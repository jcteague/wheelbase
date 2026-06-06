# US-35 Code Review Remediation Plan

Branch: `us-35`
Source review: combined findings from `/code-review` + secondary review pass.

Every fix follows the project TDD cycle (Red → Green → Refactor). Tasks are grouped by file so a single PR-shaped change can land per area; within an area, tasks are ordered so each one is independently committable.

---

## Priority Summary

| #   | Severity | Area                           | Issue                                                              |
| --- | -------- | ------------------------------ | ------------------------------------------------------------------ |
| 1   | P1       | detect-assignments.ts          | Watermark advanced from wall clock, not poll start — races         |
| 2   | P1       | detect-assignments.ts          | Map keyed by OCC symbol loses duplicate CSPs                       |
| 3   | P1       | PositionsListPage + row        | AC: pulsing amber indicator on the assigned row is missing         |
| 4   | P1       | AssignmentNotificationBanner   | AC: banner sentence text doesn't match story copy                  |
| 5   | P1       | AssignmentNotificationBanner   | AC: success message doesn't match "AAPL assigned — now holding..." |
| 6   | P2       | AssignmentNotificationBanner   | `invalidateQueries(['positions','list'])` matches no real key      |
| 7   | P2       | pending-assignments.ts         | `dismissPending` allows dismissing a `confirmed` row               |
| 8   | P2       | preload/index.d.ts + banner    | `positionId: number` type lie; underlying value is a UUID string   |
| 9   | P2       | preload/index.d.ts + IPC       | `runDetectionNow` declared payload doesn't match handler return    |
| 10  | P3       | AssignmentNotificationBanner   | No UI feedback when confirm/dismiss returns `ok: false`            |
| 11  | P3       | AssignmentNotificationBanner   | Arbitrary `px-[24px] py-[12px]` instead of Tailwind scale / tokens |
| 12  | P3       | ipc/assignments.ts             | `dismissedAt` returned by IPC drifts from stored row on no-op      |
| 13  | P3       | polling-scheduler.ts           | `stop()` leaks an uncleared 5s setTimeout when drain wins          |
| 14  | P3       | ipc/assignments.ts             | Duplicated error-envelope mapping between confirm + dismiss        |
| 15  | P3       | services/scheduler-instance.ts | Module-load side effect; lazy factory would be testable            |

---

## Area A — Detection service correctness (P1)

**Files:** `src/main/services/detect-assignments.ts`, `src/main/services/detect-assignments.test.ts`

### A1. Fix watermark race (#1)

- **Red:** Add a test that mocks `getActivities` to return AFTER an artificial delay during which the test injects an activity whose `transactionTime` is between poll-start and poll-end. After the poll completes, the stored watermark must be `<= pollStart`, not `now()`. (Use `vi.useFakeTimers()` + `vi.setSystemTime()` to control wall clock.)
- **Green:** Capture `const pollStartedAt = new Date().toISOString()` **before** `await brokerProvider.getActivities(...)`. Use `pollStartedAt` (not `new Date().toISOString()`) when writing `app_settings`. Inside the same transaction, optionally also compute `max(transaction_time)` from the returned batch and persist the larger of the two — but `pollStartedAt` alone is sufficient and safer (it includes anything that arrived during the gap on the next poll).
- **Refactor:** Pull the watermark key + timestamp logic into a small helper so the rule "stamp the start, not the finish" is self-documenting.

### A2. Handle multiple CSPs with the same OCC symbol (#2)

- **Red:** Add a test: seed two `CSP_OPEN` positions on AAPL 2026-01-19 $180 PUT (same ticker/strike/exp/type). Feed one OPASN activity for that symbol. Assert **two** `pending_assignments` rows are written (one per matching open leg). Also assert each row references the correct `position_id` + `leg_id` pair.
- **Green:** Change `buildOpenLegMap` to build `Map<string, OpenLegMatch[]>`. Iterate matches when an activity hits and insert one `pending_assignments` row per match. The schema also needs to allow the same `activity_id` against different `position_id`s — edit migration 006 in place (product not yet released, no data to preserve) to drop the column-level `UNIQUE` on `activity_id` and add a compound `UNIQUE(activity_id, position_id)` index instead.
- **Refactor:** Rename `matchActivityToLeg` → `matchActivityToLegs` (plural) to reflect the new return type. Update the JSDoc on the SQL constant to call out the multi-match invariant.

