---
page: docs/spec/domain/market-data.md
audited_at: 2026-09-28
findings: 71
---

# Audit: docs/spec/domain/market-data.md

## Verified (61)

- ✓ `MarketDataProvider` is declared as a `type`, not an `interface` — `src/main/integrations/market-data-provider.ts:130`
- ✓ `MarketDataError` with six codes — `market-data-provider.ts:6-22`
- ✓ `StockQuote` shape (`price, bid, ask, change, changePercent, prevClose, volume, timestamp`) — `market-data-provider.ts:26-35`
- ✓ `OptionSnapshot` shape: `openInterest: number | null`, `volume: number | null`, optional `greeks` (delta/gamma/theta/vega), top-level optional `impliedVolatility` — `market-data-provider.ts:37-52`
- ✓ `OptionChainQuote = OptionSnapshot & { contractId, strike, expiration, contractType }` — `market-data-provider.ts:57-62`
- ✓ `OptionChainFilter` fields (`underlying, expirationFrom/To, type, strikeFrom/To, limit, cursor`) — `market-data-provider.ts:64-73`
- ✓ `MarketStatus { isOpen, nextOpen, nextClose, session }` — `market-data-provider.ts:77-82`
- ✓ [US-116] `getMarketStatus` and `getMarketCalendar(range)` are on `MarketDataProvider` — `market-data-provider.ts:134-137`; served by `AlpacaMarketDataProvider` — `src/main/integrations/alpaca-market-data.ts:223-248`
- ✓ `BrokerProvider` is exactly `getAccountInfo` + `getActivities`; no `broker:market-status` channel — `src/main/integrations/broker-provider.ts:46-49`; `src/main/ipc/broker.ts:9,16`
- ✓ `market-data:market-status` channel — `src/main/ipc/market-data.ts:88`
- ✓ `getOptionDailyBars` / `getStockDailyBars` signatures; `DailyBarRange.end` optional; `IvHistoryBarSource = Pick<…>` — `market-data-provider.ts:103-108,140-142,160-163`
- ✓ Chain pagination: `limit=1000` default, `min(limit,1000)` with `followPages: filter.limit === undefined` — `src/main/integrations/alpaca-market-data-mappers.ts:30,210`; `alpaca-market-data.ts:185-188`
- ✓ HTTP → code mapping (401/403 auth, 404 not_found, 429 after `MAX_RETRIES` honouring `Retry-After`, other unknown) — `alpaca-market-data.ts:55,107-130`
- ✓ Websocket connect codes 402 → `auth_failed`, 409 → `streaming_unsupported` — `alpaca-market-data-mappers.ts:439-445`
- ✓ `marketDataFactory` with `configure/create/recreate/disconnect`; `FakeMarketDataProvider` under `FAKE_MARKET_DATA=true`; construction never throws — `src/main/integrations/market-data-factory.ts:15-41`
- ✓ `MarketDataFactoryConfig { loadActiveAlpacaCredentials }`; default loader `loadAlpacaCredentialsFromEnv` — `market-data-factory.ts:7-13`
- ✓ Credentials resolved per call; missing ⇒ `MarketDataError('auth_failed', 'Alpaca credentials not configured')` — `alpaca-market-data.ts:78`
- ✓ `@alpacahq/typescript-sdk` imported only by the broker provider — grep of `src/` → `src/main/integrations/alpaca-broker.ts:2`
- ✓ Data base URL `https://data.alpaca.markets`, `feed=iex` for stocks, `feed=indicative` for options — `alpaca-market-data-mappers.ts:25-29`
- ✓ `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` headers — `alpaca-market-data.ts:93-94`
- ✓ Stock daily bars `feed=sip&adjustment=raw` — `alpaca-market-data-mappers.ts:314,361-362`
- ✓ Missing contract in `?symbols=` ⇒ `MarketDataError('not_found')` — `alpaca-market-data.ts:169`
- ✓ Non-finite figure warn log `alpaca_option_snapshot_non_finite_figure` with `{ contract, fields }` — `alpaca-market-data.ts:176`
- ✓ Open-interest call isolated; failure degrades to `openInterest: null` with a warning — `alpaca-market-data.ts:344-363`
- ✓ Option bars chunked 100/request, sequential; shared `fetchPages` — `alpaca-market-data-mappers.ts:315`; `alpaca-market-data.ts:257-260,327-337`
- ✓ `mapDailyBar` derives the session day with `etDateOf` — `alpaca-market-data-mappers.ts:367-370`
- ✓ Fake provider programmed via `WHEELBASE_FAKE_IV_SERIES` — `src/main/integrations/fake-market-data.ts:222`
- ✓ IV30 constants: `DEFAULT_RISK_FREE_RATE = '0.0450'`, `DAYS_PER_YEAR = 365`, gap reasons `no_underlying_bar` / `no_tradeable_pair`, dividend yield stored — `src/main/core/iv30.ts:20,24,52,57,170,186`
- ✓ Weekly horizon 45 d, monthly horizon 70 d, strike increments `[0.5, 1, 2.5, 5]` — `src/main/core/iv30-selection.ts:20-23,80,90`
- ✓ Rank window 252 sessions, min coverage 200, clamped rank — `src/main/core/iv-metrics.ts:3-4,20,47`
- ✓ `collectIvHistory`; `up_to_date` when nothing missing — `src/main/services/iv-history.ts:45,200,226`
- ✓ 253 required sessions (`RANK_WINDOW_SESSIONS + 1`) and 45-min bar settle — `iv-history.ts:59,77-86`
- ✓ `end` omitted when the newest session is today (never names the current day) — `iv-history.ts` `barRange` (~line 90)
- ✓ Stale-`engine_version` recompute from stored inputs — `iv-history.ts:277-289`; `IV30_ENGINE_VERSION` — `iv30.ts:19`
- ✓ `ivr-collect` job at close + 60 min — `src/main/index.ts:268`; `src/main/services/ivr-collector.ts:16`
- ✓ `buildOccSymbol` / `parseOccSymbol` in pure `src/shared/option-symbol.ts` (imports only `decimal.js`), re-exported by `src/main/core/option-symbol.ts` — `src/shared/option-symbol.ts:7,31,87`; `src/main/core/option-symbol.ts:1`
- ✓ Stream URL `wss://stream.data.alpaca.markets/v2/iex`, 10 s auth timeout — `alpaca-market-data.ts:56-57`
- ✓ Per-symbol diff subscribe/unsubscribe over `bars` — `alpaca-market-data.ts:524-543`
- ✓ After-connect 405/406 → `symbol_limit` / `connection_limit` — `alpaca-market-data-mappers.ts:433-437`
- ✓ `close` handler guarded by socket identity — `alpaca-market-data.ts:449-453`
- ✓ `disconnect()` nulls socket and clears subscribed set — `alpaca-market-data.ts:382-383`
- ✓ `subscribeToStockQuotes`: `connected` guard, connect failure logged and REST-only continues, empty list unsubscribes all — `src/main/services/market-data.ts:97-114`
- ✓ No auto-reconnect; error clears `connected` so the next ticker change reconnects — `services/market-data.ts:116-124`
- ✓ `restartStockQuoteStream` disconnects and replays remembered tickers — `services/market-data.ts:136-150`; called from `onBrokerProviderChanged` — `src/main/index.ts:189`
- ✓ `before-quit` disconnects the provider — `src/main/index.ts:340`
- ✓ `useOptionSnapshots`: `refetchInterval: session === 'closed' ? false : 60s`, `staleTime`, `refetchOnWindowFocus` — `src/renderer/src/hooks/useOptionSnapshots.ts:64-66`
- ✓ `useStockQuotes`: `staleTime: Infinity`, `refetchOnWindowFocus: true` — `src/renderer/src/hooks/useStockQuotes.ts:42-43`
- ✓ `STALE_THRESHOLD_MS = 5 * 60 * 1000` in `useStockQuotes.ts:17`; `SNAPSHOT_STALE_THRESHOLD_MS` in `src/renderer/src/pages/PositionDetailPage.tsx:25`
- ✓ `deriveMarketStatusDisplay` falls back to `computeNYSESession()` — `src/renderer/src/lib/market-status.ts:7,18,23`
- ✓ `useMarketStatus`: 60 s refetch, 30 s stale, focus refetch, key `['market','status']`, enabled by market-data configuration — `src/renderer/src/hooks/useMarketStatus.ts:6-17`; `marketDataQueryKeys.ts:2`; `useMarketStatusDisplay.ts:23`
- ✓ `useSettings` invalidation predicate matches `'broker'` or `'market'` (useMarketStatus section) — `src/renderer/src/hooks/useSettings.ts:33-36`
- ✓ `isWideSpread` — `src/renderer/src/lib/option-display.ts:18`; `computeUnrealizedPnl` in `src/main/core/costbasis.ts:285`
- ✓ `DEFAULT_PROFIT_TARGET_PERCENT = 50`, `resolveProfitTarget` — `src/main/core/profit-target.ts:4,6`
- ✓ Verdict labels and thresholds (ACT NOW dte ≤ 3, TARGET HIT 50, WATCH ≤ 21, `SHARES_VERDICT`, "Awaiting market data") — `src/renderer/src/lib/verdict.ts:44-67,147-218`
- ✓ Delta severity bases (CSP 0.30/0.45, CC 0.35/0.50), tight shift 0.05 at dte ≤ 7, gamma threshold 0.04, `DELTA · TIGHT` label — `verdict.ts:44-67`; `src/renderer/src/components/position-cockpit/DeltaGauge.tsx:44`
- ✓ Cockpit `rank N` IV sub-line not yet wired: `ContextStrip` takes an optional `ivRank`, and no page passes one — `position-cockpit/ContextStrip.tsx:42`; `PositionCockpit.tsx:95`
- ✓ Finnhub URL, 5-min failure TTL, `earnings_fetch_no_api_key`, `earnings_fetch_failed` — `src/main/integrations/finnhub-earnings.ts:9,12,182,204`
- ✓ `loadFinnhubApiKey` reads `import.meta.env.MAIN_VITE_FINNHUB_API_KEY` with a `process.env.FINNHUB_API_KEY` fallback — `src/main/integrations/finnhub-credentials.ts:1-5`
- ✓ `evaluateAlerts` `fetchOrDegrade`, injectable `FetchEarnings`, WARN `alert_evaluation_earnings_unavailable` — `src/main/services/evaluate-alerts.ts:153,170,228`
- ✓ `CredentialStatus.marketData` formula — `src/main/services/settings.ts:168`; `LiveBrokerConfirmDialog` copy — `LiveBrokerConfirmDialog.tsx:58`; `MarketDataStatusDot` copy — `MarketDataStatusDot.tsx:12`; `EnvironmentBadge` exists; shared auth prompt — `PositionsListPage.tsx:199`
- ✓ Migrations 013 (`earnings_date`) and 016 (IV30 history) exist — `migrations/013_create_earnings_date.sql`, `migrations/016_create_iv30_history.sql`

