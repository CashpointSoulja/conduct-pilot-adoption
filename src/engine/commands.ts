import { ACCEPTANCE_TESTS, ACCOUNT, EDGES, NODES, OWNERS, SEED_HYPOTHESES, SEED_SCOPE, seedBaselines, seedBlockers, seedChange, seedCohortCsv, seedEnv } from "../fixtures/pilot";
import { cohortMetrics, parseCohortCsv } from "./cohort";
import { APPROVAL_GATES, evaluateGates, GATE_RULES, latestRun, type GateRule } from "./gates";
import { fingerprint } from "./hash";
import { impactMap } from "./impact";
import { changeFingerprint, runAcceptance } from "./suite";
import { cleanText } from "./text";
import { CommandError, type Command, type OwnerId, type State } from "./types";

export const LIMITS = { events: 100, runs: 20, rollouts: 10, feedback: 50, maxSimOffsetMs: 30 * 24 * 3600 * 1000 };
export const COMMAND_TYPES = [
  "setScope", "setBaseline", "editChange", "assignOwner", "resolveBlocker", "runSuite",
  "approve", "rollout", "importCohort", "addFeedback", "advanceClock", "reset",
] as const;

export function simNow(state: State, realNow: number): number {
  return realNow + state.simOffsetMs;
}

export function seedState(realNow: number, revision = 0): State {
  const parsed = parseCohortCsv(seedCohortCsv(), realNow);
  if (!parsed.ok) throw new Error("seed cohort invalid: " + JSON.stringify(parsed.errors));
  return {
    schema: 1,
    revision,
    createdAt: realNow,
    simOffsetMs: 0,
    scope: { ...SEED_SCOPE },
    baselines: seedBaselines(),
    change: seedChange(),
    env: seedEnv(),
    blockers: seedBlockers(),
    runs: [],
    approval: null,
    rollouts: [],
    cohort: { rows: parsed.rows, source: "seed", importedAt: realNow, fingerprint: fingerprint(parsed.rows) },
    feedback: [],
    events: [],
    counters: { run: 0, rollout: 0, feedback: 0 },
  };
}

function obj(payload: unknown): Record<string, unknown> {
  if (payload === undefined) return {};
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new CommandError(422, "invalid_payload", "payload must be an object");
  return payload as Record<string, unknown>;
}

function owner(id: unknown, field = "ownerId"): OwnerId {
  const o = OWNERS.find((x) => x.id === id);
  if (!o) throw new CommandError(422, "invalid_field", `${field} must be one of ${OWNERS.map((x) => x.id).join(", ")}`, { field });
  return o.id;
}

