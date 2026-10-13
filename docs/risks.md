# Risk register

| ID | Risk | Likelihood | Impact | Mitigation in this repo | Owner |
|---|---|---|---|---|---|
| R-1 | Reader mistakes the concept for an official Conduct product | Medium | High | Banner, footer, README and every export say independent and not affiliated; wordmark is secondary and labelled "Concept for a Conduct role" | Ayo |
| R-2 | Reader mistakes synthetic numbers for measured results | Medium | High | "Synthetic fixture" chips, deltas labelled "synthetic, not a measured result", Unknown baselines produce no delta | Ayo |
| R-3 | Visitors see each other's data | Low | High | Per-visitor Durable Object keyed by random 128-bit HttpOnly cookie; invalid cookies are replaced; tested | Ayo |
| R-4 | Stored hostile content executes in browser or spreadsheet | Low | Medium | textContent-only rendering; control/bidi characters rejected; exports escape HTML, markdown and formula prefixes; tested | Ayo |
| R-5 | Unbounded growth or abuse of free-tier storage | Medium | Medium | 128 KB body cap, 512 KB state cap, 500 cohort rows, bounded runs/events/idempotency rows, 14-day idle wipe via alarm | Ayo |
| R-6 | Double submit creates duplicate rollouts or runs | Medium | Medium | Idempotency keys plus natural once-per-revision rollout rule | Ayo |
| R-7 | Cross-site request triggers commands | Low | Medium | SameSite=Strict cookie, Origin check, JSON content type required | Ayo |
| R-8 | Brand use objected to by the company | Low | Medium | Nominative use only, no product screens, fonts or customer logos; remove the wordmark on request (see design.md) | Ayo |
| R-9 | Free plan limits change | Low | Low | No paid bindings; configuration documented; static fallback not needed for review | Ayo |
| R-10 | Video overstates what the demo shows | Medium | High | Video only shows real local footage; claims ledger in `claims-and-caveats.md` | Ayo |
