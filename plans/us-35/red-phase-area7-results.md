# Red Phase Results: Area 7 — Preload + Renderer Hook + AssignmentNotificationBanner

## Feature Context

- **Feature directory**: `plans/us-35/`
- **User story**: `docs/epics/06-stories/US-35-assignment-detection-and-auto-transition.md`
- **Plan file**: `plans/us-35/plan.md`

## Test Files Created

- `src/renderer/src/components/AssignmentNotificationBanner.test.tsx` — component render, interaction, hook config

## Interfaces Under Test

```tsx
// src/renderer/src/components/AssignmentNotificationBanner.tsx
export function AssignmentNotificationBanner(): React.JSX.Element

// src/renderer/src/api/assignments.ts
export function usePendingAssignments(): UseQueryResult<PendingAssignment[]>

// window.api.assignments (src/preload/index.ts addition)
confirm: (pendingAssignmentId: number) => Promise<{ ok: true; position: ... } | { ok: false; ... }>
dismiss: (pendingAssignmentId: number) => Promise<{ ok: true; dismissedAt: string } | { ok: false; ... }>
listPending: () => Promise<{ ok: true; assignments: PendingAssignment[] } | { ok: false; ... }>
```

## Test Coverage

### Component tests (`AssignmentNotificationBanner`)

- [ ] Renders ticker, strike, contract type, and transaction date
- [ ] Shows Confirm and Dismiss buttons
- [ ] Clicking Confirm calls `window.api.assignments.confirm(id)` and shows success message on ok:true
- [ ] Success state includes "Open covered call →" link with `href="/positions/{positionId}"`
- [ ] Clicking Dismiss calls `window.api.assignments.dismiss(id)` and the banner unmounts

### Hook test (`usePendingAssignments`)

- [ ] Calls `useQuery` with `refetchInterval: 30_000`

## Test Design Assumptions

1. **Dismiss uses local state**: The component must locally track dismissed IDs (a `Set<number>` in `useState`) so the banner disappears immediately after `ok:true` from the API, without waiting for a real query refetch (the `useQueryClient.invalidateQueries` mock doesn't trigger re-renders in unit tests).

2. **Confirm shows inline success**: No external toast library. On `ok:true` from confirm, the component renders an inline success state (e.g., "Assignment confirmed" text + "Open covered call →" link) inside the same banner.

3. **Link href format**: The component passes `href="/positions/{positionId}"` to a wouter `<Link>`. With the mocked `Link` that renders `<a href={href}>`, the test sees `/positions/42`. Hash routing (`#`) is handled by wouter internally at runtime, not reflected in the Link's `href` prop.

4. **Hook test uses `vi.importActual`**: To bypass the `vi.mock('../api/assignments')` module stub and load the real hook, `vi.importActual` is used. This imports the actual module (which uses the mocked `@tanstack/react-query.useQuery`), enabling us to verify the `refetchInterval: 30_000` option.

## Test Execution Results

```
FAIL renderer src/renderer/src/components/AssignmentNotificationBanner.test.tsx
Error: Failed to resolve import "./AssignmentNotificationBanner" from
"src/renderer/src/components/AssignmentNotificationBanner.test.tsx". Does the file exist?
  Plugin: vite:import-analysis

Test Files  1 failed (1)
Tests       no tests
```

## Verification

- ✅ Tests fail because the implementation files don't exist (`./AssignmentNotificationBanner` and `../api/assignments`)
- ✅ No syntax errors in the test file
- ✅ Suite-level failure at Vite's import-analysis stage — the correct red-phase failure mode when the component module doesn't exist

## Handoff to Green Phase

Run `/green us-35 area 7`. Green phase should:

1. Add `assignments` namespace to `src/preload/index.ts` and its type declarations in `src/preload/index.d.ts`
2. Create `src/renderer/src/api/assignments.ts` — export `usePendingAssignments` with `useQuery({ queryKey: ['assignments', 'pending'], queryFn: () => window.api.assignments.listPending(), refetchInterval: 30_000 })`
3. Create `src/renderer/src/components/AssignmentNotificationBanner.tsx` — smart component using `usePendingAssignments`, `useQueryClient`, local `dismissedIds` state, and inline confirm-success state
4. Mount the banner in `src/renderer/src/components/PageLayout.tsx` or the positions list page
