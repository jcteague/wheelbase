---
page: docs/spec/domain/alerts.md
audited_at: 2026-09-28
findings: 44
---

# Audit: docs/spec/domain/alerts.md

## Verified (35)

- ✓ Six rule codes `EXPIRATION_IMMINENT`, `MANAGEMENT_WINDOW`, `PROFIT_TARGET`, `STRIKE_PROXIMITY`, `EARNINGS_PROXIMITY`, `COVERED_CALL_BREACH` (`src/main/core/alerts.ts:12-18`).
- ✓ Engine is pure — no DB/broker/logger imports (`src/main/core/alerts.ts:1-8`).
- ✓ Urgencies high / medium / low / medium / medium / medium, matching the table (`src/main/core/alerts.ts:232-300`).
- ✓ `EXPIRATION_IMMINENT_MAX_DTE = 5`, `0 ≤ dte ≤ 5` (`src/main/core/alerts.ts:21`, `:237-238`).
- ✓ `MANAGEMENT_WINDOW` is `dte > 5 && dte ≤ resolved.managementWindowDte`, so it is mutually exclusive with imminent (`src/main/core/alerts.ts:245-248`); `DEFAULT_MANAGEMENT_WINDOW_DTE = 21` (`:24`).
- ✓ `STRIKE_PROXIMITY` is CSP-only, `|price − strike| / strike × 100 ≤ 1` (`src/main/core/alerts.ts:36`, `:166-170`, `:271-272`); the summary is direction-aware and appends " — now in the money" when below (`:172-179`).
- ✓ `EARNINGS_PROXIMITY` predicate `0 ≤ daysToEarnings ≤ 10 && daysToEarnings ≤ dte`; `EARNINGS_PROXIMITY_MAX_DAYS = 10` (`src/main/core/alerts.ts:39`, `:284-289`).
- ✓ Earnings summary is singular/plural-aware (today / in 1 day / in N days) (`src/main/core/alerts.ts:185-189`).
- ✓ `COVERED_CALL_BREACH` is CC-only, `price ≥ strike`, and reuses `proximityPercent` (`src/main/core/alerts.ts:181-183`, `:296-297`).
- ✓ `PriceVsStrikeInput = Pick<'strike' | 'currentUnderlyingPrice'>`, aliased by `StrikeProximityInput` and `CoveredCallBreachInput`; `EarningsProximityInput` Pick-slice (`src/main/core/alerts.ts:84-93`).
- ✓ Summary templates for the imminent, management-window, profit-target and breach rules match (`src/main/core/alerts.ts:120-126`, `:150-152`, `:181-183`); every rule's quick action is `'Review position'` (`:41`).
- ✓ Strike is formatted as `$` + `new Decimal(strike).toFixed(2)`, and pct to 1 dp (`src/main/core/alerts.ts:116-118`, `:151`, `:175`).
- ✓ `computeDte` lives in `src/main/core/dte.ts:13` and is used for both `dte` and `daysToEarnings` (`src/main/services/evaluate-alerts.ts:137`, `:146`).
- ✓ `PROFIT_TARGET` uses `computeUnrealizedPnl(...).pnlPercent` compared against the resolved target (`src/main/core/alerts.ts:140-148`, `:264`); `DEFAULT_PROFIT_TARGET_PERCENT = 50` (`src/main/core/profit-target.ts:4`).
- ✓ `evaluatePosition` computes `ResolvedThresholds` up front via `resolveManagementWindowDte` and `resolveProfitTarget` (`src/main/core/alerts.ts:202-205`, `:302-312`); resolution is `override === null ? default : override` (`:32`).
- ✓ The rule registry is `RULES: RuleDefinition[]` with an optional per-rule `missingData` returning `string | null`; evaluation is a two-pass flatMap/filter (`src/main/core/alerts.ts:207-214`, `:232`, `:316-330`); it returns `{ matches, skipped }` with `SkippedRule { ruleCode, reason }` (`:102-110`).
- ✓ Skip reasons `missing_dte`, `missing_option_mark`, `invalid_profit_target_input`, `missing_underlying_price`, `missing_expiration`, `missing_earnings_date` exist and guard the rules listed (`src/main/core/alerts.ts:43-49`, `:216-230`, `:254-263`, `:280-283`).
- ✓ The service logs skips at DEBUG `alert_rule_skipped` (`src/main/services/evaluate-alerts.ts:258-261`).
- ✓ Three concurrent `fetchOrDegrade` fetches under `Promise.all`: `fetchStockQuotes`, `fetchOptionSnapshots`, and `fetchEarnings` (defaulting to `getEarnings`) through the `FetchEarnings` seam (`src/main/services/evaluate-alerts.ts:153-156`, `:170-182`, `:191`, `:211-230`).
- ✓ WARN events `alert_evaluation_stock_quotes_unavailable`, `alert_evaluation_option_snapshots_unavailable`, `alert_evaluation_earnings_unavailable`, `alert_evaluation_occ_symbol_invalid`, and ERROR `alert_evaluation_failed` (per-position try/catch) (`src/main/services/evaluate-alerts.ts:94`, `:216-228`, `:263-265`).
- ✓ OCC symbol is built once per row and is non-throwing (`src/main/services/evaluate-alerts.ts:77-97`, `:201-203`).
- ✓ `evaluateAlerts` is async, returns `Promise<EvaluateAlertsResult>`, and defaults its provider from `marketDataFactory.create()` (`src/main/services/evaluate-alerts.ts:184-192`).
- ✓ Compute outside any transaction, then persist in one `db.transaction`; `keepOpenKeys` = skipped keys ∪ matched keys; `resolveAlertsNotIn` + `clearStaleDismissals` (`src/main/services/evaluate-alerts.ts:274-284`).
- ✓ Resolution is global — every open or dismissed row not in keep-open is resolved, with `resolved_at` set and `dismissed_at` untouched (`src/main/services/alerts.ts:142-196`).
- ✓ `upsertOpenAlert` returns `'suppressed'` when a dismissed row exists; the update path refreshes summary / urgency / quick_action / last_evaluated_at and preserves triggered_at; the insert path sets triggered_at = last_evaluated_at = now (`src/main/services/alerts.ts:72-136`).
- ✓ `AlertError('NOT_OPEN', 'Only open alerts can be dismissed')` and `AlertError('NOT_FOUND', …)`; dismiss sets status / dismissed_at / updated_at (`src/main/services/alerts.ts:59-61`, `:203-218`).
- ✓ Alert status union `'open' | 'resolved' | 'dismissed'` (`src/main/core/alerts.ts:11`).
- ✓ `listManagementQueue` joins positions, filters open, and orders by the urgency CASE then `triggered_at ASC` (`src/main/services/alerts.ts:274-297`); `listOpenAlerts` is a separate primitive (`:231`); `ManagementQueueItem` has exactly the listed fields (`src/main/schemas.ts:622-631`).
- ✓ `alerts:list` and `alerts:dismiss` are registered in `src/main/ipc/alerts.ts:8`, `:12`; renderer adapter at `src/renderer/src/api/alerts.ts`.
- ✓ Migration `009_create_alerts.sql` has `idx_alerts_open_unique` (partial on `status = 'open'`) and `idx_alerts_status_urgency` (`migrations/009_create_alerts.sql:18-23`); `011_add_alerts_dismissal.sql` adds `dismissed_at TEXT` and `idx_alerts_dismissed_unique` (`migrations/011_add_alerts_dismissal.sql:2-7`).
- ✓ `management_window_dte_override INTEGER` is nullable, added by migration 010 (`migrations/010_add_management_window_dte_override.sql`); migration 005 exists.
- ✓ `app_settings` keys `alert_default_profit_target_percent` / `alert_default_management_window_dte` are read via `getAlertDefaults` / `saveAlertDefaults` (`src/main/services/alert-defaults.ts:15-16`, `:28-37`), which fall back to the hardcoded constants when absent (`:31-33`).
- ✓ Both services enforce bounds with `ValidationError` (`src/main/services/alert-defaults.ts:39-42`, `src/main/services/save-position-alert-overrides.ts:29-32`); the overrides service updates only `positions` (`:41`).
- ✓ `PositionCard.tsx`'s `deriveRowDisplay` calls `resolveProfitTarget` (`src/renderer/src/components/PositionCard.tsx:39-44`).
- ✓ The `alert-evaluation` job uses an interval cadence of 60 s open / 300 s extended / null when closed, is not broker-gated, and calls `getAlertDefaults(db)` fresh each tick (`src/main/index.ts:288-304`). The earnings store refreshes near-term dates every 12 h and distant ones weekly (`src/main/services/earnings-dates.ts:34`, `:48`, `:109-114`). The feed keeps only an in-memory failure backoff (`src/main/integrations/finnhub-earnings.ts:142-146`) and emits `earnings_fetch_no_api_key` (WARN, once), `earnings_fetch_failed` (WARN with code auth_failed / rate_limited / network_error / unknown) and `earnings_no_event_in_window` (DEBUG) (`finnhub-earnings.ts:94`, `:150-155`, `:180-184`, `:204`).

