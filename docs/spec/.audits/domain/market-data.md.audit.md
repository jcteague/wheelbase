---
page: docs/spec/domain/market-data.md
audited_at: 2026-06-27
findings: 7
---

# Audit: docs/spec/domain/market-data.md

> Major theme: the live quote/option provider has been refactored from Alpaca to
> a **Massive** provider (`api.massive.com` / `wss://delayed.massive.com`). The
> US-37 section already references "Massive", but the us-31..34 generated sections
> still describe an Alpaca-based market-data adapter, its stream URLs, OPRA/SIP
> feeds, MessagePack decoding, and `keyId`/`secretKey`/`paper` config — all stale.

## Verified (10)

- ✓ `MarketDataProvider` interface exists in
  `src/main/integrations/market-data-provider.ts` with `getStockQuotes`,
  `getOptionSnapshots`, `getMarketStatus`, `supportsStreaming`, `connect`,
  `disconnect`, `stream` (interface methods confirmed; `fake-market-data.ts`
  implements them at l.42,73).
- ✓ `MarketDataError` class exists
  (`src/main/integrations/market-data-provider.ts:13`) with code union including
  `auth_failed`, `rate_limited`, `streaming_unsupported`, `unknown` (l.10).
- ✓ Errors normalise to `MarketDataError` in the provider — used throughout
  `src/main/integrations/massive-market-data.ts:135-175`.
- ✓ IPC channels exist: `market-data:stock-quotes`
  (`src/main/ipc/market-data.ts:29`), `market-data:option-snapshots` (l.52),
  `market-data:stock-quote` push (l.45), `market-data:stream-error` push (l.46).
- ✓ `mid` computed by adapter as `(bid + ask)/2`, `toFixed(2)`; `openInterest`
  null; greeks 4dp — `src/main/integrations/massive-market-data.ts:80-95`.
- ✓ `buildOccSymbol` is a pure leaf importing only `decimal.js`
  (`src/shared/option-symbol.ts:7,31`) — but see Drift on its _location_.
- ✓ `deriveMarketStatusDisplay` exists in
  `src/renderer/src/lib/market-status.ts:18`.
- ✓ `computeVerdict` exists in `src/renderer/src/lib/verdict.ts:138`.
- ✓ `STALE_THRESHOLD_MS = 5 * 60 * 1000` exists — but in
  `src/renderer/src/hooks/useStockQuotes.ts:17` (and
  `SNAPSHOT_STALE_THRESHOLD_MS` in `PositionDetailPage.tsx:25`), see Drift on
  _location_.
- ✓ Linked feature pages (us-31..us-34) and `contracts/ipc-handlers.md`,
  `contracts/alpaca-integration.md` references — feature/contract pages exist
  (us-37 section present and partially current).

## Drift (7)

- ✗ Page claims `createMarketDataProvider(config)` in
  `src/main/integrations/market-data-factory.ts` is the factory entry point
  (Adapter rules + Provider lifecycle sections, ~l.80-85, l.371-377). No such
  function exists. The factory exports an object `marketDataFactory` with
  `.configure()` / `.create()` / `.disconnect()`
  (`src/main/integrations/market-data-factory.ts:28-29`), consumed in
  `src/main/index.ts:8,143,152,261` as `marketDataFactory.configure(...)` /
  `.create()` / `.disconnect()`. Suggested fix: replace
  `createMarketDataProvider(config)` with the `marketDataFactory` object API.

- ✗ Page's `MarketDataConfig` (Configuration section, l.98-107) declares
  `provider: 'alpaca'`, `keyId`, `secretKey`, `paper`, `dataFeed` (sip/iex),
  `optionFeed` (opra/indicative). The actual factory config is
  `MarketDataFactoryConfig` keyed on a Massive API key
  (`market-data-factory.ts:5`, `marketDataFactory.configure({ loadMassiveApiKey })`
  in `index.ts:143`), and the provider config is
  `MassiveMarketDataConfig = { apiKey: string }`
  (`massive-market-data.ts:20`). Suggested fix: rewrite the config block for the
  Massive provider.

- ✗ Page describes Alpaca as the concrete adapter at
  `src/main/integrations/market-data-provider.ts` and "Alpaca's
  `@alpacahq/typescript-sdk` is touched only inside" it (l.68-71). The live
  quote/option adapter is now `MassiveMarketDataProvider` in
  `src/main/integrations/massive-market-data.ts:104` — a REST+WS client against
  Massive (`market-data-provider.ts` holds the interface + `MarketDataError`, not
  the Alpaca SDK calls). Alpaca remains only for broker account/activities/clock
  (`src/main/integrations/alpaca-broker.ts`). Suggested fix: retarget the
  concrete-adapter prose to Massive.

- ✗ Page's streaming-surface table (l.241-250) gives Alpaca URLs
  (`wss://stream.data.alpaca.markets/v2/{dataFeed}` and
  `/v1beta1/{optionFeed}`), MessagePack `decodeMulti()` for options, OPRA feed.
  Actual streaming uses Massive: `WS_URL = 'wss://delayed.massive.com/stocks'`
  (`massive-market-data.ts:17`); options are REST-only (Massive/Polygon `O:`
  ticker prefix, l.67). Suggested fix: replace the Alpaca stream URLs/feeds with
  Massive's.

- ✗ Page locates `STALE_THRESHOLD_MS = 5 * 60 * 1000` in
  `src/renderer/src/lib/market-status.ts` ("the only tunable", l.464). The
  constant is not in that file; it lives in
  `src/renderer/src/hooks/useStockQuotes.ts:17` (and a sibling
  `SNAPSHOT_STALE_THRESHOLD_MS` in `PositionDetailPage.tsx:25`). Suggested fix:
  correct the file reference.

- ✗ Page states `buildOccSymbol` is defined in
  `src/main/core/option-symbol.ts` ("a pure leaf module that imports only
  `decimal.js`", l.218-222). That path only **re-exports** it
  (`src/main/core/option-symbol.ts:1` →
  `export { buildOccSymbol, ... } from '../../shared/option-symbol'`). The actual
  definition is `src/shared/option-symbol.ts:31`. Suggested fix: cite the shared
  module (or note the re-export).

- ✗ Page's provider `DataFeed` type is `type DataFeed = 'stockQuotes' |
'optionQuotes' | 'optionTrades'` (l.63). The code names it `MarketDataFeed`
  (`src/main/integrations/market-data-provider.ts:66`); `DataFeed` does not
  exist. Suggested fix: rename to `MarketDataFeed`.

## Unverifiable (2)

- ? US-37 "Massive vs broker state" / `EnvironmentBadge` / `MarketDataStatusDot`
  split (l.687-703). Narrative product distinction; `MarketDataStatusDot`/
  `EnvironmentBadge` component existence not exhaustively grepped here. Consistent
  in spirit with the Massive refactor but flag for human review.

- ? "No `contract_id` column on legs" (l.228, l.671). A negative existence claim
  about the schema; consistent with migrations seen but not exhaustively proven.

## Missing files (0)

(none — all referenced source files resolve, though several point at the wrong
provider/location as noted in Drift.)
