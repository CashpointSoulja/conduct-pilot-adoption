import { ACCEPTANCE_TESTS, ACCOUNT, OWNERS, SEED_HYPOTHESES } from "../fixtures/pilot";
import { ACTIVATION_WINDOW_DAYS, ADOPTION_MIN_WEEKS, cohortMetrics, MIN_DENOMINATOR, type Ratio } from "./cohort";
import { baselineView, simNow } from "./commands";
import { evaluateGates, FRESH_MS, latestRun } from "./gates";
import { impactMap } from "./impact";
import { changeFingerprint } from "./suite";
import { mdSafe } from "./text";
import type { State } from "./types";

export const EXPORT_KINDS = ["handoff", "playbook", "feedback"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
const r = (x: Ratio) => (x.pct === null ? `Unknown (0 known of 0)` : `${x.pct}% (${x.numerator} / ${x.denominator})`);
const roleOf = (id: string | null) => (id ? `${id} ${OWNERS.find((o) => o.id === id)?.role ?? ""}`.trim() : "no owner");

function header(title: string, state: State, now: number): string[] {
  return [
    `# ${title}`,
    "",
    `> SYNTHETIC FIXTURE. ${ACCOUNT.name} and every person, object, test and figure below are invented.`,
    "> Independent concept by Ayo Ahmed. Not affiliated with Conduct AI Ltd. No customer or financial system was read or written.",
    "",
    `- Pilot: ${ACCOUNT.pilotId}`,
    `- Change: ${state.change.id}, revision ${state.change.changeRevision}, fingerprint ${changeFingerprint(state.change, state.env)}`,
    `- Workspace revision: ${state.revision}`,
    `- Generated (simulated clock): ${iso(now)}`,
    "",
  ];
}

export function handoff(state: State, realNow: number): string {
  const now = simNow(state, realNow);
  const gates = evaluateGates(state, now);
  const m = cohortMetrics(state.cohort.rows, now);
  const run = latestRun(state);
  const rolled = state.rollouts.find((x) => x.changeRevision === state.change.changeRevision);
  const out = header("Customer success handoff", state, now);
  out.push("## Scope", "", `- Objective: ${mdSafe(state.scope.objective)}`, `- Workflow: ${mdSafe(state.scope.workflow)}`, `- Change: ${mdSafe(state.change.title)} (${state.change.params.surchargePct}% on ${state.change.params.appliesTo} orders)`, "");
  out.push("## Rollout status", "", rolled ? `Simulated rollout ${rolled.id} of revision ${rolled.changeRevision} at ${iso(rolled.at)}, citing ${rolled.runId}. Nothing was deployed to a real system.` : "Not rolled out. The gates below explain why.", "");
  out.push("| Gate | State | Why | Recovery owner |", "|---|---|---|---|");
  for (const g of gates) out.push(`| ${g.id} ${g.label} | ${g.pass ? "PASS" : "BLOCKED"} | ${mdSafe(g.why)} | ${g.pass ? "-" : roleOf(g.recoveryOwner)} |`);
  out.push("", "## Baselines", "", "| Metric | Baseline | Source | Pilot value | Delta |", "|---|---|---|---|---|");
  for (const b of baselineView(state)) out.push(`| ${b.id} ${b.name} | ${b.baseline === null ? "Unknown" : `${b.baseline} ${b.unit}`} | ${mdSafe(b.baselineSource)} | ${b.pilotValue === null ? "Unknown" : `${b.pilotValue} ${b.unit}`} | ${mdSafe(b.delta)} |`);
  out.push("", "## Cohort (synthetic)", "", `- Rows: ${m.invited}. Excluded: test accounts ${m.excluded.test_account}, left company ${m.excluded.left_company}, on leave ${m.excluded.on_leave}.`, `- Invited under ${ACTIVATION_WINDOW_DAYS} days ago (not yet measurable): ${m.immature}.`, `- Activation (first use within ${ACTIVATION_WINDOW_DAYS} days): ${r(m.activation)}. Unknown first use, left out of the denominator: ${m.activationUnknown}.`, `- Adoption (active ${ADOPTION_MIN_WEEKS}+ of last 4 weeks): ${r(m.adoption)}. Unknown activity, left out: ${m.adoptionUnknown}.`, `- Status: ${m.status === "ok" ? "measurable" : `HOLD. ${m.holdReason}`}`);
  if (m.mixWarning) out.push(`- Mix warning: ${m.mixWarning}`);
  out.push("", "| Role | Activation | Adoption |", "|---|---|---|");
  for (const s of m.segments) out.push(`| ${s.role} | ${r(s.activation)} | ${r(s.adoption)} |`);
  out.push("", "## Decisions and accepted risks", "");
  for (const b of state.blockers) out.push(`- ${b.id} ${mdSafe(b.title)}: ${b.status === "resolved" ? `resolved by ${roleOf(b.ownerId)}. ${mdSafe(b.resolutionNote ?? "")}` : `OPEN, ${roleOf(b.ownerId)}`}`);
  out.push("", "## Latest evidence", "", run ? `${run.id} at ${iso(run.at)} on revision ${run.changeRevision}:` : "No acceptance run recorded.", "");
  if (run) for (const t of run.results) out.push(`- ${t.testId} ${t.passed ? "PASS" : "FAIL"}: expected \`${mdSafe(t.expected)}\`, actual \`${mdSafe(t.actual)}\``);
  out.push("", "## What this handoff does not claim", "", "- No measured business impact. Pilot values are synthetic.", "- Unknown baselines stay Unknown and produce no delta.", "- No real users, systems or customers were involved.", "");
  return out.join("\n");
}

export function playbook(state: State, realNow: number): string {
  const now = simNow(state, realNow);
  const impact = impactMap(state.change);
  const out = header("Reusable deployment playbook", state, now);
  out.push(
    "Generated from the gates this pilot actually used. Thresholds are this concept's defaults, not a standard.",
    "",
    "## 1. Scope before building",
    "- Write the objective and the one workflow in scope.",
    "- Record each baseline with a source and date, or mark it Unknown. Unknown baselines never produce an impact number.",
    "- Agree acceptance tests with expected values before the change is built.",
    "",
    "## 2. Map the change",
    `- Start from the changed objects and walk every downstream edge. This pilot touched ${impact.affected.length} objects (max depth ${Math.max(...impact.affected.map((a) => a.depth))}).`,
    "- Every affected object needs a named owner team and at least one acceptance test, or an explicit accepted risk.",
    "",
    "## 3. Own every blocker",
    "- A blocker without an owner blocks rollout. Resolution needs a note; a fix to the environment creates a new change revision.",
    "",
    "## 4. Evidence",
    `- Run the full suite against the current revision. Evidence older than ${FRESH_MS / 3600000} h is stale and blocks approval and rollout.`,
    "- A failed test names the owner of the object it covers as recovery owner. Stale evidence names the test lead.",
    "",
    "## 5. Approval",
    "- Approval binds to the change revision, its fingerprint and the run it cited. Any edit or newer run requires fresh approval.",
    "- The requester cannot approve their own change.",
    "",
    "## 6. Rollout and adoption",
    `- Roll out only when every gate passes. Measure activation within ${ACTIVATION_WINDOW_DAYS} days and adoption as ${ADOPTION_MIN_WEEKS}+ active weeks of 4.`,
    `- State exclusions. Keep unknown rows out of denominators and report them. Hold the read-out below ${MIN_DENOMINATOR} known users.`,
    "- Break results down by role before reporting an aggregate.",
    "",
    "## Checklist used in this pilot",
    "",
  );
  for (const g of evaluateGates(state, now)) out.push(`- [${g.pass ? "x" : " "}] ${g.id} ${g.label}`);
  out.push("", "## Acceptance test template", "", "| ID | Covers | Critical | Expected |", "|---|---|---|---|");
  for (const t of ACCEPTANCE_TESTS) out.push(`| ${t.id} | ${t.covers} | ${t.critical ? "yes" : "no"} | ${mdSafe(t.expected)} |`);
  out.push("");
  return out.join("\n");
}

export function feedbackPacket(state: State, realNow: number): string {
  const now = simNow(state, realNow);
  const out = header("Product feedback packet", state, now);
  const verified = state.feedback.filter((f) => f.kind === "verified");
  const hyps = state.feedback.filter((f) => f.kind === "hypothesis");
  out.push("\"Verified\" means verified inside this synthetic pilot against a cited run, resolved blocker or rollout. It is not evidence about any real customer.", "");
  out.push("## Verified findings (with evidence)", "");
  if (!verified.length) out.push("None recorded. A finding cannot be marked verified without a citation.");
  for (const f of verified) out.push(`- ${f.id} [${f.evidenceRef}] ${mdSafe(f.text)}`);
  out.push("", "## Hypotheses (to test, not evidence)", "");
  for (const f of hyps) out.push(`- ${f.id}${f.evidenceRef ? ` [related: ${f.evidenceRef}]` : ""} ${mdSafe(f.text)}`);
  for (const [i, h] of SEED_HYPOTHESES.entries()) out.push(`- H-${i + 1} (seed) ${mdSafe(h)}`);
  out.push("", "## Next step", "", "Test each hypothesis in discovery interviews using the neutral guide in docs/discovery.md. Do not count this packet as interview evidence.", "");
  return out.join("\n");
}

export function renderExport(kind: ExportKind, state: State, realNow: number): string {
  if (kind === "handoff") return handoff(state, realNow);
  if (kind === "playbook") return playbook(state, realNow);
  return feedbackPacket(state, realNow);
}
