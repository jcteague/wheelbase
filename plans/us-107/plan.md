---
story: us-107
kind: feature
parent: null
topics: [alerts, pmcc, management-queue]
status: planned
---

# Implementation Plan: US-107 — Fire alert when LEAPS DTE drops below 60 days

## Summary

Add a medium-urgency `PMCC_LEAPS_ROLL_WINDOW` rule that fires while a PMCC's LEAPS has
0–60 calendar days to expiration, whether or not a short call is open. Rules now declare
which leg they read, so on a LEAPS-only PMCC the short-leg rules are inapplicable rather
than skipped. PMCC selection widens from "short open" to "LEAPS open". The queue badge
becomes leg-aware (`PMCC · LEAPS` / `PMCC · short call`). Done means all 8 Linear scenario
families pass as 12 named e2e cases, with wheel output unchanged.

## Supporting Documents

- **User Story & Acceptance Criteria:** [OPT-15 / US-107](https://linear.app/optionswheel/issue/OPT-15/us-107-fire-alert-when-leaps-dte-drops-below-60-days)
  (Linear is the authority; the table below is a test index, not a copy)
- **Research & Design Decisions:** `plans/us-107/research.md`
- **Data Model & Selection Logic:** `plans/us-107/data-model.md` (incl. § Type Design)
- **API Contract:** `plans/us-107/contracts/alerts-list.md` (additive `ruleCode`)
- **Quickstart & Verification:** `plans/us-107/quickstart.md`
- **Mockup:** `mockups/us-107-pmcc-leaps-dte-alert.mdx`

## Prerequisites

- **US-106 must be merged first.** This plan uses its planned names:
  `PMCC_ASSIGNMENT_RISK`, `loadPmccEvaluableRows`, `PmccCandidateRow`, the failed-selection
  keep-open set, `evaluate-alerts-pmcc.test.ts`, the PMCC badge branch in
  `ManagementQueueRow`, and `e2e/pmcc-assignment-risk-alert.spec.ts` (research § Starting point).
  Branch `wb-107` from `main` after it lands.
- Already on `main`: US-101 PMCC entry (`PMCC_OPEN`), US-103 `pmccOpenLegs` /
  `currentLeapsLeg` replay, US-104 short roll, US-105 `rollPmccLeaps` IPC, the US-50/51/52/59
  alert engine, queue and dismissal, and `computeDte`.
- No migration.

## Acceptance coverage audit

| Ref | Linear scenario → e2e test name                                                       | Cases | Areas   |
| --- | ------------------------------------------------------------------------------------- | ----- | ------- |
| S1  | Alert fires once the LEAPS has 60 days or fewer to expiration (60 / 59 / 30)          | 3     | 1,3,6   |
| S2  | Alert does not fire while the LEAPS has more than 60 days left (61 / 70)              | 2     | 1,3,6   |
| S3  | The queue row identifies the position as a PMCC and the LEAPS as the leg              | 1     | 4,5,6   |
| S4  | A PMCC with only the LEAPS open is still evaluated for this rule                      | 1     | 2,3,6   |
| S5  | Alert resolves when the LEAPS is rolled out past the window                           | 1     | 3,6     |
| S6  | The short-call rules and the LEAPS rule co-fire without reading each other's leg      | 1     | 2,3,6   |
| S7  | A LEAPS with no readable expiration keeps the alert open instead of resolving it      | 1     | 1,3,6   |
| S8  | Classic wheel positions do not use the PMCC rule (MSFT CC_OPEN 59 / AAPL CSP_OPEN 20) | 2     | 1,2,3,6 |

Total: 8 families, 12 named e2e cases.

## Implementation Areas

### 1. Pure LEAPS roll-window rule

**Files to create or modify:**

- `src/main/core/alerts.ts` — inputs, rule code, constant, `inDays`, summary helper, registry entry.
- `src/main/core/alerts.test.ts` — `makeInput` gains `leapsDte: null, leapsStrike: null`; new describe block.
- `src/main/core/alerts.property.test.ts` — new properties (file created by US-106).

**Red — tests to write:**

- `alerts.test.ts` › `PMCC_LEAPS_ROLL_WINDOW`: with `phase: 'PMCC_OPEN'`, `leapsStrike: '80.0000'`,
  table-test `leapsDte` 60, 59, 30, 2, 1, 0 → one MED match with exact summaries
  `LEAPS expires in 60 days at $80.00 strike — review for roll or close`, `…in 1 day…`,
  `…today…`, `quickAction: 'Review position'`.
- `leapsDte` 61, 70, 185, -1 → no PMCC_LEAPS_ROLL_WINDOW match and no skip.
- `leapsDte: null` on a PMCC → skipped `{ ruleCode: 'PMCC_LEAPS_ROLL_WINDOW', reason: 'missing_leaps_dte' }`, no match.
  `leapsStrike: null` with a valid DTE → skip `missing_strike`, no `$0.00` summary.
- For `CSP_OPEN` and `CC_OPEN` with `leapsDte` 59 **and** with `leapsDte: null` → neither
  a match nor a skip for the rule (S8 guard).
- Leg independence: PMCC input with short `dte: 2`, `strike: '112.0000'`, `leapsDte: 30`,
  `leapsStrike: '80.0000'` → EXPIRATION_IMMINENT summary `Expires in 2 days at $112.00 strike`
  and LEAPS summary with `$80.00`; no EXPIRATION_IMMINENT/MANAGEMENT_WINDOW summary
  contains `$80.00`.
- Existing EARNINGS_PROXIMITY summaries (`today`, `in 1 day`, `in N days`) still pass after
  `inDays` is extracted.
- `alerts.property.test.ts` (use `fc.integer({ min: -400, max: 800 })` for DTE and
  `positiveMoney` for strike):
  - **Oracle:** for every PMCC input, the rule matches ⇔ `0 <= leapsDte && leapsDte <= 60`.
    The oracle is the literal inequality from the story, not a call to the predicate.
  - **Guard:** for every wheel phase (`wheelPhase` arbitrary filtered by construction to
    `CSP_OPEN | CC_OPEN`) and any `leapsDte`/`leapsStrike` including null, there is no match
    or skip with this code.
  - **Invariant (leg independence):** for any PMCC input, arbitrary `leapsDte`/`leapsStrike`
    leave the set of non-LEAPS-rule matches and skips unchanged. Compare evaluations
    with the LEAPS fields set against the same input with them nulled; this is order- and
    value-independent, so it does not re-run the rule under test.

**Green — implementation:**

- `AlertEvaluationInput` gains `leapsDte: number | null` and `leapsStrike: string | null`
  (data-model § Type Design).
- `RuleCode` gains `'PMCC_LEAPS_ROLL_WINDOW'`; add `PMCC_LEAPS_ROLL_WINDOW_MAX_DTE = 60` and
  `MISSING_LEAPS_DTE = 'missing_leaps_dte'`.
- `PmccLeapsRollWindowInput = Pick<AlertEvaluationInput, 'leapsDte' | 'leapsStrike'>`.
- Extract `inDays(days: number): string`; `earningsProximitySummary` uses it.
  `pmccLeapsRollWindowSummary(input: PmccLeapsRollWindowInput)` builds the string in
  data-model § Rule.
- Append the `RULES` entry: `urgency: 'medium'`, `missingData` returns `MISSING_LEAPS_DTE`
  for null DTE and `MISSING_STRIKE` for a non-numeric strike (`isNumeric`), and `test`
  checks `0 <= leapsDte <= 60`. Phase gating comes from Area 2's `leg: 'leaps'`. Until
  Area 2 lands, gate inside `missingData`/`test` with `input.phase === 'PMCC_OPEN'` so
  this area is green on its own; Area 2 removes that inline gate.

**Refactor — cleanup to consider:**

- Update the registry header comment to name the new rule and that it reads the LEAPS
  only. Check `formatStrike` is reused, not re-implemented. No logging in core.

**Acceptance criteria covered:** S1, S2, S7 (engine), S8 (engine guard), S6 (engine).

### 2. Rules declare their leg; an absent leg makes the rule inapplicable

**Files to create or modify:**

- `src/main/core/alerts.ts` — `RuleLeg`, `LEG_PRESENT`, `leg` on every `RuleDefinition`, filter in `evaluatePosition`.
- `src/main/core/alerts.test.ts` — LEAPS-only cases.
- `src/main/core/alerts.property.test.ts` — inapplicability property.

**Red — tests to write:**

- LEAPS-only PMCC input (`phase: 'PMCC_OPEN'`, `instrumentType: null`, `strike: null`,
  `dte: null`, `expiration: null`, premium/contracts/mid null, `currentUnderlyingPrice: '118.80'`,
  `daysToEarnings: 3`, `leapsDte: 2`, `leapsStrike: '80.0000'`) → `skipped` is `[]` and
  `matches` is exactly one PMCC_LEAPS_ROLL_WINDOW. In particular there is **no**
  `missing_dte`, `missing_option_mark`, `missing_strike` or `missing_underlying_price` skip
  from EXPIRATION_IMMINENT, MANAGEMENT_WINDOW, PROFIT_TARGET, EARNINGS_PROXIMITY or
  PMCC_ASSIGNMENT_RISK.
- Wheel regression: a CSP_OPEN input with `dte: null` still skips EXPIRATION_IMMINENT and
  MANAGEMENT_WINDOW with `missing_dte` (short leg present, so the rules apply). Existing
  suite stays green unchanged except for the `makeInput` defaults.
- Remove the Area 1 inline phase gate and keep the wheel-guard tests green.
- **Property (guard):** for any PMCC input with `instrumentType: null` and arbitrary
  short-leg fields, no rule other than PMCC_LEAPS_ROLL_WINDOW appears in `matches` or
  `skipped`.

**Green — implementation:**

- `type RuleLeg = 'short' | 'leaps'`; `RuleDefinition` gains required `leg: RuleLeg`.
- `const LEG_PRESENT: Record<RuleLeg, (input: AlertEvaluationInput) => boolean> =
{ short: (i) => i.instrumentType !== null, leaps: (i) => i.phase === 'PMCC_OPEN' }`.
- Tag EXPIRATION_IMMINENT, MANAGEMENT_WINDOW, PROFIT_TARGET, STRIKE_PROXIMITY,
  EARNINGS_PROXIMITY, COVERED_CALL_BREACH and PMCC_ASSIGNMENT_RISK `leg: 'short'`, and
  PMCC_LEAPS_ROLL_WINDOW `leg: 'leaps'`.
- In `evaluatePosition`, compute `const applicable = RULES.filter((rule) => LEG_PRESENT[rule.leg](input))`
  once and run the existing skip/match pipeline over `applicable` instead of `RULES`.

**Refactor — cleanup to consider:**

- Update the registry comment: "each rule declares the leg it reads; a rule whose leg is
  absent produces neither a match nor a skip, so its stale alert resolves."
  Check whether any `missingData` now carries a redundant null-short check, and delete it
  only if it was made redundant by this change.

**Acceptance criteria covered:** S4 (engine), S6 (registry-level leg separation), S8.

### 3. Evaluate every PMCC whose LEAPS is open

**Files to create or modify:**

- `src/main/services/evaluate-alerts.ts` — `EvaluableRow` LEAPS columns, wheel SQL NULLs,
  `loadPmccEvaluableRows` via `pmccOpenLegs`, `toEvaluationInput` LEAPS fields.
- `src/main/services/evaluate-alerts-pmcc.test.ts` — new LEAPS-window describe block.
- `src/main/services/evaluate-alerts.test.ts` — wheel regression only if fixtures need the new columns.

**Red — tests to write** (issue calendar, `TZ=America/New_York`, `now` at 16:00Z):

- Window boundary: on 2027-07-19 / -07-20 / -08-18 an open MED PMCC_LEAPS_ROLL_WINDOW
  alert exists for XYZ with the exact S1 summary. On 2027-07-18 and 2027-07-09 none exists.
- Refresh in place: evaluate 2027-07-19 then 2027-07-20, and the same alert id and
  `triggered_at` carry the summary `…in 59 days…`. With dismiss between runs, it stays
  `dismissed` and no new open row appears.
- LEAPS-only (S4): evaluate 2027-08-19 (EXPIRATION_IMMINENT open for the short at 1 DTE),
  record `SHORT_CALL_EXPIRED`, evaluate 2027-09-15. Expect EXPIRATION_IMMINENT `resolved`,
  LEAPS row open with `…in 2 days at $80.00…`, and no other open XYZ alert. Also assert
  `fetchOptionSnapshots` was called with no XYZ symbol and never the LEAPS OCC.
- US-106 regression: a LEAPS-only PMCC with quote 118.80 does not produce
  PMCC_ASSIGNMENT_RISK and records no skip for it; a previously open assignment alert
  resolves.
- Co-fire (S6) on 2027-08-18: HIGH EXPIRATION_IMMINENT `Expires in 2 days at $112.00 strike`
  plus MED LEAPS row; no EXPIRATION_IMMINENT/MANAGEMENT_WINDOW summary contains `$80.00`
  or `2027-09-17`.
- Roll (S5): open on 2027-07-20, call the real `rollPmccLeapsPosition` to $85 / 2028-01-21,
  re-evaluate the same day → alert `resolved`, no new PMCC_LEAPS_ROLL_WINDOW row
  (185 DTE).
- Unreadable (S7): open on 2027-07-20, `UPDATE legs SET expiration = 'unreadable'` on the
  LEAPS leg id only, re-evaluate. The row stays `open` with the previous summary, the spy
  logger has `alert_rule_skipped` with `ruleCode: 'PMCC_LEAPS_ROLL_WINDOW'` and
  `reason: 'missing_leaps_dte'`, and `skippedRuleCount` ≥ 1. This also proves
  `pmccOpenLegs` tolerates a non-date expiration. If it throws instead, stop and revisit
  research ADR 6.
- No LEAPS: a PMCC candidate whose legs have no LEAPS yields no evaluation and no failure log.
- Wheel (S8): mixed batch with MSFT CC_OPEN 59 DTE and AAPL CSP_OPEN 20 DTE → MSFT has no
  alert, AAPL has exactly `20 DTE remaining — review for roll or close`, and neither has a
  LEAPS-rule row or skip.

**Green — implementation:**

- `EvaluableRow` gains `leaps_strike: string | null` and `leaps_expiration: string | null`;
  `EVALUABLE_QUERY` adds `NULL AS leaps_strike, NULL AS leaps_expiration`.
- In US-106's `loadPmccEvaluableRows`, replace `currentShortCallLeg(legs)` with
  `pmccOpenLegs(legs)`. Return no row for `null`; otherwise map `short` (or nulls when
  absent, with `instrument_type: short ? 'CALL' : null`) plus `long.strike` and
  `long.expiration` into the row. Keep US-106's per-candidate catch and failed-id set.
- `toEvaluationInput` adds `leapsDte: computeDte(row.leaps_expiration, now)` and
  `leapsStrike: row.leaps_strike`.
- Update the module header comment ("positions with an active short option leg") to
  "wheel positions with an active short leg, and PMCCs with an open LEAPS".

**Refactor — cleanup to consider:**

- If `currentShortCallLeg` is now unused in this file, drop the import. It is still used
  elsewhere, so leave the export. Keep fixtures in the focused test file. No new log
  events: `alert_rule_skipped`, `alert_evaluation_completed` and `alert_evaluation_failed`
  already cover the flow.

**Acceptance criteria covered:** S1, S2, S4, S5, S6, S7, S8 (service behaviour and lifecycle).

### 4. Carry the rule code on the management-queue item

**Files to create or modify:**

- `src/main/schemas.ts` — `ManagementQueueItem.ruleCode: RuleCode`.
- `src/preload/index.d.ts` — duplicated `ManagementQueueItem` gains `ruleCode: string`.
- `src/main/services/alerts.ts` — `QueueRow.rule_code`, select `a.rule_code AS rule_code`, `mapQueueRow`.
- `src/main/services/alerts.test.ts`, `src/main/ipc/alerts.test.ts` — expectations.

**Red — tests to write:**

- `alerts.test.ts` › `listManagementQueue`: seed one EXPIRATION_IMMINENT and one
  PMCC_LEAPS_ROLL_WINDOW alert on the same position, then assert each item's `ruleCode`.
  Ordering (HIGH before MED, then `triggered_at`) is unchanged.
- `ipc/alerts.test.ts`: `alerts:list` envelope passes `ruleCode` through.

**Green — implementation:**

- Per `contracts/alerts-list.md`: add the field to both interfaces, the SQL select and
  `mapQueueRow`. Handler file unchanged.

**Refactor — cleanup to consider:**

- Update renderer test fixtures (`ManagementQueue.test.tsx`, `api/alerts.test.ts`,
  `PositionsListPage.test.tsx`) that build `ManagementQueueItem` literals so typecheck passes.
  Note the preload duplication in the PR rather than fixing it.

**Acceptance criteria covered:** S3 (data the badge needs).

### 5. Leg-aware PMCC badge in the queue row

**Files to create or modify:**

- `src/renderer/src/components/ManagementQueueRow.tsx`
- `src/renderer/src/components/ManagementQueueRow.test.tsx`

**Red — tests to write:**

- A PMCC_LEAPS_ROLL_WINDOW item (`phase: 'PMCC_OPEN'`, `urgency: 'medium'`) renders `XYZ`,
  the MED pill, the badge text `PMCC · LEAPS` and the full summary. It does **not** render
  `short call` or the wheel `PhaseBadge`.
- An EXPIRATION_IMMINENT PMCC item renders `PMCC · short call` (US-106 regression).
- Review position sets `window.location.hash` to `/positions/<id>`; Dismiss calls back
  with the alert id.
- CSP/CC rows still render `PhaseBadge`.

**Green — implementation:**

- Follow the `QueueRow` screen in `mockups/us-107-pmcc-leaps-dte-alert.mdx`: ticker over
  the `UrgencyPill` in the 96px cell, then the 150px badge cell with the existing `Badge`
  and its 5px gold dot (`bg-wb-gold`), then the summary, then the right-aligned Review
  position (gold) and Dismiss (red) buttons. This is the same layout US-106 ships.
  The only change is the label, taken from
  `PMCC_LEG_LABEL[item.ruleCode === 'PMCC_LEAPS_ROLL_WINDOW' ? 'leaps' : 'short']`
  (data-model § Type Design). Per the user's decision, use the leg-aware label instead
  of the mockup's plain `PMCC`.
- Do not ship the mockup's prototype-only pieces: the gold row highlight, the
  "why the LEAPS is in the queue" `StatGrid`, the `DteRuler`, the explanation
  `AlertBox`es and the preset controls. There is no new sheet, overlay or post-success
  navigation, and no extra visual treatment for the unreadable-expiration state. The row
  just keeps its last summary (S7).

**Refactor — cleanup to consider:**

- Keep the branch inline; no strategy-badge component. `wb-*` Tailwind tokens only, with
  no inline style.

**Acceptance criteria covered:** S3; the visible parts of S4, S5 and S6.

### 6. E2e Tests

**Files to create or modify:**

- `e2e/pmcc-leaps-roll-window-alert.spec.ts` — new.
- `e2e/alert-helpers.ts` — add `setLegExpiration(dbPath, legId, expiration)` (single leg,
  bound by id; same `sqlite3` + escaping style as `setActiveLegExpiration`).
- Reuse `runAlertEvaluation`, `listManagementQueueItems`, `readAlertRows`, `QUEUE_ROW`,
  `recordEvent` (`testPmccRecordLegEvent`) and US-106's PMCC launch/seed setup. If both
  PMCC alert specs need the same seeding helper, extract it into `e2e/pmcc-helpers.ts`.

Electron dates are run-day relative (quickstart). Each case seeds the LEAPS at the
scenario's DTE and the short 28 days earlier, which keeps the issue's calendar gap (for
example LEAPS `localDate(59)` and short `localDate(31)`). Expected summaries are literal
strings from Linear, never built with the production helper.

**Red — tests to write** (one test per AC case; names mirror the Linear wording):

- **S1** `it.each` — `Alert fires once the LEAPS has 60 days or fewer to expiration — <n> days`
  for n = 60, 59, 30: after `runAlertEvaluation`, `readAlertRows` has an `open`, `medium`
  `PMCC_LEAPS_ROLL_WINDOW` row for XYZ whose summary is exactly
  `LEAPS expires in <n> days at $80.00 strike — review for roll or close`.
- **S2** `it.each` — `Alert does not fire while the LEAPS has more than 60 days left — <n> days`
  for n = 61, 70: there is no `PMCC_LEAPS_ROLL_WINDOW` row of any status for XYZ. For
  falsifiability, the same run must create a MANAGEMENT_WINDOW row for a sibling CSP at
  20 DTE, which proves evaluation ran.
- **S3** — `The queue row identifies the position as a PMCC and the LEAPS as the leg`:
  LEAPS at 59 DTE. The dashboard row containing the exact summary shows `MED`,
  `PMCC · LEAPS` and the summary. Clicking its `Review position` navigates to
  `#/positions/<xyzId>` and the XYZ detail header renders.
- **S4** — `A PMCC with only the LEAPS open is still evaluated for this rule`: LEAPS
  `localDate(2)` and short `localDate(1)`. Evaluate and assert EXPIRATION_IMMINENT is
  open. Record `SHORT_CALL_EXPIRED` and evaluate again. EXPIRATION_IMMINENT is now
  `resolved`, the LEAPS row is open with `LEAPS expires in 2 days at $80.00 strike — review for roll or close`,
  and it is the only open XYZ alert.
- **S5** — `Alert resolves when the LEAPS is rolled out past the window`: LEAPS at 59 DTE.
  Evaluate (row open), then `window.api.rollPmccLeaps` to $85 at `localDate(185)`, then
  evaluate again. The row is `resolved`, no XYZ queue row has a `LEAPS expires` summary,
  and no new open `PMCC_LEAPS_ROLL_WINDOW` row exists.
- **S6** — `The short-call rules and the LEAPS rule co-fire without reading each other's leg`:
  short at `localDate(2)` and LEAPS at `localDate(30)`. Expect an open HIGH
  EXPIRATION_IMMINENT `Expires in 2 days at $112.00 strike`, an open MED LEAPS row
  `…in 30 days at $80.00…`, and no EXPIRATION_IMMINENT/MANAGEMENT_WINDOW summary
  containing `$80.00` or the LEAPS expiration date. In the queue, HIGH sorts above MED.
- **S7** — `A LEAPS with no readable expiration keeps the alert open instead of resolving it`:
  LEAPS at 59 DTE. Evaluate, capture the row id and summary, call
  `setLegExpiration(dbPath, leapsLegId, 'unreadable')`, and evaluate again. The same id is
  still `open` with the identical summary, and the captured DEBUG stdout has
  `alert_rule_skipped` with XYZ's position id, `PMCC_LEAPS_ROLL_WINDOW` and
  `missing_leaps_dte`.
- **S8** `it.each` — `Classic wheel positions do not use the PMCC rule — <ticker> <phase>`:
  MSFT CC_OPEN at 59 DTE produces no alert rows at all and no LEAPS-rule skip in the
  DEBUG log. AAPL CSP_OPEN at 20 DTE produces exactly one open MANAGEMENT_WINDOW row with
  `20 DTE remaining — review for roll or close`, plus no LEAPS-rule row or skip.

**Green — implementation:**

- Fixture orchestration and assertions only, once Areas 1–5 make the behaviour real. Do not
  hand-insert alert rows and add no clock or quote IPC. Keep the fake market session
  closed, and wait on locators rather than sleeping.

**Refactor — cleanup to consider:**

- Each case seeds independently and disposes Electron and the temp DB. Recheck the audit
  table (8 families, 12 cases). Run the gates and regressions in `quickstart.md`, then run
  `/update-spec us-107`.

**Acceptance criteria covered:** S1–S8, each outline row a separately named case.
