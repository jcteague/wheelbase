# Green Phase Results: Area 8 — Wire Preload + Update Renderer Callers

## Feature Context

- **Feature directory**: `plans/us-39/`
- **Plan file**: `plans/us-39/plan.md`
- **Tasks file**: `plans/us-39/tasks.md`

## Implementation Files Created/Modified

- `src/renderer/src/api/broker.ts` — implemented `getBrokerAccount()` and `getMarketStatus()` calling `window.api.broker.*`
- `src/preload/index.ts` — added `broker`/`marketData` namespaces; removed old flat `getStockQuotes` and `getMarketStatus`
- `src/preload/index.d.ts` — added broker result types and `broker`/`marketData` namespaces; removed old flat `getStockQuotes`/`getMarketStatus` declarations
- `src/renderer/src/lib/verdict.ts` — added `impliedVolatility?: number | null` to `CockpitInput`; made `greeks.iv` optional
- `src/renderer/src/components/position-cockpit/ContextStrip.tsx` — IV cell reads `input.impliedVolatility` first, falls back to `greeks.iv`, shows "—" when null
- `src/renderer/src/hooks/useMarketStatus.ts` — imports `getMarketStatus` from `api/broker` instead of `api/market-data`
- `src/renderer/src/hooks/useMarketStatus.test.ts` — updated mock to use `window.api.broker.marketStatus`
- `src/renderer/src/api/market-data.ts` — `getStockQuotes` migrated to `window.api.marketData.stockQuotes`; dead `getMarketStatus` export removed
- `src/renderer/src/api/market-data.test.ts` — mock updated to `window.api.marketData.stockQuotes`; dead `getMarketStatus` tests removed
- `src/renderer/src/hooks/useStockQuotes.test.ts` — mock updated to `window.api.marketData.stockQuotes`

## Public Interfaces Implemented

```typescript
// src/renderer/src/api/broker.ts
export async function getBrokerAccount(): Promise<AccountInfo>
export async function getMarketStatus(): Promise<MarketStatus>

// window.api additions (src/preload/index.d.ts)
window.api.broker.account() => Promise<IpcGetBrokerAccountResult>
window.api.broker.activities(payload) => Promise<IpcGetBrokerActivitiesResult>
window.api.broker.marketStatus() => Promise<IpcGetBrokerMarketStatusResult>
window.api.marketData.stockQuotes(payload) => Promise<IpcGetStockQuotesResult>
window.api.marketData.optionSnapshot(payload) => Promise<unknown>
window.api.marketData.optionChain(payload) => Promise<unknown>
```

## Implementation Summary

Added the `broker` and `marketData` namespaces to the preload without removing existing legacy methods — stock quotes streaming (`setStockQuoteTickers`, `onStockQuote`, `onStreamError`) is still used by `useStockQuotes` and `useOptionSnapshots` which were left unchanged to avoid cascading test updates.

`ContextStrip` IV logic: `input.impliedVolatility !== undefined ? input.impliedVolatility : (input.greeks.iv ?? null)`. When the resolved value is null, shows "—".

## Test Execution Results

```
Test Files  105 passed (105)
      Tests  1170 passed (1170)
```

(2 fewer than Red baseline: the dead `getMarketStatus` tests in `market-data.test.ts` were removed with the function.)

## Quality Checks

- ✅ `pnpm test` — 1170/1170 passed
- ✅ `pnpm lint` — no errors
- ✅ `pnpm typecheck` — no errors

## Known Limitations / Tech Debt

- `useOptionSnapshots.ts` still uses the old `window.api.getOptionSnapshots` flat method and the `market-data:option-snapshots` bulk IPC channel — no direct new-API equivalent; migrating requires per-symbol `optionSnapshot` calls and is deferred
- `setStockQuoteTickers`, `onStockQuote`, `onStreamError` remain as flat preload methods — could eventually move into a `streaming` namespace
- `marketData.optionSnapshot` and `marketData.optionChain` in `index.d.ts` are typed `unknown` — needs proper types once callers are wired

## Handoff to Refactor Phase

Run `/refactor`. Refactor phase should:

1. Consider extracting a `useBrokerEnvironment()` hook fed by `broker:account` for US-37
2. Consider renaming `useMarketStatus` query key from `['market-data', 'market-status']` to `['broker', 'market-status']` to match namespace
