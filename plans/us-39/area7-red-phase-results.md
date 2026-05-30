# Red Phase Results: Area 7 — Split IPC Handlers Into market-data and broker

## Feature Context

- **Feature directory**: `plans/us-39/`
- **Plan file**: `plans/us-39/plan.md`
- **IPC contracts**: `plans/us-39/contracts/ipc-channels.md`

## Test Files Created/Modified

- `src/main/ipc/market-data.test.ts` — added 5 new tests (4 failing, 1 passing guard)
- `src/main/ipc/broker.test.ts` — new file with 5 tests (all failing)

## Interfaces Under Test

```typescript
// src/main/ipc/market-data.ts (modified)
export function registerMarketDataHandlers(
  provider: MarketDataProvider,
  getWindow: () => BrowserWindow | null
): void
// Registers channels: 'market-data:stock-quotes', 'market-data:option-snapshot', 'market-data:option-chain'
// Does NOT register: 'market-data:activities', 'market-data:account', 'market-data:market-status'

// src/main/ipc/broker.ts (new)
export function registerBrokerHandlers(provider: BrokerProvider): void
// Registers channels: 'broker:account', 'broker:activities', 'broker:market-status'
```

## Test Coverage Summary

### market-data.test.ts — new tests

- [x] `market-data:option-snapshot` channel is registered — **FAILS** (only `option-snapshots` plural exists)
- [x] `market-data:option-snapshot` handler returns `{ ok: true, snapshot }` — **FAILS** (channel absent)
- [x] `market-data:option-chain` channel is registered — **FAILS** (channel absent)
- [x] `market-data:option-chain` handler returns `{ ok: true, snapshots, nextCursor }` — **FAILS** (channel absent)
- [x] `:activities`, `:account`, `:market-status` are NOT registered on the market-data namespace — **PASSES** (regression guard)

### broker.test.ts — all new

- [x] Registers `broker:account`, `broker:activities`, `broker:market-status` — **FAILS** (module not found)
- [x] `broker:account` returns `{ ok: true, account }` — **FAILS** (module not found)
- [x] `broker:activities` passes filter through and returns `{ ok: true, activities }` — **FAILS** (module not found)
- [x] `broker:market-status` returns `{ ok: true, status }` — **FAILS** (module not found)
- [x] `broker:account` returns `{ ok: false, errors, code }` on `BrokerError` — **FAILS** (module not found)

## Test Execution Results

```
Test Files  2 failed (2)
     Tests  9 failed | 21 passed (30)

broker.test.ts: 5 failed — Cannot find module '/src/main/ipc/broker'
market-data.test.ts: 4 failed — assertion (channel not registered) | 1 passed (guard)
```

## Verification

- ✅ Every new failure is because the feature is not yet implemented
- ✅ No syntax errors in test files
- ✅ No fixture or import errors caused by test setup mistakes
- ✅ All 21 existing market-data tests continue to pass

## Handoff to Green Phase

Green phase must:

1. Create `src/main/ipc/broker.ts` exporting `registerBrokerHandlers(provider: BrokerProvider)`
2. Register `broker:account`, `broker:activities`, `broker:market-status` IPC channels
3. Update `src/main/ipc/market-data.ts` to also register `market-data:option-snapshot` and `market-data:option-chain`
4. Add Zod schemas to `src/main/schemas.ts` per `contracts/ipc-channels.md`
5. `handleIpcCall` in `utils.ts` needs BrokerError handling added alongside existing MarketDataError handling
