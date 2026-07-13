---
story: us-62
kind: feature
parent: null
topics: [alerts]
status: planned
---

# Implementation Plan: US-62 — Covered-call breach alert

## Summary

Add a `COVERED_CALL_BREACH` rule to the pure alert engine that fires a
medium-urgency alert when a `CC_OPEN` position's underlying trades at or above
its short-call strike, reporting the percent above the strike. Done state: a
breached covered call surfaces a medium alert in the US-51 queue, no alert fires
below the strike or for CSP/holding-shares positions, and the alert
auto-resolves when the stock falls back below the strike — all via the existing
service, persistence, and resolution machinery (no migration, IPC, or renderer
changes).

## Supporting Documents

Read these before starting implementation:

- **User Story & Acceptance Criteria:** `docs/epics/07-stories/US-62-covered-call-breach-alert.md`
- **Research & Design Decisions:** `plans/us-62/research.md`
- **Data Model & Rule Definition:** `plans/us-62/data-model.md`
- **Quickstart & Verification:** `plans/us-62/quickstart.md`

(No `contracts/` — this story adds no new IPC surface; alerts are read through
the existing US-51 `alerts:list` handler.)

## Prerequisites

None — all required schema and infrastructure already exists:

- `alerts` table with unconstrained `rule_code TEXT` and the partial-unique
  open-alert index (`migrations/009`, `011`).
- `AlertEvaluationInput.currentUnderlyingPrice` + `.strike`, populated for every
  phase by `src/main/services/evaluate-alerts.ts`.
- `EVALUABLE_QUERY` already restricts to `ACTIVE` positions in `CSP_OPEN` /
  `CC_OPEN` with an active short-option leg (excludes `HOLDING_SHARES`).
- Automatic resolution via `resolveAlertsNotIn` and skip-keep-open via
  `skippedKeys`.
- Reusable helpers `formatStrike`, `proximityPercent`, and the
  `MISSING_UNDERLYING_PRICE` skip reason.

## Implementation Areas

### 1. `COVERED_CALL_BREACH` rule in the pure engine

**Files to create or modify:**

- `src/main/core/alerts.ts` — add `'COVERED_CALL_BREACH'` to the `RuleCode`
  union (removing the reserved comment on line 18); add a
  `CoveredCallBreachInput = Pick<AlertEvaluationInput, 'strike' |
'currentUnderlyingPrice'>` type; add a `coveredCallBreachSummary` builder; and
  append a `COVERED_CALL_BREACH` entry to the `RULES` registry.
- `src/main/core/alerts.test.ts` — new `describe('evaluatePosition —
COVERED_CALL_BREACH (US-62)')` block.

**Red — tests to write** (in `src/main/core/alerts.test.ts`):

- `COVERED_CALL_BREACH fires at/above the strike` — input `phase: 'CC_OPEN'`,
  `instrumentType: 'CALL'`, `strike: '420.0000'`,
  `currentUnderlyingPrice: '427.40'`; assert a match with
  `ruleCode: 'COVERED_CALL_BREACH'`, `urgency: 'medium'`,
  `quickAction: 'Review position'`, and
  `summary: 'Stock is 1.8% above the $420.00 call strike — shares may be called away'`.
- `COVERED_CALL_BREACH fires exactly at the strike (0.0%)` — price `'420.00'`,
  strike `'420.0000'`; assert it matches and the summary reads
  `'Stock is 0.0% above the $420.00 call strike — shares may be called away'`
  (covers the `≥` boundary).
- `COVERED_CALL_BREACH does not fire below the strike` — price `'416.00'`,
  strike `'420.0000'`; assert no `COVERED_CALL_BREACH` match.
- `COVERED_CALL_BREACH does not apply to CSP_OPEN` — `phase: 'CSP_OPEN'`,
  strike `'180.0000'`, price `'185.00'`; assert **neither** a match **nor** a
  skip for `COVERED_CALL_BREACH`.
- `COVERED_CALL_BREACH skips with missing_underlying_price for a CC without a price`
  — `phase: 'CC_OPEN'`, `currentUnderlyingPrice: null`; assert no match and a
  `SkippedRule { ruleCode: 'COVERED_CALL_BREACH', reason: 'missing_underlying_price' }`.
- `COVERED_CALL_BREACH co-fires with DTE rules on a CC_OPEN position` — a
  `CC_OPEN` position that is both breached and inside a DTE window; assert the
  match codes include both the DTE rule and `COVERED_CALL_BREACH` (per US-50
  independent-rule co-firing).

**Green — implementation:**

