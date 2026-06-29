# ADR: Provider-agnostic `MarketDataProvider` interface + factory

<!-- generated:from us-31,market-data-massive-migration -->

## Decision

Downstream services consume the provider-agnostic `MarketDataProvider` (declared as a TypeScript `type`, not an `interface`) and obtain an instance from the `marketDataFactory` object rather than importing a concrete provider class. The factory switches on environment configuration and returns the matching implementation; an unconfigured factory throws. The concrete provider class is never imported by services.

The interface surface (in `src/main/integrations/market-data-provider.ts`):

- `getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>` — batch quote read, keyed by ticker.
- `getOptionSnapshot(contractId: string): Promise<OptionSnapshot>` — single-contract read.
- `getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionSnapshot[]>` — chain read; the underlying lives inside `filter` (alongside optional `expirationFrom/To`, `type`, `strikeFrom/To`, `limit`, `cursor`).
- `supportsStreaming(feed)`, `connect(feeds?)`, `disconnect()`.
- `stream(feed, symbols): Observable<StreamEvent<StockQuote | OptionSnapshot>>` — streaming is an RxJS `Observable` (first-class unsubscription, error/completion channels, operators like `retry`/`share`/`debounceTime`); REST methods stay plain `Promise`s.

## Why

Keeping every service on the interface means a second provider can be added without churning callers. It also makes integration tests trivial — services can be tested with an in-memory fake (`FakeMarketDataProvider`) by passing it in place of the factory's product. Splitting REST (`Promise`) from streaming (`Observable`) models request/response vs. push correctly and gives downstream stories the RxJS operators they need.

## Current state

Market data has migrated off Alpaca to **Massive** (a Polygon-compatible delayed-data vendor); Alpaca remains the broker/order layer only, behind a separate `BrokerProvider` (`AlpacaBrokerProvider`) on the `broker:*` IPC namespace. Account info, market status/clock, and broker activities are **not** on `MarketDataProvider` — they moved to `BrokerProvider` (there is no `market-data:market-status` channel).

The factory is the object `marketDataFactory` in `src/main/integrations/market-data-factory.ts`, not a `createMarketDataProvider(config)` function. Its methods are `configure({ loadMassiveApiKey })` (resets the cache), `create()` (cached), `recreate()` (resets the cache, returns `void`), and `disconnect()`. `create()` returns a `FakeMarketDataProvider` when `process.env.FAKE_MARKET_DATA === 'true'`, otherwise a `MassiveMarketDataProvider` (`src/main/integrations/massive-market-data.ts`) when the key loader yields a key, otherwise throws `"Market data provider not configured. Set MASSIVE_API_KEY or FAKE_MARKET_DATA=true."`. There is no `config.provider` union and no `'alpaca'` branch.

The key loader (`loadMassiveApiKey` in `src/main/integrations/massive-credentials.ts`) prefers `MAIN_VITE_MASSIVE_API_KEY` (electron-vite `.env`) and falls back to `process.env.MASSIVE_API_KEY`. `MassiveMarketDataProvider` takes a `MassiveMarketDataConfig = { apiKey: string }`, hits `https://api.massive.com` over the global `fetch` (key as an `?apiKey=` query param, no SDK), and streams over a single JSON WebSocket `wss://delayed.massive.com/stocks` (`{action:'auth',params:<apiKey>}` then `{action:'subscribe',params:'AM.*'}`). The Alpaca-era paper/live `environment` rationale, two-socket/MessagePack streaming, and SDK dependency no longer apply to the market-data layer.

## Alternatives considered

- **Import the concrete class directly** — couples every service to a single vendor; swapping providers (as the Alpaca→Massive migration did) would require a sweep across the codebase.
- **Singleton with mutable provider type** — harder to test; obscures construction.
- **Callbacks / AsyncIterables for streaming** — reimplement Observable badly (callbacks) or use the wrong pull-based model (AsyncIterables) for push-based WebSocket streams.

## Source

- `plans/us-31/data-model.md`, `plans/us-31/plan.md` Area 5
- `plans/market-data-massive-migration/research.md`, `plans/market-data-massive-migration/contracts/market-data-provider.md`
- `src/main/integrations/market-data-factory.ts`, `massive-market-data.ts`, `massive-credentials.ts`, `market-data-provider.ts`
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->
