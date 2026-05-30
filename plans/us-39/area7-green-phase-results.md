# Green Phase Results: Area 7 — Split IPC Handlers Into market-data and broker

## Feature Context

- **Feature directory**: `plans/us-39/`
- **Plan file**: `plans/us-39/plan.md`
- **Red phase results**: `plans/us-39/area7-red-phase-results.md`

## Implementation Files Created/Modified

- `src/main/ipc/broker.ts` — new; registers `broker:account`, `broker:activities`, `broker:market-status` IPC handlers
- `src/main/ipc/market-data.ts` — added `market-data:option-snapshot` and `market-data:option-chain` handlers
- `src/main/ipc/utils.ts` — added `BrokerError` handling alongside existing `MarketDataError` handling
- `src/main/schemas.ts` — added `GetOptionSnapshotPayloadSchema`, `GetOptionChainPayloadSchema`, `GetBrokerActivitiesPayloadSchema`
- `src/main/ipc/broker.test.ts` — fixed import formatting (prettier)
- `src/main/ipc/market-data.test.ts` — corrected `option-chain` mock to return `OptionSnapshot[]` (array, not object)

## Public Interfaces Implemented

```typescript
// src/main/ipc/broker.ts
export function registerBrokerHandlers(provider: BrokerProvider): void
// Channels: 'broker:account', 'broker:activities', 'broker:market-status'

// src/main/ipc/market-data.ts (new channels added)
// 'market-data:option-snapshot' → { ok: true, snapshot: OptionSnapshot } | { ok: false, errors }
// 'market-data:option-chain'    → { ok: true, snapshots: OptionSnapshot[], nextCursor: null } | { ok: false, errors }

// src/main/schemas.ts
export const GetOptionSnapshotPayloadSchema // { underlying, contract (OCC regex) }
export const GetOptionChainPayloadSchema // { underlying, expirationFrom?, ..., limit?, cursor? }
export const GetBrokerActivitiesPayloadSchema // { type, since? }
```

## Key Design Decisions

- **BrokerError in utils.ts**: Added `BrokerError` catch block identical to the `MarketDataError` block — both map to `{ field: '__root__', code, message }`. This keeps broker handlers thin.
- **option-chain wraps the array**: `getOptionChainSnapshot` returns `OptionSnapshot[]`; the IPC handler wraps it as `{ snapshots, nextCursor: null }`. The `nextCursor` is always `null` for now — real pagination support is deferred.
- **Test mock correction**: The Red-phase mock used `{ snapshots: [...], nextCursor: null }` which was the wrong shape for the provider interface (`OptionSnapshot[]`). Fixed to `[AAPL_SNAPSHOT]`.

## Deviations from Plan

- `nextCursor` is always `null` in the `option-chain` handler. The plan mentions pagination but the provider currently returns a flat array. A future story can add cursor pass-through when the provider interface is updated to return `{ snapshots, nextCursor }`.

## Test Execution Results

```
Test Files  104 passed (104)
     Tests  1165 passed (1165)
```

## Quality Checks

- ✅ `pnpm test` passed (104 files, 1165 tests)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Known Limitations / Tech Debt

- `nextCursor` is always `null`. If real pagination is needed, `getOptionChainSnapshot` must return `{ snapshots, nextCursor }` and the Massive provider, interface, and this handler all need updating.
- Old channels (`market-data:option-snapshots`, `market-data:set-stock-quote-tickers`) still registered — should be removed in a future cleanup once renderer callers migrate to the new channels.
