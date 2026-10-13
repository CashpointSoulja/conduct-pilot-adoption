# Actual test results

Copied from command output on the build machine (Node 24, Wrangler 4.150.0 local runtime).
Nothing here was run against a deployed Worker; the app has not been deployed.

## Typecheck, unit/integration tests, evaluations, Wrangler dry run
```text
$ npm run typecheck
exit=0
$ npm test
 RUN  v2.1.9 .

 ✓ test/cohort.test.ts (5 tests) 17ms
 ✓ test/hostile.test.ts (5 tests) 40ms
 ✓ test/workflow.test.ts (34 tests) 128ms
 ✓ test/store.test.ts (10 tests) 164ms

 Test Files  4 passed (4)
      Tests  54 passed (54)
   Start at  15:47:30
   Duration  460ms (transform 249ms, setup 0ms, collect 457ms, tests 350ms, environment 1ms, prepare 199ms)

$ npm run eval
MODE: normal rules

id   result  case | expected | actual
E1   GREEN   Seed rollout is blocked | 409 gates_blocked | 409 gates_blocked
E2   GREEN   Seed first run: failing tests | AT-3,AT-4 | AT-3,AT-4
E3   GREEN   Green path ends in simulated rollout | 200 | 200
E4   GREEN   Stale evidence (25 h) blocks approval | 409 gates_blocked | 409 gates_blocked
E5   GREEN   Stale evidence names a recovery owner | O-QA | O-QA
E6   GREEN   Approval for revision 3 does not cover revision 4 | 409 gates_blocked | 409 gates_blocked
E7   GREEN   Failed test names the covered object's owner | O-PRC | O-PRC
E8   GREEN   Unknown baseline produces no delta | Not computable: baseline Unknown | Not computable: baseline Unknown
E9   GREEN   Seed activation numerator/denominator | 32/42 | 32/42
E10  GREEN   Verified finding without evidence is refused | 422 evidence_required | 422 evidence_required
E11  GREEN   Self-approval by a non-approver is refused | 403 not_an_approver | 403 not_an_approver
E12  GREEN   Bad cohort row rejects the whole import | 422 cohort_rejected | 422 cohort_rejected

12/12 green
exit=0
$ npm run eval:broken
MODE: broken freshness rule (expect RED)

id   result  case | expected | actual
E1   GREEN   Seed rollout is blocked | 409 gates_blocked | 409 gates_blocked
E2   GREEN   Seed first run: failing tests | AT-3,AT-4 | AT-3,AT-4
E3   GREEN   Green path ends in simulated rollout | 200 | 200
E4   RED     Stale evidence (25 h) blocks approval | 409 gates_blocked | 200 undefined
E5   GREEN   Stale evidence names a recovery owner | O-QA | O-QA
E6   GREEN   Approval for revision 3 does not cover revision 4 | 409 gates_blocked | 409 gates_blocked
E7   GREEN   Failed test names the covered object's owner | O-PRC | O-PRC
E8   GREEN   Unknown baseline produces no delta | Not computable: baseline Unknown | Not computable: baseline Unknown
E9   GREEN   Seed activation numerator/denominator | 32/42 | 32/42
E10  GREEN   Verified finding without evidence is refused | 422 evidence_required | 422 evidence_required
E11  GREEN   Self-approval by a non-approver is refused | 403 not_an_approver | 403 not_an_approver
E12  GREEN   Bad cohort row rejects the whole import | 422 cohort_rejected | 422 cohort_rejected

11/12 green, 1 red
exit=1
$ npm run check:wrangler
 ⛅️ wrangler 4.150.0
────────────────────
✨ Read 17 files from the assets directory ./public
Total Upload: 53.33 KiB / gzip: 16.06 KiB
Your Worker has access to the following bindings:
Binding                             Resource            
env.WORKSPACE (PilotWorkspace)      Durable Object      
env.ASSETS                          Assets              
--dry-run: exiting now.
exit=0
```

`npm run eval:broken` replaces the G6 freshness rule with one that always passes. E4 turns red and
the process exits 1, which shows the evaluation catches a weakened gate.

## Browser checks (`npm run ui:check`, Playwright Chromium + axe-core, against `npm run dev`)
Desktop 1366x900 and mobile 390x844, two separate visitors. Screenshots in `screenshots/`.
```text
PASS  axe wcag2a/aa violations: desktop seed | none
PASS  first Tab focuses skip link | Skip to content
PASS  skip link moves focus to main
PASS  approve dialog moves focus inside
PASS  early approval refused with recovery owners
PASS  axe wcag2a/aa violations: refusal dialog open | none
PASS  Escape closes dialog and returns focus to trigger
PASS  seed run shows AT-3 and AT-4 failing
PASS  old run flagged as old revision after environment fixes
PASS  stale evidence blocks rollout and names test lead
PASS  rollout click while stale is refused by the server
PASS  recovery path ends in simulated rollout
PASS  hostile/malformed cohort import rejected with row errors
PASS  cohort unchanged after rejected import
PASS  verified finding without evidence refused
PASS  feedback export separates verified from hypotheses
PASS  axe wcag2a/aa violations: export dialog open | none
PASS  axe wcag2a/aa violations: desktop after full flow | none
PASS  no console or page errors (desktop)
PASS  second visitor starts at seed (isolation)
PASS  no horizontal scroll at 390px
PASS  tap targets >= 44px tall at 390px
PASS  axe wcag2a/aa violations: mobile seed | none
PASS  no console or page errors (mobile)
24/24 UI checks passed
```

Notes: axe runs the `wcag2a`, `wcag2aa` and `wcag21aa` rule tags, which include colour contrast.
Expected server refusals (409, 422) show in the browser console as resource errors and are
filtered; page errors and any other console error fail the check. Automated checks only; no
screen-reader user testing has been done.

## Local HTTP checks against `wrangler dev --local` (curl)
| Check | Expected | Actual |
|---|---|---|
| Visitor A assigns an owner | 200, revision 1 | 200, revision 1 |
| Same Idempotency-Key and body again | replay | 200 with `Idempotent-Replay: true` |
| Visitor B reads state | revision 0, no owner on B-1 | revision 0, no owner on B-1 |
| Command with `Origin: https://evil.example` | 403 | 403 |
| Form-encoded command | 415 | 415 |
| Body over 128 KB | 413 | 413 |
| Forged `cpa_vid` cookie | replaced | new cookie issued, seed state |
| `GET /api/export/handoff` | 200 markdown attachment | 200 `text/markdown`, `Content-Disposition: attachment` |
| `GET /api/export/unknown` | 404 | 404 |