**Schema change — edit `migrations/006_create_pending_assignments.sql` in place:**

```sql
-- BEFORE:  activity_id TEXT NOT NULL UNIQUE,
-- AFTER:   activity_id TEXT NOT NULL,
--
-- Plus add at the bottom:
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_assignments_activity_position
  ON pending_assignments(activity_id, position_id);
```

Devs with an existing local sqlite db need to delete it (or migrate by hand) — there is no upgrade path because nothing has shipped.

---

## Area B — Pending-assignments service guard (P2)

**Files:** `src/main/services/pending-assignments.ts`, `src/main/services/pending-assignments.test.ts`

### B1. Block dismiss of non-pending rows (#7)

- **Red:** Add a test: seed a `confirmed` pending row, call `dismissPending`, assert it throws `PendingAssignmentError('NOT_PENDING')` and the row is unchanged (status still `confirmed`, `dismissed_at` still null).
- **Green:** Replace the guard `if (!row || row.status === 'dismissed') return` with:
  - `!row` → throw `PendingAssignmentError('NOT_FOUND', ...)`
  - `row.status === 'dismissed'` → no-op return (preserves existing idempotency contract)
  - `row.status !== 'pending'` → throw `PendingAssignmentError('NOT_PENDING', ...)`
- **Refactor:** Extract a shared `assertStatusFor(action, row)` helper used by both `confirmPending` and `dismissPending` so the state machine is in one place.

### B2. Update IPC to map the new error (corollary)

- **Green:** No code change needed — `ipc/assignments.ts` already routes `PendingAssignmentError` to the envelope via `pendingAssignmentErrorResponse`. But add an integration-style test that the dismiss IPC returns `{ ok: false, code: 'NOT_PENDING' }` for a confirmed row.

---

## Area C — Banner correctness + AC compliance (P1, P2, P3)

**Files:** `src/renderer/src/components/AssignmentNotificationBanner.tsx`, `src/renderer/src/components/AssignmentNotificationBanner.test.tsx`

### C1. Banner sentence matches AC (#4)

- **Red:** Update the test "renders ticker, strike, contract type, and transaction date" to also assert the literal string `Assignment detected: AAPL $180 PUT was assigned on Apr 19. Confirm to update position.` (or the equivalent formatted form). Format the date as "MMM D" from the ISO `transactionTime`.
- **Green:** Build the message in one place: `Assignment detected: {ticker} ${strike} {CONTRACT_TYPE} was assigned on {MMM D}. Confirm to update position.` Use `Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })` — no new dep. Keep the structured layout for accessibility (heading + actions), but the visible text must include the AC sentence.
- **Refactor:** Extract the message into a pure helper `formatPendingAssignmentBannerText(assignment)` so the test reads from a single source.

### C2. Success message matches AC (#5)

- **Red:** Update the confirm-flow test to assert the literal `AAPL assigned — now holding 100 shares at $180 strike` after confirmation. The component must surface ticker, share count (`qty * 100` from the option contract), and strike.
- **Green:** Replace the plain `Assignment confirmed` text with the AC-formatted string. Pull the data from the `confirmed.assignment` already in state (ticker, strike) plus `qty * 100` from the same assignment object. Keep the `Open covered call →` link.
- **Refactor:** Extract `formatConfirmedAssignmentText(assignment)` mirroring C1.

### C3. Invalidate the right query keys (#6)

- **Red:** Add a test that asserts `mockInvalidateQueries` is called with `positionQueryKeys.all` (`['positions']`) on confirm success — not `['positions', 'list']`.
- **Green:** Import `positionQueryKeys` from `../hooks/positionQueryKeys`. Replace:
  - `invalidateQueries({ queryKey: ['positions', 'list'] })` → `invalidateQueries({ queryKey: positionQueryKeys.all })`
  - `invalidateQueries({ queryKey: ['positions', String(positionId)] })` → `invalidateQueries({ queryKey: positionQueryKeys.detail(positionId) })`
- **Refactor:** None — this aligns with the pattern used by `useAssignPosition.ts` and `useOpenCoveredCall.ts`.

### C4. Surface IPC errors to the user (#10)

