# Demo walkthrough: grounded script and deterministic flow

Script for a 90-120 second first-person walkthrough of the real local build. The video itself is
not produced in this repo. `demo/record.mjs` drives the running app through exactly these scenes
with a visible pointer, so every on-screen result comes from the real Worker, not a mock-up.

## Run the flow
```bash
npm run dev                    # terminal 1
cd demo && node record.mjs     # terminal 2: frames in demo/out/frames, scene starts in demo/out/timeline.json
```
Each run starts as a new visitor, so it begins from the synthetic seed and repeats the same states.
With measured narration lengths in `demo/out/vo/durations.json` (one WAV per line, keys `scene-index`),
each scene lasts at least as long as its narration; without it, lengths are estimated at 2.6 words
per second. A rehearsal run with measured lines took about 115 s with no console or page errors.

## Scenes
| Scene | On screen (real actions) | Narration | Grounded in |
|---|---|---|---|
| intro | Top of the app: synthetic banner, gate rail | This is Pilot-to-Adoption Proof, an independent concept I built for the Deployment Strategist role. Every account, person and number in it is synthetic. | Banner in public/index.html |
| scope | Scope section, Unknown baseline | A pilot starts with one workflow, two baselines and six acceptance tests. Lead time was never measured, so it stays Unknown, and no improvement is claimed. | src/fixtures/pilot.ts M-1 baseline Unknown |
| impact | Affected-object table | The fuel surcharge change is walked through a synthetic dependency graph, with each object's depth and owner. | src/engine/impact.ts |
| early | Approve clicked too early; refusal dialog lists gates and recovery owners | If I try to approve now, the server refuses. It lists every blocking gate, and names who recovers each one. | gates G2-G6, eval E1 |
| run1 | Run acceptance suite; AT-3 and AT-4 fail | The first run fails two of six tests, and each failure names the owner of the object it covers. | eval E2, E7 |
| assign | Assign owners to B-1, B-2, B-4 | Three blockers have no owner, so I give each one a named team. Until every blocker is owned, the gate stays red. | gate G2 |
| resolve | Resolve four blockers with notes; change moves to revision 3 | Resolving a blocker needs a note. The margin report gap is accepted as a risk, with its reason recorded. Fixing the environment bumps the change to revision three, so the earlier run no longer counts. | commands.ts resolveBlocker bumps changeRevision |
| approve | RUN-2 passes 6/6; change approver signs off; 8/8 gates | A fresh run passes six of six. The approver signs off on this exact revision and run, and all eight gates go green. | gate G7, eval E3 |
| stale | Advance simulated clock 25 h; G6 blocks, test lead named | Now I move the simulated clock forward twenty five hours. The evidence is stale, rollout is blocked again, and the test lead is named to recover it. | gate G6, eval E4/E5 |
| recover | RUN-3, re-approval, simulated rollout | A new run and a new approval clear the gate. The rollout is recorded as simulated. Nothing is written to any external system. | rollout command |
| cohort | Denominators (27/42 adoption) and 44-point role-mix warning | Adoption is shown with its denominator: twenty seven of forty two eligible users. Exclusions and unknowns stay out of it, and a warning shows two roles forty four points apart. | eval E9, cohort.ts mix warning |
| import | Import sample with errors; rejected whole, cohort unchanged | A cohort file with bad rows is rejected whole, with each error listed, and nothing changes. | eval E12 |
| exports | Verified finding refused without evidence, then cited; feedback packet preview | A verified finding must cite evidence, so this one is refused until I attach the run. The feedback packet keeps verified findings apart from hypotheses, for customer success and product. | eval E10, exports.ts feedbackPacket |
| close | Back to top | An independent concept by Ayo Ahmed. Not affiliated with Conduct, and not deployed. | README non-affiliation notice |

Caption line breaks are in `demo/narration.json` (`|` marks the break).

## Claims check
Every spoken figure (two of six failures, revision three, 25 hours, 27 of 42, 44 points) comes
from the synthetic seed and is visible on screen in the same scene. The script claims no deployment,
customer, interview, Conduct internals or measured result.
