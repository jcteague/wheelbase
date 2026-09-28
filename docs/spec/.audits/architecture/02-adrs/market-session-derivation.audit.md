---
page: docs/spec/architecture/02-adrs/market-session-derivation.md
audited_at: 2026-09-28
findings: 4
---

# Audit: market-session-derivation.md

## Verified (6)

- ✓ `session` enum `regular | pre | post | closed` — `src/renderer/src/api/market-data.ts:14-19`; `MarketStatus` in `src/main/integrations/market-data-provider.ts`.
- ✓ `getMarketStatus()` is on `MarketDataProvider` — `market-data-provider.ts:134`; implemented by `AlpacaMarketDataProvider` — `src/main/integrations/alpaca-market-data.ts:223`.
- ✓ `deriveSession` / `parseOffsetMinutes` in `src/main/integrations/alpaca-market-data-mappers.ts:257, 265`, fed `raw.is_open` + `raw.timestamp` (`:297`); clock URL `/v2/clock` on the trading host (`:281`).
- ✓ Hardcoded ET constants `PRE_MARKET_START_HOUR = 4`, `REGULAR_MARKET_START_HOUR = 9.5`, `REGULAR_MARKET_END_HOUR = 16`, `POST_MARKET_END_HOUR = 20` — `alpaca-market-data-mappers.ts:252-255`; no calendar input.
- ✓ Served on `market-data:market-status` — `src/main/ipc/market-data.ts:88-90`.
- ✓ No `broker:market-status` channel — `src/main/ipc/broker.test.ts:111-120`.

## Drift (3)

- ✗ "Current state" (line 15) places `deriveSession` in `src/main/integrations/alpaca-broker.ts`; it is in `alpaca-market-data-mappers.ts:265` (the page's own line 9 says so). `alpaca-broker.ts` has no `deriveSession`.
- ✗ Line 17: "The renderer reads market status through `window.api.broker.marketStatus` … the handler lives in `src/main/ipc/broker.ts`." The bridge is `window.api.marketData.marketStatus` → `market-data:market-status` (`src/preload/index.ts:56`; `src/renderer/src/api/market-data.ts:59-60`); the handler is `src/main/ipc/market-data.ts:88`. `window.api.broker` exposes only `account` / `activities` (`preload/index.ts:36-38`).
- ✗ "Why" (line 21) says the design keeps session "on the `BrokerProvider` interface (not `MarketDataProvider`) … quotes/snapshots come from Massive". Contradicts current code (on `MarketDataProvider`, `market-data-provider.ts:134`) and the page's own Decision; Massive is retired. Present-tense, not framed as history.

## Unverifiable (1)

- ? Holiday/half-day trade-off note — design commentary.

## Missing files (1)

- ✗ Source cites `plans/us-31/research.md`; `plans/us-31/` no longer exists (the durable source is `docs/spec/.extracts/us-31.md`). `plans/market-data-massive-migration/research.md` and `../../features/us-31-market-data-provider-adapter.md` exist.
