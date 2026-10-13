# Assumptions

| ID | Assumption | Risk if wrong | How I would check |
|---|---|---|---|
| A-1 | One change per pilot is a useful unit for proving value | Pilots may bundle many changes; one-change view feels toy-like | Ask in interviews how pilots are scoped (Q1-Q3) |
| A-2 | Owners can be named per object at team level | Ownership may be contested or by person | Interview Q2 |
| A-3 | 24 h is a reasonable default freshness window | Too strict for slow test cycles, too loose for busy systems | Make configurable in v2; ask test leads |
| A-4 | 14-day activation window and 3-of-4-weeks adoption are sensible defaults | Different products have different usage rhythms | Ask CS what they report today (Q6-Q7) |
| A-5 | 20 known users is the minimum for a read-out | Small pilots never clear the bar | Allow a documented override with the reason in v2 |
| A-6 | A deployment strategist would keep this updated | If it becomes extra admin it will be skipped | Prototype test: time to update vs value seen |
| A-7 | Product teams value a verified/hypothesis split | They may want volume, not rigour | Ask product how feedback is triaged today |
| A-8 | The synthetic graph is representative enough to demonstrate the flow | Real dependency graphs are far larger | Explicitly out of scope; v2 notes import from a real source |
