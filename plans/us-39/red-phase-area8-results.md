# Red Phase Results: Area 8 — Wire Preload + Update Renderer Callers

## Feature Context

- **Feature directory**: `plans/us-39/`
- **Plan file**: `plans/us-39/plan.md`
- **IPC contracts**: `plans/us-39/contracts/ipc-channels.md`

## Test Files Created/Modified

- `src/renderer/src/api/broker.test.ts` — NEW: tests for renderer-side broker API adapter
- `src/renderer/src/components/position-cockpit/ContextStrip.spec.tsx` — UPDATED: added IV placeholder test

## Interfaces Under Test

```typescript
// src/renderer/src/api/broker.ts (NEW)
export async function getBrokerAccount(): Promise<AccountInfo>
// calls window.api.broker.account()
// returns AccountInfo on ok:true
// throws ApiError(502) on ok:false

export async function getMarketStatus(): Promise<MarketStatus>
// calls window.api.broker.marketStatus()  ← moved from market-data to broker namespace
// returns MarketStatus on ok:true
// throws ApiError(502) on ok:false

// AccountInfo type (from src/main/integrations/broker-provider.ts):
// { buyingPower, portfolioValue, cash, environment, accountNumberMasked }

// MarketStatus type (from src/renderer/src/api/market-data.ts):
// { isOpen, nextOpen, nextClose, session }

// window.api shape required by tests:
// window.api.broker.account()        → IpcResult<{ account: AccountInfo }>
// window.api.broker.marketStatus()   → IpcResult<{ status: MarketStatus }>

// src/renderer/src/components/position-cockpit/ContextStrip.tsx (MODIFY)
// CockpitInput must gain: impliedVolatility: number | null
// ContextStrip must render "—" for the IV cell when impliedVolatility is null
```

## Test Coverage Summary

### Broker API adapter (`src/renderer/src/api/broker.test.ts`)

- [x] `getBrokerAccount` calls `window.api.broker.account()`
- [x] `getBrokerAccount` returns AccountInfo on ok:true
- [x] `getBrokerAccount` throws ApiError(502) on ok:false
- [x] `getMarketStatus` calls `window.api.broker.marketStatus()`
- [x] `getMarketStatus` returns MarketStatus on ok:true
- [x] `getMarketStatus` throws ApiError(502) on ok:false

### ContextStrip component (`ContextStrip.spec.tsx`)

- [x] renders `—` for IV cell when `impliedVolatility` is null

## Design Assumptions

1. `getBrokerAccount` and `getMarketStatus` in `api/broker.ts` follow the same pattern as functions in `api/market-data.ts` — call `window.api.broker.*`, check `ok`, throw `apiError(502, ...)` on failure.
2. The `CockpitInput` type in `src/renderer/src/lib/verdict.ts` needs a new field: `impliedVolatility: number | null`. The existing `greeks.iv` field will be removed from `CockpitInput.greeks`.
3. `ContextStrip` will use `input.impliedVolatility` for the IV display instead of `input.greeks.iv`.
4. `MarketStatus` type is already defined in `src/renderer/src/api/market-data.ts`; the `getMarketStatus` function simply moves from that module to `api/broker.ts`.

## Test Execution Results

```
 ❯ renderer  src/renderer/src/api/broker.test.ts (0 test)
 ❯ renderer  src/renderer/src/components/position-cockpit/ContextStrip.spec.tsx (14 tests | 1 failed)
     ✓ renders null when greeks are absent
     ✓ renders Theta as dollar-per-day
     ...13 pass...
     × renders — for IV when impliedVolatility is null

FAIL src/renderer/src/api/broker.test.ts
  Error: Failed to resolve import "./broker" — file does not exist yet

Test Files  2 failed (2)
      Tests  1 failed | 13 passed (14)
```

## Verification

- ✅ `broker.test.ts` fails because `src/renderer/src/api/broker.ts` does not exist
- ✅ `ContextStrip.spec.tsx` new test fails because component renders "NaN%" (reads undefined `greeks.iv`), not "—"
- ✅ All 13 existing ContextStrip tests still pass
- ✅ Zero test failures caused by bugs in the tests themselves

## Handoff to Green Phase

Green phase must:

1. Create `src/renderer/src/api/broker.ts` with `getBrokerAccount()` and `getMarketStatus()` calling `window.api.broker.*`
2. Update `src/preload/index.ts` to expose two namespaces: `api.marketData.*` and `api.broker.*`
3. Update `src/preload/index.d.ts` with the new type declarations
4. Add `impliedVolatility: number | null` to `CockpitInput` in `src/renderer/src/lib/verdict.ts`
5. Update `ContextStrip` to use `input.impliedVolatility` with `"—"` fallback
6. Update `src/renderer/src/api/market-data.ts` to call `window.api.marketData.*` (not the flat API)
7. Update `useMarketStatus` to import `getMarketStatus` from `api/broker.ts`
8. Update `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` `buildCockpitInput` to read `impliedVolatility` from `snapshot`
9. Update `market-data.test.ts` and `useMarketStatus.test.ts` mocks to use the new API shape
