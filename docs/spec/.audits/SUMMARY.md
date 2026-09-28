# Spec Audit Summary — 2026-09-28

Full audit of every page under `docs/spec/` (excluding `.extracts/`, `.audits/`, and `docs/spec/README.md`) against current `src/`, `migrations/`, and `e2e/` on branch `wb-121-calculate-iv`.

- **Pages audited:** 182 (11 topic/contract/schema, 52 features, 119 ADRs incl. the ADR index)
- **Claims:** 2128 verified · 398 drift · 352 unverifiable · 101 missing-file
- **Clean (0 drift, 0 missing):** 52
- **With drift:** 110
- **Missing-file only:** 20

Per-page reports are under `docs/spec/.audits/<same-path>`. Two filename schemes co-exist: topic/contract/schema/ADR reports are `<page>.audit.md`; feature reports are `<page>.md.audit.md`. Older `<page>.md.audit.md` files for topic pages are stale (2026-06-27) — the links below point at the fresh ones.

---

## Possible code defects (not spec drift — need a human look)

1. **`positions:get` bypasses Zod and `handleIpcCall`** (`src/main/ipc/positions.ts:62-71`) — errors throw to the renderer, violating the CLAUDE.md IPC rule. `positions:list` also returns a bare array with no `{ ok }` envelope (`:54`), and `positions:create` never parses `CreatePositionPayloadSchema`. Flagged independently by contracts/ipc-handlers, features/us-4 and adrs/zod-payload-validation.
2. **Earnings lookup lost its past-date fallback** (`earnings-dates.ts:251`, `evaluate-alerts.ts:114-120`) — us-56 specifies falling back to the most recent past earnings date; the code uses only the next date, so an earnings-proximity alert may never resolve after earnings pass.
3. **`OpenCoveredCallSheet` uses `useState` form state** (`src/renderer/src/components/OpenCoveredCallSheet.tsx:24-30`), violating the React Hook Form + Zod rule.
4. **Renderer imports `src/main/core`** (`PositionCard.tsx:3-5`), contradicting the overview's layering claim.
5. **Renderer money previews use `parseFloat`** (`CloseCspForm.tsx:42-49`, `lib/rolls.ts:15-53`, `openCcGuardrail.ts:10-28`) — the decimal-money-math ADR says previews use decimal.js; only `CcPnlPreview` does.
6. Dead values: `WheelPhase` has `CSP_EXPIRED`/`CC_EXPIRED` that no code transitions to (`src/main/core/types.ts:9,14`); `zustand` is declared but never imported (`package.json:57`).

---

## Dominant drift themes

### 1. US-121 / Barchart retirement not propagated (≈20 pages)

`ivr_snapshot` is dropped (`migrations/016_create_iv30_history.sql:55`); the collector is `collectIvHistoryBatch`/`collectIvHistory` with outcomes `collected | up_to_date | failed | no_market_data`; the read path is `readIvRankLookup` (`src/main/services/iv-rank-lookup.ts`). No throttle, no `market_closed` skip. Still describing the old design in present tense:
features us-43, us-44, us-65, us-67, us-70, us-96, us-97, us-98, us-100, us-116, us-117; ADRs ivr-assessment-three-state-result, ivr-collector-throttle-boundary, ivr-collector-per-ticker-failure-isolation, union-ivr-targets-positions-and-watchlist, earnings-persisted-per-ticker, earnings-four-state-lookup, ADR README.

**On this branch specifically:** `market-data-provider-interface` omits the US-121 `getOptionDailyBars`/`getStockDailyBars`; `alpaca-sole-market-data-vendor` says `feed=sip` is never requested but US-121 requests it for daily stock bars. us-121's own feature page audited clean.

### 2. Market status/calendar moved from BrokerProvider to MarketDataProvider (US-116) (≈15 pages)

`BrokerProvider` has only `getAccountInfo`/`getActivities`; `getMarketStatus`/`getMarketCalendar` are on `MarketDataProvider`; IPC is `market-data:market-status`, preload `window.api.marketData.marketStatus`, query key `['market','status']`; `getSafeBroker`/`fallbackBroker` are gone. Stale on: 01-overview, contracts/alpaca-integration, domain/market-data, us-31, us-32, us-35, us-39, us-46, us-47-49, us-48, us-60, us-98, market-data-massive-migration, ADRs market-session-derivation, market-data-tanstack-cache, vendor-scoped-query-keys, tanstack-query-mutation-hooks, scheduler-singleton-safe-broker, alpaca-sdk-rest-only.

### 3. Massive described as the live vendor (≈12 pages)

Factory builds `AlpacaMarketDataProvider`; `massive-market-data.ts` doesn't exist. Present-tense on: us-31, us-32, us-37, us-39, us-48, us-64, domain/alerts, schema/tables (`credential_settings`), ADRs ws-package-streaming, option-data-availability, option-snapshots-rest-polling, msgpack-option-streaming, market-data-tanstack-cache.

### 4. Screener folded into the watchlist bench (US-96)

`ScreenerPage.tsx`, `ScreenerResultsTable.tsx`, `ScreenerExcludedSection` deleted in `152aabf`; stale on us-66, us-67, us-68, us-70, us-99, earnings-tier-before-score.

### 5. Alert engine grew

