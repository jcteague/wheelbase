# Red Phase Results: Layer 6 — E2E Tests

## Feature Context

- **Feature directory**: `plans/us-39/`
- **Plan file**: `plans/us-39/plan.md`
- **User stories**: `docs/epics/06-stories/US-31-market-data-provider-adapter.md`, `US-39-massive-market-data-provider.md`, `US-40-alpaca-broker-provider.md`

## Test Files Created

- `e2e/provider-split.spec.ts` — 23 e2e tests covering every AC from US-31, US-39, US-40

## Test Coverage by AC

### US-31 (Interface Separation)

| AC                                                            | Test                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| MarketDataProvider exposes stock quote retrieval              | `it('MarketDataProvider exposes stock quote retrieval')`              |
| MarketDataProvider exposes option contract snapshot           | `it('MarketDataProvider exposes option contract snapshot')`           |
| MarketDataProvider exposes option chain snapshot with filters | `it('MarketDataProvider exposes option chain snapshot with filters')` |
| MarketDataProvider declares streaming capability              | `it('MarketDataProvider declares streaming capability')`              |
| BrokerProvider exposes account info                           | `it('BrokerProvider exposes account info')`                           |
| BrokerProvider exposes broker activity polling                | `it('BrokerProvider exposes broker activity polling')`                |
| BrokerProvider exposes market status                          | `it('BrokerProvider exposes market status')`                          |
| Interfaces remain independent                                 | `it('Interfaces remain independent')`                                 |

### US-39 (MassiveMarketDataProvider)

| AC                                                                      | Test                                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| getStockQuotes returns NBBO for each ticker                             | `it('getStockQuotes returns NBBO for each ticker')`                             |
| getOptionSnapshot returns full snapshot including Greeks when present   | `it('getOptionSnapshot returns full snapshot including Greeks when present')`   |
| getOptionSnapshot omits Greeks when absent                              | `it('getOptionSnapshot omits Greeks when absent')`                              |
| getOptionChainSnapshot filters by strike, expiration, and contract type | `it('getOptionChainSnapshot filters by strike, expiration, and contract type')` |
| supportsStreaming declares streamable feeds                             | `it('supportsStreaming declares streamable feeds')`                             |
| Missing API key surfaces a typed error                                  | `it('Missing API key surfaces a typed error')`                                  |
| Massive 401/403 surfaces auth error                                     | `it('Massive 401/403 surfaces auth error')`                                     |
| Massive 429 retry-with-backoff                                          | `it.todo(...)` — covered by unit tests                                          |
| API key loaded once per process                                         | `it.todo(...)` — requires safeStorage spy, covered by unit tests                |

### US-40 (AlpacaBrokerProvider)

| AC                                                                  | Test                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| getAccountInfo returns balances, environment, masked account number | `it('getAccountInfo returns balances, environment, and masked account number')` |
| getActivities returns OPASN activities filtered by date             | `it('getActivities returns OPASN activities filtered by date')`                 |
| getMarketStatus returns current session                             | `it('getMarketStatus returns current session')`                                 |
| Missing Alpaca credentials surface typed error                      | `it('Missing Alpaca credentials surface typed error')`                          |
| Environment is sourced from stored credentials                      | `it('Environment is sourced from stored credentials')`                          |
| Credential environment mismatch is detectable                       | `it('Credential environment mismatch is detectable')`                           |

## Expected Failure Reasons

### Group A: Broker channel not registered (fails immediately with "no handler" error)

- `it('BrokerProvider exposes account info')`
- `it('BrokerProvider exposes broker activity polling')`
- `it('BrokerProvider exposes market status')`
- All US-40 tests
- **Root cause**: `src/main/index.ts` does not call `registerBrokerHandlers`. Green phase must add this.

### Group B: Error injection env vars not wired into fake providers

- `it('Missing API key surfaces a typed error')`
- `it('Massive 401/403 surfaces auth error')`
- `it('Missing Alpaca credentials surface typed error')`
- `it('Credential environment mismatch is detectable')`
- **Root cause**: `FAKE_MARKET_DATA_ERROR` and `FAKE_BROKER_ERROR` env vars are not read by `FakeMarketDataProvider` / `FakeBrokerProvider`. Green phase must add error injection.

### Group C: Expected to pass already (happy path market data)

- `it('MarketDataProvider exposes stock quote retrieval')` ← likely passes
- `it('MarketDataProvider exposes option contract snapshot')` ← likely passes
- `it('MarketDataProvider exposes option chain snapshot with filters')` ← likely passes
- `it('MarketDataProvider declares streaming capability')` ← likely passes
- `it('Interfaces remain independent')` ← passes (file-system check, synchronous)

## Green Phase: Changes Required

### 1. Register broker handlers in `src/main/index.ts`

```ts
import { brokerFactory } from './integrations/broker-factory'
import { registerBrokerHandlers } from './ipc/broker'

// Inside app.whenReady():
const brokerProvider = brokerFactory.create()
registerBrokerHandlers(brokerProvider)
```

### 2. Add error injection to `src/main/integrations/fake-market-data.ts`

Read `FAKE_MARKET_DATA_ERROR` env var. If set, throw `MarketDataError(code)` on all provider calls.

### 3. Add error injection to `src/main/integrations/fake-broker.ts`

Read `FAKE_BROKER_ERROR` env var. If set, throw `BrokerError(code)` on all provider calls.

### 4. Handle broker factory startup failures gracefully

When `brokerFactory.create()` throws in `main/index.ts`, either:

- Register a stub handler that returns the error, OR
- Wrap creation in try-catch and register no-op handlers

## Note on e2e Execution

E2E tests require a GUI terminal — cannot be run from Claude Code's shell. The command `pnpm test:e2e` rebuilds the app first (`electron-vite build`) then runs via vitest.

```bash
# Run from iTerm/Terminal.app:
pnpm test:e2e
```

Typecheck verified: `pnpm typecheck` exits clean (0 errors).
