---
story: us-59
kind: feature
parent: null
topics: [alerts]
status: planned
---

# Implementation Plan: US-59 — Dismiss an alert with a record of the dismissal

## Summary

Adds a `Dismiss` action to open management-queue alerts. Dismissing an alert
transitions it to `status = 'dismissed'` with a `dismissed_at` timestamp,
removes it from the open queue, and — critically — makes the evaluation job's
upsert logic dismissal-aware so a still-true condition doesn't silently
re-open it on the next tick. When the underlying condition genuinely clears,
the dismissed row is retired to `resolved`; if the condition later returns, a
brand-new open row is created with a fresh `triggered_at`, exactly like the
existing resolve→refire lifecycle. Done state: a trader can click Dismiss,
confirm, watch the row disappear from the queue, and trust it stays gone until
the condition clears and comes back.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/07-stories/US-59-dismiss-alert.md`
- **Mockup:** `mockups/us-59-dismiss-alert.mdx`
- **Research & Design Decisions:** `plans/us-59/research.md`
- **Data Model & State Transitions:** `plans/us-59/data-model.md`
- **API Contract:** `plans/us-59/contracts/alerts-dismiss.md`
- **Quickstart & Verification:** `plans/us-59/quickstart.md`

## Prerequisites

Already done — this story builds directly on top of:

- US-50's `alerts` table, `upsertOpenAlert` / `resolveAlertsNotIn` persist-phase
  transaction in `evaluate-alerts.ts`, and the `alert-compute-then-persist` /
  `alerts-partial-unique-open` ADRs.
- US-51's `listManagementQueue` read path and `ManagementQueue` /
  `ManagementQueueRow` renderer components.
- The `pending_assignments` dismiss pattern (`src/main/services/pending-assignments.ts`)
  as the precedent for "dismissed but retained in SQLite," per the story's
  technical notes.

## Implementation Areas

### 1. Schema — `dismissed_at` column and partial unique index

**Files to create or modify:**

- `migrations/011_add_alerts_dismissal.sql` — new migration
- `src/main/schemas.ts` — `AlertRecord.dismissedAt: string | null`;
  `DismissAlertPayloadSchema`
- `src/main/services/alerts.ts` — `AlertRow` interface gains `dismissed_at`;
  `mapAlertRow` maps it to `dismissedAt`

**Red — tests to write:**

- In `src/main/services/alerts.test.ts`, extend the existing `describe('alerts schema', ...)`
  block:
  - `'accepts a dismissed row with a dismissed_at timestamp'` — raw insert with
    `status: 'dismissed'` and a `dismissed_at` value succeeds and round-trips.
  - `'rejects a second dismissed row for the same (position_id, rule_code) via the partial unique index'`
    — mirrors the existing open-index test at line 68, using
    `rawInsertAlert(..., { status: 'dismissed' })` twice for the same key and
    asserting the second insert throws.
  - `'allows an open, a resolved, and a dismissed historical row for the same (position_id, rule_code)'`
    — extends the existing "allows an open and a resolved row" test (line 75) to
    include a third, already-cleared `dismissed` row (i.e. one whose lifetime has
    ended — insert it directly with both `dismissed_at` and a later
    `resolved_at`/status `resolved`, since only one _currently_ `dismissed` row
    can exist at once per the new unique index).

**Green — implementation:**

- Migration `011_add_alerts_dismissal.sql`:

  ```sql
  ALTER TABLE alerts ADD COLUMN dismissed_at TEXT;

  CREATE UNIQUE INDEX idx_alerts_dismissed_unique
    ON alerts (position_id, rule_code) WHERE status = 'dismissed';
  ```

- `AlertRecord` in `src/main/schemas.ts` gains `dismissedAt: string | null`
  (positioned next to `resolvedAt`, per `data-model.md`).
- `DismissAlertPayloadSchema = z.object({ alertId: z.string().min(1) })` added to
  `src/main/schemas.ts` alongside the existing `DismissAssignmentPayloadSchema`.
- `mapAlertRow` in `src/main/services/alerts.ts` reads `row.dismissed_at` into
  `dismissedAt`.

**Refactor — cleanup to consider:**

- Check for naming consistency with `resolved_at`/`resolvedAt` — `dismissed_at`/
  `dismissedAt` should read as an obvious sibling, not a special case.

**Acceptance criteria covered:**

- Supports "the alert stores a dismissed_at timestamp" (Scenario 1) at the
  schema level.

---

### 2. Service layer — `dismissAlert`, dismissal-aware upsert, `clearStaleDismissals`

**Files to create or modify:**

- `src/main/services/alerts.ts` — `AlertError` class, `dismissAlert`,
  `upsertOpenAlert` guard, `clearStaleDismissals`

**Red — tests to write:**

- New `describe('dismissAlert', ...)` block in `src/main/services/alerts.test.ts`:
  - `'transitions an open alert to dismissed with a dismissed_at timestamp'` —
    seed an open alert (reuse `upsertOpenAlert` or `rawInsertAlert`), call
    `dismissAlert`, assert `status === 'dismissed'`, `dismissedAt` set,
    `updatedAt` advanced, `triggeredAt` unchanged.
  - `'throws AlertError NOT_FOUND for an unknown alertId'`.
  - `'throws AlertError NOT_OPEN with message "Only open alerts can be dismissed" when the alert is resolved'`
    — seed a `resolved` row, assert the throw and exact message (Scenario 4).
  - `'throws AlertError NOT_OPEN when the alert is already dismissed'` — seed a
    `dismissed` row, same assertion.
- Extend `describe('upsertOpenAlert', ...)`:
  - `'returns "suppressed" and does not insert or update when a dismissed row exists for the same (position_id, rule_code)'`
    — seed a dismissed row, call `upsertOpenAlert` with a matching key, assert
    the dismissed row is untouched (no new open row, dismissed row's fields
    unchanged) and the return value is `'suppressed'`.
  - `'still inserts a new open row when only a resolved row exists for the key'`
    (regression guard — proves the dismissed-only guard doesn't overreach into
    the existing resolved→refire path).
- New `describe('clearStaleDismissals', ...)` block:
  - `'transitions a dismissed row to resolved when its key is absent from keepOpenKeys'`
    — seed a dismissed row, call with an empty/unrelated `keepOpenKeys` set,
    assert `status === 'resolved'`, `resolvedAt` set, `dismissedAt` preserved.
  - `'leaves a dismissed row untouched when its key is present in keepOpenKeys'`
    — mirrors the "leaves matched ones open" case in the existing
    `resolveAlertsNotIn` test (line 159) but for dismissed rows.
  - `'ignores already-resolved and already-open rows'` — only rows with
    `status = 'dismissed'` are candidates.

**Green — implementation:**

- `AlertError` class in `src/main/services/alerts.ts`, mirroring
  `PendingAssignmentError` exactly (`code: 'NOT_FOUND' | 'NOT_OPEN'`).
- `dismissAlert(db: Database.Database, alertId: string, now: string): AlertRecord`:
  select the row by `id`; throw `NOT_FOUND` if absent; throw `NOT_OPEN` with
  message `Only open alerts can be dismissed` if `status !== 'open'`; otherwise
  `UPDATE alerts SET status = 'dismissed', dismissed_at = ?, updated_at = ? WHERE id = ?`
  and return the mapped `AlertRecord`. Log `alert_dismissed` at INFO (business
  event, per the logging standard).
- `upsertOpenAlert`: before the existing `status = 'open'` lookup, add
  `SELECT id FROM alerts WHERE position_id = ? AND rule_code = ? AND status = 'dismissed'`;
  if found, log `alert_dismissal_suppressed_reopen` at DEBUG and return
  `'suppressed'` without touching the row. `UpsertOutcome` type widens to
  `'inserted' | 'updated' | 'suppressed'`.
- `clearStaleDismissals(db: Database.Database, keepOpenKeys: Set<string>, now: string): number` —
  same shape as `resolveAlertsNotIn` (per `data-model.md`'s state-transition
  table) but filters `WHERE status = 'dismissed'` and transitions matches to
  `status = 'resolved', resolved_at = ?`. Returns count transitioned.

**Refactor — cleanup to consider:**

- `dismissAlert`'s row-fetch and `upsertOpenAlert`'s dismissed-row-lookup are
  both single-column selects keyed differently (`id` vs.
  `position_id + rule_code`) — leave as two distinct prepared statements, don't
  force a shared helper for two different keys.
- Check `resolveAlertsNotIn` and `clearStaleDismissals` for duplicated SQL shape
  (`UPDATE ... SET status = ?, <ts column> = ?, updated_at = ? WHERE id = ?`) —
  if a small shared helper reads cleanly without hiding the status-specific
  column name, extract it; otherwise leave the two functions as parallel,
  independently-readable siblings (matches the existing file's style of small,
  single-purpose functions).

**Acceptance criteria covered:**

- "the alert status changes to dismissed" / "stores a dismissed_at timestamp"
  (Scenario 1)
- "the dismissed alert remains hidden ... no new MANAGEMENT_WINDOW alert is
  created" (Scenario 2, via the `upsertOpenAlert` suppression)
- "a new MANAGEMENT_WINDOW alert is created ... with a new triggered_at"
  (Scenario 3, via `clearStaleDismissals` freeing the key)
- "dismissing an already resolved alert is rejected" (Scenario 4)

---

### 3. Evaluation job — wire `clearStaleDismissals` into the persist transaction

**Files to create or modify:**

- `src/main/services/evaluate-alerts.ts`

**Red — tests to write:**

- In `src/main/services/evaluate-alerts.test.ts`, new cases alongside the
  existing `evaluateAlerts` describe block:
  - `'keeps a dismissed MANAGEMENT_WINDOW alert hidden across a re-run where the position is still inside the window'`
    — seed a CSP at 12 DTE, run `evaluateAlerts`, dismiss the resulting alert
    directly via `dismissAlert`, run `evaluateAlerts` again with the same DTE,
    assert `listManagementQueue`/`listOpenAlerts` still excludes it and no
    second alert row was inserted for the key (Scenario 2).
  - `'re-opens a dismissed MANAGEMENT_WINDOW alert with a new triggered_at after the position leaves and re-enters the window'`
    — seed at 12 DTE, run, dismiss, then move the leg to 30 DTE (rolled — outside
    the window) and run again (asserts the dismissed row transitions to
    `resolved` and stays out of the open queue), then move the leg back to 14
    DTE and run a third time — assert a new open row exists with a
    `triggered_at` later than the original (Scenario 3).
  - `'still resolves an open (non-dismissed) alert when its condition clears, unaffected by clearStaleDismissals'`
    — regression guard that the new step doesn't interfere with the existing
    `resolveAlertsNotIn` path.

**Green — implementation:**

- Inside the `db.transaction(() => { ... })` block in `evaluateAlerts`, after
  `resolvedCount = resolveAlertsNotIn(db, keepOpenKeys, nowIso)`, add
  `clearStaleDismissals(db, keepOpenKeys, nowIso)` using the same
  `keepOpenKeys` set (no separate computation — the "was this rule genuinely
  evaluated and did it not match" question is identical for open and dismissed
  rows, per `research.md`'s ADR).
- No change to `upsertOpenAlert`'s call site — its new `'suppressed'` outcome is
  simply not counted toward `createdCount`/`updatedCount` (matches the existing
  `if (... === 'inserted') createdCount++ else updatedCount++` — this needs a
  small tweak: only increment `updatedCount` when the outcome is `'updated'`,
  not on `'suppressed'`).

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency between `resolveAlertsNotIn` and
  `clearStaleDismissals` call sites in the transaction body.

**Acceptance criteria covered:**

- Scenario 2 and Scenario 3, exercised through the full `evaluateAlerts`
  orchestration rather than the isolated service functions from Area 2.

---

### 4. IPC — `alerts:dismiss` handler and error mapping

**Files to create or modify:**

- `src/main/ipc/alerts.ts` — `alerts:dismiss` handler
- `src/main/ipc/utils.ts` — `AlertError` branch in `handleIpcCall`

**Red — tests to write:**

- In `src/main/ipc/alerts.test.ts`:
  - `'alerts:dismiss returns the dismissed alert on success'` — seed an open
    alert, invoke the handler, assert `{ ok: true, alert: { status: 'dismissed', dismissedAt: ... } }`.
  - `'alerts:dismiss returns a NOT_FOUND error envelope for an unknown alertId'`.
  - `'alerts:dismiss returns a NOT_OPEN error envelope with "Only open alerts can be dismissed" for a resolved alert'`.
  - `'alerts:dismiss rejects a payload missing alertId via ZodError mapping'`.

**Green — implementation:**

- `src/main/ipc/utils.ts`: import `AlertError` from `../services/alerts`; add
  ```typescript
  if (err instanceof AlertError) {
    return {
      ok: false,
      code: err.code,
      errors: [{ field: '__root__', code: err.code, message: err.message }]
    }
  }
  ```
  placed alongside the existing `PendingAssignmentError` branch.
- `src/main/ipc/alerts.ts`: add
  ```typescript
  ipcMain.handle('alerts:dismiss', (_, payload: unknown) =>
    handleIpcCall('alerts_dismiss_error', () => {
      const { alertId } = DismissAlertPayloadSchema.parse(payload)
      return { alert: dismissAlert(db, alertId, new Date().toISOString()) }
    })
  )
  ```
  per `contracts/alerts-dismiss.md`.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency with the `assignments:dismiss`
  handler in `src/main/ipc/assignments.ts` — same shape, deliberately.

**Acceptance criteria covered:**

- All four scenarios, at the IPC boundary.

---

### 5. Preload + renderer API adapter

**Files to create or modify:**

- `src/preload/index.ts` — `alerts.dismiss`
- `src/renderer/src/api/alerts.ts` — `dismissAlert`
- `src/main/preload.d.ts` (or wherever the `window.api` type surface lives —
  match whatever file currently types `window.api.alerts.list`)

**Red — tests to write:**

- In `src/renderer/src/api/alerts.test.ts`:
  - `'dismissAlert resolves with the dismissed alert on success'` — mock
    `window.api.alerts.dismiss` to resolve `{ ok: true, alert: {...} }`.
  - `'dismissAlert throws a mapped ApiError with the NOT_OPEN message on rejection'`
    — mock a `{ ok: false, errors: [...] }` response, assert the thrown
    `ApiError` carries the `Only open alerts can be dismissed` message (same
    `throwMappedIpcErrors` pattern as `saveAlertOverrides`).

**Green — implementation:**

- `src/preload/index.ts`: `alerts: { list: () => invoke('alerts:list'), dismiss: (payload: { alertId: string }) => invoke('alerts:dismiss', payload) }`.
- `src/renderer/src/api/alerts.ts`:
  ```typescript
  export async function dismissAlert(alertId: string): Promise<AlertRecord> {
    const result = await window.api.alerts.dismiss({ alertId })
    if (!result.ok) throwMappedIpcErrors(result.errors)
    return result.alert
  }
  ```
  (reuse or re-export the existing `throwMappedIpcErrors`/error-mapping helper
  from `api/positions.ts` if it isn't already shared — check before
  duplicating).

**Refactor — cleanup to consider:**

- If `throwMappedIpcErrors` only lives in `api/positions.ts` today, decide
  whether to import it or promote it into `api/error.ts` alongside `apiError`
  — prefer promoting since two adapters now need it, avoiding duplication.

**Acceptance criteria covered:**

- Plumbing for all four scenarios, at the renderer/IPC boundary.

---

### 6. Renderer UI — Dismiss button, inline confirm panel, queue wiring

**Files to create or modify:**

- `src/renderer/src/components/ManagementQueueRow.tsx` — Dismiss button
- `src/renderer/src/components/ManagementQueue.tsx` — confirm-state wiring
- `src/renderer/src/components/DismissConfirmPanel.tsx` — new component
- `src/renderer/src/hooks/useDismissAlert.ts` — new mutation hook

**Mockup reference (`mockups/us-59-dismiss-alert.mdx`):**

The mockup names three states — `open`, `confirm`, `dismissed` — and two
panels: the existing "Management Queue" panel and a new "Confirm Dismissal"
panel that appears only in the `confirm` state. Implement exactly this
two-panel interaction, not a modal/dialog overlay:

- **`open` state (existing `ManagementQueueRow`):** add a `Dismiss` button next
  to the existing `quickAction` button, styled with the mockup's danger
  treatment — border/background/text in the `wb-red` family (matching
  `ErrorAlert`'s `bg-wb-red-dim text-wb-red` tokens), not the gold
  `quickAction` styling.
- **`confirm` state:** clicking `Dismiss` does not call the mutation directly.
  It puts that row's `alertId` into `ManagementQueue`'s local
  `confirmingAlertId` state, which renders a second panel — `DismissConfirmPanel` —
  directly below the queue list (matching the mockup's stacked "Management
  Queue" + "Confirm Dismissal" panels, not an inline expansion of the row).
  `DismissConfirmPanel` shows:
  - Heading: `Hide this alert until the condition clears?`
  - Body (genericized from the mockup's AAPL/21-DTE-specific copy so it reads
    correctly for any rule code, per `research.md`'s scope note): `{ticker} will disappear from the open queue, but the dismissal will be recorded with a timestamp. If the condition clears and later returns, a fresh alert can appear.`
  - Two buttons: `Confirm dismiss` (destructive style, solid `wb-red`
    background per the mockup's `#f85149`/white-text treatment) and
    `Keep alert open` (ghost/secondary style per the mockup's transparent
    background + muted border).