- **Red:** Add a test: `mockConfirm.mockResolvedValue({ ok: false, code: 'NOT_PENDING', errors: [...] })`. Click Confirm. Assert an error message is shown to the trader (the banner stays visible and an error string appears).
- **Green:** Track `errorByAssignment` state (`Record<number, string>`). On `result.ok === false`, store the friendly message and render it inside the same `AlertBox` (variant="warning" stays, plus an inline error line). On retry click, clear the entry.
- **Refactor:** Co-locate the error string lookup: `confirmErrorMessage(code)` mapping `NOT_PENDING` / `NOT_FOUND` / generic to user-readable text.

### C5. Replace arbitrary spacing with design tokens (#11)

- **Green:** `px-[24px] py-[12px]` → `px-6 py-3`. No test change required — visual.
- **Refactor:** None — single-line cleanup.

---

## Area D — Position row pulsing amber indicator (P1)

**Files:** `src/renderer/src/pages/PositionsListPage.tsx`, `src/renderer/src/pages/PositionsListPage.test.tsx`, and possibly a row component.

### D1. Show a pulsing amber indicator on rows with a pending assignment (#3)

- **Red:** Add a test that renders `PositionsListPage` with one position whose id appears in the pending-assignments query result. Assert the corresponding row has an element with `data-testid="pending-assignment-indicator"` carrying the `animate-wb-pulse` class (and an amber color class — `text-wb-gold` or `bg-wb-gold/20`, whichever your design tokens supply).
- **Green:**
  1. In `PositionsListPage`, compute `pendingPositionIds = new Set(pendingAssignments.map(a => a.positionId))` from the same `usePendingAssignments()` hook the banner uses (lifted up via context or read independently — query cache means a second call is free).
  2. For each rendered row, if `pendingPositionIds.has(position.id)`, render a small dot element: `<span data-testid="pending-assignment-indicator" className="inline-block w-2 h-2 rounded-full bg-wb-gold animate-wb-pulse" aria-label="Assignment pending" />` adjacent to the ticker cell.
- **Refactor:** Extract `<PendingAssignmentIndicator />` as a tiny stateless component if the indicator is needed elsewhere (detail page is mentioned in the story as a follow-on — keep extraction local for now unless reuse appears in this PR).

---

## Area E — Type contract honesty (P2)

**Files:** `src/preload/index.d.ts`, `src/renderer/src/components/AssignmentNotificationBanner.tsx`

### E1. `positionId` is a string (#8)

- **Red:** Compile-time: change the test fixture `positionId: 42` (number) to `positionId: 'pos-1'` (string) in `AssignmentNotificationBanner.test.tsx`. The test should fail typecheck before code is updated.
- **Green:**
  - `PendingAssignmentNotification.positionId`: `number` → `string`
  - `assignments.confirm` result: `position: { id: number; ... }` → `position: { id: string; ... }`
  - `AssignmentNotificationBanner.tsx`: `ConfirmedState.positionId`: `number` → `string`; `handleConfirm` parameter same.
  - Remove the unnecessary `String(positionId)` coercion in the queryKey (after C3, this becomes `positionQueryKeys.detail(positionId)` which already takes a string).
- **Refactor:** None.

### E2. `runDetectionNow` payload matches handler (#9)

- **Red:** Update the IPC test to capture the return value of the `assignments:run-detection-now` handler and assert it includes `detected`, `skipped`, and `durationMs` numeric fields.
- **Green:** In `ipc/assignments.ts`, change the handler to time the call and return the data:
  ```ts
  ipcMain.handle('assignments:run-detection-now', () =>
    handleIpcCall('assignments_run_detection_now_error', async () => {
      const start = Date.now()
      await scheduler.runNow(DETECT_ASSIGNMENTS_JOB_NAME)
      return { detected: 0, skipped: 0, durationMs: Date.now() - start }
    })
  )
  ```
  Better: change `scheduler.runNow` to return the handler's result, or have `detectAssignments` write to a "last run summary" in `app_settings` that the IPC reads. Simplest: bypass the scheduler for the IPC and call `detectAssignments` directly (the scheduler's `runNow` is still used by the cadence loop). The bypass approach trades one indirection for honest return values.
- **Refactor:** Choose one of: (a) shrink the d.ts to `{ ok: true }` if the renderer never reads the fields, or (b) wire the real numbers through. The story's e2e tests check `result.ok` only — option (a) is the minimum that removes the type lie; option (b) is the honest fix and enables future UI affordances ("Detected 2 new assignments"). Recommend (b).

