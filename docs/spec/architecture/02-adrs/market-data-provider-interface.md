# ADR: Provider-agnostic `MarketDataProvider` interface + factory

<!-- generated:from us-31 -->

## Decision

Downstream services consume a `MarketDataProvider` interface and instantiate it via `createMarketDataProvider(config)`. The concrete `AlpacaMarketDataProvider` class is never imported by services. The factory switches on `config.provider` (`'alpaca'` today; extensible union for future providers) and returns the matching implementation. Unknown providers throw.

## Why

Keeping every service on the interface means a second provider can be added without churning callers. It also makes integration tests trivial — services can be tested with an in-memory fake (`FakeMarketDataProvider`) by passing it in place of `createMarketDataProvider`. The `environment: 'paper' | 'live'` flag is derived from the factory's `paper` config option rather than any API response, since Alpaca's `getAccount()` has no paper/live indicator.

## Alternatives considered

- **Import the concrete class directly** — couples every service to Alpaca; non-Alpaca providers would require a sweep across the codebase.
- **Singleton with mutable provider type** — harder to test; obscures construction.

## Source

- `plans/us-31/data-model.md`
- `plans/us-31/plan.md` Area 5
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->
