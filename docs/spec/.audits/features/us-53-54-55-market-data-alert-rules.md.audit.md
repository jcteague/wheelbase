---
page: docs/spec/features/us-53-54-55-market-data-alert-rules.md
audited_at: 2026-09-28
findings: 34
---

# Audit: docs/spec/features/us-53-54-55-market-data-alert-rules.md

## Verified (27)

- ✓ `MANAGEMENT_WINDOW` (medium): `dte > EXPIRATION_IMMINENT_MAX_DTE && dte <= resolved.managementWindowDte`, default 21 — `src/main/core/alerts.ts:21,24,241-250`
- ✓ MANAGEMENT_WINDOW summary `"{dte} DTE remaining — review for roll or close"` — `src/main/core/alerts.ts:124-126`
- ✓ `PROFIT_TARGET` (low): `capturedPercent(input).gte(resolved.profitTargetPercent)`, via `resolveProfitTarget` — `src/main/core/alerts.ts:251-264,308-311`
- ✓ `capturedPercent` built on `computeUnrealizedPnl(...).pnlPercent` — `src/main/core/alerts.ts:140-148`; `computeUnrealizedPnl` at `src/main/core/costbasis.ts:285`
- ✓ PROFIT_TARGET summary `"{pct}% of max profit captured — consider closing"` — `src/main/core/alerts.ts:150-152`
- ✓ `STRIKE_PROXIMITY` (medium) CSP-only, `proximityPercent <= 1` — `src/main/core/alerts.ts:265-271`, `STRIKE_PROXIMITY_MAX_PERCENT = 1` at line 34
- ✓ `proximityPercent = |price − strike| / strike × 100` — `src/main/core/alerts.ts:165-170`
- ✓ Direction wording "above" / "below … — now in the money" — `src/main/core/alerts.ts:172-179`
- ✓ `requiresDte` replaced by `missingData?: (input) => string | null` — grep finds no `requiresDte` in `src/main`; `RuleDefinition.missingData` at `src/main/core/alerts.ts:211`
- ✓ Skip-reason constants `missing_dte`, `missing_option_mark`, `missing_underlying_price`, `invalid_profit_target_input` — `src/main/core/alerts.ts:43-49`
- ✓ `hasComputableProfit` guard (non-positive-integer contracts / non-positive premium) — `src/main/core/alerts.ts:130-138`
- ✓ `evaluatePosition` records `SkippedRule` when a reason is non-null — `src/main/core/alerts.ts:300-320`
- ✓ `evaluateAlerts` is async and returns `Promise<EvaluateAlertsResult>` with injected `provider` — `src/main/services/evaluate-alerts.ts:184-192`
- ✓ `EvaluateAlertsResult` `{ createdCount, updatedCount, resolvedCount, skippedRuleCount }` — `src/main/schemas.ts` (interface after `ManagementQueueItem`)
- ✓ `occByPositionId` map built once via `occSymbolForRow` — `src/main/services/evaluate-alerts.ts:201-203`
- ✓ `occSymbolForRow` catches, WARNs `alert_evaluation_occ_symbol_invalid`, returns `null` — `src/main/services/evaluate-alerts.ts:77-94`
- ✓ Batched `fetchStockQuotes` / `fetchOptionSnapshots` under `Promise.all`, each wrapped by `fetchOrDegrade` — `src/main/services/evaluate-alerts.ts:209-228`; wrappers at `src/main/services/market-data.ts:43,57`
- ✓ WARN events `alert_evaluation_stock_quotes_unavailable` / `alert_evaluation_option_snapshots_unavailable` — `src/main/services/evaluate-alerts.ts:214,220`
- ✓ DEBUG `alert_rule_skipped` and error `alert_evaluation_failed` per-position — `src/main/services/evaluate-alerts.ts:~254-262`
- ✓ All awaits precede the single `db.transaction` persist phase — `src/main/services/evaluate-alerts.ts:~270-283`
- ✓ `resolveProfitTarget(0) === 0` locked by a test — `src/main/core/profit-target.test.ts:20`
- ✓ `logger` typed `Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>` (as `LoggerLike`) — `src/main/logger.ts:4`
- ✓ `src/main/services/evaluate-alerts.e2e.test.ts` has the US-53 (4), US-54 (5), US-55 (4) AC scenarios — lines 239-514
- ✓ `src/main/services/evaluate-alerts-test-utils.ts` exists and exports `seedAaplCsp`
- ✓ Reused files exist: `src/main/core/profit-target.ts` (`DEFAULT_PROFIT_TARGET_PERCENT = 50`), `src/shared/option-symbol.ts` (`buildOccSymbol`, line 31), `src/main/services/market-data.ts`, `src/main/integrations/market-data-factory.ts`, `src/main/integrations/market-data-provider.ts`, `src/main/services/alerts.ts`
- ✓ No new IPC handler — alerts are read by `alerts:list` (`src/main/ipc/alerts.ts:8`)
- ✓ Domain links `../domain/alerts.md`, `../domain/market-data.md` and ADR `../architecture/02-adrs/alert-rule-registry.md` exist

## Drift (4)

- ✗ Contract block says `provider?` "defaults to market-data-factory getProvider()". The code defaults to `marketDataFactory.create()` (`src/main/services/evaluate-alerts.ts:186`), and the factory exposes `create()`/`recreate()`, not `getProvider` (`src/main/integrations/market-data-factory.ts:26-35`).
- ✗ The `evaluateAlerts` input contract block leaves out the `profitTargetPercentDefault` (US-57) and `fetchEarnings` (US-56) parameters now on `EvaluateAlertsInput` (`src/main/services/evaluate-alerts.ts:164-172`). Stale present-tense contract.
- ✗ Source-files entry says `src/main/index.ts` "awaits `evaluateAlerts({ db, provider })`". The handler now passes `managementWindowDte` and `profitTargetPercentDefault` from `getAlertDefaults(db)` (`src/main/index.ts:297-304`).
- ✗ The "stable, auditable" skip-reason list and "STRIKE_PROXIMITY returns `missing_underlying_price`" are incomplete. STRIKE_PROXIMITY now uses `priceVsStrikeMissingData('CSP_OPEN')`, which can also return `missing_strike` (`src/main/core/alerts.ts:219-227,268`). Other rules add `missing_earnings_date` / `missing_expiration` (lines 47-48).

## Unverifiable (3)

- ? Rejected alternatives (fetch in predicate, price-cache table, sync handler fetch, extra booleans) — design history.
- ? "13 AC-driven scenarios": the US-53/54/55 blocks hold 13 scenarios. The file now has 35 `it(` cases because later stories (US-50/56/57/58/62) added more, so the count holds only for this story's scope.
- ? "the Decimal work is cheap and only runs for matched rules" — performance narrative.

## Missing files (0)

Note (not drift): the page's "both feeds run concurrently" predates US-56; `Promise.all` now also runs a third `fetchEarnings` feed (`src/main/services/evaluate-alerts.ts:224-229`).