- **`dismissed` state:** no new component needed — once the mutation succeeds,
  `listManagementQueue` naturally excludes the row (US-51's existing read path
  already filters `status = 'open'`), so the row disappears and, if it was the
  last item, the existing "No positions need attention right now" empty state
  in `ManagementQueue.tsx` (line 21-26) takes over unchanged — this matches the
  mockup's `dismissed` panel copy in spirit ("queue stays quiet until ...
  clears and later returns") without duplicating a second empty-state string.

**Red — tests to write:**

- `ManagementQueueRow.test.tsx`:
  - `'renders a Dismiss button alongside the quick action'`.
  - `'clicking Dismiss calls onDismissClick with the item's alertId, not the mutation directly'`
    (proves the confirm gate — no direct IPC call from the row).
- `ManagementQueue.test.tsx`:
  - `'shows the Confirm Dismissal panel with the generic condition-clears copy when a row's Dismiss is clicked'`.
  - `'clicking "Keep alert open" hides the confirm panel without calling dismissAlert'`.
  - `'clicking "Confirm dismiss" calls dismissAlert with the alertId and hides the panel on success'`.
  - `'shows an inline ErrorAlert with the server message and keeps the row visible when dismissAlert rejects (e.g. NOT_OPEN)'`
    (covers Scenario 4 reachable via a race: the eval job resolves the alert
    between page load and the trader's confirm click).
- `useDismissAlert.test.ts` (mirrors `useSaveAlertOverrides.test.ts`):
  - `'invalidates the ["alerts","queue"] query on success'`.

**Green — implementation:**

- `useDismissAlert.ts`: `useMutation` wrapping `dismissAlert` from `api/alerts.ts`;
  `onSuccess` invalidates `['alerts', 'queue']` (the exact query key
  `useManagementQueue` uses).
- `ManagementQueueRow.tsx`: accepts a new `onDismissClick: (alertId: string) => void`
  prop; renders the Dismiss button calling it — no mutation import in this file.
- `ManagementQueue.tsx`: owns `confirmingAlertId` state and the `useDismissAlert()`
  mutation; passes `onDismissClick` down to each row; renders
  `<DismissConfirmPanel item={...} onConfirm={...} onCancel={...} error={mutation.error} />`
  when `confirmingAlertId` matches a currently-listed item.
- `DismissConfirmPanel.tsx`: presentational component per the mockup copy above,
  using the existing `SectionCard` wrapper (same as `ManagementQueue`'s own
  panel) for visual consistency, and `ErrorAlert` for the rejection case.

**Refactor — cleanup to consider:**

- Check `ManagementQueueRow`'s grid layout (`grid-cols-[96px_110px_1fr_160px]`)
  still fits with a second button — may need a wrapping flex container for the
  two action buttons in the last column rather than widening the grid.
- Reduces duplication: confirm that `DismissConfirmPanel`'s button styling
  reuses whatever shared button classes/tokens already exist rather than
  hand-rolling new ones.

**Acceptance criteria covered:**

- "the alert no longer appears in the open management queue" (Scenario 1, via
  the query invalidation + existing US-51 filter)
- The confirm interaction is UI/UX scaffolding around Scenario 1 mandated by
  the mockup, not a separate AC.

---

### 7. E2e Tests

**Files to create or modify:**

- `e2e/dismiss-alert.spec.ts` — new spec, one test per AC scenario
- `e2e/alert-helpers.ts` — extend `AlertRow` with `dismissed_at`; add a
  `dismissAlertViaQueue(page, ticker)` helper (click Dismiss → click Confirm
  dismiss) if the existing helpers don't already cover UI interaction (they
  currently only drive `runAlertEvaluation` and read rows directly)

