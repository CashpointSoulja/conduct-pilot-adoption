# Discovery: hypotheses and neutral interview guide

No interviews have been run for this concept. Nothing below is evidence; it is a plan.

## Hypotheses
| ID | Hypothesis | Would be supported if | Would be weakened if |
|---|---|---|---|
| H-1 | Deployment time is lost re-deriving who owns each downstream dependency for every change | Interviewees describe recent changes where owner discovery took days, unprompted | Owners are already listed in a tool people trust and use |
| H-2 | Approvals given on an earlier revision are reused after the change moves | People recall a rollout that differed from what was approved | Change tools already invalidate approvals on edit and people rely on it |
| H-3 | Activation reported without exclusions overstates adoption in mixed-role cohorts | Read-outs people share lack denominators or exclusions | Read-outs already split by role with explicit denominators |
| H-4 | Stale test evidence is a real cause of failed go-lives | People can name a go-live that relied on evidence from before a late edit | Test evidence is always re-run as part of release |
| H-5 | A playbook generated from the gates actually used is more reusable than a hand-written one | Teams describe playbooks that drift from practice | Existing playbooks are maintained and followed |

## Who to talk to (target, not done)
Deployment and implementation leads, SAP functional analysts, integration developers, test leads,
change approvers, and customer success managers who inherit enterprise accounts. Aim for 8-12
conversations across at least three roles before trusting any pattern.

## Neutral interview guide
Ask about the past, not about this concept. Do not show the prototype until the last section.

1. Tell me about the last change you took from request to production. What happened first?
2. Who did you need to involve? How did you find out who they were?
3. What was the longest wait in that change? What were you waiting for?
4. How did you know the change was tested enough? When were the tests run relative to the last edit?
5. Who approved it? What exactly did they look at when they approved?
6. After go-live, how did you know whether people were using it? What number did you report?
7. Who was included in that number? Who was left out, and why?
8. What did you hand over to the next team? What did they ask you for afterwards?
9. Is there anything you raised with the product team? What happened to it?
10. (Only now) Here is a rough prototype. Where does it not match how you work?

Rules: no leading questions ("wouldn't it be useful if..."), no pitching, record exact words,
separate what people did from what they say they would do.