## Drift (6)

- ✗ **Clock/session placement (lines 37-38, 54, 72-73, and the Provider interface block at lines 76-95).** The Overview and Provider-interface sections say the market clock/session is **not** on `MarketDataProvider` and lives on `BrokerProvider`. They also call Alpaca "the broker (account, activities, clock)", and the type block omits `getMarketStatus` and `getMarketCalendar`. Code has both on the type (`market-data-provider.ts:134-137`); `BrokerProvider` has neither (`broker-provider.ts:46-49`). This contradicts the page's own US-116 "Market clock and calendar" section. Suggested fix: add the two methods to the code block and remove the "not on this type" sentences.
- ✗ **StreamError contract (lines 127, 599-601).** Page says the stream-error codes are `'symbol_limit' | 'connection_limit' | 'unknown'` and that `reconnectable` is "always false today". The socket `close` handler emits `{ code: 'connection_lost', reconnectable: true }` (`alpaca-market-data.ts:443-463`).
- ✗ **Market-cache refresh on credential change (line 1166).** Page says `['market', ...]` caches are refreshed by the stream restart rather than invalidated. `useSettings` invalidates `'market'` as well as `'broker'` (`useSettings.ts:33-36`). The page's own useMarketStatus section also says so.
- ✗ **Finnhub batch wrapper name and shape (line 1006).** Page documents `fetchNextEarnings(tickers, { lookaheadDays }) → Promise<Record<ticker, EarningsLookup>>` with `found | none | unavailable`. The module exports `fetchEarningsCalendar(tickers, opts) → Promise<Record<string, EarningsCalendarRead>>`, where `EarningsCalendarRead = { status: 'read'; next; last } | { status: 'unavailable' }` (`finnhub-earnings.ts:21-23,170`). `EarningsLookup` is a separate core screener type (`src/main/core/screener.ts:66`).
- ✗ **Finnhub lookback window (line 1018).** Page says `from = now − 7d (EARNINGS_LOOKBACK_DAYS)`. Code has `EARNINGS_LOOKBACK_DAYS = 30` (`finnhub-earnings.ts:13,65`).
- ✗ **Missing Finnhub key result (line 1066).** Page says a missing key returns `{}`. Code returns every requested ticker as `{ status: 'unavailable' }` (`finnhub-earnings.ts:180-191`).

## Unverifiable (4)

- ? Alpaca free-plan facts: `feed=sip`/`opra` snapshots 403, the `403 OPRA agreement is not signed` for `end = today`, expired contracts served back to January 2024, 35–60% of probed symbols existing, ~200 req/min. These are vendor behaviour, not code.
- ? "The interface, IPC layer, hooks and UI did not change across either swap" (Overview): narrative vendor history.
- ? "One cache, two transports" rationale (React 19 stale-view race with `useSyncExternalStore`): design narrative.
- ? Staleness "known limitation" (`minutesAgo` does not tick without a data update; deferred tech debt): behavioural, not mechanically checkable by grep.

## Missing files (0)

All linked feature pages, ADRs and cited source paths exist.
