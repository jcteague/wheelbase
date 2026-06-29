---
page: docs/spec/architecture/02-adrs/market-data-stream-with-rest-seed.md
audited_at: 2026-06-29
findings: 0
---

# Audit: market-data-stream-with-rest-seed.md

## Verified (13)

- ✓ Provider is `MassiveMarketDataProvider` in `src/main/integrations/massive-market-data.ts:104`, implementing `MarketDataProvider`.
- ✓ Provider-agnostic interface exists at `src/main/integrations/market-data-provider.ts` with `getStockQuotes` (`:85`), `stream` (`:91-94`), `StreamEvent<T>` (`:68`), and `MarketDataFeed` (`:66`).
- ✓ Env-switched `marketDataFactory` selecting Massive vs `FakeMarketDataProvider` confirmed in `src/main/integrations/market-data-factory.ts:2-3,15,19,28` (Fake when `FAKE_MARKET_DATA` set, Massive otherwise).
- ✓ REST seed uses `provider.getStockQuotes(tickers)` — `getStockQuotes` defined at `massive-market-data.ts:185-209`; it returns `prevClose` from `prevDay.c` (`:201`), so the REST seed is the source of `prevClose`.
- ✓ REST path computes `change`/`changePercent` in the adapter from `todaysChange`/`todaysChangePerc` (`massive-market-data.ts:199-200`).
- ✓ Stream path uses `provider.stream('stockQuotes', tickers)` filtered to the subscribed symbol set — `stream()` at `massive-market-data.ts:256-263` filters `tickSubject` by `symbolSet`.
- ✓ Stream is a single JSON WebSocket exposed as an RxJS `Observable` — `tickSubject = new Subject<StreamEvent<StockQuote>>()` (`:107`), `import { Subject, filter, type Observable } from 'rxjs'` (`:2`), single `ws` member (`:106`).
- ✓ Aggregate-minute (`ev:'AM'`) frames become `StockQuote` ticks — `emitTick(msg: WsAmMsg)` (`:113-131`) called on `msg.ev === 'AM'` (`:294-295`).
- ✓ `change`/`changePercent` omitted (empty) on stream ticks — `emitTick` sets `change: ''`, `changePercent: ''`, `prevClose: ''` (`massive-market-data.ts:118-120`).
- ✓ Single WebSocket URL `wss://delayed.massive.com/stocks` with JSON auth `{action:'auth',params:<apiKey>}` then `{action:'subscribe',params:'AM.*'}` — `WS_URL` (`:17`), auth send (`:272`), subscribe send (`:286`).
- ✓ REST adapter calls `GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}` — `massive-market-data.ts:190`; derives `prevClose` from `prevDay.c` and `change`/`changePercent` from `todaysChange`/`todaysChangePerc`; `price`/`bid`/`ask` all carry last-minute close `min.c` (`:197-202`).
- ✓ `IpcStockQuote` carries `prevClose: string | null`, populated on REST seed / null on stream tick — `src/renderer/src/api/market-data.ts:7`, `src/preload/index.d.ts:214`; tick→null and seed→value confirmed by `src/main/ipc/market-data.test.ts:283,106-107`.
- ✓ Renderer merges by carrying cached value forward `event.quote.prevClose ?? prev?.[event.ticker]?.prevClose ?? null` — exact match at `src/renderer/src/hooks/useStockQuotes.ts:12`; `setQueryData` bridge at `:76`. `change`/`changePercent` absent from renderer `StockQuote` type (`market-data.ts:3-10`) and recomputed in `PriceCell.tsx:20-21`.

## Drift (0)

None.

## Unverifiable (1)

- ? "The transport was migrated from Alpaca … the Alpaca two-socket / MessagePack streaming and the `bp`/`ap`/`bs`/`as`/`t` quote-frame shape no longer exist in the codebase." Negative/absence claim about removed code; consistent with current single-JSON-WebSocket implementation (no Alpaca streaming references found in the audited provider), but not a positive claim to verify mechanically against present code.

## Missing files (0)

- ✓ `../../features/market-data-massive-migration.md` exists.
- ✓ `./market-data-tanstack-cache.md` exists.
- ✓ Source extracts `../../.extracts/us-32.md` and `../../.extracts/market-data-massive-migration.md` exist; feature links `../../features/us-32-live-position-prices.md` and `../../features/market-data-massive-migration.md` exist.
