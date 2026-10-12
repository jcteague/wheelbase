# Implementation Plan: US-106 — PMCC short-call assignment-risk alert

## Summary

Add a medium-urgency PMCC short-call alert beginning 2% below its strike and
remaining active at every higher price. Reuse PMCC leg replay, the alert registry
and persistence lifecycle, and the existing management queue with a PMCC badge.
Done means the current short alone feeds all applicable short-leg rules, with
wheel behavior preserved and every Linear scenario verified.

## Supporting Documents

- **User Story & Acceptance Criteria:** [OPT-14 / US-106](https://linear.app/optionswheel/issue/OPT-14/us-106-fire-alert-when-short-call-is-within-2percent-of-strike).
  Linear remains the requirements authority; the mapping below is an implementation
  test index, not a copied or amended story.
- **Research & Design Decisions:** [research.md](./research.md).
- **Data Model & Selection Logic:** [data-model.md](./data-model.md), including Type Design.
- **Quickstart & Verification:** [quickstart.md](./quickstart.md).
- **Mockup:** [US-106 queue states](../../mockups/us-106-pmcc-assignment-risk-alert.mdx).

No `contracts/` artifact: there is no new or changed production IPC surface.
`alerts:list`, `alerts:dismiss` and the existing queue shape remain sufficient.

## Prerequisites

Source inspection confirms US-101 PMCC entry and `PMCC_OPEN`, US-103 ledger replay
and test fixtures, and US-104 short-roll service/IPC are present. Alert engine,
queue, generic rules and dismissal are already implemented. No dependency on
US-105, US-107, US-108 or a future short-expiration UI is needed.

The issue's suggested shared `activeLegSubquery` expansion is superseded in this
plan by service-local PMCC selection using `currentShortCallLeg`; see research.
Preserve PMCC's null legacy wheel `activeLeg` in list/detail consumers.

## Acceptance coverage audit

Each entry references one scenario in Linear, in order. Names below become E2E
test names in area 4; outline rows expand into separate named cases. The nine
scenario families cover 15 test executions. All Then/And assertions belonging to
one scenario stay in that scenario's test; no test combines unrelated scenarios.

| Ref | E2E test name / outline parameters                                                                           | Implementation areas |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------- |
| S1  | Alert fires as the stock approaches or passes the short-call strike — 107.80, 108.35, 110.00, 112.53, 118.80 | 1, 2, 4              |
| S2  | Alert does not fire while the stock is more than 2% below the strike — 107.70, 105.00                        | 1, 2, 4              |
| S3  | The queue row identifies the position as a PMCC                                                              | 2, 3, 4              |
| S4  | Alert resolves when the stock retreats below the band                                                        | 2, 4                 |
| S5  | Alert resolves when the short call is rolled further from the money                                          | 2, 4                 |
| S6  | A PMCC with no open short call is not evaluated                                                              | 2, 4                 |
| S7  | A missing quote keeps the alert open instead of resolving it                                                 | 1, 2, 4              |
| S8  | Classic wheel positions do not use the PMCC rule — MSFT/CC_OPEN, AAPL/CSP_OPEN                               | 1, 2, 4              |
| S9  | The existing short-leg rules evaluate the PMCC short call, never the LEAPS                                   | 2, 3, 4              |

## Implementation Areas

### 1. Pure PMCC assignment-risk rule

**Files to create or modify:**

- `src/main/core/alerts.ts` — rule literal, fixed constant, summary helper and registry entry.
- `src/main/core/alerts.test.ts` — PMCC rule examples and guards.
- `src/main/core/alerts.property.test.ts` — new property suite for the rule.

**Red — tests to write:**

- In `alerts.test.ts`, table-test the five S1 prices against strike `110.0000`:
  assert medium urgency, Review position and exact Linear summaries with 2.0/1.5%
  below and 0.0/2.3/8.0% above. Assert the 2% boundary is inclusive and deep ITM
  remains matched.
- Assert 107.70 and 105.00 do not match; also test 107.7999 so a value which
  displays as 2.0% below cannot enter through display rounding.
- Assert null, malformed, NaN and Infinity underlying prices yield only this
  rule's `missing_underlying_price` skip, with no thrown error or match; malformed
  and absent strikes yield `missing_strike` when price is valid.
- For every non-PMCC phase, assert neither a PMCC match nor PMCC skip, including
  missing prices. Preserve exact wheel output for S8 and existing rule tests.
- Assert independent co-firing with imminent expiration at 4 DTE; PMCC receives
  neither STRIKE_PROXIMITY nor COVERED_CALL_BREACH.
- In `alerts.property.test.ts`, **oracle/bound**: generate positive 4-dp price and
  strike with `positiveMoney`; compare presence of the PMCC match against
  `price * 100 >= strike * 98` using exact Decimal multiplication. This avoids
  copying the implementation's signed division formula.
- **Monotonicity invariant:** for generated positive strike, price and nonnegative
  increment, a matched price remains matched after increasing it. **Phase guard:**
  generate non-PMCC phases directly from the enum options excluding PMCC_OPEN,
  rather than discarding generated draws with `fc.pre`.

**Green — implementation:**

- Extend `RuleCode`'s literal union and declare fixed
  `PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW = 2` in `alerts.ts`.
- Add `PmccAssignmentRiskInput = PriceVsStrikeInput` as designed in
  `data-model.md` § Type Design, and `pmccAssignmentRiskSummary` using
  `proximityPercent`, `formatStrike` and the direction/suffix rules in the design.
- Append one `RULES` entry with `priceVsStrikeMissingData('PMCC_OPEN')`, explicit
  phase gate, signed Decimal predicate and medium urgency. Reuse the registry's
  Review position action. Do not alter the evaluation loop or generic rules.

**Refactor — cleanup to consider:**

- Keep the existing shared price/strike slice and guard as the single source;
  update their comments to include PMCC. Do not add logging or I/O to core.
- Keep test inputs complete and inert for unrelated rules; filter assertions by
  rule code where co-firing is legitimate. Stress properties as in quickstart.

**Acceptance criteria covered:** S1, S2, S7, S8; engine portion of S9.

### 2. Select current PMCC shorts and preserve the alert lifecycle

**Files to create or modify:**

- `src/main/services/evaluate-alerts.ts` — PMCC selection and replay isolation.
- `src/main/services/evaluate-alerts-pmcc.test.ts` — new focused DB/service tests.
- `src/main/services/evaluate-alerts.test.ts` — revise obsolete US-101 exclusion test.

Reuse without rewriting `pmcc-ledger.ts`, `leg-rows.ts`, `alerts.ts`,
`evaluate-alerts-test-utils.ts` and `test-fixtures/pmcc-legs.ts`.

**Red — tests to write:**

- In the new suite, seed the fixed-date XYZ history and assert the selected short's
  CALL OCC is requested; never request the LEAPS OCC. Assert the assignment rule
  and the 18-DTE MANAGEMENT_WINDOW row use the short inputs.
- Test each generic rule with PMCC inputs: 4-DTE imminent summary uses $110;
  management window uses short DTE; short entry premium $2 and mid $0.80 produce
  60.0% PROFIT_TARGET; earnings inside 10 days and on/before short expiry match,
  while earnings after short expiry but before LEAPS expiry do not.
- Use the real `rollPmccShortCallPosition` service to roll to $115/2026-11-20:
  at 112.53, assert the old assignment alert resolves without a new one. Exercise
  repeated short rolls and a later LEAPS roll to prove correct side selection.
- Record SHORT_CALL_EXPIRED, SHORT_CALL_CLOSE and SHORT_CALL_ASSIGNED separately:
  no current short means no option snapshot request or PMCC evaluation and prior
  alerts resolve. Add a later SHORT_CALL_OPEN and assert it becomes evaluable.
  Inactive PMCC positions must also be excluded.
- Fire, repeat, retreat to 106, and re-enter: assert dedupe, stable id while open,
  resolved timestamp on clear and fresh id/triggered time on return. Dismiss then
  re-evaluate to assert suppression; clear then re-enter to assert rearming.
- Omit the quote and separately return a malformed quote: existing summary/id
  remain, DEBUG `alert_rule_skipped` records the new rule and exact reason,
  and quote-independent short DTE alerts still work. Test rejected quote fetch too.
- Batch healthy wheel and PMCC positions beside a PMCC with malformed roll data:
  replay exception logs its position id, preserves its existing open/dismissed
  alerts, and healthy targets still match. Simulate a bulk PMCC history-read
  failure: wheel processing proceeds and failed PMCC keys are retained.
- Call `listManagementQueue` to verify PMCC phase enrichment and HIGH-before-MED
  ordering without changing its implementation. Assert no LEAPS strike/expiry
  appears in XYZ alerts and preserve exact wheel outputs in a mixed batch.
- Replace the US-101 assertion that all PMCC alerts are absent: its 5-DTE short
  must now generate EXPIRATION_IMMINENT, while wheel-only rule codes and errors
  remain absent. Keep existing get/list-position regressions proving null wheel
  fields for PMCC.

**Green — implementation:**

- In `evaluate-alerts.ts`, add `PmccCandidateRow` using the Pick/intersection in
  `data-model.md` § Type Design and a PMCC-only candidate query. Keep the existing
  wheel query and `activeLegSubquery()` unchanged.
- Add a module-private `loadPmccEvaluableRows` helper that bulk-reads histories,
  replays `currentShortCallLeg` per candidate, and returns mapped `EvaluableRow[]`.
  Accept the local failed-position-id set for recording selection failures. Null
  short means exclusion; exceptions mean log and mark failed, never infer closure.
- Combine the two row sets before current OCC construction and concurrent feeds.
  Existing `toEvaluationInput` then carries the short's fields with phase
  `PMCC_OPEN`; retain position and global threshold precedence.
- Before resolution, add existing open/dismissed alert keys for failed selection
  ids to `keepOpenKeys`, using a bound-parameter query and `alertKey`. Successful
  null-short selections contribute no keys. Keep the existing single transaction
  and generic persistence functions; do not change alert status semantics.
- Preserve existing INFO/DEBUG events and per-item catches; log selection errors
  using `alert_evaluation_failed`, with position id when known. Do not depend on
  broker credentials or add a new provider capability.

**Refactor — cleanup to consider:**

- Reuse `currentShortCallLeg` and `readLegsByPosition`; no duplicate SQL replay or
  new selector framework. No new query in the normal per-position loop.
- Keep new fixtures in the focused test file unless a second caller actually
  needs them. Do not change unrelated PMCC roll, list or detail behavior.

**Acceptance criteria covered:** S1–S9 service behavior; S3 data enrichment.

### 3. Render the PMCC management-queue badge

**Files to create or modify:**

- `src/renderer/src/components/ManagementQueueRow.tsx`.
- `src/renderer/src/components/ManagementQueueRow.test.tsx`.

**Red — tests to write:**

- Render the PMCC assignment item and assert XYZ, MED, `PMCC · short call`, full
  summary and Review position. The wheel phase label must not occupy its badge cell.
- Clicking Review position sets the existing position-detail hash route; clicking
  Dismiss invokes the existing callback with the alert id.
- Render an EXPIRATION_IMMINENT PMCC row and assert HIGH with the same strategy
  badge, proving the branch is based on phase rather than summary text or rule code.
- Preserve CSP and CC PhaseBadge rendering and actions.

**Green — implementation:**

- Follow the `QueueRow` screen in
  `mockups/us-106-pmcc-assignment-risk-alert.mdx`: ticker/urgency cell, 150px badge
  cell, summary and existing right-aligned actions. Use existing `Badge` with the
  compact gold dot and `PMCC · short call` for `PMCC_OPEN`; retain `PhaseBadge`
  for wheels. Use `wb-*` Tailwind classes and no new styling dependency.
- Keep the existing hash navigation and dismissal flow. There is no new overlay,
  form or post-success shortcut. Resolution removes only the resolved alert row;
  a missing quote retains its last summary. The mockup's amber/red explanatory
  panels, strike ruler, row highlight and preset controls remain prototype aids.
  Do not add a missing-quote banner or detail-page alert.

**Refactor — cleanup to consider:**

- A small inline badge branch is sufficient; do not create a strategy component
  hierarchy. Preserve current accessible button text and DOM test hooks.

**Acceptance criteria covered:** S3 and the visible queue aspects of S4, S7, S9.

### 4. E2e Tests

**Files to create or modify:**

- `e2e/pmcc-assignment-risk-alert.spec.ts` — new Electron acceptance suite.

Reuse `e2e/alert-helpers.ts`, `assignment-helpers.ts`, and the existing PMCC
creation / leg-event IPC helpers. Keep story-only setup local to the spec.

**Red — tests to write:**

- **S1 — `Alert fires as the stock approaches or passes the short-call strike`**:
  five named `it.each` cases at 107.80, 108.35, 110.00, 112.53 and 118.80. Run the
  scheduler and assert the persisted PMCC rule is open, medium and has the exact
  Linear summary for that example. Read literals from the issue when implementing;
  do not calculate expected strings with the production summary helper.
- **S2 — `Alert does not fire while the stock is more than 2% below the strike`**:
  two named cases at 107.70 and 105.00; assert no persisted assignment-risk row.
  Generic MANAGEMENT_WINDOW rows are allowed.
- **S3 — `The queue row identifies the position as a PMCC`**: at 112.53, inspect
  the assignment row's MED pill, PMCC badge and exact summary; click its Review
  position and verify the XYZ detail route and page.
- **S4 — `Alert resolves when the stock retreats below the band`**: open through
  evaluation, change quote to 106, reevaluate and assert stored resolution plus
  disappearance of that alert row from the dashboard.
- **S5 — `Alert resolves when the short call is rolled further from the money`**:
  open at 112.53, use real short-roll IPC to record $115 and the later expiration,
  reevaluate and assert old assignment row resolved and no replacement assignment
  alert. Check the queue no longer contains that alert.
- **S6 — `A PMCC with no open short call is not evaluated`**: open the alert,
  record short expiration with the existing test leg-event seam, quote 118.80 and
  reevaluate. Assert prior assignment row resolved, no new assignment row, and no
  alert built from LEAPS fields.
- **S7 — `A missing quote keeps the alert open instead of resolving it`**: open
  at 112.53, remove XYZ from fake stock quotes, reevaluate, and assert same open id
  and summary plus the DEBUG event carrying position id, PMCC rule and
  `missing_underlying_price`. Verify the retained queue row.
- **S8 — `Classic wheel positions do not use the PMCC rule`**: two named cases
  for MSFT CC $420/price $415 and AAPL CSP $180/price $178.50. Assert no PMCC rule;
  MSFT has no COVERED_CALL_BREACH and AAPL has the exact existing 0.8%-below put
  STRIKE_PROXIMITY summary from Linear.
- **S9 — `The existing short-leg rules evaluate the PMCC short call, never the LEAPS`**:
  use a 4-DTE short, retain the distant LEAPS and quote 112.53. Assert HIGH imminent
  with `$110.00`/4-day summary plus open assignment-risk alert. Check all XYZ alert
  summaries exclude the $80 LEAPS strike and LEAPS expiration, and HIGH sorts
  before MED in the queue.

**Green — implementation:**

- Add only fixture orchestration and assertions after areas 1–3 make behavior
  available. Use the fake-provider and scheduler recipe in `quickstart.md`, with
  run-day-relative Electron dates and fixed-date service counterparts. Do not add
  a clock/quote IPC channel or replace production evaluation with seeded alerts.
- Use the mockup's queue states for visible assertions. Identify the assignment
  row by its returned alert id/summary rather than ticker alone because generic
  rules co-fire. Keep exact expected messages independent of implementation.
- Await DOM/query state after each explicit evaluation; capture DEBUG logs before
  the missing-quote run. Keep the fake market session closed to prevent timer races.

**Refactor — cleanup to consider:**

- Keep each scenario independently seeded and named; dispose Electron and temporary
  databases in cleanup. Extract only setup repeated within this suite.
- Recheck all nine audit rows and all 15 executions. Run the implementation gates
  and related queue regressions in quickstart, then update the shipped spec with
  `/update-spec us-106` after the feature is implemented and verified.

**Acceptance criteria covered:** S1–S9, with every outline example independently named.