`RULES` has six rules; `evaluateAlerts` is async and takes `provider`/`profitTargetPercentDefault`/`fetchEarnings`; new skip reasons `missing_strike`/`missing_earnings_date`/`missing_expiration`; Finnhub function is `fetchEarningsCalendar` with a 30-day lookback. Stale on us-50, us-53-54-55, us-56, us-57-58, domain/alerts, domain/market-data, alert-rule-registry.

### 6. Cost basis & leg roles

- Snapshots use `makeSnapshotAt(eventDate)` with `ORDER BY snapshot_at DESC, rowid DESC` — no "now + 1ms" (domain/cost-basis, schema/tables, append-only-cost-basis-snapshots, event-marker-legs). `CC_EXPIRED` writes no terminal snapshot.
- Roll formulas: CC roll spreads net over `positionContracts`; CSP roll to a new strike adds the strike delta (us-12, us-14, us-16).
- Leg roles: CC expire = `CC_EXPIRED` (not `EXPIRE`), call-away = `CALLED_AWAY` (not `CC_CLOSE`) (us-9, us-10, event-marker-legs).

### 7. Schema pages

CHECK constraints on `leg_role`/`action`/`option_type` described but absent from `001`; `positions.contracts` column documented but never created; `legs` has two indexes (`idx_legs_position_fill_date`, `idx_legs_position_role_date`) though the page says none.

---

## Drift detected (110 pages, most-drifted first)

