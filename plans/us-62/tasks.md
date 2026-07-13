# US-62 — Covered-call breach alert — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

> **Scope note:** All production changes are in one pure file
> (`src/main/core/alerts.ts`). No migration, no service change, no IPC, no
> renderer. See `plans/us-62/plan.md` and `plans/us-62/data-model.md`.

---

## Layer 1 — Foundation (no dependencies)

> Start immediately.

### 1. `COVERED_CALL_BREACH` rule (pure engine)

- [x] **[Red]** Write failing tests — `src/main/core/alerts.test.ts`
  - New `describe('evaluatePosition — COVERED_CALL_BREACH (US-62)')` block with cases:
    - `fires at/above the strike` — `phase: 'CC_OPEN'`, `instrumentType: 'CALL'`, `strike: '420.0000'`, `currentUnderlyingPrice: '427.40'` → match `{ ruleCode: 'COVERED_CALL_BREACH', urgency: 'medium', quickAction: 'Review position', summary: 'Stock is 1.8% above the $420.00 call strike — shares may be called away' }`
    - `fires exactly at the strike (0.0%)` — price `'420.00'`, strike `'420.0000'` → matches; summary `'Stock is 0.0% above the $420.00 call strike — shares may be called away'` (covers the `≥` boundary)
    - `does not fire below the strike` — price `'416.00'`, strike `'420.0000'` → no `COVERED_CALL_BREACH` match
    - `does not apply to CSP_OPEN` — `phase: 'CSP_OPEN'`, strike `'180.0000'`, price `'185.00'` → **neither** a match **nor** a skip for `COVERED_CALL_BREACH`
    - `skips with missing_underlying_price for a CC without a price` — `phase: 'CC_OPEN'`, `currentUnderlyingPrice: null` → no match + `SkippedRule { ruleCode: 'COVERED_CALL_BREACH', reason: 'missing_underlying_price' }`
    - `co-fires with DTE rules on a CC_OPEN position` — breached CC also inside a DTE window → match codes include both the DTE rule and `COVERED_CALL_BREACH`
  - Run `pnpm test src/main/core/alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/alerts.ts` _(depends on: Area 1 Red ✓)_
  - Add `'COVERED_CALL_BREACH'` to the `RuleCode` union (remove the reserved comment on line 18)
  - Add `export type CoveredCallBreachInput = Pick<AlertEvaluationInput, 'strike' | 'currentUnderlyingPrice'>`
  - Add `function coveredCallBreachSummary(input: CoveredCallBreachInput): string` → `` `Stock is ${proximityPercent(input).toFixed(1)}% above the ${formatStrike(input.strike)} call strike — shares may be called away` `` (reuse existing `proximityPercent` + `formatStrike`)
  - Append a `RULES` entry: `code: 'COVERED_CALL_BREACH'`, `urgency: 'medium'`, `missingData: (input) => input.phase === 'CC_OPEN' && input.currentUnderlyingPrice === null ? MISSING_UNDERLYING_PRICE : null`, `test: (input) => input.phase === 'CC_OPEN' && input.strike !== null && input.currentUnderlyingPrice !== null && new Decimal(input.currentUnderlyingPrice).gte(input.strike)`, `summary: coveredCallBreachSummary`
  - Run `pnpm test src/main/core/alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/alerts.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider a shared `PriceVsStrikeInput` alias for both `StrikeProximityInput` and `CoveredCallBreachInput` (broaden `proximityPercent`'s param) instead of relying on structural typing; check CSP/CC helper duplication and naming consistency
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — E2E Tests

**Requires:** Area 1 Green ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `src/main/services/evaluate-alerts.e2e.test.ts` _(depends on: Area 1 Green ✓)_
  - One `it()` per AC bullet; names mirror AC language. Seed real positions/legs and drive `evaluateAlerts` with a stubbed market-data provider (follow existing US-55 e2e patterns + `evaluate-alerts-test-utils.ts`).
  - AC coverage:
    - AC-1: Alert fires when the stock rises above the covered-call strike → `it('fires a medium COVERED_CALL_BREACH alert when the stock rises above the call strike')` — MSFT `CC_OPEN` @ `$420.00`, price `$427.40` → one open medium alert, summary `'Stock is 1.8% above the $420.00 call strike — shares may be called away'`
    - AC-2: Alert does not fire while the stock is below the covered-call strike → `it('does not create a COVERED_CALL_BREACH alert while the stock is below the call strike')` — MSFT `CC_OPEN` @ `$420.00`, price `$416.00` → no alert
    - AC-3: Alert resolves when the stock falls back below the strike → `it('resolves the COVERED_CALL_BREACH alert when the stock falls back below the strike')` — first run @ `$427.40` opens, second run @ `$415.00` → final status `resolved`
    - AC-4: Cash-secured-put positions do not use this covered-call breach rule → `it('does not create a COVERED_CALL_BREACH alert for a cash-secured put')` — AAPL `CSP_OPEN` @ `$180.00`, price `$185.00` → no `COVERED_CALL_BREACH` alert
    - AC-5: Holding-shares positions without an open call are not evaluated → `it('does not evaluate a holding-shares position with no open covered call')` — TSLA `HOLDING_SHARES`, no open call → no `COVERED_CALL_BREACH` alert
  - Run `pnpm test src/main/services/evaluate-alerts.e2e.test.ts` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - No new production code beyond Area 1 — these exercise the existing service selection/persistence/resolution paths
  - Run `pnpm test src/main/services/evaluate-alerts.e2e.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Reuse shared fixtures from `evaluate-alerts-test-utils.ts` rather than copying US-55 setup
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (AC-1 … AC-5)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
