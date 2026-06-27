---
page: docs/spec/architecture/02-adrs/market-data-provider-interface.md
audited_at: 2026-06-27
findings: 3
---

# Audit: market-data-provider-interface.md

## Verified (2)

- ✓ A provider-agnostic `MarketDataProvider` type/interface exists (`src/main/integrations/market-data-provider.ts:84`) and services consume it (handlers take `getProvider: () => MarketDataProvider`).
- ✓ No service imports a concrete provider class — grep of `src/main/services/` for `AlpacaMarketDataProvider`/`MassiveMarketDataProvider` is empty; the factory hands back a `MarketDataProvider`.

## Drift (3)

- ✗ Page claims the factory function is `createMarketDataProvider(config)`. No such function exists in `src/` (grep for `function createMarketDataProvider`/`createMarketDataProvider =` is empty). The actual factory is an object `marketDataFactory` with `create()/configure()/recreate()/disconnect()` in `src/main/integrations/market-data-factory.ts`. The only `createMarketDataProvider` mentions are `@deprecated` doc comments in `alpaca.ts`. Suggested fix: rename the documented API to `marketDataFactory.create()`.
- ✗ Page claims the concrete implementation is `AlpacaMarketDataProvider`. No such class exists (grep empty). The concrete provider is `MassiveMarketDataProvider` (`src/main/integrations/massive-market-data.ts`); the in-memory fake is `FakeMarketDataProvider`. Market data has moved off Alpaca. Suggested fix: rewrite the ADR around Massive (Alpaca remains the broker/order layer only).
- ✗ Page claims the factory "switches on `config.provider` (`'alpaca'`…); unknown providers throw." Actual `buildProvider()` switches on `process.env.FAKE_MARKET_DATA === 'true'` then on presence of `MASSIVE_API_KEY`, and throws "Market data provider not configured" when no key is set (`market-data-factory.ts:13-24`). There is no `config.provider` union and no `'alpaca'` branch. The `environment: 'paper'|'live'` / `paper` config-option rationale also no longer applies to the market-data factory.

## Unverifiable (0)

## Missing files (0)

- ✓ `../../features/us-31-market-data-provider-adapter.md` exists.

One-line: Audited market-data-provider-interface.md: 2 verified, 3 drift, 0 unverifiable, 0 missing.