- [contracts/ipc-handlers.md](../contracts/ipc-handlers.md) — 22 drift, 6 missing ([report](contracts/ipc-handlers.audit.md))
- [contracts/zod-schemas.md](../contracts/zod-schemas.md) — 15 drift, 6 missing ([report](contracts/zod-schemas.audit.md))
- [features/us-100-ivr-on-demand-and-outside-market-hours.md](../features/us-100-ivr-on-demand-and-outside-market-hours.md) — 11 drift, 2 missing ([report](features/us-100-ivr-on-demand-and-outside-market-hours.md.audit.md))
- [features/us-44-ivr-snapshot-store-and-scheduler.md](../features/us-44-ivr-snapshot-store-and-scheduler.md) — 10 drift, 3 missing ([report](features/us-44-ivr-snapshot-store-and-scheduler.md.audit.md))
- [features/us-66-screener-results.md](../features/us-66-screener-results.md) — 10 drift, 3 missing ([report](features/us-66-screener-results.md.audit.md))
- [features/us-63-manage-watchlist.md](../features/us-63-manage-watchlist.md) — 9 drift, 1 missing ([report](features/us-63-manage-watchlist.md.audit.md))
- [features/us-65-score-wheel-candidates.md](../features/us-65-score-wheel-candidates.md) — 9 drift, 2 missing ([report](features/us-65-score-wheel-candidates.md.audit.md))
- [contracts/alpaca-integration.md](../contracts/alpaca-integration.md) — 8 drift, 1 missing ([report](contracts/alpaca-integration.audit.md))
- [features/us-31-market-data-provider-adapter.md](../features/us-31-market-data-provider-adapter.md) — 8 drift, 4 missing ([report](features/us-31-market-data-provider-adapter.md.audit.md))
- [features/us-37-paper-live-broker-environment-toggle.md](../features/us-37-paper-live-broker-environment-toggle.md) — 8 drift ([report](features/us-37-paper-live-broker-environment-toggle.md.audit.md))
- [features/us-97-collect-ivr-for-watchlist-underlyings.md](../features/us-97-collect-ivr-for-watchlist-underlyings.md) — 8 drift ([report](features/us-97-collect-ivr-for-watchlist-underlyings.md.audit.md))
- [schema/tables.md](../schema/tables.md) — 8 drift ([report](schema/tables.audit.md))
- [features/us-32-live-position-prices.md](../features/us-32-live-position-prices.md) — 7 drift, 1 missing ([report](features/us-32-live-position-prices.md.audit.md))
- [features/us-35-assignment-detection.md](../features/us-35-assignment-detection.md) — 7 drift ([report](features/us-35-assignment-detection.md.audit.md))
- [features/us-46-polling-scheduler.md](../features/us-46-polling-scheduler.md) — 7 drift ([report](features/us-46-polling-scheduler.md.audit.md))
- [features/us-6-record-assignment.md](../features/us-6-record-assignment.md) — 7 drift, 1 missing ([report](features/us-6-record-assignment.md.audit.md))
- [features/us-7-open-covered-call.md](../features/us-7-open-covered-call.md) — 7 drift ([report](features/us-7-open-covered-call.md.audit.md))
- [features/us-98-ivr-staleness-tiers.md](../features/us-98-ivr-staleness-tiers.md) — 7 drift, 4 missing ([report](features/us-98-ivr-staleness-tiers.md.audit.md))
- [architecture/01-overview.md](../architecture/01-overview.md) — 6 drift, 1 missing ([report](architecture/01-overview.audit.md))
- [architecture/03-design-system.md](../architecture/03-design-system.md) — 6 drift, 1 missing ([report](architecture/03-design-system.audit.md))
- [domain/cost-basis.md](../domain/cost-basis.md) — 6 drift, 3 missing ([report](domain/cost-basis.audit.md))
- [domain/market-data.md](../domain/market-data.md) — 6 drift ([report](domain/market-data.audit.md))
- [features/us-34-position-cockpit.md](../features/us-34-position-cockpit.md) — 6 drift ([report](features/us-34-position-cockpit.md.audit.md))
- [features/us-67-configure-screening-criteria.md](../features/us-67-configure-screening-criteria.md) — 6 drift, 1 missing ([report](features/us-67-configure-screening-criteria.md.audit.md))
- [features/us-68-promote-result-to-new-wheel.md](../features/us-68-promote-result-to-new-wheel.md) — 6 drift, 2 missing ([report](features/us-68-promote-result-to-new-wheel.md.audit.md))
- [architecture/02-adrs/ws-package-streaming.md](../architecture/02-adrs/ws-package-streaming.md) — 5 drift ([report](architecture/02-adrs/ws-package-streaming.audit.md))
- [features/us-2-position-list.md](../features/us-2-position-list.md) — 5 drift ([report](features/us-2-position-list.md.audit.md))
- [features/us-33-option-mid-pnl.md](../features/us-33-option-mid-pnl.md) — 5 drift ([report](features/us-33-option-mid-pnl.md.audit.md))
- [features/us-5-expire-csp.md](../features/us-5-expire-csp.md) — 5 drift ([report](features/us-5-expire-csp.md.audit.md))
- [features/us-56-earnings-proximity-alert.md](../features/us-56-earnings-proximity-alert.md) — 5 drift ([report](features/us-56-earnings-proximity-alert.md.audit.md))
- [features/us-64-pull-option-chains-for-watchlist.md](../features/us-64-pull-option-chains-for-watchlist.md) — 5 drift, 1 missing ([report](features/us-64-pull-option-chains-for-watchlist.md.audit.md))
- [architecture/02-adrs/ivr-assessment-three-state-result.md](../architecture/02-adrs/ivr-assessment-three-state-result.md) — 4 drift ([report](architecture/02-adrs/ivr-assessment-three-state-result.audit.md))
- [architecture/02-adrs/option-data-availability.md](../architecture/02-adrs/option-data-availability.md) — 4 drift, 1 missing ([report](architecture/02-adrs/option-data-availability.audit.md))
- [architecture/02-adrs/sheet-component-pattern.md](../architecture/02-adrs/sheet-component-pattern.md) — 4 drift ([report](architecture/02-adrs/sheet-component-pattern.audit.md))
- [domain/alerts.md](../domain/alerts.md) — 4 drift ([report](domain/alerts.audit.md))
- [features/us-11-leg-history.md](../features/us-11-leg-history.md) — 4 drift ([report](features/us-11-leg-history.md.audit.md))
- [features/us-39-massive-market-data-provider.md](../features/us-39-massive-market-data-provider.md) — 4 drift ([report](features/us-39-massive-market-data-provider.md.audit.md))
- [features/us-50-alert-engine.md](../features/us-50-alert-engine.md) — 4 drift ([report](features/us-50-alert-engine.md.audit.md))
- [features/us-53-54-55-market-data-alert-rules.md](../features/us-53-54-55-market-data-alert-rules.md) — 4 drift ([report](features/us-53-54-55-market-data-alert-rules.md.audit.md))
- [features/us-59-dismiss-alert.md](../features/us-59-dismiss-alert.md) — 4 drift ([report](features/us-59-dismiss-alert.md.audit.md))
- [features/us-60-expiration-calendar-view.md](../features/us-60-expiration-calendar-view.md) — 4 drift ([report](features/us-60-expiration-calendar-view.md.audit.md))
- [features/us-70-earnings-in-window-warning.md](../features/us-70-earnings-in-window-warning.md) — 4 drift, 1 missing ([report](features/us-70-earnings-in-window-warning.md.audit.md))
- [architecture/02-adrs/README.md](../architecture/02-adrs/README.md) — 3 drift ([report](architecture/02-adrs/README.audit.md))
- [architecture/02-adrs/market-data-tanstack-cache.md](../architecture/02-adrs/market-data-tanstack-cache.md) — 3 drift ([report](architecture/02-adrs/market-data-tanstack-cache.audit.md))
- [architecture/02-adrs/market-session-derivation.md](../architecture/02-adrs/market-session-derivation.md) — 3 drift, 1 missing ([report](architecture/02-adrs/market-session-derivation.audit.md))
- [architecture/02-adrs/option-snapshots-rest-polling.md](../architecture/02-adrs/option-snapshots-rest-polling.md) — 3 drift, 2 missing ([report](architecture/02-adrs/option-snapshots-rest-polling.audit.md))
- [architecture/02-adrs/vendor-scoped-query-keys.md](../architecture/02-adrs/vendor-scoped-query-keys.md) — 3 drift ([report](architecture/02-adrs/vendor-scoped-query-keys.audit.md))
- [features/us-10-call-away.md](../features/us-10-call-away.md) — 3 drift ([report](features/us-10-call-away.md.audit.md))
- [features/us-14-roll-cc.md](../features/us-14-roll-cc.md) — 3 drift ([report](features/us-14-roll-cc.md.audit.md))
- [features/us-43-barchart-ivr-scraper.md](../features/us-43-barchart-ivr-scraper.md) — 3 drift, 2 missing ([report](features/us-43-barchart-ivr-scraper.md.audit.md))
- [features/us-48-scheduler-settings-fixes.md](../features/us-48-scheduler-settings-fixes.md) — 3 drift ([report](features/us-48-scheduler-settings-fixes.md.audit.md))
- [features/us-52-expiration-imminent-alert.md](../features/us-52-expiration-imminent-alert.md) — 3 drift ([report](features/us-52-expiration-imminent-alert.md.audit.md))
- [features/us-9-expire-cc.md](../features/us-9-expire-cc.md) — 3 drift ([report](features/us-9-expire-cc.md.audit.md))
- [features/us-99-alpaca-market-data-provider.md](../features/us-99-alpaca-market-data-provider.md) — 3 drift, 2 missing ([report](features/us-99-alpaca-market-data-provider.md.audit.md))
- [schema/migrations.md](../schema/migrations.md) — 3 drift ([report](schema/migrations.audit.md))
- [architecture/02-adrs/alert-rule-registry.md](../architecture/02-adrs/alert-rule-registry.md) — 2 drift ([report](architecture/02-adrs/alert-rule-registry.audit.md))
- [architecture/02-adrs/alpaca-sdk-rest-only.md](../architecture/02-adrs/alpaca-sdk-rest-only.md) — 2 drift ([report](architecture/02-adrs/alpaca-sdk-rest-only.audit.md))
- [architecture/02-adrs/append-only-cost-basis-snapshots.md](../architecture/02-adrs/append-only-cost-basis-snapshots.md) — 2 drift ([report](architecture/02-adrs/append-only-cost-basis-snapshots.audit.md))
- [architecture/02-adrs/client-side-pnl-preview.md](../architecture/02-adrs/client-side-pnl-preview.md) — 2 drift ([report](architecture/02-adrs/client-side-pnl-preview.audit.md))
- [architecture/02-adrs/earnings-four-state-lookup.md](../architecture/02-adrs/earnings-four-state-lookup.md) — 2 drift ([report](architecture/02-adrs/earnings-four-state-lookup.audit.md))
- [architecture/02-adrs/event-marker-legs.md](../architecture/02-adrs/event-marker-legs.md) — 2 drift ([report](architecture/02-adrs/event-marker-legs.audit.md))
- [architecture/02-adrs/instrument-type-rename.md](../architecture/02-adrs/instrument-type-rename.md) — 2 drift ([report](architecture/02-adrs/instrument-type-rename.audit.md))
- [architecture/02-adrs/ivr-collector-throttle-boundary.md](../architecture/02-adrs/ivr-collector-throttle-boundary.md) — 2 drift ([report](architecture/02-adrs/ivr-collector-throttle-boundary.audit.md))
- [architecture/02-adrs/market-status-pill.md](../architecture/02-adrs/market-status-pill.md) — 2 drift ([report](architecture/02-adrs/market-status-pill.audit.md))
- [architecture/02-adrs/rxjs-observables-for-streaming.md](../architecture/02-adrs/rxjs-observables-for-streaming.md) — 2 drift ([report](architecture/02-adrs/rxjs-observables-for-streaming.audit.md))
- [architecture/02-adrs/tanstack-query-mutation-hooks.md](../architecture/02-adrs/tanstack-query-mutation-hooks.md) — 2 drift ([report](architecture/02-adrs/tanstack-query-mutation-hooks.audit.md))
- [architecture/02-adrs/trading-calendar-fetched-and-cached.md](../architecture/02-adrs/trading-calendar-fetched-and-cached.md) — 2 drift ([report](architecture/02-adrs/trading-calendar-fetched-and-cached.audit.md))
- [architecture/02-adrs/union-ivr-targets-positions-and-watchlist.md](../architecture/02-adrs/union-ivr-targets-positions-and-watchlist.md) — 2 drift ([report](architecture/02-adrs/union-ivr-targets-positions-and-watchlist.audit.md))
- [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md) — 2 drift, 4 missing ([report](domain/wheel-lifecycle.audit.md))
- [features/market-data-massive-migration.md](../features/market-data-massive-migration.md) — 2 drift ([report](features/market-data-massive-migration.md.audit.md))
- [features/us-116-market-facts-from-market-data-provider.md](../features/us-116-market-facts-from-market-data-provider.md) — 2 drift ([report](features/us-116-market-facts-from-market-data-provider.md.audit.md))
- [features/us-13-roll-down-and-out.md](../features/us-13-roll-down-and-out.md) — 2 drift ([report](features/us-13-roll-down-and-out.md.audit.md))
- [features/us-4-close-csp.md](../features/us-4-close-csp.md) — 2 drift ([report](features/us-4-close-csp.md.audit.md))
- [features/us-47-49-broker-ac-hardening.md](../features/us-47-49-broker-ac-hardening.md) — 2 drift ([report](features/us-47-49-broker-ac-hardening.md.audit.md))
- [features/us-57-58-configurable-alert-thresholds.md](../features/us-57-58-configurable-alert-thresholds.md) — 2 drift ([report](features/us-57-58-configurable-alert-thresholds.md.audit.md))
- [architecture/02-adrs/action-buttons-phase-gated.md](../architecture/02-adrs/action-buttons-phase-gated.md) — 1 drift ([report](architecture/02-adrs/action-buttons-phase-gated.audit.md))
- [architecture/02-adrs/alerts-partial-unique-open.md](../architecture/02-adrs/alerts-partial-unique-open.md) — 1 drift, 2 missing ([report](architecture/02-adrs/alerts-partial-unique-open.audit.md))
- [architecture/02-adrs/alpaca-sole-market-data-vendor.md](../architecture/02-adrs/alpaca-sole-market-data-vendor.md) — 1 drift ([report](architecture/02-adrs/alpaca-sole-market-data-vendor.audit.md))
- [architecture/02-adrs/cockpit-component-decomposition.md](../architecture/02-adrs/cockpit-component-decomposition.md) — 1 drift, 3 missing ([report](architecture/02-adrs/cockpit-component-decomposition.audit.md))
- [architecture/02-adrs/decimal-money-math.md](../architecture/02-adrs/decimal-money-math.md) — 1 drift ([report](architecture/02-adrs/decimal-money-math.audit.md))
- [architecture/02-adrs/dev-only-test-scheduler-ipc.md](../architecture/02-adrs/dev-only-test-scheduler-ipc.md) — 1 drift, 1 missing ([report](architecture/02-adrs/dev-only-test-scheduler-ipc.audit.md))
- [architecture/02-adrs/earnings-persisted-per-ticker.md](../architecture/02-adrs/earnings-persisted-per-ticker.md) — 1 drift ([report](architecture/02-adrs/earnings-persisted-per-ticker.audit.md))
- [architecture/02-adrs/earnings-tier-before-score.md](../architecture/02-adrs/earnings-tier-before-score.md) — 1 drift, 1 missing ([report](architecture/02-adrs/earnings-tier-before-score.audit.md))
- [architecture/02-adrs/ipc-envelope-contract.md](../architecture/02-adrs/ipc-envelope-contract.md) — 1 drift ([report](architecture/02-adrs/ipc-envelope-contract.audit.md))
- [architecture/02-adrs/ivr-collector-per-ticker-failure-isolation.md](../architecture/02-adrs/ivr-collector-per-ticker-failure-isolation.md) — 1 drift, 1 missing ([report](architecture/02-adrs/ivr-collector-per-ticker-failure-isolation.audit.md))
- [architecture/02-adrs/market-data-provider-interface.md](../architecture/02-adrs/market-data-provider-interface.md) — 1 drift, 2 missing ([report](architecture/02-adrs/market-data-provider-interface.audit.md))
- [architecture/02-adrs/market-data-provider-lifecycle.md](../architecture/02-adrs/market-data-provider-lifecycle.md) — 1 drift ([report](architecture/02-adrs/market-data-provider-lifecycle.audit.md))
- [architecture/02-adrs/market-data-push-events.md](../architecture/02-adrs/market-data-push-events.md) — 1 drift ([report](architecture/02-adrs/market-data-push-events.audit.md))
- [architecture/02-adrs/market-data-stale-detection.md](../architecture/02-adrs/market-data-stale-detection.md) — 1 drift ([report](architecture/02-adrs/market-data-stale-detection.audit.md))
- [architecture/02-adrs/msgpack-option-streaming.md](../architecture/02-adrs/msgpack-option-streaming.md) — 1 drift, 2 missing ([report](architecture/02-adrs/msgpack-option-streaming.audit.md))
- [architecture/02-adrs/per-symbol-ws-subscription-reconciliation.md](../architecture/02-adrs/per-symbol-ws-subscription-reconciliation.md) — 1 drift ([report](architecture/02-adrs/per-symbol-ws-subscription-reconciliation.audit.md))
- [architecture/02-adrs/polling-scheduler-settimeout-chain.md](../architecture/02-adrs/polling-scheduler-settimeout-chain.md) — 1 drift, 2 missing ([report](architecture/02-adrs/polling-scheduler-settimeout-chain.audit.md))
- [architecture/02-adrs/polling-scheduler-stateless.md](../architecture/02-adrs/polling-scheduler-stateless.md) — 1 drift, 1 missing ([report](architecture/02-adrs/polling-scheduler-stateless.audit.md))
- [architecture/02-adrs/positions-list-active-closed-grouping.md](../architecture/02-adrs/positions-list-active-closed-grouping.md) — 1 drift ([report](architecture/02-adrs/positions-list-active-closed-grouping.audit.md))
- [architecture/02-adrs/pure-core-engines.md](../architecture/02-adrs/pure-core-engines.md) — 1 drift ([report](architecture/02-adrs/pure-core-engines.audit.md))
- [architecture/02-adrs/react-hook-form-zod.md](../architecture/02-adrs/react-hook-form-zod.md) — 1 drift ([report](architecture/02-adrs/react-hook-form-zod.audit.md))
- [architecture/02-adrs/renderer-snake-case-adapter.md](../architecture/02-adrs/renderer-snake-case-adapter.md) — 1 drift ([report](architecture/02-adrs/renderer-snake-case-adapter.audit.md))
- [architecture/02-adrs/runtime-broker-provider-refresh.md](../architecture/02-adrs/runtime-broker-provider-refresh.md) — 1 drift ([report](architecture/02-adrs/runtime-broker-provider-refresh.audit.md))
- [architecture/02-adrs/scheduler-singleton-safe-broker.md](../architecture/02-adrs/scheduler-singleton-safe-broker.md) — 1 drift ([report](architecture/02-adrs/scheduler-singleton-safe-broker.audit.md))
- [architecture/02-adrs/single-step-phase-transitions.md](../architecture/02-adrs/single-step-phase-transitions.md) — 1 drift ([report](architecture/02-adrs/single-step-phase-transitions.audit.md))
- [architecture/02-adrs/standalone-service-per-operation.md](../architecture/02-adrs/standalone-service-per-operation.md) — 1 drift ([report](architecture/02-adrs/standalone-service-per-operation.audit.md))
- [architecture/02-adrs/wouter-hash-routing-query-prefill.md](../architecture/02-adrs/wouter-hash-routing-query-prefill.md) — 1 drift ([report](architecture/02-adrs/wouter-hash-routing-query-prefill.audit.md))
- [architecture/02-adrs/zod-payload-validation.md](../architecture/02-adrs/zod-payload-validation.md) — 1 drift ([report](architecture/02-adrs/zod-payload-validation.audit.md))
- [features/us-117-position-implied-volatility.md](../features/us-117-position-implied-volatility.md) — 1 drift ([report](features/us-117-position-implied-volatility.md.audit.md))
- [features/us-12-roll-csp.md](../features/us-12-roll-csp.md) — 1 drift ([report](features/us-12-roll-csp.md.audit.md))
- [features/us-16-cost-basis-sequential-rolls.md](../features/us-16-cost-basis-sequential-rolls.md) — 1 drift ([report](features/us-16-cost-basis-sequential-rolls.md.audit.md))
- [features/us-51-management-queue-dashboard.md](../features/us-51-management-queue-dashboard.md) — 1 drift ([report](features/us-51-management-queue-dashboard.md.audit.md))
- [features/us-62-covered-call-breach-alert.md](../features/us-62-covered-call-breach-alert.md) — 1 drift ([report](features/us-62-covered-call-breach-alert.md.audit.md))
- [features/us-8-close-cc-early.md](../features/us-8-close-cc-early.md) — 1 drift ([report](features/us-8-close-cc-early.md.audit.md))
- [features/us-96-one-live-bench.md](../features/us-96-one-live-bench.md) — 1 drift ([report](features/us-96-one-live-bench.md.audit.md))

