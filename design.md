# Design: Pilot-to-Adoption Proof

Independent concept by Ayo Ahmed. Not affiliated with, endorsed by, or built for Conduct AI Ltd.
Committed before any application code, so the build follows it rather than the reverse.

## 1. What I inspected

On 2026-10-13 I loaded https://conduct.ai/ and https://conduct.ai/solutions in a headless browser at
1366x900 and 390x844, took screenshots, read computed styles from the DOM and sampled pixels.
Those reference captures are kept out of this repository on purpose: they are Conduct's pages and
product illustrations, and this concept must not copy their screens.

Measured (computed style or pixel sample):

| Element | Live value | Source |
|---|---|---|
| Primary ink | `rgb(30, 13, 21)` = `#1E0D15` (headings, wordmark fill) | computed `color` on h1, logo `fill` |
| Secondary ink | `rgb(29, 29, 10)` = `#1D1D0A` (metric figures) | computed `color` on h2 |
| Accent | `rgb(248, 80, 24)` = `#F85018` (eyebrow labels, CTA border, highlighted clause) | computed `color` |
| Light accent band | `#FFE5D8` (announcement bar, closing CTA section) | pixel sample |
| Product card surface | `#F7F7F7` inside white rounded panels | pixel sample |
| Gradient wash | warm cream `#FFF1DE` to amber `#FC9432` to ember `#F85018` to rose `#F0454B`, horizontal blurred bands | pixel samples on hero |
| Display face | "Flecha S Regular", 48-56px, weight 400, letter-spacing -0.04em | computed `font-family` |
| UI face | "APK Narrative Regular" / "ABC Diatype Medium" / Inter | computed `font-family` on body copy |
| Label face | "APK Narrative Mono" 11px uppercase, letter-spacing 1.2px, ink at 60% | computed nav style |
| Buttons | white pill, `border-radius: 350px`, 1px ember border, ink label | computed + screenshot |
| Layout | 40px side gutter at 1366, hairline rules under section labels, generous whitespace, product UI shown as white rounded cards floating on the ember wash | screenshot |

## 2. What I take, and what I do not

Take (the visual language): ink-on-white with one hot accent, serif display headings, mono
uppercase section labels with hairlines, white pill buttons with ember outline, soft ember wash
behind product cards, rounded white cards with `#F7F7F7` rows.

Do not take:
- Conduct's product screens, flows, object names, copy, customer logos or case-study figures.
- Proprietary fonts. Flecha S, APK Narrative and ABC Diatype are commercial faces served to
  conduct.ai; they are not redistributed here. Open-licensed fallbacks (SIL OFL 1.1), self-hosted
  from `/fonts` with licences alongside:
  - Display: **Source Serif 4** 400 (closest open serif in weight and contrast to Flecha S).
  - UI: **Inter** 400/500/600 (conduct.ai already uses Inter for some UI text).
  - Labels and IDs: **Fragment Mono** 400 (conduct.ai also loads it from Google Fonts).
- Customer data. Every account, user, object, test and number in the app is synthetic and labelled.

## 3. Company mark

- The Conduct wordmark is the literal inline SVG from the live site header (paths unchanged; the
  CSS variable fill was resolved to its fallback `#1E0D15`). Stored at `public/brand/conduct-wordmark.svg`.
- It is contextual and secondary: it appears once, small, in a "Concept for" slot after Ayo's
  authorship line, never as the product's own logo. The product name "Pilot-to-Adoption Proof" and
  "Independent concept by Ayo Ahmed" lead the header.
- Every page carries: "Independent concept by Ayo Ahmed. Not affiliated with Conduct AI Ltd.
  All data synthetic."

### Publication restrictions (documented)
- Conduct's Terms (conduct.ai/legal/terms, section 4) reserve all IP in the Platform and its
  documentation to Conduct AI Ltd; the only logo-use permission in those terms concerns contracting
  parties. No permission to use the mark has been granted to this project. Use here is nominative
  (identifying the company the concept is addressed to) and must be removed on request.
