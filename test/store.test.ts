import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "../src/store";
import { greenPath, NOW, workspace } from "./helpers";
import { memoryStorage } from "./sqlite";

describe("idempotency", () => {
  it("replays the stored response for the same key and body without applying twice", () => {
    const w = workspace();
    const a = w.send("runSuite", undefined, { key: "same-key-0001", rev: 0 });
    const b = w.send("runSuite", undefined, { key: "same-key-0001", rev: 0 });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.replay).toBe(true);
    expect(b.body).toEqual(a.body);
    expect(w.view().runs).toHaveLength(1);
  });

  it("rejects a reused key with a different body", () => {
    const w = workspace();
    w.send("runSuite", undefined, { key: "reuse-key-001", rev: 0 });
    const r = w.send("advanceClock", { hours: 1 }, { key: "reuse-key-001", rev: 1 });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("idempotency_key_reused");
  });

  it("does not store failures, so a corrected retry with a new key works", () => {
    const w = workspace();
    expect(w.send("advanceClock", { hours: 0 }, { key: "fail-key-0001" }).status).toBe(422);
    expect(w.send("advanceClock", { hours: 1 }, { key: "fail-key-0002" }).status).toBe(200);
  });

  it("keeps a bounded idempotency table", () => {
    const w = workspace();
    for (let i = 0; i < 230; i++) w.send(i % 2 ? "runSuite" : "advanceClock", i % 2 ? undefined : { hours: 1 }, { at: NOW });
    const count = w.storage.sql.exec("SELECT COUNT(*) AS n FROM idempotency").toArray()[0].n;
    expect(count).toBe(200);
    expect(w.view().runs.length).toBeLessThanOrEqual(5);
  });
});

describe("concurrent actions", () => {
  it("two tabs acting on the same revision: first wins, second gets 409 with the current revision", () => {
    const w = workspace();
    const base = w.rev;
    const results = [
      w.store.command({ type: "assignOwner", expectedRevision: base, payload: { blockerId: "B-1", ownerId: "O-INT" } }, "tab-a-000001", NOW),
      w.store.command({ type: "assignOwner", expectedRevision: base, payload: { blockerId: "B-1", ownerId: "O-QA" } }, "tab-b-000001", NOW),
    ];
    expect(results.map((r) => r.status)).toEqual([200, 409]);
    expect((results[1].body as any).details.currentRevision).toBe(base + 1);
    expect(w.view().blockers.find((b: any) => b.id === "B-1").ownerId).toBe("O-INT");
  });

  it("concurrent approve and edit cannot leave an approval covering the edited revision", () => {
    const w = workspace();
    greenPath(w);
    const base = w.rev;
    const edit = w.store.command({ type: "editChange", expectedRevision: base, payload: { surchargePct: 5, appliesTo: "haulage" } }, "race-edit-01", NOW);
    const roll = w.store.command({ type: "rollout", expectedRevision: base }, "race-roll-01", NOW);
    expect(edit.status).toBe(200);
    expect(roll.status).toBe(409);
    expect(w.view().rollouts).toHaveLength(0);
  });
});

describe("atomic import", () => {
  it("one bad row rejects the whole file and leaves the cohort untouched", () => {
    const w = workspace();
    const before = w.view().cohort;
    const csv = "user_id,role,team,invited_on,first_use_on,active_weeks_last4,excluded\nSYN-U001,analyst,Order to Cash,2026-09-01,2026-09-02,4,\nSYN-U002,analyst,Order to Cash,2026-09-01,2026-08-01,4,\n";
    const r = w.send("importCohort", { csv });
    expect(r.status).toBe(422);
    expect(r.body.details.errors).toEqual([{ line: 3, message: "first_use_on is before invited_on" }]);
    expect(w.view().cohort).toEqual(before);
  });

  it("a storage failure mid-command rolls back the transaction", () => {
    const storage = memoryStorage();
    const store = new WorkspaceStore(storage);
    store.getView(NOW);
    const realExec = storage.sql.exec.bind(storage.sql);
    storage.sql.exec = (q: string, ...b: unknown[]) => { if (q.startsWith("INSERT INTO idempotency")) throw new Error("disk full"); return realExec(q, ...b); };
    expect(() => store.command({ type: "runSuite", expectedRevision: 0 }, "boom-key-001", NOW)).toThrow("disk full");
    storage.sql.exec = realExec;
    expect((store.getView(NOW) as any).revision).toBe(0);
    expect((store.getView(NOW) as any).runs).toHaveLength(0);
  });

  it("rejects oversize state before writing", () => {
    const w = workspace();
    const rows = ["user_id,role,team,invited_on,first_use_on,active_weeks_last4,excluded"];
    for (let i = 1; i <= 501; i++) rows.push(`SYN-U${String(i % 1000).padStart(3, "0")},analyst,A,2026-09-01,,,`);
    const r = w.send("importCohort", { csv: rows.join("\n") });
    expect(r.status).toBe(422);
  });
});

describe("visitor isolation", () => {
  it("two visitors' stores never see each other's changes or keys", () => {
    const a = workspace();
    const b = workspace();
    greenPath(a);
    a.send("rollout");
    expect(b.view().rollouts).toHaveLength(0);
    expect(b.view().revision).toBe(0);
    const ka = "shared-key-01";
    expect(a.send("advanceClock", { hours: 1 }, { key: ka }).status).toBe(200);
    const rb = b.send("runSuite", undefined, { key: ka });
    expect(rb.status).toBe(200);
    expect(rb.replay).toBeUndefined();
  });
});
