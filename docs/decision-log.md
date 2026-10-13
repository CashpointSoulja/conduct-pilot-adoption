# Decision log

| # | Decision | Alternatives | Reason |
|---|---|---|---|
| D-1 | Commit `design.md` and the visual guide before app code | Design while building | Brief asked for it; keeps the UI honest to measured brand values |
| D-2 | Open-licence fonts (Source Serif 4, Inter, Fragment Mono) | Proprietary live fonts | Cannot redistribute Flecha S / APK Narrative / ABC Diatype |
| D-3 | `#B83A0E` for small accent text | Live ember `#F85018` | Ember is 3.41:1 on white, below AA for body text |
| D-4 | Fictional account "Kestrel Building Materials" and a fuel surcharge change | A real-sounding customer | Synthetic-only rule; names chosen to avoid confusion with real firms |
| D-5 | Durable Object with SQLite storage per visitor | D1 with a visitor column | Isolation by construction, transactional writes, available on Workers Free |
| D-6 | Pure engine (`src/engine`) separate from storage | Logic in the Worker | Lets tests and evals run without Cloudflare; the same reducer runs in both |
| D-7 | Approval binds to revision + fingerprint + run id | Revision only | A newer run on the same revision is new evidence and needs a fresh sign-off |
| D-8 | Environment fixes from blockers bump the change revision | Keep revision for code edits only | The tested thing changed, so earlier evidence must stop counting |
| D-9 | Any failing test blocks, critical or not | Block on critical only | Brief: failed tests keep rollout blocked; the critical flag is informational in v1 |
| D-10 | Recovery owner = owner of the object a failed test covers; stale = test lead | One generic owner | Names the person who can actually fix it |
| D-11 | Unknown cohort values out of the denominator and counted separately | Treat unknown as inactive | Treating unknown as inactive turns missing data into a finding |
| D-12 | Mix warning at 20 points with n >= 5 | No split | Shows how an aggregate can hide a lagging role |
| D-13 | Verified feedback must cite a run, resolved blocker or rollout | Free text with a checkbox | Keeps hunches out of the verified list by rule |
| D-14 | Simulated clock instead of real waiting | Real timestamps only | Reviewers can see staleness in seconds; capped at 30 days |
| D-15 | Prepare Cloudflare config and dry run; do not deploy | Deploy to workers.dev | Brief: deploy only to an approved destination supplied separately |
