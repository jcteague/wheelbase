---
page: docs/spec/architecture/02-adrs/tanstack-query-mutation-hooks.md
audited_at: 2026-09-28
findings: 3
---

# Audit: tanstack-query-mutation-hooks.md

## Verified (8)

- ✓ Mutation hooks exist: `useClosePosition`, `useExpirePosition`, `useAssignPosition`, `useOpenCoveredCall`, `useCloseCoveredCallEarly`, `useExpireCoveredCall`, `useRollCsp` — all under `src/renderer/src/hooks/`.
- ✓ Hooks use `useMutation<Response, ApiError, Payload>` — e.g. `useAssignPosition.ts`, `useClosePosition.ts`, `usePositionMutation.ts:14-17`.
- ✓ On success they call `queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })` — `usePositionMutation.ts:20`, `useAssignPosition.ts`, `useExpirePosition.ts:14`, `useOpenCoveredCall.ts:14`, `useExpireCoveredCall.ts:14`.
- ✓ Optional `onSuccess(data)` is forwarded — `usePositionMutation.ts:7-9,21`; `useAssignPosition.ts`.
- ✓ `usePositionMutation(mutationFn, options)` helper exists — `src/renderer/src/hooks/usePositionMutation.ts:11`; `useRollCsp.ts:8` is a one-line wrapper.
- ✓ `positionQueryKeys` in `src/renderer/src/hooks/positionQueryKeys.ts` with `all: ['positions']`, `detail: (id) => ['positions', id]`; used by `usePositions.ts:7` and `usePosition.ts:7`.
- ✓ Separate `marketDataQueryKeys` registry exists — `src/renderer/src/hooks/marketDataQueryKeys.ts`; linked ADR `./market-data-tanstack-cache.md` exists.
- ✓ All linked extracts and feature pages exist.

## Drift (2)

- ✗ Page says `useMarketStatus` was moved under `brokerQueryKeys` (`['broker', 'market-status']`, `brokerQueryKeys.ts`) (line 13). Actual: `brokerQueryKeys` holds only `all`, `account`, `activities` (`src/renderer/src/hooks/brokerQueryKeys.ts:1-6`), and `useMarketStatus` uses `marketDataQueryKeys.marketStatus` = `['market', 'status']` (`useMarketStatus.ts:11`, `marketDataQueryKeys.ts:2`) — consistent with US-116 moving market status to the market-data port. Suggested fix: update to the current key and note the US-37 placement as history.
- ✗ Page says `usePositionMutation` makes "every mutation hook a one-line wrapper" (line 15). Only `useRollCsp`, `useRollCc`, `useRecordCallAway`, `useCloseCoveredCallEarly` use it; `useClosePosition`, `useExpirePosition`, `useAssignPosition`, `useOpenCoveredCall`, `useExpireCoveredCall` hand-roll `useMutation` + invalidation (`useClosePosition.ts:13-19`, `useAssignPosition.ts`). `useClosePosition` also does not accept/forward an `onSuccess` option, contrary to point 3. Suggested fix: scope the claim, or migrate the remaining hooks.

## Unverifiable (1)

- ? Rationale (broad invalidation is cheap at small scale; `setQueryData` rejected) — narrative.

## Missing files (0)

None.