**Red — tests to write** (each maps to exactly one Gherkin scenario in
`docs/epics/07-stories/US-59-dismiss-alert.md`):

- `'trader dismisses an alert from the queue'` (Scenario 1) — seed AAPL at 12
  DTE, run evaluation, go to positions list, click Dismiss on the AAPL row,
  click Confirm dismiss, assert the row disappears from `QUEUE_ROW` and
  `readAlertRows(dbPath)` shows the row with `status: 'dismissed'` and a
  non-null `dismissed_at`.
- `'dismissed alert does not immediately reappear while the condition is unchanged'`
  (Scenario 2) — continue from a dismissed AAPL at 12 DTE, run
  `runAlertEvaluation` again with the leg still at 12 DTE (`setActiveLegExpiration`
  unchanged), assert the queue still shows no AAPL row and
  `readAlertRows(dbPath)` contains exactly one row for the
  `(AAPL, MANAGEMENT_WINDOW)` key (no duplicate insert).
- `'dismissed alert can reappear after the condition clears and later returns'`
  (Scenario 3) — from a dismissed AAPL alert, use `setActiveLegExpiration` to
  move it to 30 DTE and run evaluation (condition clears — assert the dismissed
  row transitions to `resolved` in the DB and the queue stays empty for AAPL),
  then move the expiration back to 14 DTE and run evaluation again — assert a
  new row appears in the queue for AAPL and its `triggered_at` in
  `readAlertRows(dbPath)` is strictly later than the original dismissed row's
  `triggered_at`.
- `'dismissing an already resolved alert is rejected'` (Scenario 4) — seed and
  resolve an alert (close the position's leg so `evaluateAlerts` resolves it,
  mirroring the existing `'resolves the open expiration-imminent alert when the
short leg is closed before the next evaluation'` pattern in
  `evaluate-alerts.test.ts`), then call `window.api.alerts.dismiss({ alertId })`
  directly via `page.evaluate` (the row has no Dismiss button once resolved, so
  this simulates the direct-IPC race the AC describes) and assert the response
  is `{ ok: false, errors: [{ code: 'NOT_OPEN', message: 'Only open alerts can be dismissed' }] }`.

**Green — implementation:**

- No new production code — this area only adds test coverage confirming Areas
  1–6 satisfy every AC end to end.

**Refactor — cleanup to consider:**

- Check `e2e/dismiss-alert.spec.ts` for duplication against
  `e2e/management-queue.spec.ts` and `e2e/expiration-imminent-alert.spec.ts`;
  share helpers via `alert-helpers.ts` rather than re-deriving DB assertions.

**Acceptance criteria covered:**

- All four Gherkin scenarios, verbatim, one e2e test each.
