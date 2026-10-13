export type OwnerId = "O-DS" | "O-PRC" | "O-INT" | "O-FIN" | "O-QA" | "O-SEC" | "O-CAB";

export interface Owner { id: OwnerId; role: string; canApprove: boolean }
export interface GraphNode { id: string; name: string; owner: OwnerId; changed?: boolean }
export interface GraphEdge { from: string; to: string; kind: string }

export interface Environment {
  carrierLineTypes: string[];
  surchargeAccount: string | null;
  rateEditRoles: string[];
  invoiceLabel: string;
}

export interface ChangeParams { surchargePct: number; appliesTo: "haulage" | "all" }
export interface ChangeRequest {
  id: string;
  title: string;
  requestedBy: OwnerId;
  params: ChangeParams;
  changeRevision: number;
}

export interface AcceptanceTest {
  id: string;
  title: string;
  covers: string;
  critical: boolean;
  expected: string;
}

export interface Baseline {
  id: string;
  name: string;
  unit: string;
  baseline: number | null;
  baselineSource: string;
  baselineMeasuredOn: string | null;
  pilotValue: number | null;
  pilotSource: string;
}

export interface Blocker {
  id: string;
  title: string;
  objectId: string;
  ownerId: OwnerId | null;
  status: "open" | "resolved";
  resolutionNote: string | null;
  fix: "carrier-line-type" | "surcharge-account" | null;
  resolvedAt: number | null;
}

export interface TestResult {
  testId: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export interface SuiteRun {
  id: string;
  at: number;
  changeRevision: number;
  fingerprint: string;
  results: TestResult[];
}

export interface Approval {
  approverId: OwnerId;
  note: string;
  at: number;
  changeRevision: number;
  fingerprint: string;
  runId: string;
}

export interface Rollout {
  id: string;
  at: number;
  changeRevision: number;
  fingerprint: string;
  runId: string;
  wave: number;
  eligibleUsers: number;
}

export type Exclusion = "" | "test_account" | "left_company" | "on_leave";
export interface CohortRow {
  userId: string;
  role: "analyst" | "developer" | "tester" | "business";
  team: string;
  invitedOn: string;
  firstUseOn: string | "none" | null;
  activeWeeksLast4: number | null;
  excluded: Exclusion;
}

export interface Cohort { rows: CohortRow[]; source: "seed" | "import"; importedAt: number; fingerprint: string }

export interface Feedback {
  id: string;
  kind: "verified" | "hypothesis";
  text: string;
  evidenceRef: string | null;
  at: number;
}

export interface EventEntry { at: number; revision: number; type: string; summary: string }

export interface State {
  schema: 1;
  revision: number;
  createdAt: number;
  simOffsetMs: number;
  scope: { objective: string; workflow: string };
  baselines: Baseline[];
  change: ChangeRequest;
  env: Environment;
  blockers: Blocker[];
  runs: SuiteRun[];
  approval: Approval | null;
  rollouts: Rollout[];
  cohort: Cohort;
  feedback: Feedback[];
  events: EventEntry[];
  counters: { run: number; rollout: number; feedback: number };
}

export interface Command { type: string; payload?: unknown }

export class CommandError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