## Missing-file findings only (20 pages)

- [architecture/02-adrs/active-leg-metadata-via-positions-list.md](../architecture/02-adrs/active-leg-metadata-via-positions-list.md) — 2 missing ([report](architecture/02-adrs/active-leg-metadata-via-positions-list.audit.md))
- [architecture/02-adrs/alert-compute-then-persist.md](../architecture/02-adrs/alert-compute-then-persist.md) — 1 missing ([report](architecture/02-adrs/alert-compute-then-persist.audit.md))
- [architecture/02-adrs/alert-engine-pure-matches-skips.md](../architecture/02-adrs/alert-engine-pure-matches-skips.md) — 1 missing ([report](architecture/02-adrs/alert-engine-pure-matches-skips.audit.md))
- [architecture/02-adrs/alert-evaluation-failure-isolation.md](../architecture/02-adrs/alert-evaluation-failure-isolation.md) — 2 missing ([report](architecture/02-adrs/alert-evaluation-failure-isolation.audit.md))
- [architecture/02-adrs/alert-evaluation-job-cadence.md](../architecture/02-adrs/alert-evaluation-job-cadence.md) — 2 missing ([report](architecture/02-adrs/alert-evaluation-job-cadence.audit.md))
- [architecture/02-adrs/alert-resolution-global.md](../architecture/02-adrs/alert-resolution-global.md) — 1 missing ([report](architecture/02-adrs/alert-resolution-global.audit.md))
- [architecture/02-adrs/assignment-polling-cadence.md](../architecture/02-adrs/assignment-polling-cadence.md) — 1 missing ([report](architecture/02-adrs/assignment-polling-cadence.audit.md))
- [architecture/02-adrs/assignment-watermark-poll-start.md](../architecture/02-adrs/assignment-watermark-poll-start.md) — 1 missing ([report](architecture/02-adrs/assignment-watermark-poll-start.audit.md))
- [architecture/02-adrs/barchart-as-canonical-ivr-source.md](../architecture/02-adrs/barchart-as-canonical-ivr-source.md) — 1 missing ([report](architecture/02-adrs/barchart-as-canonical-ivr-source.audit.md))
- [architecture/02-adrs/consolidated-before-quit.md](../architecture/02-adrs/consolidated-before-quit.md) — 1 missing ([report](architecture/02-adrs/consolidated-before-quit.audit.md))
- [architecture/02-adrs/dte-aware-delta-severity.md](../architecture/02-adrs/dte-aware-delta-severity.md) — 2 missing ([report](architecture/02-adrs/dte-aware-delta-severity.audit.md))
- [architecture/02-adrs/leg-history-in-cost-basis-drawer.md](../architecture/02-adrs/leg-history-in-cost-basis-drawer.md) — 2 missing ([report](architecture/02-adrs/leg-history-in-cost-basis-drawer.audit.md))
- [architecture/02-adrs/management-queue-read-path.md](../architecture/02-adrs/management-queue-read-path.md) — 2 missing ([report](architecture/02-adrs/management-queue-read-path.audit.md))
- [architecture/02-adrs/no-active-leg-cockpit-branch.md](../architecture/02-adrs/no-active-leg-cockpit-branch.md) — 2 missing ([report](architecture/02-adrs/no-active-leg-cockpit-branch.audit.md))
- [architecture/02-adrs/occ-symbol-pure-leaf.md](../architecture/02-adrs/occ-symbol-pure-leaf.md) — 1 missing ([report](architecture/02-adrs/occ-symbol-pure-leaf.audit.md))
- [architecture/02-adrs/pending-assignments-compound-unique.md](../architecture/02-adrs/pending-assignments-compound-unique.md) — 1 missing ([report](architecture/02-adrs/pending-assignments-compound-unique.audit.md))
- [architecture/02-adrs/pending-assignments-table-as-notification.md](../architecture/02-adrs/pending-assignments-table-as-notification.md) — 1 missing ([report](architecture/02-adrs/pending-assignments-table-as-notification.audit.md))
- [architecture/02-adrs/pnl-math-in-costbasis.md](../architecture/02-adrs/pnl-math-in-costbasis.md) — 2 missing ([report](architecture/02-adrs/pnl-math-in-costbasis.audit.md))
- [architecture/02-adrs/profit-target-nullable-column.md](../architecture/02-adrs/profit-target-nullable-column.md) — 2 missing ([report](architecture/02-adrs/profit-target-nullable-column.audit.md))
- [architecture/02-adrs/renderer-builds-occ-symbols.md](../architecture/02-adrs/renderer-builds-occ-symbols.md) — 2 missing ([report](architecture/02-adrs/renderer-builds-occ-symbols.audit.md))

