// Executable expected/actual evaluations. `npm run eval` should be all green.
// `npm run eval:broken` swaps in a deliberately broken freshness rule that lets stale evidence
// through; the staleness evaluation must then turn red and the process must exit non-zero.
import { applyCommand, seedState, view } from "../src/engine/commands";
import { GATE_RULES, type GateRule } from "../src/engine/gates";
import type { State } from "../src/engine/types";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const broken = process.argv.includes("--broken");

const brokenFreshness: GateRule = {
  id: "G6", label: "Evidence is fresh (24 h) [DELIBERATELY BROKEN]",
  check: () => ({ pass: true, why: "Broken rule: never checks the age of the evidence.", recoveryOwner: null }),
};
const RULES = broken ? GATE_RULES.map((r) => (r.id === "G6" ? brokenFreshness : r)) : GATE_RULES;

type Step = [string, unknown?];
function play(steps: Step[]): { state: State; outcomes: { type: string; status: number; code?: string }[] } {
  let state = seedState(NOW);
  const outcomes: { type: string; status: number; code?: string }[] = [];
  for (const [type, payload] of steps) {
    try {
      state = applyCommand(state, { type, payload }, NOW, RULES).state;
      outcomes.push({ type, status: 200 });
    } catch (e: any) {
      outcomes.push({ type, status: e.status ?? 500, code: e.code });
    }
  }
  return { state, outcomes };
}

const GREEN: Step[] = [
  ["assignOwner", { blockerId: "B-1", ownerId: "O-INT" }],
  ["assignOwner", { blockerId: "B-2", ownerId: "O-FIN" }],
  ["assignOwner", { blockerId: "B-4", ownerId: "O-FIN" }],
  ...["B-1", "B-2", "B-3", "B-4"].map((b) => ["resolveBlocker", { blockerId: b, note: "Resolved in the synthetic environment." }] as Step),
  ["runSuite"],
];
const last = (o: { outcomes: { type: string; status: number; code?: string }[] }) => o.outcomes[o.outcomes.length - 1];

interface Case { id: string; name: string; expected: string; actual: () => string }
const cases: Case[] = [
  { id: "E1", name: "Seed rollout is blocked", expected: "409 gates_blocked", actual: () => { const r = last(play([["rollout"]])); return `${r.status} ${r.code}`; } },
  { id: "E2", name: "Seed first run: failing tests", expected: "AT-3,AT-4", actual: () => play([["runSuite"]]).state.runs[0].results.filter((r) => !r.passed).map((r) => r.testId).join(",") },
  { id: "E3", name: "Green path ends in simulated rollout", expected: "200", actual: () => String(last(play([...GREEN, ["approve", { approverId: "O-CAB", note: "Approved" }], ["rollout"]])).status) },
  { id: "E4", name: "Stale evidence (25 h) blocks approval", expected: "409 gates_blocked", actual: () => { const r = last(play([...GREEN, ["advanceClock", { hours: 25 }], ["approve", { approverId: "O-CAB", note: "Approved" }]])); return `${r.status} ${r.code}`; } },
  { id: "E5", name: "Stale evidence names a recovery owner", expected: "O-QA", actual: () => { const s = play([...GREEN, ["advanceClock", { hours: 25 }]]).state; return String(view(s, NOW).gates.find((g) => g.id === "G6")?.recoveryOwner); } },
  { id: "E6", name: "Approval for revision 3 does not cover revision 4", expected: "409 gates_blocked", actual: () => { const r = last(play([...GREEN, ["approve", { approverId: "O-CAB", note: "Approved" }], ["editChange", { surchargePct: 4, appliesTo: "haulage" }], ["rollout"]])); return `${r.status} ${r.code}`; } },
  { id: "E7", name: "Failed test names the covered object's owner", expected: "O-PRC", actual: () => { const s = play([...GREEN, ["editChange", { surchargePct: 3.5, appliesTo: "all" }], ["runSuite"]]).state; return String(view(s, NOW).gates.find((g) => g.id === "G5")?.recoveryOwner); } },
  { id: "E8", name: "Unknown baseline produces no delta", expected: "Not computable: baseline Unknown", actual: () => view(seedState(NOW), NOW).baselines[0].delta },
  { id: "E9", name: "Seed activation numerator/denominator", expected: "32/42", actual: () => { const m = view(seedState(NOW), NOW).cohort.metrics; return `${m.activation.numerator}/${m.activation.denominator}`; } },
  { id: "E10", name: "Verified finding without evidence is refused", expected: "422 evidence_required", actual: () => { const r = last(play([["addFeedback", { kind: "verified", text: "This is a claim without evidence" }]])); return `${r.status} ${r.code}`; } },
  { id: "E11", name: "Self-approval by a non-approver is refused", expected: "403 not_an_approver", actual: () => { const r = last(play([...GREEN, ["approve", { approverId: "O-PRC", note: "Mine" }]])); return `${r.status} ${r.code}`; } },
  { id: "E12", name: "Bad cohort row rejects the whole import", expected: "422 cohort_rejected", actual: () => { const r = last(play([["importCohort", { csv: "user_id,role,team,invited_on,first_use_on,active_weeks_last4,excluded\nSYN-U001,analyst,A,2026-09-01,,,\nSYN-U001,analyst,A,2026-09-01,,," }]])); return `${r.status} ${r.code}`; } },
];

let failed = 0;
console.log(broken ? "MODE: broken freshness rule (expect RED)\n" : "MODE: normal rules\n");
console.log("id   result  case | expected | actual");
for (const c of cases) {
  let actual: string;
  try { actual = c.actual(); } catch (e: any) { actual = `threw: ${e.message}`; }
  const pass = actual === c.expected;
  if (!pass) failed++;
  console.log(`${c.id.padEnd(4)} ${pass ? "GREEN " : "RED   "}  ${c.name} | ${c.expected} | ${actual}`);
}
console.log(`\n${cases.length - failed}/${cases.length} green${failed ? `, ${failed} red` : ""}`);
process.exit(failed ? 1 : 0);
