---
page: docs/spec/architecture/02-adrs/market-data-provider-lifecycle.md
audited_at: 2026-09-28
findings: 1
---

# Audit: market-data-provider-lifecycle.md

## Verified (14)

- ✓ Provider obtained via `marketDataFactory.create()` in `src/main/index.ts:162-163`; `marketDataFactory.configure(...)` at `index.ts:157`.
- ✓ `app.before-quit` calls `marketDataFactory.disconnect()` — `index.ts:337-340` (alongside `scheduler.stop()`).
- ✓ `StreamState = { connected, activeSub, tickers }` + `newStreamState()` — `src/main/services/market-data.ts:20-29`.
- ✓ `subscribeToStockQuotes` tears down the prior subscription (`state.activeSub?.unsubscribe()`), remembers tickers, connects only when `!state.connected` — `services/market-data.ts:97-110`.
- ✓ `connect()` rejection is caught, logged (`logger.warn`), and the call continues REST-only — `services/market-data.ts:111-113`.
- ✓ `restartStockQuoteStream` unsubscribes, `provider.disconnect()`, clears `connected`, replays remembered tickers — `services/market-data.ts:136-152`.
- ✓ `registerMarketDataHandlers` returns `restartStockQuoteStream`, called from `onBrokerProviderChanged` — `index.ts:162, 175-191`.
- ✓ Alpaca provider: IEX socket `wss://stream.data.alpaca.markets/v2/iex`, `AUTH_TIMEOUT_MS = 10_000`, resolves on `authenticated` frame — `src/main/integrations/alpaca-market-data.ts:56-57, 396-420`; 402 → `auth_failed`, 409 → `streaming_unsupported` — `alpaca-market-data-mappers.ts:440-442`.
- ✓ Factory: default loader `loadAlpacaCredentialsFromEnv` (`market-data-factory.ts:11-13`); `configure` resets cache (`:27-29`); `create` returns `FakeMarketDataProvider` under `FAKE_MARKET_DATA === 'true'` else `AlpacaMarketDataProvider({ loadCredentials })`, cached (`:17-33`); `recreate(): void` clears cache (`:35-37`); `disconnect(): Promise<void>` (`:38-40`).
- ✓ Unconfigured credentials raise `MarketDataError('auth_failed', 'Alpaca credentials not configured')` — `alpaca-market-data.ts:78`.
- ✓ IPC channels `market-data:stock-quotes`, `set-stock-quote-tickers`, `option-snapshots`, `option-snapshot`, `option-chain`, `market-status` — `src/main/ipc/market-data.ts:43-88`; push channels `market-data:stock-quote` / `market-data:stream-error` — `:37, :40`.
- ✓ No `broker:market-status` handler — asserted by `src/main/ipc/broker.test.ts:111-120`; `src/main/ipc/broker.ts` registers only `broker:account` / `broker:activities`.
- ✓ Empty ticker list tears down and sends `provider.stream('stockQuotes', [])` when connected, returning `[]` → `{ subscribedTickers: [] }` — `services/market-data.ts:100-104`, `ipc/market-data.ts:51-62`.
- ✓ `MarketDataError` maps to `__root__` with its `code` — `src/main/ipc/utils.ts:44-51`.

## Drift (1)

- ✗ Page (line 21) says `index.ts` passes `() => settings.loadActiveAlpacaCredentials()` to `configure`. It passes `resolveAlpacaCredentials`, which is `settings.loadActiveAlpacaCredentials() ?? loadAlpacaCredentialsFromEnv()` (saved credentials, then `.env` fallback), shared with `brokerFactory` — `src/main/index.ts:151-158`. Suggested fix: describe the shared resolver and its env fallback.

## Unverifiable (2)

- ? Rationale that connecting at startup wastes a socket / renderer is source of truth for tickers — design intent.
- ? Historical note about the US-32 SDK-client lazy getter — history, framed as such.

## Missing files (0)

None.
