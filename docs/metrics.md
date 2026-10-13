# Metrics with denominators

Every metric names its numerator, denominator, exclusions and how Unknown is handled. In the app
these are computed on synthetic data only; none has been measured with real users.

## In-product pilot metrics (computed by `src/engine/cohort.ts`)
| Metric | Numerator | Denominator | Excluded | Unknown handling |
|---|---|---|---|---|
| Activation | Eligible, mature users whose first use is within 14 days of invite | Eligible, mature users with a known first use (`none` counts as known) | `test_account`, `left_company`, `on_leave`; invites under 14 days old (immature) | Empty `first_use_on` is Unknown: out of the denominator and reported as a count |
| Adoption | Eligible, mature users active in 3+ of the last 4 weeks | Eligible, mature users with known activity | Same as above | Empty `active_weeks_last4` is Unknown: out of the denominator, reported |
| Read-out hold | - | - | - | If either denominator is under 20, status is HOLD and gate G8 blocks rollout |
| Mix warning | - | Segments with n >= 5 | - | Raised when two roles' adoption differs by 20+ points |

Seed values (synthetic, `npm run eval` E9): activation 32 / 42 (76.2%), adoption 27 / 42 (64.3%),
4 excluded, 2 unknown first use, analysts 15 / 19 adoption vs developers 6 / 17.

## Baselines
| Metric | Baseline | Pilot | Delta rule |
|---|---|---|---|
| M-1 change lead time | Unknown (not measured) | 4 days (synthetic) | Not computable while the baseline is Unknown |
| M-2 acceptance cycle | 16 h (synthetic stand-in for a customer estimate) | 6 h (synthetic) | Shown, labelled synthetic, never as a measured result |

## Concept success metrics (proposed, unmeasured)
| Metric | Numerator / denominator | Why |
|---|---|---|
| Owner coverage before build | Blockers with an owner before first test run / all blockers raised | Tests H-1 |
| Revision-bound approvals | Rollouts whose approval cites the rolled-out revision and run / all rollouts | Tests H-2; target 100% by construction |
| Evidence freshness at approval | Approvals on evidence under 24 h old / all approvals | Tests H-4 |
| Denominator disclosure | Adoption read-outs showing denominator, exclusions and unknowns / all read-outs exported | Tests H-3 |
| Handoff reuse | Handoffs where CS asked no follow-up question in week 1 / handoffs sent | Usefulness of export |
