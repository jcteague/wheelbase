# ADR: TanStack Query mutation hooks invalidate positions on success

<!-- generated:from us-2, us-4, us-5, us-6, us-7, us-8, us-9, us-12, us-32 -->

## Decision

Every position-mutation IPC call is wrapped in a TanStack Query mutation hook (`useClosePosition`, `useExpirePosition`, `useAssignPosition`, `useOpenCoveredCall`, `useCloseCoveredCallEarly`, `useExpireCoveredCall`, `useRollCsp`). The hook:

1. Wraps the renderer adapter via `useMutation<Response, ApiError, Payload>`.
2. On success, calls `queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })` so both the list and any detail-page cache entries refetch.
3. Forwards an optional `onSuccess(data)` callback — used by sheet components to transition from form-state to success-state with the returned data.

Read paths use `useQuery` hooks (`usePositions`, `usePosition`) with the same `positionQueryKeys` registry. Market data uses a separate `marketDataQueryKeys` registry (see ADR [market-data-tanstack-cache](./market-data-tanstack-cache.md)). Per US-37 (vendor-scoped query keys), `useMarketStatus` was moved under a `brokerQueryKeys` registry (`['broker', 'market-status']`, `src/renderer/src/hooks/brokerQueryKeys.ts`) rather than the market-data registry.

The shared `usePositionMutation(adapter, options)` helper extracted during US-12-refactor implements this pattern in one place so every mutation hook is a one-line wrapper.

## Context / Why

- TanStack Query is the project's chosen server-state library; mutations + invalidation gives us automatic refetch without manual cache wiring.
- Invalidating the whole `positions` key (rather than a single position) is intentional: any mutation can affect both the list (sort order, badges) and the detail page; broad invalidation is correct and cheap at a small scale.
- Forwarding `onSuccess` to the sheet lets the orchestrator transition states with the IPC response in hand (P&L, premium waterfall, shares-held), so the success view doesn't need a second fetch.

## Alternatives considered

- **Direct calls to `window.api.*` with manual `setQueryData` updates** — rejected; bypasses the query cache's stale-time machinery and requires hand-rolled invalidation per call site.
- **Narrow invalidation (`['positions', id]`)** — partially adopted (`usePosition` keys are `['positions', id]`) but mutation hooks invalidate the broader `['positions']` parent so list views stay in sync.
- **Per-mutation custom React state** — rejected; loses request-status tracking (`isPending`, `isError`) and forces every component to reimplement loading UI.

## Consequences

- Every new mutation gets a small hook file (`useX.ts`) and may be one line if `usePositionMutation` covers it.
- The `onSuccess` callback contract is part of the sheet's API: the orchestrator passes a setter that captures the IPC response and renders the success state.
- `positionQueryKeys` lives in `src/renderer/src/hooks/positionQueryKeys.ts` (or similar) and is the single source of truth for query-key construction.

## Sources

- [extract: us-2](../../.extracts/us-2.md) — `usePositions` query hook (read path)
- [extract: us-4](../../.extracts/us-4.md) — `usePosition` queryKey `['positions', id]`; list key `['positions']`; invalidation on close
- [extract: us-5](../../.extracts/us-5.md) — `useExpirePosition` invalidates `queryKey: ['positions']`
- [extract: us-6](../../.extracts/us-6.md) — `useAssignPosition` invalidates `positionQueryKeys.all`
- [extract: us-7](../../.extracts/us-7.md) — `useOpenCoveredCall` mutation hook
- [extract: us-8](../../.extracts/us-8.md) — `useCloseCoveredCallEarly` mutation hook
- [extract: us-9](../../.extracts/us-9.md) — `useExpireCoveredCall` mutation hook
- [extract: us-12](../../.extracts/us-12.md) — `useRollCsp` via shared `usePositionMutation` helper
- [extract: us-32](../../.extracts/us-32.md) — `useStockQuotes` / `useMarketStatus` query hooks (market-status keys later moved to `brokerQueryKeys` in US-37)
- [feature: us-2-position-list](../../features/us-2-position-list.md)
- [feature: us-4-close-csp](../../features/us-4-close-csp.md)
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
<!-- /generated -->
