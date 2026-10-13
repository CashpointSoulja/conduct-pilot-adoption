# Claims and caveats ledger

> Historical pre-release note. The current publication record is [LIVE_RELEASE.md](LIVE_RELEASE.md), which supersedes any statement below that the app is not deployed or the video is not recorded.

| Claim made in the app, docs or video | Basis | Caveat |
|---|---|---|
| Independent concept by Ayo Ahmed | Authorship of this repo | Not affiliated with, endorsed by, or built for Conduct AI Ltd |
| All data is synthetic | `src/fixtures/pilot.ts`; cohort IDs must match `SYN-U###` | Names are invented; any resemblance is unintended |
| The dependency map shows affected objects | BFS over a hand-authored graph | Not analysis of any real system; no SAP or ABAP involved |
| Acceptance tests ran | `runAcceptance` against a synthetic environment object | No real system was tested |
| Rollout happened | A simulated rollout record | Nothing was deployed or written anywhere external |
| Activation 76.2% (32/42), adoption 64.3% (27/42) | Seed cohort, `npm run eval` E9 | Synthetic numbers; not a measured result |
| M-2 delta -10 h | Two synthetic fixture values | Labelled synthetic; M-1 has no delta because its baseline is Unknown |
| Visitor isolation, revision checks, idempotency | Tests in `test/store.test.ts`, local curl checks in `test-results.md` | Verified locally with Wrangler's local runtime, not on deployed Cloudflare |
| Accessibility checks pass | axe-core WCAG 2 A/AA rules and keyboard checks in `scripts/ui-check.mjs` | Automated checks only; no screen-reader user testing |
| Conduct's public positioning (SAP, change requests, 48h go-live) | Public website, see `research.md` | Company claims, not verified by me |
