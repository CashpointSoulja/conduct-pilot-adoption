// Synthetic fixture. Every account, person, object, test and figure here is invented for this
// independent concept. The dependency graph is hand-authored, not the output of analysing any system.
import type { AcceptanceTest, Baseline, Blocker, ChangeRequest, Environment, GraphEdge, GraphNode, Owner } from "../engine/types";

export const ACCOUNT = {
  name: "Kestrel Building Materials (fictional)",
  label: "Synthetic fixture",
  pilotId: "PILOT-SYN-01",
};

export const OWNERS: Owner[] = [
  { id: "O-DS", role: "Deployment strategist", canApprove: false },
  { id: "O-PRC", role: "Pricing functional analyst", canApprove: false },
  { id: "O-INT", role: "Integration developer", canApprove: false },
  { id: "O-FIN", role: "Finance systems controller", canApprove: true },
  { id: "O-QA", role: "Test lead", canApprove: false },
  { id: "O-SEC", role: "Authorisation admin", canApprove: false },
  { id: "O-CAB", role: "Change advisory approver", canApprove: true },
];

export const NODES: GraphNode[] = [
  { id: "OBJ-COND", name: "Surcharge rate table", owner: "O-PRC", changed: true },
  { id: "OBJ-PRICING", name: "Freight surcharge pricing step", owner: "O-PRC", changed: true },
  { id: "OBJ-ORDER-UI", name: "Sales order entry screen", owner: "O-PRC" },
  { id: "OBJ-INVOICE", name: "Invoice output layout", owner: "O-PRC" },
  { id: "OBJ-CARRIER", name: "Carrier outbound interface", owner: "O-INT" },
  { id: "OBJ-REV", name: "Revenue posting rule", owner: "O-FIN" },
  { id: "OBJ-AUTH", name: "Rate maintenance role", owner: "O-SEC" },
  { id: "OBJ-REPORT", name: "Weekly margin report", owner: "O-FIN" },
  { id: "OBJ-WMS", name: "Warehouse pick list", owner: "O-INT" },
  { id: "OBJ-CREDIT", name: "Customer credit check", owner: "O-FIN" },
];

export const EDGES: GraphEdge[] = [
  { from: "OBJ-COND", to: "OBJ-PRICING", kind: "reads rate" },
  { from: "OBJ-COND", to: "OBJ-AUTH", kind: "maintained under" },
  { from: "OBJ-PRICING", to: "OBJ-ORDER-UI", kind: "displays line" },
  { from: "OBJ-PRICING", to: "OBJ-INVOICE", kind: "prints line" },
  { from: "OBJ-PRICING", to: "OBJ-CARRIER", kind: "sends line items" },
  { from: "OBJ-PRICING", to: "OBJ-REV", kind: "posts amount" },
  { from: "OBJ-REV", to: "OBJ-REPORT", kind: "aggregates" },
];

export const ACCEPTANCE_TESTS: AcceptanceTest[] = [
  { id: "AT-1", title: "Haulage order (net GBP 1,200.00) gets the surcharge line", covers: "OBJ-PRICING", critical: true, expected: "42.00" },
  { id: "AT-2", title: "Non-haulage order (net GBP 800.00) gets no surcharge", covers: "OBJ-ORDER-UI", critical: true, expected: "0.00" },
  { id: "AT-3", title: "Carrier message carries the SURCHARGE line type", covers: "OBJ-CARRIER", critical: true, expected: "SURCHARGE present" },
  { id: "AT-4", title: "Surcharge posts to revenue account 4410", covers: "OBJ-REV", critical: true, expected: "4410" },
  { id: "AT-5", title: "Sales clerk cannot edit the surcharge rate", covers: "OBJ-AUTH", critical: false, expected: "denied" },
  { id: "AT-6", title: "Invoice prints the line as \"Fuel surcharge\"", covers: "OBJ-INVOICE", critical: false, expected: "Fuel surcharge" },
];

export function seedChange(): ChangeRequest {
  return {
    id: "CR-SYN-014",
    title: "Add a fuel surcharge line to haulage sales orders",
    requestedBy: "O-PRC",
    params: { surchargePct: 3.5, appliesTo: "haulage" },
    changeRevision: 1,
  };
}

