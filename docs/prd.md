# PRD: Pilot-to-Adoption Proof

Independent concept by Ayo Ahmed. Not affiliated with Conduct AI Ltd. All data synthetic.

## Problem
I think the riskiest stretch of an enterprise software deployment is the gap between "the pilot
worked" and "people use it". A requested change touches more objects than the request names,
blockers sit without owners, test evidence goes stale while the change keeps moving, approvals get
reused across revisions, and adoption is reported as one number with no denominator. Each of these
is a hypothesis about deployment work in general (see `discovery.md`), not a claim about any
company's customers.

## Who it is for
- Primary: a deployment strategist running the first change of a pilot with an enterprise account.
- Secondary: the account's change approver, test lead and the customer success owner who inherits
  the account after rollout.

## Goal
One screen where a deployment strategist can prove, with evidence tied to an exact revision, that
a change is safe to roll out and is being adopted, and hand that proof to customer success and
product.

## Non-goals
- Reading or writing any real ERP, SAP system, transport or customer data. No ABAP analysis.
- Reproducing Conduct's product or internals.
- Measuring business impact. Pilot values are synthetic.
- Real rollout, email, tickets or messages.

## Requirements (all implemented in this repo)
| # | Requirement | Where |
|---|---|---|
| R1 | Scope: objective, workflow, baselines with source or Unknown, acceptance tests with expected values | `src/fixtures/pilot.ts`, `setScope`, `setBaseline` |
| R2 | Unknown baseline never produces a delta | `baselineView` in `src/engine/commands.ts` |
| R3 | Map the change through a synthetic dependency graph: depth, relation, owner | `src/engine/impact.ts` |
| R4 | Blockers need an owner; resolution needs a note; environment fixes bump the change revision | `assignOwner`, `resolveBlocker` |
| R5 | Acceptance run against the synthetic environment: expected, actual, time, revision, fingerprint | `src/engine/suite.ts` |
| R6 | Failed or stale (>24 h) evidence blocks approval and rollout and names a recovery owner | `src/engine/gates.ts` G4-G6 |
| R7 | Approval binds to revision, fingerprint and cited run; requester and non-approvers refused | `approve`, gate G7 |
| R8 | Simulated rollout only when all eight gates pass; once per revision | `rollout` |
| R9 | Cohort: atomic CSV import, activation and adoption with numerator, denominator, exclusions, unknowns, immature invites, hold under 20, by-role split and mix warning | `src/engine/cohort.ts` |
| R10 | Exports: customer success handoff, deployment playbook, feedback packet with verified (cited) vs hypotheses | `src/engine/exports.ts` |
| R11 | Per-visitor SQLite isolation, revision checks, idempotency keys, bounded state | `src/store.ts`, `src/worker.ts` |

## Success measures for the concept
Defined with denominators in `metrics.md`. None has been measured with real users.

## Release
> Historical pre-release note. The current publication record is [LIVE_RELEASE.md](LIVE_RELEASE.md), which supersedes any statement below that the app is not deployed or the video is not recorded.

Local build and Cloudflare Workers Free configuration with a passing dry run. Not deployed.
