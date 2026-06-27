# ADR: Provider-agnostic `MarketDataProvider` interface + factory

<!-- generated:from us-31,market-data-massive-migration -->

## Decision

Downstream services consume a `MarketDataProvider` interface and instantiate it via a factory rather than importing a concrete class. The factory switches on environment configuration and returns the matching implementation; an unconfigured factory throws. The concrete provider class is never imported by services.

## Why

Keeping every service on the interface means a second provider can be added without churning callers. It also makes integration tests trivial — services can be tested with an in-memory fake (`FakeMarketDataProvider`) by passing it in place of the factory's product. The original Alpaca design derived an `environment: 'paper' | 'live'` flag from a factory `paper` config option rather than any API response, since Alpaca's `getAccount()` has no paper/live indicator.

## Current state

Market data has migrated off Alpaca to **Massive** (Alpaca remains the broker/order layer only). The factory is the object `marketDataFactory` (with `create()` / `configure()` / `recreate()` / `disconnect()`) in `src/main/integrations/market-data-factory.ts`, not a `createMarketDataProvider(config)` function. Its private `buildProvider()` switches on `process.env.FAKE_MARKET_DATA === 'true'` (returns `FakeMarketDataProvider`), then on the presence of `MASSIVE_API_KEY` (returns `MassiveMarketDataProvider` from `src/main/integrations/massive-market-data.ts`), and throws "Market data provider not configured" when neither is set. There is no `config.provider` union, no `'alpaca'` branch, and the `paper`/`environment` rationale no longer applies to the market-data factory.

## Alternatives considered

- **Import the concrete class directly** — couples every service to Alpaca; non-Alpaca providers would require a sweep across the codebase.
- **Singleton with mutable provider type** — harder to test; obscures construction.

## Source

- `plans/us-31/data-model.md`
- `plans/us-31/plan.md` Area 5
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->