- No customer or partner logos from conduct.ai are reproduced.
- Do not present screenshots of this concept as Conduct's product, and do not imply Conduct
  reviewed, endorsed or uses it.

## 4. Product surface

One page, one synthetic pilot, worked left to right like a deployment checklist. Sections, in order:

1. **Pilot scope**: objective, in-scope workflow, baseline metrics (value plus source, or Unknown),
   acceptance tests with expected values and a critical flag.
2. **Change impact**: the requested change, its changed objects, and the downstream dependencies
   reached through the synthetic graph, each with depth, edge type and owner team.
3. **Blockers**: technical blockers with an assigned owner; unowned or open blockers hold rollout.
4. **Acceptance evidence**: run the acceptance suite against the simulated environment; each result
   shows expected vs actual, run time, revision and freshness. Failed or stale results name a
   recovery owner.
5. **Approval and rollout**: approval bound to the current change revision and fingerprint; a
   gate list where every item must be green before a clearly-labelled simulated rollout.
6. **Cohort**: synthetic pilot cohort import (atomic CSV), activation and adoption with numerator,
   denominator, exclusions and unknowns, plus a by-role split showing the aggregate can mislead.
7. **Exports**: customer success handoff, reusable deployment playbook, product feedback packet
   (verified findings with evidence references, separate from hypotheses).

### Components
- Header: 64px, white, hairline bottom. Left: product name in Source Serif 4 22px, authorship
  line in Fragment Mono 11px. Right: "Concept for" + wordmark at 16px height, Reset button.
- Section label: Fragment Mono 11px uppercase, tracking 1.2px, ink-60, hairline to the right.
- Section heading: Source Serif 4 32px desktop / 26px mobile, -0.03em, ink; a second clause in
  ember-text for emphasis (mirrors the site's two-tone headings).
- Card: white, 20px radius, ink-12 hairline, soft shadow; rows inside on `#F7F7F7` with 12px radius.
- Ember wash: used only behind the gate summary hero card, never behind body text.
- Status chip: pill, mono 11px uppercase. PASS (green), FAIL (red), STALE (amber), UNKNOWN (grey),
  BLOCKED (red), SIMULATED (ink outline). Text label always present; colour never carries meaning alone.
- Buttons: primary = ink fill, white text, pill. Secondary = white pill with ember border.
  Disabled = ink-12 border, ink-60 text, `aria-disabled` with the reason in adjacent text.
- Dialogs: native `<dialog>` with focus moved in, Escape closes, focus returns to the trigger.

### Colour and contrast rules
- `#F85018` on white is 3.41:1, below WCAG AA for body text, so it is used only for borders, large
  display text (>=24px) and decoration. Small accent text uses `--ember-text` `#B83A0E` (5.75:1 on
  white, 4.75:1 on `#FFE5D8`).
- Muted text uses `#6B5A62` (6.43:1 on white).
- Status chips use dark-on-tint pairs that each clear 4.5:1 (verified in tests/a11y run).

### Responsive
- >=1100px: two columns, sticky gate rail on the right with the rollout gate list.
- 700-1099px: single column, gate rail becomes a card at the top.
- <=699px (checked at 390px): single column, tables become stacked rows, header wraps the
  wordmark under the title, tap targets >=44px.

### Motion
- None beyond 150ms colour/border transitions; `prefers-reduced-motion` removes them.

## 5. Copy rules
- Every synthetic surface says so ("Synthetic fixture").
- Unknown stays "Unknown". No impact figure is shown when a baseline is missing.
- Rollout is always "Simulated rollout"; nothing is written to any external system.
- No claims about Conduct's internals, customers, outcomes or roadmap.

See `docs/visual-guide.html` (rendered tokens and components) and `docs/visual-guide.png`.