function blocked(state: State, now: number, ids: string[], rules: GateRule[]) {
  const failing = evaluateGates(state, now, rules).filter((g) => ids.includes(g.id) && !g.pass);
  if (failing.length) {
    throw new CommandError(409, "gates_blocked", `Blocked by ${failing.map((g) => g.id).join(", ")}`, {
      gates: failing.map((g) => ({ id: g.id, why: g.why, recoveryOwner: g.recoveryOwner })),
    });
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface Applied { state: State; summary: string }

// Pure reducer. Throws CommandError and leaves the input untouched on any rejection.
export function applyCommand(prev: State, cmd: Command, realNow: number, rules: GateRule[] = GATE_RULES): Applied {
  if (!cmd || typeof cmd.type !== "string" || !(COMMAND_TYPES as readonly string[]).includes(cmd.type))
    throw new CommandError(400, "unknown_command", "Unknown command type");
  const p = obj(cmd.payload);
  if (cmd.type === "reset") {
    const s = seedState(realNow, prev.revision + 1);
    s.events = [{ at: realNow, revision: s.revision, type: "reset", summary: "Workspace reset to the synthetic seed." }];
    return { state: s, summary: "Workspace reset to the synthetic seed." };
  }
  const s: State = structuredClone(prev);
  const now = simNow(s, realNow);
  let summary = "";
  const bumpChange = () => { s.change.changeRevision += 1; };

  switch (cmd.type) {
    case "setScope": {
      s.scope.objective = cleanText(p.objective, "objective", 300, { min: 10 });
      s.scope.workflow = cleanText(p.workflow, "workflow", 120, { min: 3 });
      summary = "Pilot scope updated.";
      break;
    }
    case "setBaseline": {
      const b = s.baselines.find((x) => x.id === p.id);
      if (!b) throw new CommandError(422, "invalid_field", "Unknown baseline id", { field: "id" });
      const source = cleanText(p.source, "source", 160, { min: 3 });
      if (p.baseline === null) {
        if (p.measuredOn !== null && p.measuredOn !== undefined) throw new CommandError(422, "invalid_field", "An Unknown baseline cannot have a measured date", { field: "measuredOn" });
        b.baseline = null; b.baselineMeasuredOn = null; b.baselineSource = source;
        summary = `${b.id} baseline set to Unknown.`;
      } else {
        if (typeof p.baseline !== "number" || !Number.isFinite(p.baseline) || p.baseline < 0 || p.baseline > 10000)
          throw new CommandError(422, "invalid_field", "baseline must be a number from 0 to 10000, or null for Unknown", { field: "baseline" });
        if (typeof p.measuredOn !== "string" || !DATE.test(p.measuredOn) || Number.isNaN(Date.parse(p.measuredOn + "T00:00:00Z")))
          throw new CommandError(422, "invalid_field", "measuredOn must be a YYYY-MM-DD date", { field: "measuredOn" });
        if (Date.parse(p.measuredOn + "T00:00:00Z") > now) throw new CommandError(422, "invalid_field", "measuredOn cannot be in the future", { field: "measuredOn" });
        b.baseline = Math.round(p.baseline * 100) / 100; b.baselineMeasuredOn = p.measuredOn; b.baselineSource = source;
        summary = `${b.id} baseline set to ${b.baseline} ${b.unit}.`;
      }
      break;
    }
    case "editChange": {
      const pct = p.surchargePct;
      if (typeof pct !== "number" || !Number.isFinite(pct) || pct <= 0 || pct > 20 || Math.round(pct * 100) !== pct * 100)
        throw new CommandError(422, "invalid_field", "surchargePct must be above 0 and at most 20, with up to 2 decimals", { field: "surchargePct" });
      if (p.appliesTo !== "haulage" && p.appliesTo !== "all") throw new CommandError(422, "invalid_field", "appliesTo must be haulage or all", { field: "appliesTo" });
      if (pct === s.change.params.surchargePct && p.appliesTo === s.change.params.appliesTo) throw new CommandError(422, "no_change", "That is already the current change.");
      s.change.params = { surchargePct: pct, appliesTo: p.appliesTo };
      bumpChange();
      summary = `Change edited to ${pct}% on ${p.appliesTo} orders; now revision ${s.change.changeRevision}.`;
      break;
    }
    case "assignOwner": {
      const b = s.blockers.find((x) => x.id === p.blockerId);
      if (!b) throw new CommandError(422, "invalid_field", "Unknown blocker", { field: "blockerId" });
      if (b.status === "resolved") throw new CommandError(409, "already_resolved", `${b.id} is already resolved`);
      const o = owner(p.ownerId);
      if (b.ownerId === o) throw new CommandError(422, "no_change", `${b.id} is already owned by ${o}`);
      b.ownerId = o;
      summary = `${b.id} assigned to ${o}.`;
      break;
    }
    case "resolveBlocker": {
      const b = s.blockers.find((x) => x.id === p.blockerId);
      if (!b) throw new CommandError(422, "invalid_field", "Unknown blocker", { field: "blockerId" });
      if (b.status === "resolved") throw new CommandError(409, "already_resolved", `${b.id} is already resolved`);
      if (!b.ownerId) throw new CommandError(409, "owner_required", `${b.id} needs an owner before it can be resolved`);
      b.resolutionNote = cleanText(p.note, "note", 280, { min: 10 });
      b.status = "resolved";
      b.resolvedAt = now;
      if (b.fix === "carrier-line-type") { s.env.carrierLineTypes = [...s.env.carrierLineTypes, "SURCHARGE"]; bumpChange(); }
      if (b.fix === "surcharge-account") { s.env.surchargeAccount = "4410"; bumpChange(); }
      summary = `${b.id} resolved by ${b.ownerId}${b.fix ? `; synthetic environment changed, change is now revision ${s.change.changeRevision}` : ""}.`;
      break;
    }
    case "runSuite": {
      s.counters.run += 1;
      const run = {
        id: `RUN-${s.counters.run}`, at: now, changeRevision: s.change.changeRevision,
        fingerprint: changeFingerprint(s.change, s.env), results: runAcceptance(s.change, s.env),
      };
      s.runs = [...s.runs, run].slice(-LIMITS.runs);
      const failed = run.results.filter((r) => !r.passed).length;
      summary = `${run.id} on revision ${run.changeRevision}: ${run.results.length - failed}/${run.results.length} passed.`;
      break;
    }
    case "approve": {
      const approver = owner(p.approverId, "approverId");
      const o = OWNERS.find((x) => x.id === approver);
      if (!o?.canApprove) throw new CommandError(403, "not_an_approver", `${approver} cannot approve changes`);
      if (approver === s.change.requestedBy) throw new CommandError(403, "self_approval", "The requester cannot approve their own change");
      const note = cleanText(p.note, "note", 280, { min: 3 });
      blocked(s, now, APPROVAL_GATES, rules);
      const fp = changeFingerprint(s.change, s.env);
      const run = latestRun(s);
      if (s.approval && s.approval.changeRevision === s.change.changeRevision && s.approval.fingerprint === fp && s.approval.runId === run?.id)
        throw new CommandError(409, "already_approved", "This revision and evidence are already approved");
      s.approval = { approverId: approver, note, at: now, changeRevision: s.change.changeRevision, fingerprint: fp, runId: run?.id as string };
      summary = `Revision ${s.change.changeRevision} approved by ${approver} on ${run?.id}.`;
      break;
    }
    case "rollout": {
      blocked(s, now, rules.map((r) => r.id), rules);
      const fp = changeFingerprint(s.change, s.env);
      if (s.rollouts.some((r) => r.changeRevision === s.change.changeRevision && r.fingerprint === fp))
        throw new CommandError(409, "already_rolled_out", `Revision ${s.change.changeRevision} has already been rolled out (simulated)`);
      s.counters.rollout += 1;
      const m = cohortMetrics(s.cohort.rows, now);
      const r = { id: `ROLL-${s.counters.rollout}`, at: now, changeRevision: s.change.changeRevision, fingerprint: fp, runId: latestRun(s)?.id as string, wave: s.rollouts.length + 1, eligibleUsers: m.activation.denominator };
      s.rollouts = [...s.rollouts, r].slice(-LIMITS.rollouts);
      summary = `${r.id}: simulated rollout of revision ${r.changeRevision}. No external system was written to.`;
      break;
    }
    case "importCohort": {
      if (typeof p.csv !== "string") throw new CommandError(422, "invalid_field", "csv must be text", { field: "csv" });
      const parsed = parseCohortCsv(p.csv, now);
      if (!parsed.ok) throw new CommandError(422, "cohort_rejected", `Import rejected: ${parsed.errors.length} row error(s). Nothing was changed.`, { errors: parsed.errors });
      s.cohort = { rows: parsed.rows, source: "import", importedAt: now, fingerprint: fingerprint(parsed.rows) };
      summary = `Cohort imported: ${parsed.rows.length} synthetic rows.`;
      break;
    }
    case "addFeedback": {
      if (p.kind !== "verified" && p.kind !== "hypothesis") throw new CommandError(422, "invalid_field", "kind must be verified or hypothesis", { field: "kind" });
      const text = cleanText(p.text, "text", 280, { min: 10 });
      let ref: string | null = null;
      if (p.evidenceRef !== undefined && p.evidenceRef !== null && p.evidenceRef !== "") {
        ref = cleanText(p.evidenceRef, "evidenceRef", 20);
        const okRef = s.runs.some((r) => r.id === ref) || s.blockers.some((b) => b.id === ref && b.status === "resolved") || s.rollouts.some((r) => r.id === ref);
        if (!okRef) throw new CommandError(422, "invalid_evidence", `${ref} is not an existing run, resolved blocker or rollout`, { field: "evidenceRef" });
      }
      if (p.kind === "verified" && !ref) throw new CommandError(422, "evidence_required", "A verified finding must cite a run, resolved blocker or rollout. Otherwise record it as a hypothesis.", { field: "evidenceRef" });
      if (s.feedback.length >= LIMITS.feedback) throw new CommandError(409, "limit_reached", `At most ${LIMITS.feedback} feedback items`);
      s.counters.feedback += 1;
      s.feedback.push({ id: `FB-${s.counters.feedback}`, kind: p.kind, text, evidenceRef: ref, at: now });
      summary = `FB-${s.counters.feedback} recorded as ${p.kind}.`;
      break;
    }
    case "advanceClock": {
      const h = p.hours;
      if (typeof h !== "number" || !Number.isInteger(h) || h < 1 || h > 72) throw new CommandError(422, "invalid_field", "hours must be a whole number from 1 to 72", { field: "hours" });
      if (s.simOffsetMs + h * 3600000 > LIMITS.maxSimOffsetMs) throw new CommandError(409, "limit_reached", "The simulated clock can move at most 30 days");
      s.simOffsetMs += h * 3600000;
      summary = `Simulated clock moved forward ${h} h.`;
      break;
    }
  }
  s.revision = prev.revision + 1;
  s.events = [...s.events, { at: simNow(s, realNow), revision: s.revision, type: cmd.type, summary }].slice(-LIMITS.events);
  return { state: s, summary };
}

export function baselineView(state: State) {
  return state.baselines.map((b) => {
    let delta: string;
    if (b.baseline === null) delta = "Not computable: baseline Unknown";
    else if (b.pilotValue === null) delta = "Not computable: pilot value Unknown";
    else delta = `${Math.round((b.pilotValue - b.baseline) * 100) / 100} ${b.unit} (synthetic, not a measured result)`;
    return { ...b, delta };
  });
}

export function view(state: State, realNow: number) {
  const now = simNow(state, realNow);
  const fp = changeFingerprint(state.change, state.env);
  return {
    synthetic: true,
    account: ACCOUNT,
    revision: state.revision,
    now,
    simOffsetHours: Math.round(state.simOffsetMs / 3600000),
    scope: state.scope,
    baselines: baselineView(state),
    change: { ...state.change, fingerprint: fp },
    env: state.env,
    owners: OWNERS,
    graph: { nodes: NODES, edges: EDGES },
    impact: impactMap(state.change),
    blockers: state.blockers,
    tests: ACCEPTANCE_TESTS,
    runs: state.runs.slice(-5),
    latestRun: latestRun(state),
    approval: state.approval,
    rollouts: state.rollouts,
    gates: evaluateGates(state, now),
    cohort: { source: state.cohort.source, importedAt: state.cohort.importedAt, rows: state.cohort.rows.length, metrics: cohortMetrics(state.cohort.rows, now) },
    feedback: state.feedback,
    hypotheses: SEED_HYPOTHESES,
    events: state.events.slice(-12).reverse(),
  };
}
