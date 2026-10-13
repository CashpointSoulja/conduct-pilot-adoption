import { applyCommand, seedState, view } from "./engine/commands";
import { renderExport, type ExportKind } from "./engine/exports";
import { fingerprint } from "./engine/hash";
import { CommandError, type State } from "./engine/types";

export interface SqlCursor { toArray(): Record<string, unknown>[] }
export interface SqlLike { exec(query: string, ...binds: unknown[]): SqlCursor }
export interface StorageLike { sql: SqlLike; transactionSync<T>(fn: () => T): T }

export const IDEMPOTENCY_KEEP = 200;
export const MAX_STATE_BYTES = 512 * 1024;
const KEY = /^[A-Za-z0-9_-]{8,64}$/;

export interface StoreResponse { status: number; body: unknown; replay?: boolean }

// One instance per visitor. All reads and writes for a visitor go through here, inside one
// SQLite transaction, so a rejected command never leaves partial state behind.
export class WorkspaceStore {
  constructor(private storage: StorageLike) {
    const sql = storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL, body TEXT NOT NULL, touched_at INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS idempotency (key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, status INTEGER NOT NULL, response TEXT NOT NULL, created_at INTEGER NOT NULL)");
  }

  private load(realNow: number): State {
    const row = this.storage.sql.exec("SELECT body FROM workspace WHERE id = 1").toArray()[0];
    if (row) return JSON.parse(String(row.body)) as State;
    const s = seedState(realNow);
    this.save(s, realNow);
    return s;
  }

  private save(state: State, realNow: number) {
    const body = JSON.stringify(state);
    if (body.length > MAX_STATE_BYTES) throw new CommandError(413, "state_too_large", "Workspace would exceed its size limit");
    this.storage.sql.exec(
      "INSERT INTO workspace (id, revision, body, touched_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, body = excluded.body, touched_at = excluded.touched_at",
      state.revision, body, realNow,
    );
  }

  getView(realNow: number) {
    return this.storage.transactionSync(() => view(this.load(realNow), realNow));
  }

  exportDoc(kind: ExportKind, realNow: number): string {
    return this.storage.transactionSync(() => renderExport(kind, this.load(realNow), realNow));
  }

  command(raw: unknown, idempotencyKey: string | null, realNow: number): StoreResponse {
    if (!idempotencyKey || !KEY.test(idempotencyKey))
      return { status: 400, body: { error: "idempotency_key_required", message: "Send an Idempotency-Key header of 8-64 letters, digits, - or _." } };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { status: 400, body: { error: "invalid_body", message: "Body must be a JSON object" } };
    const req = raw as { type?: unknown; expectedRevision?: unknown; payload?: unknown };
    const requestHash = fingerprint({ type: req.type, expectedRevision: req.expectedRevision, payload: req.payload ?? null });
    try {
      return this.storage.transactionSync(() => {
        const prior = this.storage.sql.exec("SELECT request_hash, status, response FROM idempotency WHERE key = ?", idempotencyKey).toArray()[0];
        if (prior) {
          if (prior.request_hash !== requestHash)
            return { status: 422, body: { error: "idempotency_key_reused", message: "This Idempotency-Key was already used for a different request." } };
          return { status: Number(prior.status), body: JSON.parse(String(prior.response)), replay: true };
        }
        if (typeof req.expectedRevision !== "number" || !Number.isInteger(req.expectedRevision))
          throw new CommandError(400, "expected_revision_required", "expectedRevision must be an integer");
        const state = this.load(realNow);
        if (req.expectedRevision !== state.revision)
          throw new CommandError(409, "stale_revision", `Workspace is at revision ${state.revision}; you sent ${req.expectedRevision}. Reload and retry.`, { currentRevision: state.revision });
        const { state: next, summary } = applyCommand(state, { type: String(req.type), payload: req.payload }, realNow);
        this.save(next, realNow);
        const body = { ok: true, summary, revision: next.revision };
        this.storage.sql.exec("INSERT INTO idempotency (key, request_hash, status, response, created_at) VALUES (?, ?, 200, ?, ?)", idempotencyKey, requestHash, JSON.stringify(body), realNow);
        this.storage.sql.exec("DELETE FROM idempotency WHERE key NOT IN (SELECT key FROM idempotency ORDER BY created_at DESC, rowid DESC LIMIT ?)", IDEMPOTENCY_KEEP);
        return { status: 200, body };
      });
    } catch (e) {
      if (e instanceof CommandError) return { status: e.status, body: { error: e.code, message: e.message, details: e.details ?? null } };
      throw e;
    }
  }

  wipe() {
    this.storage.sql.exec("DELETE FROM workspace");
    this.storage.sql.exec("DELETE FROM idempotency");
  }

  lastTouched(): number | null {
    const row = this.storage.sql.exec("SELECT touched_at FROM workspace WHERE id = 1").toArray()[0];
    return row ? Number(row.touched_at) : null;
  }
}
