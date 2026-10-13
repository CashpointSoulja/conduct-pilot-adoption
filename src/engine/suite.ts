import { ACCEPTANCE_TESTS } from "../fixtures/pilot";
import { fingerprint } from "./hash";
import type { ChangeRequest, Environment, TestResult } from "./types";

export function changeFingerprint(change: ChangeRequest, env: Environment): string {
  return fingerprint({ id: change.id, rev: change.changeRevision, params: change.params, env });
}

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

// Runs the acceptance suite against the synthetic environment only. Nothing external is called.
export function runAcceptance(change: ChangeRequest, env: Environment): TestResult[] {
  const pct = change.params.surchargePct;
  const actual: Record<string, string> = {
    "AT-1": money((1200 * pct) / 100),
    "AT-2": change.params.appliesTo === "all" ? money((800 * pct) / 100) : "0.00",
    "AT-3": env.carrierLineTypes.includes("SURCHARGE") ? "SURCHARGE present" : "rejected: SURCHARGE not in allowlist",
    "AT-4": env.surchargeAccount ?? "unmapped",
    "AT-5": env.rateEditRoles.includes("sales_clerk") ? "allowed" : "denied",
    "AT-6": env.invoiceLabel,
  };
  return ACCEPTANCE_TESTS.map((t) => ({ testId: t.id, expected: t.expected, actual: actual[t.id], passed: actual[t.id] === t.expected }));
}