## Clean (52 pages)

- [architecture/02-adrs/active-ivr-targets-from-positions.md](../architecture/02-adrs/active-ivr-targets-from-positions.md)
- [architecture/02-adrs/active-leg-resolution.md](../architecture/02-adrs/active-leg-resolution.md)
- [architecture/02-adrs/alpaca-credentials-runtime-env-only.md](../architecture/02-adrs/alpaca-credentials-runtime-env-only.md)
- [architecture/02-adrs/barchart-retired-from-code-and-schema.md](../architecture/02-adrs/barchart-retired-from-code-and-schema.md)
- [architecture/02-adrs/configurable-alert-thresholds.md](../architecture/02-adrs/configurable-alert-thresholds.md)
- [architecture/02-adrs/daily-bars-on-market-data-provider.md](../architecture/02-adrs/daily-bars-on-market-data-provider.md)
- [architecture/02-adrs/dedicated-ivr-ipc-surface.md](../architecture/02-adrs/dedicated-ivr-ipc-surface.md)
- [architecture/02-adrs/deeplink-in-ipc-error-envelope.md](../architecture/02-adrs/deeplink-in-ipc-error-envelope.md)
- [architecture/02-adrs/earnings-invalidates-ivr-before-expiry.md](../architecture/02-adrs/earnings-invalidates-ivr-before-expiry.md)
- [architecture/02-adrs/error-field-naming-convention.md](../architecture/02-adrs/error-field-naming-convention.md)
- [architecture/02-adrs/fake-provider-synthesises-bars-from-iv-series.md](../architecture/02-adrs/fake-provider-synthesises-bars-from-iv-series.md)
- [architecture/02-adrs/fill-migration-gap-with-007.md](../architecture/02-adrs/fill-migration-gap-with-007.md)
- [architecture/02-adrs/iex-feed-for-seed-and-stream.md](../architecture/02-adrs/iex-feed-for-seed-and-stream.md)
- [architecture/02-adrs/ipc-channel-naming.md](../architecture/02-adrs/ipc-channel-naming.md)
- [architecture/02-adrs/ipc-returns-full-option-snapshot.md](../architecture/02-adrs/ipc-returns-full-option-snapshot.md)
- [architecture/02-adrs/iv-rank-absence-reason-in-memory-run-state.md](../architecture/02-adrs/iv-rank-absence-reason-in-memory-run-state.md)
- [architecture/02-adrs/iv-rank-window-252-before-anchor.md](../architecture/02-adrs/iv-rank-window-252-before-anchor.md)
- [architecture/02-adrs/iv30-contract-selection.md](../architecture/02-adrs/iv30-contract-selection.md)
- [architecture/02-adrs/iv30-engine-version-recompute.md](../architecture/02-adrs/iv30-engine-version-recompute.md)
- [architecture/02-adrs/iv30-from-daily-bar-vwap.md](../architecture/02-adrs/iv30-from-daily-bar-vwap.md)
- [architecture/02-adrs/iv30-gap-rows-except-newest-session.md](../architecture/02-adrs/iv30-gap-rows-except-newest-session.md)
- [architecture/02-adrs/iv30-series-with-inputs-metrics-on-read.md](../architecture/02-adrs/iv30-series-with-inputs-metrics-on-read.md)
- [architecture/02-adrs/ivr-auth-failure-aborts-as-skip.md](../architecture/02-adrs/ivr-auth-failure-aborts-as-skip.md)
- [architecture/02-adrs/ivr-collector-idempotent-over-missing-sessions.md](../architecture/02-adrs/ivr-collector-idempotent-over-missing-sessions.md)
- [architecture/02-adrs/ivr-freshness-in-completed-sessions.md](../architecture/02-adrs/ivr-freshness-in-completed-sessions.md)
- [architecture/02-adrs/ivr-non-trading-day-guard-in-collector.md](../architecture/02-adrs/ivr-non-trading-day-guard-in-collector.md)
- [architecture/02-adrs/ivr-same-day-overwrite-delete-then-insert.md](../architecture/02-adrs/ivr-same-day-overwrite-delete-then-insert.md)
- [architecture/02-adrs/market-data-lazy-credentials-stream-restart.md](../architecture/02-adrs/market-data-lazy-credentials-stream-restart.md)
- [architecture/02-adrs/market-data-stream-with-rest-seed.md](../architecture/02-adrs/market-data-stream-with-rest-seed.md)
- [architecture/02-adrs/marketdataerror-structured-codes.md](../architecture/02-adrs/marketdataerror-structured-codes.md)
- [architecture/02-adrs/named-lifecycle-functions.md](../architecture/02-adrs/named-lifecycle-functions.md)
- [architecture/02-adrs/open-interest-from-contracts-endpoint.md](../architecture/02-adrs/open-interest-from-contracts-endpoint.md)
- [architecture/02-adrs/park-wake-reuses-scheduletick.md](../architecture/02-adrs/park-wake-reuses-scheduletick.md)
- [architecture/02-adrs/pct-of-max-formula.md](../architecture/02-adrs/pct-of-max-formula.md)
- [architecture/02-adrs/rolls-as-linked-leg-pairs.md](../architecture/02-adrs/rolls-as-linked-leg-pairs.md)
- [architecture/02-adrs/save-verified-alpaca-service.md](../architecture/02-adrs/save-verified-alpaca-service.md)
- [architecture/02-adrs/server-side-dte-and-derived-fields.md](../architecture/02-adrs/server-side-dte-and-derived-fields.md)
- [architecture/02-adrs/settings-market-data-action-placement.md](../architecture/02-adrs/settings-market-data-action-placement.md)
- [architecture/02-adrs/shadcn-collapsible-drawers.md](../architecture/02-adrs/shadcn-collapsible-drawers.md)
- [architecture/02-adrs/shared-dte-helper.md](../architecture/02-adrs/shared-dte-helper.md)
- [architecture/02-adrs/shared-massive-app-configuration.md](../architecture/02-adrs/shared-massive-app-configuration.md)
- [architecture/02-adrs/soft-client-side-warnings.md](../architecture/02-adrs/soft-client-side-warnings.md)
- [architecture/02-adrs/spread-no-bid-renderer-predicates.md](../architecture/02-adrs/spread-no-bid-renderer-predicates.md)
- [architecture/02-adrs/subsume-greeks-into-cockpit.md](../architecture/02-adrs/subsume-greeks-into-cockpit.md)
- [architecture/02-adrs/underlying-via-stockquotes.md](../architecture/02-adrs/underlying-via-stockquotes.md)
- [architecture/02-adrs/unknown-earnings-never-excludes.md](../architecture/02-adrs/unknown-earnings-never-excludes.md)
- [architecture/02-adrs/usable-ivr-only-reaches-the-engine.md](../architecture/02-adrs/usable-ivr-only-reaches-the-engine.md)
- [architecture/02-adrs/verdict-precedence-chain.md](../architecture/02-adrs/verdict-precedence-chain.md)
- [architecture/02-adrs/verdict-pure-compute.md](../architecture/02-adrs/verdict-pure-compute.md)
- [features/us-121-iv-rank-from-own-iv-history.md](../features/us-121-iv-rank-from-own-iv-history.md)
- [features/us-15-roll-pair-timeline.md](../features/us-15-roll-pair-timeline.md)
- [features/us-17-reject-roll-invalid-phase.md](../features/us-17-reject-roll-invalid-phase.md)

