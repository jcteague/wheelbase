---
page: docs/spec/architecture/02-adrs/tanstack-query-mutation-hooks.md
audited_at: 2026-06-27
findings: 1
---

# Audit: tanstack-query-mutation-hooks.md

## Verified (12)

- ✓ `useClosePosition` → `src/renderer/src/hooks/useClosePosition.ts`
- ✓ `useExpirePosition` → `src/renderer/src/hooks/useExpirePosition.ts`
- ✓ `useAssignPosition` → `src/renderer/src/hooks/useAssignPosition.ts`
- ✓ `useOpenCoveredCall` → `src/renderer/src/hooks/useOpenCoveredCall.ts`
- ✓ `useCloseCoveredCallEarly` → `src/renderer/src/hooks/useCloseCoveredCallEarly.ts`
- ✓ `useExpireCoveredCall` → `src/renderer/src/hooks/useExpireCoveredCall.ts`
- ✓ `useRollCsp` → `src/renderer/src/hooks/useRollCsp.ts`
- ✓ Read hooks `usePositions` and `usePosition` both in `src/renderer/src/hooks/usePositions.ts`.
- ✓ Shared `usePositionMutation` helper → `src/renderer/src/hooks/usePositionMutation.ts`; on success it calls `queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })` (`usePositionMutation.ts:20`), matching "invalidates the whole positions key".
- ✓ `onSuccess` forwarding: `usePositionMutation.ts:8` declares `onSuccess?: (data) => void` and `:21` calls `options?.onSuccess?.(data)`.
- ✓ `positionQueryKeys` registry at `src/renderer/src/hooks/positionQueryKeys.ts`; `all = ['positions']`, `detail(id) = ['positions', id]` — matches "narrow invalidation `['positions', id]`" and broad parent `['positions']`.
- ✓ Consequences claim "`positionQueryKeys` lives in `src/renderer/src/hooks/positionQueryKeys.ts` (or similar)" — exact path match.

## Drift (1)

- ✗ The Decision sentence "Market data uses a separate `marketDataQueryKeys` registry (see ADR market-data-tanstack-cache)" and the us-37 extract framing are now partially stale: per US-37 (vendor-scoped query keys), `useMarketStatus` moved under `brokerQueryKeys` (`['broker', 'market-status']`, `src/renderer/src/hooks/brokerQueryKeys.ts`) rather than the market-data registry. The us-32 source line "`useStockQuotes` / `useMarketStatus` query hooks" no longer reflects where market-status keys live. Suggested fix: cross-reference the vendor-scoped-query-keys ADR for market-status.

## Unverifiable (1)

- ? The linked ADR `./market-data-tanstack-cache.md` reference was not in audit scope (cross-page link, not src/).

## Missing files (0)

None within src/ scope.
