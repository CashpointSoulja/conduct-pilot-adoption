# Trade-offs

| Decision | Chosen | Gave up | Why |
|---|---|---|---|
| Data | Hand-authored synthetic fixture | Realism of a real system | Brief forbids real SAP access or ABAP claims; synthetic data can be published |
| Storage | One SQLite-backed Durable Object per visitor | Cross-visitor views, analytics | Visitor isolation by construction; works on Workers Free |
| State shape | One JSON document per visitor, written in a transaction | Fine-grained queries | Small bounded state; atomic writes are simpler to reason about |
| Concurrency | Optimistic revision check (409 on mismatch) | Silent merging | A stale tab must never overwrite newer evidence or approval |
| Idempotency | Client key per command, stored for successes only, last 200 kept | Replaying failures | A corrected retry should not be stuck behind a stored error |
| Gate strictness | Any failed or stale test blocks, including non-critical | Flexibility for minor tests | Brief: failed/stale keeps rollout blocked; overrides belong in v2 with a reason |
| Rollout | Simulated record only | Showing a real deploy | No external writes allowed |
| Frontend | Vanilla JS, no framework, no build step | Component ergonomics | Smaller attack surface, textContent-only rendering, no bundler on Workers |
| Time | Simulated clock offset per workspace | Real waiting | Lets a reviewer see staleness in seconds; capped at 30 days |
| Fonts | Open-licence fallbacks | Pixel-exact brand type | Proprietary fonts may not be redistributed |
