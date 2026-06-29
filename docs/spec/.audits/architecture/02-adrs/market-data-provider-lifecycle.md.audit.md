---
page: docs/spec/architecture/02-adrs/market-data-provider-lifecycle.md
audited_at: 2026-06-29
findings: 1
---

# Audit: market-data-provider-lifecycle.md

## Verified (16)

- ✓ Provider created once at startup via `marketDataFactory`, not `createMarketDataProvider(...)` — `src/main/index.ts:143` calls `marketDataFactory.configure({ loadMassiveApiKey })` and `:152` calls `() => marketDataFactory.create()`. No `createMarketDataProvider` symbol exists in `src/` (only deprecated JSDoc references in `src/main/integrations/alpaca.ts:17,23`).
- ✓ `provider.connect()` deferred until first non-empty subscription — `src/main/services/market-data.ts:96-100`: returns early when `tickers.length === 0`, then `await provider.connect(['stockQuotes'])` only when `!state.connected`.
- ✓ `connected` flag ensures one `connect()` per session — `src/main/services/market-data.ts:97-100` guards on `state.connected` and sets it `true` after success.
- ✓ `marketDataFactory.disconnect()` called on `app.before-quit` — `src/main/index.ts:259-261`: `app.on('before-quit', ...)` awaits `marketDataFactory.disconnect()`.
- ✓ `StreamState` object `{ connected, activeSub }` (not module-scoped) — `src/main/services/market-data.ts:20-23`.
- ✓ `newStreamState()` creates it — `src/main/services/market-data.ts:25-26`; threaded into `subscribeToStockQuotes` via `src/main/ipc/market-data.ts:27` (`newStreamState()`) and the `subscribeToStockQuotes(...)` call at `:40`.
- ✓ Teardown is `state.activeSub?.unsubscribe()` — `src/main/services/market-data.ts:94`.
- ✓ Concrete provider is `MassiveMarketDataProvider`; no `AlpacaMarketDataProvider` class — grep for `AlpacaMarketDataProvider` returns none in `src/`; `MassiveMarketDataProvider` instantiated at `src/main/integrations/market-data-factory.ts:19`.
- ✓ `configure({ loadMassiveApiKey })` sets loader and resets cache — `src/main/integrations/market-data-factory.ts:29-32` (`config = next; cached = null`).
- ✓ `create()` returns `FakeMarketDataProvider` when `FAKE_MARKET_DATA === 'true'`, else `MassiveMarketDataProvider`, caches result — `market-data-factory.ts:14-19,33-36`.
- ✓ `recreate(): void` clears cache, returns void — `market-data-factory.ts:37-39`.
- ✓ `disconnect(): Promise<void>` disconnects cached provider — `market-data-factory.ts:40-42`.
- ✓ Credential precedence: prefers `MAIN_VITE_MASSIVE_API_KEY` then falls back to `MASSIVE_API_KEY` — `src/main/integrations/massive-credentials.ts:4` (`import.meta.env.MAIN_VITE_MASSIVE_API_KEY || process.env.MASSIVE_API_KEY || ''`).
- ✓ Throws `"Market data provider not configured. Set MASSIVE_API_KEY or FAKE_MARKET_DATA=true."` when neither set — `market-data-factory.ts:21-23`.
- ✓ `MarketDataError` with codes `auth_failed | network_error | rate_limited | streaming_unsupported` — `src/main/integrations/market-data-provider.ts:5-19`.
- ✓ Source/feature/ADR links all exist — `docs/spec/.extracts/us-32.md`, `docs/spec/.extracts/market-data-massive-migration.md`, `docs/spec/features/us-32-live-position-prices.md`, `docs/spec/architecture/02-adrs/market-data-provider-interface.md`, `docs/spec/architecture/02-adrs/ipc-envelope-contract.md`.

## Drift (1)

- ✗ Consequences section (line 44) claims the main process exposes three IPC handlers including `market-data:market-status` (poll). No such handler exists. `src/main/ipc/market-data.ts` registers `market-data:stock-quotes`, `market-data:set-stock-quote-tickers`, `market-data:option-snapshots`, `market-data:option-snapshot`, and `market-data:option-chain`. Market status lives at `broker:market-status` (`src/main/ipc/broker.ts:24`), and `src/main/ipc/market-data.test.ts:593` explicitly asserts `channels` does NOT contain `market-data:market-status`. The "three handlers" count and the market-status channel attribution are both stale. Suggested fix: drop `market-data:market-status` from the list; describe the actual stock-quote handlers (and, if in scope, the option-data handlers) plus the two push channels `market-data:stock-quote` / `market-data:stream-error` (those two are correct — `market-data.ts:45-46`).

## Unverifiable (3)

- ? "Connecting at startup wastes a WebSocket connection..." (Context/Why) — design rationale, not mechanically verifiable.
- ? "MarketDataError ... maps to `__root__` with the matching `code` in the IPC envelope" — delegated to ipc-envelope-contract ADR; not verified here.
- ? Consequences note that the red-phase Alpaca lazy-getter is historical — the page itself flags it as historical (line 15); no current code to verify.

## Missing files (0)

- None.
