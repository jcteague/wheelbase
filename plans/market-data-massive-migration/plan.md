---
story: market-data-massive-migration
kind: migration
parent: null
topics: [market-data, contracts]
status: shipped
supersedes: [us-31, us-32, us-39]
---

# Implementation Plan: Market-Data Provider Migration — Alpaca → Massive

> **Retro plan.** This plan was written _after_ the migration shipped, to capture
> at the source a change that landed in code without its own story. It is the
> authoritative current-state record for the market-data provider layer and
> **supersedes the market-data portions of US-31, US-32, and US-39** (which
> describe the original Alpaca design). The wheel/broker domain and the IVR
> pipeline are unaffected.

## Summary

The live market-data layer was migrated from Alpaca's market-data API to the
**Massive** provider (a Polygon-compatible delayed-data vendor). The
`MarketDataProvider` interface, an env-switched `marketDataFactory`, and a
`MassiveMarketDataProvider` (REST over `fetch` + a single JSON WebSocket)
replace the original `AlpacaMarketDataProvider`. In the same change the
**broker** concerns (account, market clock/session, activities) were split out
of the market-data interface into a separate `BrokerProvider`
(`AlpacaBrokerProvider`) exposed on a dedicated `broker:*` IPC namespace, while
quote/option reads stay on `market-data:*`. There are **no database or schema
changes** — this is an integration/IPC-layer migration only.

## Why a retro plan

A full `/build-spec` re-extracts every `plans/` dir from scratch. Without a plan
dir describing the Massive architecture, the only market-data sources are the
Alpaca-era US-31/US-32/US-39 plans, so a rebuild reproduces stale Alpaca content.
This plan gives the extractor a current-state source that supersedes those.

## Supporting Documents

- **Research & Architecture Decisions:** `research.md`
- **Provider / IPC Contract:** `contracts/market-data-provider.md`
- **Data Model:** `data-model.md` (no schema changes)
- **What shipped (authoritative):** `results.md`

## What changed

### 1. Provider interface + Massive implementation

- `src/main/integrations/market-data-provider.ts` — the `MarketDataProvider`
  interface (`getStockQuotes`, `getOptionSnapshot`, `getOptionChainSnapshot`,
  `supportsStreaming(feed)`, `connect(feeds?)`, `stream(feed, …)`, `disconnect`),
  the `MarketDataFeed` union (`'stockQuotes' | 'optionQuotes' | 'optionTrades'`),
  and the structured `MarketDataError` / `MarketDataErrorCode`.
- `src/main/integrations/massive-market-data.ts` — `MassiveMarketDataProvider`
  (`MassiveMarketDataConfig = { apiKey }`): REST over `fetch` against
  `https://api.massive.com` with the key as an `apiKey` query param; streaming
  over a single JSON WebSocket `wss://delayed.massive.com/stocks`
  (`auth` then `subscribe AM.*`).
- `src/main/integrations/fake-market-data.ts` — `FakeMarketDataProvider` for e2e
  (`FAKE_MARKET_DATA=true`, `FAKE_MARKET_DATA_ERROR` to force an error code).

### 2. Env-switched factory

- `src/main/integrations/market-data-factory.ts` — `marketDataFactory` object
  (`configure()`, `create()`, `recreate()`, `disconnect()`). Selects the fake
  provider when `FAKE_MARKET_DATA=true`, else Massive from `MASSIVE_API_KEY`;
  throws "Market data provider not configured" when neither is set. Replaces the
  original `createMarketDataProvider(config)` / `MarketDataConfig` /
  `provider:'alpaca'` union.

### 3. Broker / market-data IPC split

- Broker concerns moved to a `BrokerProvider` (`AlpacaBrokerProvider` in
  `src/main/integrations/alpaca-broker.ts`) on the `broker:*` namespace:
  `broker:account`, `broker:market-status`, `broker:activities`.
- Market data stays on `market-data:*`: `market-data:stock-quotes`,
  `market-data:set-stock-quote-tickers`, `market-data:stock-quote` (push),
  `market-data:stream-error` (push), `market-data:option-snapshots` (bulk,
  retained), `market-data:option-snapshot` (singular), `market-data:option-chain`.

### 4. Shared OCC symbol builder

- `buildOccSymbol` lives in `src/shared/option-symbol.ts`; `src/main/core/option-symbol.ts`
  re-exports it.

## Out of scope / unaffected

- No migrations, tables, or columns change.
- The broker remains Alpaca (`AlpacaBrokerProvider`); only the **market-data**
  provider changed vendor.
- IVR collection (Barchart) and the polling scheduler are unaffected.