## Missing-link findings (101 total)

- **Mostly deleted plan dirs** (`plans/us-6`, `us-31`, `us-33`, `us-34`, `us-35`, `us-50`, `us-51`, `us-53-54-55`, …) cited on Source lines. Known state — the durable sources are in `.extracts/`. Not new breakage.
- **Renamed feature pages** linked by old names from topic pages, e.g. `us-5-record-csp-expiration.md` → `us-5-expire-csp.md`, `us-8-close-covered-call-early.md` → `us-8-close-cc-early.md` (see contracts/ipc-handlers, contracts/zod-schemas, domain/wheel-lifecycle, domain/cost-basis reports).
- **Deleted source files still cited**: `barchart-ivr-scraper.ts`, `ivr-snapshots.ts`, `massive-market-data.ts`, `alpaca.ts`, `fake-ivr.ts`, `ipc/test-ivr.ts`, `ScreenerResultsTable.tsx`.
- ADR README: all 118 links resolve and every ADR file is listed.

## Recommended next steps

- **Before merging this branch:** fix the two US-121-owned ADRs (`market-data-provider-interface`, `alpaca-sole-market-data-vendor`) and `ivr-assessment-three-state-result` — or run `/update-spec us-121` if its plan has the content.
- Triage the **possible code defects** above — #1 (`positions:get`) and #2 (earnings fallback) look like real bugs, not doc drift.
- Themes 1–3 are the bulk of the drift and share root causes; a single pass per theme (Barchart→IV30, broker→market-data, Massive→Alpaca) will clear ~60% of findings. No live plans cover them, so they need manual correction.
- Fix renamed-feature links in the topic pages (mechanical).
- Optionally delete the stale 2026-06-27 `<page>.md.audit.md` duplicates for topic/ADR pages to remove naming confusion.
