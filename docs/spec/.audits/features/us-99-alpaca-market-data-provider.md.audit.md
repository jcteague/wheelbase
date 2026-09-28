---
page: docs/spec/features/us-99-alpaca-market-data-provider.md
audited_at: 2026-09-28
findings: 8
---

# Audit: docs/spec/features/us-99-alpaca-market-data-provider.md

Context: Massive is retired and this page's Massive references are all framed as removal or
history. None of them is drift. grep `-rni massive src e2e .env.example` prints nothing, as the
page claims.

## Verified (24)

- ✓ `AlpacaMarketDataProvider` takes `{ loadCredentials }` and resolves it per call (`src/main/integrations/alpaca-market-data.ts:60-78`). The no-credential error is `MarketDataError('auth_failed', 'Alpaca credentials not configured')` (`:78`).
- ✓ Requests authenticate with the `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` headers (`alpaca-market-data.ts:93-94`).
- ✓ `MAX_RETRIES = 2` honours `Retry-After` (`alpaca-market-data.ts:55,112-119`).
- ✓ The stream URL is `wss://stream.data.alpaca.markets/v2/iex` (`:56`) with a 10 s auth timeout, `AUTH_TIMEOUT_MS = 10_000` (`:57`).
- ✓ The feeds are `STOCK_FEED = 'iex'` and `OPTION_FEED = 'indicative'` (`alpaca-market-data-mappers.ts:27-29`), so neither `opra` nor `sip` is requested.
- ✓ Open interest comes from `${ALPACA_TRADING_BASE_URLS[environment]}/v2/options/contracts` (`alpaca-market-data-mappers.ts:230`). `ALPACA_TRADING_BASE_URLS` lives in `alpaca-hosts.ts` and is shared with `services/settings-connections.ts`.
- ✓ An open-interest outage degrades with the `alpaca_open_interest_unavailable` warning (`alpaca-market-data.ts:363`).
- ✓ The websocket handshake codes map 402 → `auth_failed` and 409 → `streaming_unsupported` (`alpaca-market-data-mappers.ts:440-442`). After connect, 405 → `symbol_limit` and 406 → `connection_limit` (`:434-435`), sent with `reconnectable: false` (`alpaca-market-data.ts:487`).
- ✓ The close handler is guarded by socket identity, `if (this.ws !== ws) return` (`alpaca-market-data.ts:452`).
- ✓ `failStream` swaps in a fresh `Subject` and clears `subscribed` (`alpaca-market-data.ts:494-498`), and `stream()` is wrapped in `defer()` (`:519`).
- ✓ The factory never throws and `FAKE_MARKET_DATA=true` selects the fake provider (`src/main/integrations/market-data-factory.ts:15-21`). `loadActiveAlpacaCredentials` defaults to `loadAlpacaCredentialsFromEnv` (`:8-12`).
- ✓ `loadAlpacaCredentialsFromEnv` reads `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY` and `ALPACA_PAPER` from `process.env` only (`src/main/integrations/alpaca-credentials.ts:22-32`).
- ✓ `CredentialStatus.marketData` is computed as `activeBrokerEnv !== 'none' || hasFallbackCredentials()` (`src/main/services/settings.ts:168`), and `hasFallbackCredentials` is a required option (`:78`).
- ✓ `TestConnectionPayloadSchema` is a `z.object` with `vendor: z.literal('alpaca')` (`src/main/schemas.ts:491-492`).
- ✓ `StreamState.tickers` exists (`src/main/services/market-data.ts:25`). `restartStockQuoteStream` is returned from `registerMarketDataHandlers` (`src/main/ipc/market-data.ts:27,115`) and called from `onBrokerProviderChanged` after `brokerFactory.recreate()` (`src/main/index.ts:175-189`).
- ✓ A connect failure leaves REST working: the "continuing without streaming" warning is at `services/market-data.ts:110-113`.
- ✓ The `MarketDataStatusDot` titles match (`src/renderer/src/components/MarketDataStatusDot.tsx:12`).
- ✓ Settings shows "Market Data — Alpaca", "Using {env} credentials" and "Connect Alpaca below to enable market data" (`SettingsPage.tsx:550-562`), and keeps "Refresh IVR now" (`:571`).
- ✓ The LIVE dialog copy "Market data reconnects with your live keys" is at `LiveBrokerConfirmDialog.tsx:58`.
- ✓ `parseOccSymbol` and `OccIdentity` are in `src/shared/option-symbol.ts:69,87`.
- ✓ Screener chain concurrency is 4, `CHAIN_FETCH_CONCURRENCY = 4` (`src/main/services/candidate-chains.ts:37`).
- ✓ `WHEELBASE_MOCK_SETTINGS_CONNECTIONS` is read at `src/main/index.ts:92`.
- ✓ All 10 cited e2e test titles exist verbatim, in `e2e/settings-environment.spec.ts` (7), `e2e/provider-split.spec.ts` (1) and `e2e/screener-results.spec.ts` (2).
- ✓ The Massive files are deleted as claimed: `massive-market-data.ts` and `massive-credentials.ts` are absent. All 14 linked ADRs and the linked feature, domain and contract pages exist.

## Drift (3)

- ✗ Lines 78-86 ("Four Alpaca surfaces back the one interface") and line 188 ("Provider interface unchanged") are stale in the present tense. `MarketDataProvider` now also declares `getMarketStatus`, `getMarketCalendar`, `getOptionDailyBars` and `getStockDailyBars` (`src/main/integrations/market-data-provider.ts:134-142`). They are implemented at `alpaca-market-data.ts:223-305` (US-98/US-121 additions). Suggested fix: note that later stories extended the interface, or link the current method table in `contracts/alpaca-integration.md`.
- ✗ Line 130-131 says post-connect stream errors are "all `reconnectable: false`". The socket `close` handler also emits `code: 'connection_lost'` with `reconnectable: true` (`alpaca-market-data.ts:455-463`), and that code is not in the page's error vocabulary.
- ✗ Lines 158-161 say "`ScreenerPage` branches its `provider_unavailable` state…". `src/renderer/src/pages/ScreenerPage.tsx` no longer exists. The "not connected" and "unreachable" copy now lives in `src/renderer/src/components/MarketDataOutage.tsx` and is exercised from `WatchlistPage` (US-96 folded the screener into the bench).

## Unverifiable (3)

- ? The free-plan rate budget (200 REST req/min, one websocket, 30 streamed symbols) is a vendor fact.
- ? The requests-per-alert-tick arithmetic ("1 batched stock snapshot + 1 per open option leg") would need a trace of the alert scheduler.
- ? The 2026-09-06 probe results and the motivation for the original Alpaca → Massive move are history, correctly framed.

## Missing files (2)

- ✗ `src/main/integrations/alpaca.ts` is listed in Source files but does not exist.
- ✗ `src/renderer/src/pages/ScreenerPage.tsx` is listed in Source files but does not exist (superseded by the Watchlist bench).
