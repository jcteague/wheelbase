# ADR: Provider-agnostic `MarketDataProvider` interface + factory

<!-- generated:from us-31,market-data-massive-migration,us-99,us-116 -->

## Decision

Downstream services consume the provider-agnostic `MarketDataProvider` (declared as a TypeScript `type`, not an `interface`) and obtain an instance from the `marketDataFactory` object rather than importing a concrete provider class. The factory switches on environment configuration and returns the matching implementation. The concrete provider class is never imported by services.

The interface surface (in `src/main/integrations/market-data-provider.ts`):

- `getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>` — batch quote read, keyed by ticker.
- `getOptionSnapshot(contractId: string): Promise<OptionSnapshot>` — single-contract read.
- `getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionChainQuote[]>` — chain read; the underlying lives inside `filter` (alongside optional `expirationFrom/To`, `type`, `strikeFrom/To`, `limit`, `cursor`); returns the `OptionChainQuote` superset (per-strike identity) since US-64.
- `supportsStreaming(feed)`, `connect(feeds?)`, `disconnect()`.
- `stream(feed, symbols): Observable<StreamEvent<StockQuote | OptionSnapshot>>` — streaming is an RxJS `Observable` (first-class unsubscription, error/completion channels, operators like `retry`/`share`/`debounceTime`); REST methods stay plain `Promise`s.

## Why

Keeping every service on the interface means a provider can be swapped without churning callers — which has now happened twice (Alpaca → Massive, then Massive → Alpaca) with no change to the IPC layer, hooks, or UI. It also makes integration tests trivial — services can be tested with an in-memory fake (`FakeMarketDataProvider`) by passing it in place of the factory's product. Splitting REST (`Promise`) from streaming (`Observable`) models request/response vs. push correctly.

## Current state (US-99)

The concrete adapter is `AlpacaMarketDataProvider` (`src/main/integrations/alpaca-market-data.ts`, pure mappers in `alpaca-market-data-mappers.ts`), serving the whole interface from Alpaca's free data plan. Alpaca is therefore both the broker (behind `BrokerProvider` / `AlpacaBrokerProvider` on `broker:*`) and the market-data vendor (behind `MarketDataProvider` on `market-data:*`) — two interfaces, two factories, one set of credentials. [US-116] `BrokerProvider` is exactly `getAccountInfo` + `getActivities` — facts about _your account_. The exchange clock (`getMarketStatus`) and its session calendar (`getMarketCalendar`) are facts about _the market_ and belong to `MarketDataProvider`, served on `market-data:market-status` and consumed directly by the trading-calendar store. There is no `broker:market-status` channel. The port is defined by what the consumer needs, not by which host answers — Alpaca happens to serve both from its trading host, which is the adapter's problem to hide.

`marketDataFactory` (`src/main/integrations/market-data-factory.ts`) exposes `configure({ loadActiveAlpacaCredentials })` (resets the cache; default loader `loadAlpacaCredentialsFromEnv`), `create()` (cached), `recreate()` (resets the cache, returns `void`), and `disconnect()`. `create()` returns `FakeMarketDataProvider` when `process.env.FAKE_MARKET_DATA === 'true'`, otherwise `new AlpacaMarketDataProvider({ loadCredentials: config.loadActiveAlpacaCredentials })` — it **never throws**. A missing credential surfaces per call as `MarketDataError('auth_failed', 'Alpaca credentials not configured')`; see [market-data-lazy-credentials-stream-restart](./market-data-lazy-credentials-stream-restart.md). The Massive-era `MassiveMarketDataConfig = { apiKey }`, `loadMassiveApiKey`, and the "Market data provider not configured. Set MASSIVE_API_KEY or FAKE_MARKET_DATA=true." throw no longer exist.

## Alternatives considered

- **Import the concrete class directly** — couples every service to a single vendor; each of the two vendor swaps would have required a sweep across the codebase.
- **Singleton with mutable provider type** — harder to test; obscures construction.
- **Callbacks / AsyncIterables for streaming** — reimplement Observable badly (callbacks) or use the wrong pull-based model (AsyncIterables) for push-based WebSocket streams.

## Source

- `plans/us-31/data-model.md`, `plans/us-31/plan.md` Area 5
- `plans/market-data-massive-migration/research.md` (historical), `plans/us-99/contracts/alpaca-market-data.md` "Factory"
- `src/main/integrations/market-data-factory.ts`, `alpaca-market-data.ts`, `alpaca-credentials.ts`, `market-data-provider.ts`
- Feature pages: [us-31](../../features/us-31-market-data-provider-adapter.md), [us-99](../../features/us-99-alpaca-market-data-provider.md)
<!-- /generated -->
