---
page: docs/spec/features/us-39-massive-market-data-provider.md
audited_at: 2026-09-28
findings: 22
---

# Audit: docs/spec/features/us-39-massive-market-data-provider.md

The page has a "Superseded by US-99" banner that explicitly frames all Massive-specific details (base URL, `?apiKey=`, `wss://delayed.massive.com`, `AM.*`, `MassiveMarketDataProvider`, `massive-credentials.ts`, the `loadMassiveApiKey` factory) as history. Those items are **not** counted as drift. This audit checks only the claims the banner says "remain current", plus claims about non-Massive code.

## Verified (14)

- ✓ `BrokerProvider` is an interface in `src/main/integrations/broker-provider.ts`, with `BrokerError` / `BrokerErrorCode`.
- ✓ The `MarketDataProvider` type, `MarketDataError`, `MarketDataErrorCode` and `MarketDataFeed` live in `src/main/integrations/market-data-provider.ts:6,112,130`.
- ✓ `MarketDataErrorCode` is exactly `auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown`: `market-data-provider.ts:6-12`.
- ✓ `greeks?` and `impliedVolatility?` are optional, and `openInterest: number | null`: `market-data-provider.ts:42-50`.
- ✓ `integration-errors.ts` exports only `isNetworkError`.
- ✓ `market-data:*` channels are registered: `stock-quotes`, `set-stock-quote-tickers`, `option-snapshots` (bulk retained), `option-snapshot`, `option-chain` (`src/main/ipc/market-data.ts:43,51,65,72,80`). Push channels `market-data:stock-quote` and `market-data:stream-error` are at `:37,40`.
- ✓ `market-data:option-chain` returns `nextCursor: null`: `src/main/ipc/market-data.ts:84`.
- ✓ `broker:account` and `broker:activities` are registered in `src/main/ipc/broker.ts:9,16`.
- ✓ `marketDataFactory` exposes `configure/create/recreate/disconnect` and returns `FakeMarketDataProvider` when `FAKE_MARKET_DATA==='true'`: `src/main/integrations/market-data-factory.ts:17-41`.
- ✓ The renderer `api/market-data.ts` wraps `stock-quotes` and bulk `option-snapshots` but not the singular `option-snapshot` or `option-chain` (`:51,67`).
- ✓ `useStockQuotes.ts` has `STALE_THRESHOLD_MS = 5 * 60 * 1000` (`:17`).
- ✓ `src/shared/option-symbol.ts` exists and is re-exported by `src/main/core/option-symbol.ts`.
- ✓ The preload exposes `onStockQuote` / `onStreamError`: `src/preload/index.ts:34-35`.
- ✓ `@msgpack/msgpack` is still declared (`package.json:34`) and unused in `src/` (grep finds no imports).

## Drift (4)

- ✗ **"Market status stays on BrokerProvider"** (Architecture decisions), plus the `BrokerProvider` contract listing `getMarketStatus()`. `BrokerProvider` now exposes only `getAccountInfo()` and `getActivities()` (`src/main/integrations/broker-provider.ts:44-47`). `getMarketStatus()` moved to `MarketDataProvider` (`market-data-provider.ts:134`). This is not framed as history.
- ✗ **The `broker:market-status` channel is listed as current** ("`broker:account`, `broker:market-status`, `broker:activities`"). No such channel is registered. Market status is served as `market-data:market-status` (`src/main/ipc/market-data.ts:88`), and the renderer calls it from `api/market-data.ts:59`.
- ✗ **The `AlpacaBrokerProvider` description says it covers "account info, market status, activities".** Market status is no longer a broker method (see above).
- ✗ **"`alpaca-broker.ts` — … (only surviving `Alpaca*` integration)"** and "Removed by this work: `src/main/integrations/alpaca-market-data.ts`". `src/main/integrations/alpaca-market-data.ts` exists again as US-99's provider. The banner partially covers this, but the Source-files annotation still reads as a present-tense claim. Suggested fix: annotate it as history or drop the parenthetical.

## Unverifiable (4)

- ? The rationale that "Maintaining both live data paths was rejected because it creates silent inconsistency" is narrative.
- ? That the fake "keeps e2e runs offline" is narrative.
- ? That `supportsStreaming`/`connect` semantics under Alpaca match the Massive description. The banner defers to US-99, so this was not re-verified here.
- ? That the renderer's optional-chain handling of `greeks?.delta` holds everywhere. It would need a full renderer sweep.

## Missing files (0)

- All linked pages exist (`us-99`, `us-31`, `us-32`, `us-33`, `us-34`, `us-37`, `domain/market-data.md`, `contracts/ipc-handlers.md`, `contracts/alpaca-integration.md`).
- `massive-market-data.ts` and `massive-credentials.ts` are absent, but the banner explicitly marks them deleted, so they are not counted.
