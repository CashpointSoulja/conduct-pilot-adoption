import { ACCEPTANCE_TESTS, NODES } from "../fixtures/pilot";
import { cohortMetrics } from "./cohort";
import { changeFingerprint } from "./suite";
import type { OwnerId, State } from "./types";

export const FRESH_MS = 24 * 3600 * 1000;

export interface GateResult { id: string; label: string; pass: boolean; why: string; recoveryOwner: OwnerId | null }
export interface GateContext { state: State; now: number; fp: string }
export interface GateRule { id: string; label: string; check(ctx: GateContext): Omit<GateResult, "id" | "label"> }

const ok = (why: string) => ({ pass: true, why, recoveryOwner: null });
const no = (why: string, recoveryOwner: OwnerId | null = null) => ({ pass: false, why, recoveryOwner });

export function latestRun(state: State) {
  return state.runs.length ? state.runs[state.runs.length - 1] : null;
}

export const freshnessRule: GateRule = {
  id: "G6", label: "Evidence is fresh (24 h)",
  check: ({ state, now }) => {
    const run = latestRun(state);
    if (!run) return no("No acceptance run yet.", "O-QA");
    const age = now - run.at;
    if (age > FRESH_MS) return no(`${run.id} is ${Math.floor(age / 3600000)} h old; re-run before approval or rollout.`, "O-QA");
    return ok(`${run.id} is ${Math.floor(age / 3600000)} h old.`);
  },
};

export const GATE_RULES: GateRule[] = [
  {
    id: "G1", label: "Pilot scope and baselines recorded",
    check: ({ state }) => {
      if (!state.scope.objective || !state.scope.workflow) return no("Objective and workflow are required.", "O-DS");
      const missingSource = state.baselines.filter((b) => !b.baselineSource);
      if (missingSource.length) return no(`Baseline source missing for ${missingSource.map((b) => b.id).join(", ")}.`, "O-DS");
      const unknown = state.baselines.filter((b) => b.baseline === null).length;
      return ok(unknown ? `Scope recorded; ${unknown} baseline(s) explicitly Unknown.` : "Scope and baselines recorded.");
    },
  },
  {
    id: "G2", label: "Every blocker has an owner",
    check: ({ state }) => {
      const unowned = state.blockers.filter((b) => !b.ownerId);
      return unowned.length ? no(`Unowned: ${unowned.map((b) => b.id).join(", ")}.`, "O-DS") : ok("All blockers owned.");
    },
  },
  {
    id: "G3", label: "Every blocker resolved or accepted",
    check: ({ state }) => {
      const open = state.blockers.filter((b) => b.status !== "resolved");
      if (!open.length) return ok("No open blockers.");
      return no(`Open: ${open.map((b) => `${b.id} (${b.ownerId ?? "no owner"})`).join(", ")}.`, open[0].ownerId ?? "O-DS");
    },
  },
  {
    id: "G4", label: "Evidence matches the current change revision",
    check: ({ state, fp }) => {
      const run = latestRun(state);
      if (!run) return no("No acceptance run yet.", "O-QA");
      if (run.changeRevision !== state.change.changeRevision || run.fingerprint !== fp)
        return no(`${run.id} tested revision ${run.changeRevision}; the change is now revision ${state.change.changeRevision}.`, "O-QA");
      return ok(`${run.id} tested revision ${run.changeRevision} (${fp.slice(0, 8)}).`);
    },
  },
  {
    id: "G5", label: "All acceptance tests pass",
    check: ({ state }) => {
      const run = latestRun(state);
      if (!run) return no("No acceptance run yet.", "O-QA");
      const failed = run.results.filter((r) => !r.passed);
      if (!failed.length) return ok(`${run.results.length}/${run.results.length} passed in ${run.id}.`);
      const first = ACCEPTANCE_TESTS.find((t) => t.id === failed[0].testId);
      const owner = NODES.find((n) => n.id === first?.covers)?.owner ?? "O-QA";
      return no(`Failed: ${failed.map((f) => f.testId).join(", ")}.`, owner);
    },
  },
  freshnessRule,
  {
    id: "G7", label: "Approval bound to the current revision",
    check: ({ state, fp }) => {
      const a = state.approval;
      if (!a) return no("Not approved.", "O-CAB");
      if (a.changeRevision !== state.change.changeRevision || a.fingerprint !== fp)
        return no(`Approval was for revision ${a.changeRevision}; it does not carry over to revision ${state.change.changeRevision}.`, "O-CAB");
      const run = latestRun(state);
      if (!run || run.id !== a.runId) return no(`Approval cited ${a.runId}; newer evidence exists and must be re-approved.`, "O-CAB");
      return ok(`Approved by ${a.approverId} on revision ${a.changeRevision}.`);
    },
  },
  {
    id: "G8", label: "Cohort measurable",
    check: ({ state, now }) => {
      const m = cohortMetrics(state.cohort.rows, now);
      return m.status === "ok" ? ok(`Activation denominator ${m.activation.denominator}.`) : no(m.holdReason as string, "O-DS");
    },
  },
];

export const APPROVAL_GATES = ["G1", "G2", "G3", "G4", "G5", "G6"];

export function evaluateGates(state: State, now: number, rules: GateRule[] = GATE_RULES): GateResult[] {
  const fp = changeFingerprint(state.change, state.env);
  return rules.map((r) => ({ id: r.id, label: r.label, ...r.check({ state, now, fp }) }));
}
