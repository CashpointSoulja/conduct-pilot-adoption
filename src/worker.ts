import { DurableObject } from "cloudflare:workers";
import { EXPORT_KINDS, type ExportKind } from "./engine/exports";
import { WorkspaceStore, type StoreResponse } from "./store";

export interface Env {
  WORKSPACE: DurableObjectNamespace<PilotWorkspace>;
  ASSETS: Fetcher;
}

const COOKIE = "cpa_vid";
const VID = /^[a-f0-9]{32}$/;
const MAX_BODY = 128 * 1024;
const IDLE_MS = 14 * 24 * 3600 * 1000;

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extra } });
}

function readVisitor(req: Request): string | null {
  const c = req.headers.get("Cookie") ?? "";
  for (const part of c.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === COOKIE && v && VID.test(v)) return v;
  }
  return null;
}

function newVisitor(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export class PilotWorkspace extends DurableObject<Env> {
  private store: WorkspaceStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new WorkspaceStore({ sql: ctx.storage.sql, transactionSync: (fn) => ctx.storage.transactionSync(fn) });
  }

  private async touch() {
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
  }

  async getView() { await this.touch(); return this.store.getView(Date.now()); }
  async exportDoc(kind: ExportKind) { await this.touch(); return this.store.exportDoc(kind, Date.now()); }
  async command(body: unknown, key: string | null) { await this.touch(); return this.store.command(body, key, Date.now()); }

  async alarm() {
    const last = this.store.lastTouched();
    if (last === null || Date.now() - last >= IDLE_MS - 60_000) {
      this.store.wipe();
      await this.ctx.storage.deleteAll();
    } else {
      await this.ctx.storage.setAlarm(last + IDLE_MS);
    }
  }
}

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  let vid = readVisitor(req);
  const setCookie: Record<string, string> = {};
  if (!vid) {
    vid = newVisitor();
    const secure = url.protocol === "https:" ? "; Secure" : "";
    setCookie["Set-Cookie"] = `${COOKIE}=${vid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${14 * 24 * 3600}${secure}`;
  }
  const stub = env.WORKSPACE.get(env.WORKSPACE.idFromName(`visitor:${vid}`));

  if (url.pathname === "/api/health" && req.method === "GET")
    return json(200, { ok: true, synthetic: true, writesToExternalSystems: false }, setCookie);

  if (url.pathname === "/api/state" && req.method === "GET") return json(200, await stub.getView(), setCookie);

  const exp = url.pathname.match(/^\/api\/export\/([a-z]+)$/);
  if (exp && req.method === "GET") {
    if (!(EXPORT_KINDS as readonly string[]).includes(exp[1])) return json(404, { error: "not_found" }, setCookie);
    const md = await stub.exportDoc(exp[1] as ExportKind);
    return new Response(md, {
      status: 200,
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${exp[1]}-synthetic.md"`, ...SECURITY_HEADERS, ...setCookie },
    });
  }

  if (url.pathname === "/api/command") {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, { Allow: "POST", ...setCookie });
    const origin = req.headers.get("Origin");
    if (origin !== null && origin !== url.origin) return json(403, { error: "cross_origin", message: "Cross-origin commands are refused." }, setCookie);
    if (!(req.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json"))
      return json(415, { error: "unsupported_media_type", message: "Send application/json" }, setCookie);
    const declared = Number(req.headers.get("Content-Length") ?? "0");
    if (declared > MAX_BODY) return json(413, { error: "too_large", message: "Body exceeds 128 KB" }, setCookie);
    const text = await req.text();
    if (text.length > MAX_BODY) return json(413, { error: "too_large", message: "Body exceeds 128 KB" }, setCookie);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json(400, { error: "invalid_json", message: "Body is not valid JSON" }, setCookie); }
    const res = (await stub.command(body, req.headers.get("Idempotency-Key"))) as unknown as StoreResponse;
    return json(res.status, res.body, { ...setCookie, ...(res.replay ? { "Idempotent-Replay": "true" } : {}) });
  }

  return json(404, { error: "not_found" }, setCookie);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return handleApi(req, env);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