---

## Area F — Polling scheduler hygiene (P3)

**Files:** `src/main/services/polling-scheduler.ts`, `src/main/services/polling-scheduler.test.ts`

### F1. Clean up the drain-timeout timer (#13)

- **Red:** Add a test that resolves the in-flight handler immediately, then asserts no timer is pending (`vi.getTimerCount() === 0`) after `stop()` resolves.
- **Green:** Capture the timer id from `clock.setTimeout(resolve, 5_000)` in a variable. After `Promise.race([drainPromise, timeoutPromise])` resolves, `clock.clearTimeout(timerId)` to clean up the loser. Easiest pattern:
  ```ts
  let drainTimeoutId: TimerId | null = null
  const timeoutPromise = new Promise<void>((resolve) => {
    drainTimeoutId = clock.setTimeout(resolve, 5_000)
  })
  return Promise.race([drainPromise, timeoutPromise]).finally(() => {
    if (drainTimeoutId !== null) clock.clearTimeout(drainTimeoutId)
  })
  ```
- **Refactor:** None.

---

## Area G — IPC handler cleanup (P3)

**Files:** `src/main/ipc/assignments.ts`, `src/main/ipc/assignments.test.ts`

### G1. `dismissedAt` reflects the stored value (#12)

- **Red:** Test: pre-dismiss a row, set `dismissed_at` to a known timestamp, call IPC, assert the returned `dismissedAt` equals the stored value (not a fresh `now()`).
- **Green:** Have `dismissPending` return `{ dismissedAt: string }` from the row (existing or just-written). IPC propagates that string.
- **Refactor:** None.

### G2. Share the typed-error mapping (#14)

- **Refactor:** Extract:
  ```ts
  function mapKnownIpcError(err: unknown): IpcErrorEnvelope | null {
    if (err instanceof PendingAssignmentError) return pendingAssignmentErrorResponse(err)
    return null
  }
  ```
  and use it inside `handleIpcCall` (or a thin wrapper around it) so confirm and dismiss collapse to one-liners. Don't merge this with C/E work — refactor lands after the bugs are fixed.

---

## Area H — Scheduler bootstrap testability (P3)

**Files:** `src/main/services/scheduler-instance.ts`, `src/main/index.ts`, `src/main/index.test.ts`

### H1. Lazy scheduler factory (#15)

- **Refactor:** Replace `export const scheduler = createPollingScheduler(getSafeBroker())` with a memoized getter:
  ```ts
  let cached: PollingScheduler | null = null
  export function getScheduler(): PollingScheduler {
    if (!cached) cached = createPollingScheduler(getSafeBroker())
    return cached
  }
  export function resetSchedulerForTests(): void {
    cached = null
  }
  ```
- Update `index.ts` to call `getScheduler()` at the point of use. Update existing tests that import `scheduler` directly. No behavior change in production; better test ergonomics.

---

## Suggested execution order

Group tasks into 2–3 PRs so review stays tractable:

**PR 1 — P1 correctness** (Areas A + B + D)

- Watermark race (A1)
- Multi-CSP collision + migration (A2)
- Pending row dismiss guard (B1, B2)
- Pulsing amber row indicator (D1)

**PR 2 — P1/P2 banner + UX + types** (Area C + E)

- Banner copy AC fixes (C1, C2)
- Query key fix (C3)
- Error UI (C4)
- Design token fix (C5)
- Type honesty (E1, E2)

**PR 3 — P3 cleanup** (Areas F + G + H)

- Scheduler timer cleanup (F1)
- dismissedAt consistency (G1)
- Shared error mapper (G2)
- Lazy scheduler factory (H1)

Each PR ends with the standard checklist: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format`, and a manual `pnpm dev` smoke through the assignment confirm flow.

---

## Out of scope (deliberately deferred)

- Multi-account CSP modeling (a position's `account_id` would disambiguate, but the schema today doesn't index by account — out of scope for US-35, file a follow-on).
- Assignment indicator on the position **detail** page — explicitly deferred per story's "Out of Scope" list.
- Bulk confirm/dismiss — deferred per story.
- The pre-existing Alpaca `getActivities` parameter name (`date` vs `after`) — pre-existing US-40 issue, not in the US-35 diff.
