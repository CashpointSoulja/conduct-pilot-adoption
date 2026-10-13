import { describe, expect, it } from "vitest";
import { greenPath, HOUR, workspace } from "./helpers";

describe("happy path", () => {
  it("goes from seed to a simulated rollout with every gate green", () => {
    const w = workspace();
    expect(w.view().gates.filter((g: any) => !g.pass).map((g: any) => g.id)).toEqual(["G2", "G3", "G4", "G5", "G6", "G7"]);
    expect(greenPath(w).status).toBe(200);
    expect(w.view().gates.every((g: any) => g.pass)).toBe(true);
    const r = w.send("rollout");
    expect(r.status).toBe(200);
    expect(r.body.summary).toContain("simulated rollout");
    expect(w.view().rollouts).toHaveLength(1);
  });

  it("first run on the seed fails the two tests hidden behind blockers and names recovery owners", () => {
    const w = workspace();
    w.send("runSuite");
    const v = w.view();
    expect(v.latestRun.results.filter((r: any) => !r.passed).map((r: any) => r.testId)).toEqual(["AT-3", "AT-4"]);
    const g5 = v.gates.find((g: any) => g.id === "G5");
    expect(g5.pass).toBe(false);
    expect(g5.recoveryOwner).toBe("O-INT");
  });
});

describe("rejected inputs", () => {
  it.each([
    ["setScope", { objective: "short", workflow: "x" }, "invalid_field"],
    ["setBaseline", { id: "M-1", baseline: -1, source: "x source", measuredOn: "2026-01-01" }, "invalid_field"],
    ["setBaseline", { id: "M-1", baseline: 5, source: "x source", measuredOn: "2027-01-01" }, "invalid_field"],
    ["setBaseline", { id: "M-1", baseline: null, source: "Not measured", measuredOn: "2026-01-01" }, "invalid_field"],
    ["setBaseline", { id: "M-9", baseline: 1, source: "x", measuredOn: "2026-01-01" }, "invalid_field"],
    ["editChange", { surchargePct: 25, appliesTo: "haulage" }, "invalid_field"],
    ["editChange", { surchargePct: 3.555, appliesTo: "haulage" }, "invalid_field"],
    ["editChange", { surchargePct: 3.5, appliesTo: "haulage" }, "no_change"],
    ["editChange", { surchargePct: 3, appliesTo: "everything" }, "invalid_field"],
    ["assignOwner", { blockerId: "B-1", ownerId: "O-CEO" }, "invalid_field"],
    ["assignOwner", { blockerId: "B-99", ownerId: "O-INT" }, "invalid_field"],
    ["resolveBlocker", { blockerId: "B-1", note: "Fixed it properly" }, "owner_required"],
    ["approve", { approverId: "O-DS", note: "Looks good" }, "not_an_approver"],
    ["approve", { approverId: "O-CAB", note: "Looks good" }, "gates_blocked"],
    ["rollout", undefined, "gates_blocked"],
    ["advanceClock", { hours: 100 }, "invalid_field"],
    ["addFeedback", { kind: "verified", text: "Approvals drift after edits", evidenceRef: null }, "evidence_required"],
    ["addFeedback", { kind: "verified", text: "Approvals drift after edits", evidenceRef: "RUN-42" }, "invalid_evidence"],
    ["addFeedback", { kind: "opinion", text: "Approvals drift after edits" }, "invalid_field"],
    ["teleport", {}, "unknown_command"],
  ])("%s %j -> %s", (type, payload, code) => {
    const w = workspace();
    const before = w.view();
    const r = w.send(type, payload);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.error).toBe(code);
    expect(w.view().revision).toBe(before.revision);
  });

  it("refuses commands without an idempotency key or expected revision", () => {
    const w = workspace();
    expect(w.store.command({ type: "runSuite", expectedRevision: 0 }, null, Date.now()).status).toBe(400);
    expect(w.store.command({ type: "runSuite" }, "abcdefgh1", Date.now()).status).toBe(400);
    expect(w.store.command([1, 2], "abcdefgh2", Date.now()).status).toBe(400);
  });

  it("blocked approval names each failing gate with a recovery owner", () => {
    const w = workspace();
    const r = w.send("approve", { approverId: "O-CAB", note: "Too early" });
    expect(r.body.details.gates.map((g: any) => g.id)).toEqual(["G2", "G3", "G4", "G5", "G6"]);
    expect(r.body.details.gates.every((g: any) => typeof g.recoveryOwner === "string")).toBe(true);
  });
});

