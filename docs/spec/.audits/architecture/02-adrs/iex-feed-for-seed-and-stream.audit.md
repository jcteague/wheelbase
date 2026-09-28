---
page: docs/spec/architecture/02-adrs/iex-feed-for-seed-and-stream.md
audited_at: 2026-09-28
findings: 9
---

# Audit: docs/spec/architecture/02-adrs/iex-feed-for-seed-and-stream.md

## Verified (8)

- ✓ One batched `GET /v2/stocks/snapshots?symbols=…&feed=iex` — `buildStockSnapshotsUrl`, `src/main/integrations/alpaca-market-data-mappers.ts:27,48-51`; called once in `getStockQuotes`, `src/main/integrations/alpaca-market-data.ts:137-144`.
- ✓ `mapStockSnapshot` maps `price = latestTrade.p`, `prevClose = prevDailyBar.c`, `change = price − prevClose`, `changePercent = change / prevClose × 100` (4 dp), `volume = dailyBar.v`, `timestamp = latestTrade.t` — `alpaca-market-data-mappers.ts:55-75`.
- ✓ Symbols absent from the response, or lacking `latestTrade`, are omitted from the Map — `alpaca-market-data-mappers.ts:56`, `alpaca-market-data.ts:148-154`.
- ✓ Stream URL `wss://stream.data.alpaca.markets/v2/iex` — `alpaca-market-data.ts:56`; subscribes to `bars` (`:536,540`); handles `T === 'b'` frames (`:433`).
- ✓ Bar frame mapping `price = bid = ask = c`, empty `change`/`changePercent`/`prevClose`, `volume = v`, `timestamp = t` — `mapBar`, `alpaca-market-data-mappers.ts:413-428`.
- ✓ `IpcStockQuote` omits `change`/`changePercent` — `src/preload/index.d.ts:212-219`.
- ✓ `PriceCell` and `useStockQuotes` exist — `src/renderer/src/components/PriceCell.tsx`, `src/renderer/src/hooks/useStockQuotes.ts`.
- ✓ Linked extract/feature/ADR files exist (`us-99` extract, `us-99-alpaca-market-data-provider.md`, `market-data-stream-with-rest-seed.md`).

## Drift (0)

None.

## Unverifiable (1)

- ? `bid`/`ask` fall back to `latestTrade.p` when `latestQuote` is absent (`alpaca-market-data-mappers.ts:64-65`), a nuance the page's "carried honestly rather than faked as `bid = ask = price`" does not mention. Plan/budget figures (200 req/min, 30-symbol cap, 403/409 on `sip`) and the AAPL fixture numbers are external facts. Flag for human review.

## Missing files (0)

None.
