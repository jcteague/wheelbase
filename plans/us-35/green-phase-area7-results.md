# Green Phase Results: Area 7 — Preload + Renderer Hook + AssignmentNotificationBanner

## Feature Context

- **Feature directory**: `plans/us-35/`
- **User story**: `docs/epics/06-stories/US-35-assignment-detection-and-auto-transition.md`
- **Plan file**: `plans/us-35/plan.md`
- **Red phase results**: `plans/us-35/red-phase-area7-results.md`

## Files touched (production)

- `src/preload/index.ts` — added `assignments` namespace (listPending, confirm, dismiss, runDetectionNow)
- `src/preload/index.d.ts` — added global `PendingAssignmentNotification` interface and `assignments` to `Window.api`
- `src/renderer/src/api/assignments.ts` — new; exports `usePendingAssignments` hook with `refetchInterval: 30_000`
- `src/renderer/src/components/AssignmentNotificationBanner.tsx` — new smart component
- `src/renderer/src/pages/PositionsListPage.tsx` — mounts `<AssignmentNotificationBanner />` above the position list
- `src/renderer/src/pages/PositionsListPage.test.tsx` — added mock for `AssignmentNotificationBanner`

## E2E coverage added or modified

None (area 8 handles e2e).

## Public Interfaces Implemented

```typescript
// src/renderer/src/api/assignments.ts
export function usePendingAssignments(): UseQueryResult<PendingAssignmentNotification[]>

// src/renderer/src/components/AssignmentNotificationBanner.tsx
export function AssignmentNotificationBanner(): React.JSX.Element | null

// src/preload/index.ts additions
window.api.assignments.listPending()   → assignments:list-pending
window.api.assignments.confirm(id)     → assignments:confirm
window.api.assignments.dismiss(id)     → assignments:dismiss
window.api.assignments.runDetectionNow() → assignments:run-detection-now

// global type (src/preload/index.d.ts)
interface PendingAssignmentNotification {
  id: number; ticker: string; strike: string; expiration: string
  contractType: 'put' | 'call'; qty: number; transactionTime: string; positionId: number
}
```

## Implementation Summary

### Key Design Decisions

- **Local `dismissedIds` state**: Component maintains a `Set<number>` of dismissed assignment IDs so banners disappear immediately on `ok:true` without waiting for a query refetch (the mocked `useQueryClient.invalidateQueries` in tests doesn't trigger re-renders).
- **Inline confirm success state**: On confirm `ok:true`, the banner transitions to a success view ("Assignment confirmed" + "Open covered call →" link) rather than unmounting immediately, consistent with tests.
- **Mounted in `PositionsListPage`**: The banner appears above the position table — assignments are contextually tied to the list view.

## Test Execution Results

```
Test Files  111 passed (111)
Tests       1221 passed (1221)
```

## Quality Checks

- ✅ `pnpm test` — 1221 tests, 0 failures
- ✅ `pnpm lint` — clean
- ✅ `pnpm typecheck` — clean

## Known Limitations / Tech Debt

- The `listPending` query function returns `[]` on error rather than throwing — this silently swallows broker errors in the renderer. The refactor phase could propagate errors through `isError` state for better UX.
- The banner has no loading/error state rendering when `usePendingAssignments` is pending or errored.

## Handoff to Refactor Phase

Run `/refactor us-35 area 7`. Refactor should:

1. Review `AssignmentNotificationBanner.tsx` for any extraction opportunities (e.g. `SingleAssignmentBanner` sub-component)
2. Consider error state handling for the query
3. Verify keyboard accessibility (Confirm = Enter when focused on that button)
