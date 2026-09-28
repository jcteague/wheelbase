---
page: docs/spec/features/us-62-covered-call-breach-alert.md
audited_at: 2026-09-28
findings: 18
---

# Audit: docs/spec/features/us-62-covered-call-breach-alert.md

## Verified (14)

- ✓ `RuleCode` union includes `'COVERED_CALL_BREACH'` — `src/main/core/alerts.ts:18`
- ✓ The `RULES` registry entry `COVERED_CALL_BREACH` has `urgency: 'medium'`, is restricted to `CC_OPEN`, and fires on `price >= strike` (`Decimal.gte`) — `src/main/core/alerts.ts:293-298`
- ✓ Quick action `Review position` (`QUICK_ACTION_REVIEW`) is applied to every match — `src/main/core/alerts.ts:41,328`
- ✓ The skip reason is `missing_underlying_price` when the price is absent (or non-numeric) — `src/main/core/alerts.ts:45,225-231`
- ✓ `PriceVsStrikeInput = Pick<AlertEvaluationInput, 'strike' | 'currentUnderlyingPrice'>` — `src/main/core/alerts.ts:84`. `StrikeProximityInput` and `CoveredCallBreachInput` are aliases — `:87,93`
- ✓ `proximityPercent(input: PriceVsStrikeInput)` computes `|price − strike| / strike × 100` — `src/main/core/alerts.ts:166-170`
- ✓ `coveredCallBreachSummary` gives `Stock is {pct.toFixed(1)}% above the {formatStrike} call strike — shares may be called away` — `src/main/core/alerts.ts:181-182`. `formatStrike` is `$` plus 2 dp — `:116-118`
- ✓ `EVALUABLE_QUERY` restricts to `status = 'ACTIVE'` and `phase IN ('CSP_OPEN','CC_OPEN')` with an active-leg join, which excludes `HOLDING_SHARES` — `src/main/services/evaluate-alerts.ts:54-72`
- ✓ `alerts.rule_code` is plain `TEXT NOT NULL` with no CHECK, under the partial-unique open index — `migrations/009_create_alerts.sql:4,19`
- ✓ `alerts:list` channel exists — `src/main/ipc/alerts.ts:8`
- ✓ `describe('US-62 acceptance — COVERED_CALL_BREACH')` has one test per AC, 5 tests — `src/main/services/evaluate-alerts.e2e.test.ts:620,642,663,675,697,717`
- ✓ Unit `describe('evaluatePosition — COVERED_CALL_BREACH (US-62)')` includes the 0.0% at-strike boundary and co-fire-with-DTE cases — `src/main/core/alerts.test.ts:486,506,599`
- ✓ Linked pages exist: `../domain/alerts.md`, `us-53-54-55-market-data-alert-rules.md`, `us-51-management-queue-dashboard.md`, `us-50-alert-engine.md`, `../architecture/02-adrs/alert-rule-registry.md`, `../architecture/02-adrs/alerts-partial-unique-open.md`
- ✓ Both listed source files exist

## Drift (1)

- ✗ The page gives the predicate as `strike !== null && currentUnderlyingPrice !== null`, with `missing_underlying_price` as the only skip reason. The implementation's shared `priceVsStrikeMissingData('CC_OPEN')` guard (`src/main/core/alerts.ts:225-231`) differs in two ways:
  - It checks `isNumeric` rather than non-null.
  - It also skips with `missing_strike` (`MISSING_STRIKE`) when the strike is non-numeric.

  This is minor. Suggested fix: mention the `missing_strike` skip and the numeric guard.

## Unverifiable (3)

- ? The rationale for rejecting an extension of `STRIKE_PROXIMITY` ("proximity is two-sided, breach is one-sided") is design narrative.
- ? "PMCC short-call-against-LEAPS deferred to Epic 09" is a roadmap claim.
- ? "No renderer change was needed; the management queue displays the new rule code transparently" is a negative claim and was not mechanically checked.

## Missing files (0)

None.