describe("unknown evidence stays unknown", () => {
  it("never computes a delta from an Unknown baseline", () => {
    const w = workspace();
    const m1 = w.view().baselines.find((b: any) => b.id === "M-1");
    expect(m1.baseline).toBeNull();
    expect(m1.delta).toBe("Not computable: baseline Unknown");
    w.send("setBaseline", { id: "M-2", baseline: null, source: "Customer could not say" });
    expect(w.view().baselines.find((b: any) => b.id === "M-2").delta).toBe("Not computable: baseline Unknown");
  });

  it("labels a computable delta as synthetic", () => {
    const w = workspace();
    expect(w.view().baselines.find((b: any) => b.id === "M-2").delta).toContain("synthetic, not a measured result");
  });
});

describe("staleness and revision binding", () => {
  it("evidence older than 24 h blocks approval and names the test lead", () => {
    const w = workspace();
    greenPath(w);
    w.send("advanceClock", { hours: 25 });
    const g6 = w.view().gates.find((g: any) => g.id === "G6");
    expect(g6.pass).toBe(false);
    expect(g6.recoveryOwner).toBe("O-QA");
    const r = w.send("rollout");
    expect(r.status).toBe(409);
    expect(r.body.details.gates.map((g: any) => g.id)).toContain("G6");
  });

  it("an approval for revision N does not authorise revision N+1", () => {
    const w = workspace();
    greenPath(w);
    w.send("editChange", { surchargePct: 4, appliesTo: "haulage" });
    const v = w.view();
    expect(v.change.changeRevision).toBe(4);
    expect(v.gates.find((g: any) => g.id === "G7").why).toContain("revision 3");
    expect(w.send("rollout").status).toBe(409);
  });

  it("an edit that breaks a test keeps rollout blocked with the object owner as recovery owner", () => {
    const w = workspace();
    greenPath(w);
    w.send("editChange", { surchargePct: 3.5, appliesTo: "all" });
    w.send("runSuite");
    const g5 = w.view().gates.find((g: any) => g.id === "G5");
    expect(g5.pass).toBe(false);
    expect(g5.why).toContain("AT-2");
    expect(g5.recoveryOwner).toBe("O-PRC");
  });

  it("a newer run invalidates the approval that cited the older run", () => {
    const w = workspace();
    greenPath(w);
    w.send("runSuite");
    expect(w.view().gates.find((g: any) => g.id === "G7").pass).toBe(false);
  });

  it("the same revision cannot be rolled out twice for the same revision", () => {
    const w = workspace();
    greenPath(w);
    expect(w.send("rollout").status).toBe(200);
    const again = w.send("rollout");
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("already_rolled_out");
  });
});

describe("recovery", () => {
  it("recovers from stale and failed evidence by re-running and re-approving", () => {
    const w = workspace();
    greenPath(w);
    w.send("editChange", { surchargePct: 3.5, appliesTo: "all" });
    w.send("runSuite");
    w.send("advanceClock", { hours: 30 });
    expect(w.send("approve", { approverId: "O-FIN", note: "Try anyway" }).status).toBe(409);
    w.send("editChange", { surchargePct: 3.5, appliesTo: "haulage" });
    w.send("runSuite");
    expect(w.send("approve", { approverId: "O-FIN", note: "Recovered: fresh and passing" }).status).toBe(200);
    expect(w.send("rollout").status).toBe(200);
  });

  it("reset returns the seed with a higher revision so old tabs are refused", () => {
    const w = workspace();
    greenPath(w);
    const old = w.rev;
    w.send("reset");
    const v = w.view();
    expect(v.revision).toBe(old + 1);
    expect(v.blockers.every((b: any) => b.status === "open")).toBe(true);
    expect(w.send("runSuite", undefined, { rev: old }).status).toBe(409);
  });

  it("caps the simulated clock", () => {
    const w = workspace();
    for (let i = 0; i < 10; i++) w.send("advanceClock", { hours: 72 });
    expect(w.view().simOffsetHours).toBe(720);
    expect(w.send("advanceClock", { hours: 1 }).body.error).toBe("limit_reached");
    expect(HOUR).toBe(3600000);
  });
});
