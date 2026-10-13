import { WorkspaceStore } from "../src/store";
import { memoryStorage } from "./sqlite";

export const NOW = Date.parse("2026-10-13T12:00:00Z");
export const HOUR = 3600 * 1000;

let n = 0;
export const k = () => `test-key-${(++n).toString().padStart(6, "0")}`;

export function workspace(now = NOW) {
  const storage = memoryStorage();
  const store = new WorkspaceStore(storage);
  let rev = (store.getView(now) as { revision: number }).revision;
  const send = (type: string, payload?: unknown, opts: { key?: string; rev?: number; at?: number } = {}) => {
    const res = store.command({ type, expectedRevision: opts.rev ?? rev, payload }, opts.key ?? k(), opts.at ?? now);
    const body = res.body as { revision?: number; error?: string; message?: string; details?: any; summary?: string };
    if (res.status === 200 && body.revision) rev = body.revision;
    return { ...res, body };
  };
  const view = (at = now) => store.getView(at) as any;
  return { store, storage, send, view, get rev() { return rev; } };
}

// Takes the seed to a fully green, approved state.
export function greenPath(w: ReturnType<typeof workspace>) {
  w.send("assignOwner", { blockerId: "B-1", ownerId: "O-INT" });
  w.send("assignOwner", { blockerId: "B-2", ownerId: "O-FIN" });
  w.send("assignOwner", { blockerId: "B-4", ownerId: "O-FIN" });
  for (const b of ["B-1", "B-2", "B-3", "B-4"]) w.send("resolveBlocker", { blockerId: b, note: "Resolved in the synthetic environment." });
  w.send("runSuite");
  return w.send("approve", { approverId: "O-CAB", note: "Approved on current evidence" });
}
