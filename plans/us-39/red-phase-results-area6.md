# Red Phase Results: Area 6 — Rewire MarketDataFactory + New BrokerFactory

## Feature Context

- **Feature directory**: `plans/us-39/`
- **Plan file**: `plans/us-39/plan.md` (Area 6)
- **Tasks file**: `plans/us-39/tasks.md`

## Test Files Created/Modified

- `src/main/integrations/market-data-factory.test.ts` — replaced existing tests with 4 new factory object tests
- `src/main/integrations/broker-factory.test.ts` — new file (4 tests)

## Interfaces Under Test

```typescript
// src/main/integrations/market-data-factory.ts
export const marketDataFactory: {
  create(): MarketDataProvider
  recreate(): MarketDataProvider
}

// src/main/integrations/broker-factory.ts (new file)
export const brokerFactory: {
  create(): BrokerProvider
  recreate(): BrokerProvider
}
```

### Environment variable contracts

| Var                                   | Effect                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `FAKE_MARKET_DATA=true`               | `marketDataFactory.create()` returns `FakeMarketDataProvider`                |
| `MASSIVE_API_KEY=<key>`               | `marketDataFactory.create()` returns `MassiveMarketDataProvider({ apiKey })` |
| (neither)                             | `marketDataFactory.create()` throws                                          |
| `FAKE_BROKER=true`                    | `brokerFactory.create()` returns `FakeBrokerProvider`                        |
| `ALPACA_KEY_ID` + `ALPACA_SECRET_KEY` | `brokerFactory.create()` returns `AlpacaBrokerProvider`                      |
| `ALPACA_PAPER=true`                   | broker environment is `'paper'`; omitted → `'live'`                          |
| (no credentials)                      | `brokerFactory.create()` throws `BrokerError('auth_failed')`                 |

## Test Coverage Summary

### market-data-factory.test.ts

- [x] Returns `MassiveMarketDataProvider` when `MASSIVE_API_KEY` is set
- [x] Returns `FakeMarketDataProvider` when `FAKE_MARKET_DATA=true`
- [x] Throws when neither env var is configured
- [x] Never instantiates `AlpacaMarketDataProvider` in any branch (mocked + spy asserted)

### broker-factory.test.ts

- [x] Returns `AlpacaBrokerProvider` when paper credentials configured (`ALPACA_PAPER=true`)
- [x] Returns `AlpacaBrokerProvider` when live credentials configured (no `ALPACA_PAPER`)
- [x] Returns `FakeBrokerProvider` when `FAKE_BROKER=true`
- [x] Throws `BrokerError` with `code='auth_failed'` when no credentials configured

## Test Execution Results

```
FAIL src/main/integrations/broker-factory.test.ts
  Error: Cannot find module './broker-factory'

FAIL src/main/integrations/market-data-factory.test.ts
  × returns MassiveMarketDataProvider when MASSIVE_API_KEY is configured
  × returns FakeMarketDataProvider when FAKE_MARKET_DATA env var is set
  × throws if neither Massive nor Fake is configured
  × does NOT instantiate AlpacaMarketDataProvider in any branch
  TypeError: Cannot read properties of undefined (reading 'recreate')
  → marketDataFactory is undefined (current export is createMarketDataProvider, not marketDataFactory)

2 failed test files, 4 failed tests
```

## Verification

- ✅ All tests fail because the implementation doesn't exist — not due to test bugs
- ✅ No syntax errors in test files
- ✅ `vi.hoisted()` used correctly to avoid hoisting issues with `vi.mock` factory

## Handoff to Green Phase

Green phase must:

1. Rewrite `src/main/integrations/market-data-factory.ts`:
   - Export `marketDataFactory` object (not `createMarketDataProvider` function)
   - `create()` checks `FAKE_MARKET_DATA` first, then `MASSIVE_API_KEY`, then throws
   - `recreate()` clears the cached instance and creates a fresh one
   - Never import or instantiate `AlpacaMarketDataProvider`

2. Create `src/main/integrations/broker-factory.ts`:
   - Export `brokerFactory` object
   - `create()` checks `FAKE_BROKER` first, then `ALPACA_KEY_ID`/`ALPACA_SECRET_KEY`, then throws `BrokerError('auth_failed')`
   - `recreate()` clears cached instance
   - Pass `environment: process.env.ALPACA_PAPER === 'true' ? 'paper' : 'live'` to `AlpacaBrokerProvider`
