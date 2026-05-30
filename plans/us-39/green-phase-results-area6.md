# Green Phase Results: Area 6 — Rewire MarketDataFactory + New BrokerFactory

## Feature Context

- **Feature directory**: `plans/us-39/`
- **Plan file**: `plans/us-39/plan.md` (Area 6)
- **Red phase results**: `plans/us-39/red-phase-results-area6.md`

## Implementation Files Created/Modified

- `src/main/integrations/market-data-factory.ts` — rewrote to export `marketDataFactory` object (Massive or Fake only; no Alpaca market data path)
- `src/main/integrations/broker-factory.ts` — new file; exports `brokerFactory` object (AlpacaBroker or FakeBroker)
- `src/main/index.ts` — updated to use `marketDataFactory.create()` instead of old `createMarketDataProvider(config)`
- `src/main/integrations/alpaca-market-data.e2e.test.ts` — deleted (preemptively; scheduled for Area 9); was broken by factory rewrite

## Public Interfaces Implemented

```typescript
// src/main/integrations/market-data-factory.ts
export const marketDataFactory: {
  create(): MarketDataProvider // checks FAKE_MARKET_DATA, then MASSIVE_API_KEY, else throws
  recreate(): void // clears cache so next create() builds fresh
}

// src/main/integrations/broker-factory.ts
export const brokerFactory: {
  create(): BrokerProvider // checks FAKE_BROKER, then ALPACA credentials, else throws BrokerError('auth_failed')
  recreate(): void // clears cache so next create() builds fresh
}
```

## Implementation Summary

### Approach

Both factories use a module-level `cached` variable. `create()` lazily builds on first call; `recreate()` just clears the cache without eagerly creating a new instance (important — `beforeEach` clears env vars before calling `recreate()`, so eager creation in `recreate()` would throw).

### Key Design Decisions

- **`recreate()` returns `void`** (not `T`): The green implementation made it return `T` initially, which caused `beforeEach` to throw when no env vars were set. `void` is the correct contract since callers call `create()` separately.
- **No `createMarketDataProvider` compat shim**: The old function is gone. `src/main/index.ts` was the only consumer and was updated directly.
- **e2e test deleted early**: `alpaca-market-data.e2e.test.ts` imported the old factory API and became broken immediately. Rather than add a compat shim that would be removed in Area 9, deleted it now.

### Deviations from Plan

- `recreate()` returns `void` instead of `T`. The plan description implied it would return the new instance, but void is cleaner and matches test usage.

## Test Execution Results

```
PASS src/main/integrations/market-data-factory.test.ts (4 tests)
PASS src/main/integrations/broker-factory.test.ts (4 tests)
8 passed, 0 failed
```

## Quality Checks

- ✅ `pnpm test` passed (area 6 tests green; pre-existing renderer flakiness is unrelated)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Known Limitations / Tech Debt

- `alpaca-market-data.ts` and `alpaca-market-data.test.ts` still exist (deletion is Area 9's job)
- `src/main/index.ts` does not yet register the broker IPC handlers (Area 7's job)

## Handoff to Refactor Phase

Refactor phase should:

1. Review both factory files for any cleanup opportunities
2. Consider whether a shared `createCachingFactory<T>()` helper reduces duplication between the two factories
