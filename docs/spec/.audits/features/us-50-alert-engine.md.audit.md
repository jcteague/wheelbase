---
page: docs/spec/features/us-50-alert-engine.md
audited_at: 2026-09-28
findings: 4
---

# Audit: us-50-alert-engine.md

## Verified (18)

- ✓ All 8 listed source files exist, including `migrations/009_create_alerts.sql`.
- ✓ All 7 linked ADRs exist under `docs/spec/architecture/02-adrs/`, and `domain/alerts.md`, `schema/tables.md` and `schema/migrations.md` exist.
- ✓ `alerts` table columns (id, position_id, rule_code, urgency, summary, quick_action, status default 'open', triggered_at, last_evaluated_at, resolved_at, created_at, updated_at) — `migrations/009_create_alerts.sql:1-14`.
- ✓ Partial unique index on `(position_id, rule_code) WHERE status = 'open'` — `009_create_alerts.sql:18-19`; `idx_alerts_status_urgency` — `:22-23`.
- ✓ The pure engine `evaluatePosition(input): PositionEvaluation` returns matches + skipped — `src/main/core/alerts.ts:302-330`. Its imports are only `decimal.js`, `./costbasis`, `./profit-target` and `./types` (no DB, broker or logger) — `alerts.ts:5-8`.
- ✓ Types `AlertUrgency`, `AlertStatus`, `RuleCode`, `AlertEvaluationInput`, `AlertMatch`, `SkippedRule`, `PositionEvaluation` — `alerts.ts:10-12,52,95,102,107`.
- ✓ `EXPIRATION_IMMINENT` (high) and `MANAGEMENT_WINDOW` (medium) use exclusive ranges `0 ≤ dte ≤ 5` and `5 < dte ≤ managementWindowDte` — `alerts.ts:21,232-250`.
- ✓ `DEFAULT_MANAGEMENT_WINDOW_DTE = 21` — `alerts.ts:24`.
- ✓ A missing DTE produces a `SkippedRule` rather than a throw — `alerts.ts:218-219,314-317`.
- ✓ `computeDte(expiration, now?)` uses `differenceInCalendarDays` — `src/main/core/dte.ts:4,13-15`; adopted by `list-positions.ts:6,78` and `evaluate-alerts.ts:15`.
- ✓ `upsertOpenAlert`, `resolveAlertsNotIn`, `listOpenAlerts` (status='open' only) and `alertKey` are exported — `src/main/services/alerts.ts:37,80,176,231-236`.
- ✓ `ALERT_EVAL_JOB_NAME = 'alert-evaluation'` — `src/main/services/evaluate-alerts.ts:28`.
- ✓ Positions are loaded via a join on `activeLegSubquery()` — `evaluate-alerts.ts:23,68`.
- ✓ The engine is called per position inside try/catch, and a failure is logged without aborting the others — `evaluate-alerts.ts:240-265`; skips are DEBUG-logged — `:258`.
- ✓ The persist phase is a single `db.transaction`: upsert matches, and keep-open = matches ∪ skipped keys, then `resolveAlertsNotIn` — `evaluate-alerts.ts:274-285`.
- ✓ `EvaluateAlertsResult` has `createdCount`/`updatedCount`/`resolvedCount`/`skippedRuleCount` — `evaluate-alerts.ts:291`; the type is in `src/main/schemas.ts:634`.
- ✓ `schemas.ts` has `AlertRecord` (`:591`) and re-exports `AlertUrgency`/`AlertStatus` (`:589`).
- ✓ The job is registered with `{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }` — `src/main/index.ts:289-296`. It is not gated on the broker: it uses `marketDataFactory`, not `BrokerProvider`.

## Drift (4)

- ✗ **Rule count.** The page says "The two in-scope rules are the only ones implemented" and calls the other four "later stories". `RULES` now holds six rules: `PROFIT_TARGET`, `STRIKE_PROXIMITY`, `EARNINGS_PROXIMITY` and `COVERED_CALL_BREACH` in addition to the two DTE rules — `src/main/core/alerts.ts:232-298`. Suggested fix: frame the two-rule scope as US-50's original delivery.
- ✗ **Rule-definition shape.** The page says each registry entry has `code`, `urgency`, `requiresDte`, `test` and `summary`. The code's `RuleDefinition` has an optional `missingData?: (input) => string | null` guard instead of `requiresDte`, and `test(input, resolved)` receives `ResolvedThresholds` — `alerts.ts:209-216`.
- ✗ **`evaluateAlerts` signature.** The page says `evaluateAlerts({ db, now?, managementWindowDte?, logger? }): EvaluateAlertsResult` (synchronous). The code is `async` and returns `Promise<EvaluateAlertsResult>`, with added inputs `provider?: MarketDataProvider`, `profitTargetPercentDefault?` and `fetchEarnings?` — `src/main/services/evaluate-alerts.ts:158-192`. The compute phase now also prefetches market data and earnings with degrade-to-fallback (`fetchOrDegrade`, `:171-182`).
- ✗ **Upsert/resolve semantics widened.** The page says `upsertOpenAlert` does "SELECT existing open → UPDATE or INSERT" and that the persist phase resolves open alerts only. `upsertOpenAlert` now also looks up `dismissed` rows and can return `'suppressed'` (`src/main/services/alerts.ts:72,89-99`), and the transaction also calls `clearStaleDismissals` (`evaluate-alerts.ts:284`). These are US-59 additions and are not reflected here. Low severity.

## Unverifiable (2)

- ? "Restart-safe" alert set and "a compute error must not leave partially written rows": the structure supports both (compute outside the transaction, single transaction to persist), but the runtime guarantee was not tested here.
- ? "Rules slot in without schema changes or control-flow edits" is a design claim.

## Missing files (0)
