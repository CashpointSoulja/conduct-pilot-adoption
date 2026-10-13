# Five Whys

Hypothesis-driven. I have not interviewed anyone for this concept; each "because" is a hypothesis
to test with the guide in `discovery.md`.

**Problem statement:** a pilot is declared a success, but adoption a quarter later is lower than
the pilot read-out suggested.

1. Why? Because the read-out reported one activation number for everyone invited.
2. Why did that mislead? Because test accounts and leavers were in the count, people with no data
   were treated as non-users or users depending on the report, and one strong role hid a weak one.
3. Why was nobody looking at the weak role? Because the deployment team's attention went to getting
   the change approved and rolled out, which took longer than planned.
4. Why did it take longer? Because each change touched objects nobody had listed, blockers sat
   without owners, and tests had to be re-run after late edits, sometimes after approval.
5. Why did that keep happening? Because there was no single place tying scope, dependencies,
   owners, evidence, approval and adoption to one revision of one change.

**What this concept tries:** one revision-bound gate list from scope to adoption, with
denominators shown wherever a percentage appears.
