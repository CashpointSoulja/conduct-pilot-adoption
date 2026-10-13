# Build vs buy memo

**Question:** if a deployment team wanted revision-bound pilot gates and denominator-honest
adoption reporting, should it build something like this or use existing tools?

**Options considered (from general knowledge of the categories, not product evaluations):**
1. Spreadsheet plus ticketing tool. Cheap and familiar. Approvals and evidence are not bound to a
   revision; denominators depend on whoever builds the sheet.
2. ALM / test management tooling already in the customer's estate. Strong on test evidence and
   transports. Usually owned by the customer, not the vendor's deployment team, and does not carry
   adoption or the CS handoff.
3. Product analytics tool. Strong on usage. Does not know about change revisions, blockers or
   approvals.
4. Build a thin layer (this concept). Ties the above together at one revision, but is another tool
   to maintain.

**Recommendation:** buy or reuse for the heavy parts (test execution, analytics, ticketing) and
build only the thin binding layer: the gate rules, the revision fingerprint, the denominator rules
and the exports. That is what this repo is. If the deployment team already has a platform with
extension points, the gate rules and cohort rules here are small enough (`src/engine/gates.ts`,
`src/engine/cohort.ts`) to port into it.

**What I have not done:** priced or trialled any product. This memo is a framing, not a
procurement recommendation.