export function seedEnv(): Environment {
  return {
    carrierLineTypes: ["ITEM", "FREIGHT"],
    surchargeAccount: null,
    rateEditRoles: ["pricing_analyst"],
    invoiceLabel: "Fuel surcharge",
  };
}

export function seedBlockers(): Blocker[] {
  const b = (id: string, title: string, objectId: string, ownerId: Blocker["ownerId"], fix: Blocker["fix"]): Blocker =>
    ({ id, title, objectId, ownerId, status: "open", resolutionNote: null, fix, resolvedAt: null });
  return [
    b("B-1", "Carrier interface allowlist does not include a SURCHARGE line type", "OBJ-CARRIER", null, "carrier-line-type"),
    b("B-2", "No revenue account is mapped for the surcharge amount", "OBJ-REV", null, "surcharge-account"),
    b("B-3", "No non-production carrier endpoint; interface tests run against a recorded stub", "OBJ-CARRIER", "O-QA", null),
    b("B-4", "Weekly margin report has no acceptance test", "OBJ-REPORT", null, null),
  ];
}

export function seedBaselines(): Baseline[] {
  return [
    {
      id: "M-1", name: "Change lead time, request to production (median)", unit: "days",
      baseline: null, baselineSource: "Not yet measured", baselineMeasuredOn: null,
      pilotValue: 4, pilotSource: "Synthetic fixture value",
    },
    {
      id: "M-2", name: "Acceptance test cycle per change", unit: "hours",
      baseline: 16, baselineSource: "Synthetic fixture value (stands in for a customer-stated estimate)", baselineMeasuredOn: "2026-09-01",
      pilotValue: 6, pilotSource: "Synthetic fixture value",
    },
  ];
}

export const SEED_SCOPE = {
  objective: "Prove one requested pricing change can go from request to an approved, tested rollout with named owners for every blocker.",
  workflow: "Order-to-cash: haulage sales orders (synthetic)",
};

export const SEED_HYPOTHESES = [
  "Deployment time is lost re-deriving who owns each downstream dependency for every change.",
  "Approvals given on an earlier revision are reused after the change moves, without anyone noticing.",
  "Activation numbers reported without exclusions overstate adoption in mixed-role cohorts.",
];

const roles = ["analyst", "developer", "tester", "business"] as const;
export function seedCohortCsv(): string {
  const lines = ["user_id,role,team,invited_on,first_use_on,active_weeks_last4,excluded"];
  // 48 synthetic users. Analysts activate well, developers poorly: the aggregate hides that split.
  for (let i = 1; i <= 48; i++) {
    const id = `SYN-U${String(i).padStart(3, "0")}`;
    const role = i <= 20 ? "analyst" : i <= 40 ? "developer" : roles[2 + (i % 2)];
    const team = role === "analyst" ? "Order to Cash" : role === "developer" ? "Integration" : role === "tester" ? "Quality" : "Commercial";
    const day = 1 + (i % 10);
    const invited = `2026-09-${String(day).padStart(2, "0")}`;
    let first = "";
    let weeks = "";
    let excluded = "";
    if (role === "analyst") { first = i <= 18 ? `2026-09-${String(day + 3).padStart(2, "0")}` : "none"; weeks = i <= 16 ? "4" : i <= 18 ? "2" : "0"; }
    else if (role === "developer") { first = i <= 29 ? `2026-09-${String(day + 6).padStart(2, "0")}` : i <= 38 ? "none" : ""; weeks = i <= 26 ? "3" : i <= 29 ? "1" : i <= 38 ? "0" : ""; }
    else { first = `2026-09-${String(day + 2).padStart(2, "0")}`; weeks = "3"; }
    if (i === 7) excluded = "test_account";
    if (i === 33) excluded = "left_company";
    if (i === 44) excluded = "on_leave";
    if (i === 45) excluded = "test_account";
    lines.push([id, role, team, invited, first, weeks, excluded].join(","));
  }
  return lines.join("\n") + "\n";
}