- Add `'COVERED_CALL_BREACH'` to the `RuleCode` union.
- Add `export type CoveredCallBreachInput = Pick<AlertEvaluationInput, 'strike'
| 'currentUnderlyingPrice'>`.
- Add `function coveredCallBreachSummary(input: CoveredCallBreachInput): string`
  returning
  `` `Stock is ${proximityPercent(input).toFixed(1)}% above the ${formatStrike(input.strike)} call strike — shares may be called away` ``
  (reuse existing `proximityPercent` and `formatStrike`; when `price ≥ strike`
  the absolute-value `proximityPercent` equals the signed percent-above).
- Append to `RULES`:
  ```ts
  {
    code: 'COVERED_CALL_BREACH',
    urgency: 'medium',
    missingData: (input) =>
      input.phase === 'CC_OPEN' && input.currentUnderlyingPrice === null
        ? MISSING_UNDERLYING_PRICE
        : null,
    test: (input) =>
      input.phase === 'CC_OPEN' &&
      input.strike !== null &&
      input.currentUnderlyingPrice !== null &&
      new Decimal(input.currentUnderlyingPrice).gte(input.strike),
    summary: coveredCallBreachSummary
  }
  ```
  (See `plans/us-62/data-model.md` for the exact rule table.)

**Refactor — cleanup to consider:**

- Consider whether `proximityPercent`'s parameter type should be a shared
  `PriceVsStrikeInput` alias used by both `StrikeProximityInput` and
  `CoveredCallBreachInput` rather than relying on structural compatibility.
- Confirm naming consistency with the sibling rules; check for duplication
  between the CSP and CC price-vs-strike helpers.

**Acceptance criteria covered:**

- "Alert fires when the stock rises above the covered-call strike" (unit-level
  match + exact summary).
- "Alert does not fire while the stock is below the covered-call strike."
- "Cash-secured-put positions do not use this covered-call breach rule."

### 2. E2e Tests

**Files to create or modify:**

- `src/main/services/evaluate-alerts.e2e.test.ts` — new `COVERED_CALL_BREACH`
  scenarios seeding real positions/legs and driving `evaluateAlerts` with a
  stubbed market-data provider (follow the existing US-55 e2e patterns and the
  `evaluate-alerts-test-utils.ts` helpers).

**Red — tests to write** (one test per AC; names mirror the AC language):

- `fires a medium COVERED_CALL_BREACH alert when the stock rises above the call strike`
  — seed MSFT `CC_OPEN` at the `$420.00` strike, stub price `$427.40`; run
  `evaluateAlerts`; assert one open `COVERED_CALL_BREACH` alert for MSFT with
  `urgency: 'medium'` and summary
  `'Stock is 1.8% above the $420.00 call strike — shares may be called away'`.
- `does not create a COVERED_CALL_BREACH alert while the stock is below the call strike`
  — MSFT `CC_OPEN` at `$420.00`, stub price `$416.00`; assert no
  `COVERED_CALL_BREACH` alert for MSFT.
- `resolves the COVERED_CALL_BREACH alert when the stock falls back below the strike`
  — first run at price `$427.40` opens the alert; second run at `$415.00`
  marks it resolved; assert the alert's final status is `resolved`.
- `does not create a COVERED_CALL_BREACH alert for a cash-secured put`
  — AAPL `CSP_OPEN` at `$180.00`, stub price `$185.00`; assert no
  `COVERED_CALL_BREACH` alert for AAPL.
- `does not evaluate a holding-shares position with no open covered call`
  — TSLA `HOLDING_SHARES` with no open call; assert no `COVERED_CALL_BREACH`
  alert for TSLA (excluded by the evaluable-position query).

**Green — implementation:**

- No new production code beyond Area 1 — these tests exercise the existing
  service selection, persistence, and resolution paths against the new rule.

**Refactor — cleanup to consider:**

- Check for duplication with existing US-55 e2e seed/setup; reuse shared
  fixtures from `evaluate-alerts-test-utils.ts` rather than copying.

**Acceptance criteria covered:**

- All five story ACs, one e2e test each (see AC Audit below).

## AC Audit

| #   | Acceptance criterion (story)                                         | E2e test case                                                                          |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Alert fires when the stock rises above the covered-call strike       | `fires a medium COVERED_CALL_BREACH alert when the stock rises above the call strike`  |
| 2   | Alert does not fire while the stock is below the covered-call strike | `does not create a COVERED_CALL_BREACH alert while the stock is below the call strike` |
| 3   | Alert resolves when the stock falls back below the strike            | `resolves the COVERED_CALL_BREACH alert when the stock falls back below the strike`    |
| 4   | Cash-secured-put positions do not use this covered-call breach rule  | `does not create a COVERED_CALL_BREACH alert for a cash-secured put`                   |
| 5   | Holding-shares positions without an open call are not evaluated      | `does not evaluate a holding-shares position with no open covered call`                |

All five ACs are covered by a dedicated e2e test.
