# Actual test results

> Historical pre-release note. The current publication record is [LIVE_RELEASE.md](LIVE_RELEASE.md), which supersedes any statement below that the app is not deployed or the video is not recorded.

Copied from command output on the build machine (Node 24, Wrangler 4.150.0 local runtime).
Nothing here was run against a deployed Worker; the app has not been deployed.

## Typecheck, unit/integration tests, evaluations, Wrangler dry run
```text
$ npm run typecheck
exit=0
$ npm test

 RUN  v2.1.9 .

 ✓ test/body.test.ts (11 tests) 10ms
 ✓ test/cohort.test.ts (5 tests) 14ms
 ✓ test/hostile.test.ts (5 tests) 21ms
 ✓ test/workflow.test.ts (34 tests) 135ms
 ✓ test/store.test.ts (10 tests) 140ms

 Test Files  5 passed (5)
      Tests  65 passed (65)
   Start at  17:05:16
   Duration  400ms (transform 267ms, setup 0ms, collect 489ms, tests 320ms, environment 1ms, prepare 196ms)

exit=0

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
✨ Read 19 files from the assets directory ./public
Total Upload: 54.49 KiB / gzip: 16.44 KiB
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
PASS  favicon links and /favicon.ico resolve (1366px) | /favicon.svg 200 image/svg+xml, /favicon.ico 200 image/vnd.microsoft.icon, /favicon.ico 200 image/vnd.microsoft.icon
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
PASS  favicon links and /favicon.ico resolve (390px) | /favicon.svg 200 image/svg+xml, /favicon.ico 200 image/vnd.microsoft.icon, /favicon.ico 200 image/vnd.microsoft.icon
PASS  second visitor starts at seed (isolation)
PASS  no horizontal scroll at 390px
PASS  tap targets >= 44px tall at 390px
PASS  axe wcag2a/aa violations: mobile seed | none
PASS  no console or page errors (mobile)
26/26 UI checks passed
```

Notes: axe runs the `wcag2a`, `wcag2aa` and `wcag21aa` rule tags, which include colour contrast.
Expected server refusals (409, 422) show in the browser console as resource errors and are
filtered; page errors, any other console error and any other HTTP response of 400 or above
(including a missing favicon) fail the check. Both widths also fetch every `<link rel=icon>` target
and `/favicon.ico` and require 200 with an image content type. Automated checks only; no
screen-reader user testing has been done.

## Local HTTP checks against `wrangler dev --local` (curl)
| Check | Expected | Actual |
|---|---|---|
| Visitor A assigns an owner | 200, revision 1 | 200, revision 1 |
| Same Idempotency-Key and body again | replay | 200 with `Idempotent-Replay: true` |
| Visitor B reads state | revision 0, no owner on B-1 | revision 0, no owner on B-1 |
| Command with `Origin: https://evil.example` | 403 | 403 |
| Form-encoded command | 415 | 415 |
| ASCII body over 128 KB with Content-Length (300,010 bytes) | 413 | 413 `too_large` |
| Multibyte body: 50,035 characters, 150,035 UTF-8 bytes | 413 | 413 `too_large` |
| Same multibyte body sent chunked, no Content-Length | 413 | 413 `too_large` |
| Truncated JSON `{"type":` | 400 JSON error | 400 `{"error":"invalid_json",...}` |
| Invalid UTF-8 bytes `{\xff\xfe}` | 400 JSON error | 400 `{"error":"invalid_encoding",...}` |
| 10 rounds of (oversized, chunked oversized, truncated JSON) in sequence | 413, 413, 400 each round | 413, 413, 400 in all 10 |
| `GET /favicon.ico`, `GET /favicon.svg` | 200 image | 200 `image/vnd.microsoft.icon`, 200 `image/svg+xml` |
| Forged `cpa_vid` cookie | replaced | new cookie issued, seed state |
| `GET /api/export/handoff` | 200 markdown attachment | 200 `text/markdown`, `Content-Disposition: attachment` |
| `GET /api/export/unknown` | 404 | 404 |

The request body limit counts UTF-8 bytes while the body streams (`src/body.ts`) and stops reading
once 128 KB is passed, so a body cannot get past the limit by using multibyte characters. One truncated-JSON request,
sent while `wrangler dev` was reloading after a source edit, failed in the local dev proxy with
"Network connection lost" (500). Rerunning the same sequence 10 times after the reload produced
the expected 400 JSON error every time. Wrangler's log reports that this proxy error affects only the request it occurred on.