## Drift (4)

- ✗ "The six reason strings" — the engine has a seventh, `missing_strike`, returned by the shared price-vs-strike guard for `STRIKE_PROXIMITY` / `COVERED_CALL_BREACH` when the strike is non-numeric (`src/main/core/alerts.ts:46`, `:223-230`). `missing_underlying_price` also fires on a non-numeric price, not only an absent one (`:227`). Suggested fix: add the row to the skip-reason table.
- ✗ "The earnings fetch window's 7-day lookback": the lookback is `EARNINGS_LOOKBACK_DAYS = 30` (`src/main/integrations/finnhub-earnings.ts:13`, `:65`).
- ✗ The Finnhub decision names `fetchNextEarnings(tickers, { lookaheadDays })`. No such function exists; the export is `fetchEarningsCalendar(tickers, { now?, logger?, lookaheadDays? })` (`src/main/integrations/finnhub-earnings.ts:170-173`).
- ✗ "`MarketDataProvider` is the Massive vendor seam" is a present-tense claim, but Massive is retired. The factory builds `AlpacaMarketDataProvider` (or the fake) (`src/main/integrations/market-data-factory.ts:17-21`), and no Massive module exists in `src/main/integrations/`. Suggested fix: say "the Alpaca market-data seam", or frame the Massive reference as history.

## Unverifiable (5)

- ? "(Massive's earnings data is a paid add-on; Alpaca has none)" and "The Barchart IVR scraper (US-43) is the precedent for a vendor-specific auxiliary feed". Both are decision rationale from US-56's time. Note that the Barchart scraper is retired: there is no Barchart module in `src/main/integrations/`, and US-121 computes IV rank from the app's own history. Consider reframing both as history.
- ? "`evaluateAlerts` becomes async" decision says "the compute phase awaits the two batched fetches". The code now awaits three (`src/main/services/evaluate-alerts.ts:211-230`), but the decision is framed as the US-53/54/55 state before US-56 added the third, so it is treated as history.
- ? `earnings_no_event_in_window` is described as "cached as null". The feed no longer caches successes (US-70), so persistence is the `earnings_date` store's concern. This is too indirect to confirm mechanically.
- ? "keeps the 60 s evaluation cadence off the free tier's 60 calls/minute" — a vendor quota claim that can't be checked against code.
- ? "Isolation guarantee … verified by an e2e test for each direction" — the e2e coverage claim was not audited; it needs a human check.

## Missing files (0)

(All relative links resolve, including `../schema/tables.md#earnings_date` → `## \`earnings_date\``at`docs/spec/schema/tables.md:676`.)
