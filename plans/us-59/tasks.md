# US-59 — Dismiss an alert with a record of the dismissal — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Schema (foundation, no dependencies)

> Start immediately.

### Schema — `dismissed_at` column + partial unique index

- [x] **[Red]** Write failing tests — `src/main/services/alerts.test.ts`
  - Extend `describe('alerts schema', ...)`:
    - `'accepts a dismissed row with a dismissed_at timestamp'`
    - `'rejects a second dismissed row for the same (position_id, rule_code) via the partial unique index'`
    - `'allows an open, a resolved, and a dismissed historical row for the same (position_id, rule_code)'`
  - Run `pnpm test alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `migrations/011_add_alerts_dismissal.sql`, `src/main/schemas.ts`, `src/main/services/alerts.ts` _(depends on: Schema Red ✓)_
  - Migration: `ALTER TABLE alerts ADD COLUMN dismissed_at TEXT;` + `CREATE UNIQUE INDEX idx_alerts_dismissed_unique ON alerts (position_id, rule_code) WHERE status = 'dismissed';`
  - `AlertRecord.dismissedAt: string | null` in `src/main/schemas.ts`, next to `resolvedAt`
  - `DismissAlertPayloadSchema = z.object({ alertId: z.string().min(1) })` in `src/main/schemas.ts`
  - `AlertRow` interface gains `dismissed_at`; `mapAlertRow` maps it to `dismissedAt`
  - Run `pnpm test alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/alerts.ts` _(depends on: Schema Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check `dismissed_at`/`dismissedAt` naming reads as an obvious sibling of `resolved_at`/`resolvedAt`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Service layer (depends on Layer 1)

### Service layer — `dismissAlert`, dismissal-aware upsert, `clearStaleDismissals`

**Requires:** Schema Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/alerts.test.ts` _(depends on: Schema Green ✓)_
  - New `describe('dismissAlert', ...)`:
    - `'transitions an open alert to dismissed with a dismissed_at timestamp'`
    - `'throws AlertError NOT_FOUND for an unknown alertId'`
    - `'throws AlertError NOT_OPEN with message "Only open alerts can be dismissed" when the alert is resolved'`
    - `'throws AlertError NOT_OPEN when the alert is already dismissed'`
  - Extend `describe('upsertOpenAlert', ...)`:
    - `'returns "suppressed" and does not insert or update when a dismissed row exists for the same (position_id, rule_code)'`
    - `'still inserts a new open row when only a resolved row exists for the key'` (regression guard)
  - New `describe('clearStaleDismissals', ...)`:
    - `'transitions a dismissed row to resolved when its key is absent from keepOpenKeys'`
    - `'leaves a dismissed row untouched when its key is present in keepOpenKeys'`
    - `'ignores already-resolved and already-open rows'`
  - Run `pnpm test alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/alerts.ts` _(depends on: Service Layer Red ✓)_
  - `AlertError` class mirroring `PendingAssignmentError` (`code: 'NOT_FOUND' | 'NOT_OPEN'`)
  - `dismissAlert(db, alertId, now): AlertRecord` — NOT_FOUND if absent, NOT_OPEN (`Only open alerts can be dismissed`) if `status !== 'open'`, else `UPDATE ... SET status = 'dismissed', dismissed_at = ?, updated_at = ?`; log `alert_dismissed` at INFO
  - `upsertOpenAlert`: add a dismissed-row lookup before the existing open lookup; on hit, log `alert_dismissal_suppressed_reopen` at DEBUG and return `'suppressed'`; widen `UpsertOutcome` to `'inserted' | 'updated' | 'suppressed'`
  - `clearStaleDismissals(db, keepOpenKeys, now): number` — same shape as `resolveAlertsNotIn` but `WHERE status = 'dismissed'`, transitions to `status = 'resolved', resolved_at = ?`
  - Run `pnpm test alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/alerts.ts` _(depends on: Service Layer Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check for duplication between `resolveAlertsNotIn` and `clearStaleDismissals` — extract a shared helper only if it stays readable, otherwise keep as parallel siblings
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Evaluation job wiring + IPC (depends on Layer 2, parallel with each other)

> Both areas depend only on the Layer 2 service functions and not on each other — dispatch in parallel.

### Evaluation job — wire `clearStaleDismissals` into the persist transaction

**Requires:** Service Layer Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/evaluate-alerts.test.ts` _(depends on: Service Layer Green ✓)_
  - `'keeps a dismissed MANAGEMENT_WINDOW alert hidden across a re-run where the position is still inside the window'`
  - `'re-opens a dismissed MANAGEMENT_WINDOW alert with a new triggered_at after the position leaves and re-enters the window'`
  - `'still resolves an open (non-dismissed) alert when its condition clears, unaffected by clearStaleDismissals'`
  - Run `pnpm test evaluate-alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/evaluate-alerts.ts` _(depends on: Evaluation Job Red ✓)_
  - After `resolvedCount = resolveAlertsNotIn(db, keepOpenKeys, nowIso)`, add `clearStaleDismissals(db, keepOpenKeys, nowIso)` using the same `keepOpenKeys` set
  - Fix the outcome-counting `if` so only `'updated'` increments `updatedCount` (not `'suppressed'`)
  - Run `pnpm test evaluate-alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/evaluate-alerts.ts` _(depends on: Evaluation Job Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### IPC — `alerts:dismiss` handler and error mapping

**Requires:** Service Layer Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/alerts.test.ts` _(depends on: Service Layer Green ✓)_
  - `'alerts:dismiss returns the dismissed alert on success'`
  - `'alerts:dismiss returns a NOT_FOUND error envelope for an unknown alertId'`
  - `'alerts:dismiss returns a NOT_OPEN error envelope with "Only open alerts can be dismissed" for a resolved alert'`
  - `'alerts:dismiss rejects a payload missing alertId via ZodError mapping'`
  - Run `pnpm test ipc/alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/alerts.ts`, `src/main/ipc/utils.ts` _(depends on: IPC Red ✓)_
  - `src/main/ipc/utils.ts`: add `instanceof AlertError` branch to `handleIpcCall`, mirroring the existing `PendingAssignmentError` branch (`{ ok: false, code: err.code, errors: [{ field: '__root__', code: err.code, message: err.message }] }`)
  - `src/main/ipc/alerts.ts`: add `ipcMain.handle('alerts:dismiss', ...)` per `plans/us-59/contracts/alerts-dismiss.md` — Zod-parse `{ alertId }`, call `dismissAlert(db, alertId, new Date().toISOString())`, return `{ alert }`
  - Run `pnpm test ipc/alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/ipc/alerts.ts` _(depends on: IPC Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check consistency with the `assignments:dismiss` handler shape in `src/main/ipc/assignments.ts`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Preload + renderer API adapter (depends on Layer 3)

**Requires:** IPC Green ✓

### Preload + renderer API adapter

- [x] **[Red]** Write failing tests — `src/renderer/src/api/alerts.test.ts` _(depends on: IPC Green ✓)_
  - `'dismissAlert resolves with the dismissed alert on success'`
  - `'dismissAlert throws a mapped ApiError with the NOT_OPEN message on rejection'`
  - Run `pnpm test api/alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/preload/index.ts`, `src/renderer/src/api/alerts.ts` (+ preload type surface) _(depends on: API Adapter Red ✓)_
  - `src/preload/index.ts`: add `alerts.dismiss: (payload: { alertId: string }) => invoke('alerts:dismiss', payload)`
  - `src/renderer/src/api/alerts.ts`: add `dismissAlert(alertId): Promise<AlertRecord>` using `throwMappedIpcErrors` on `!result.ok`
  - Check whether `throwMappedIpcErrors` should be promoted from `api/positions.ts` into `api/error.ts` now that two adapters need it
  - Run `pnpm test api/alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/api/alerts.ts` _(depends on: API Adapter Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Renderer UI (depends on Layer 4)

**Requires:** API Adapter Green ✓

### Renderer UI — Dismiss button, inline confirm panel, queue wiring

- [x] **[Red]** Write failing tests — `src/renderer/src/components/ManagementQueueRow.test.tsx`, `ManagementQueue.test.tsx`, `src/renderer/src/hooks/useDismissAlert.test.ts` _(depends on: API Adapter Green ✓)_
  - `ManagementQueueRow.test.tsx`:
    - `'renders a Dismiss button alongside the quick action'`
    - `'clicking Dismiss calls onDismissClick with the item's alertId, not the mutation directly'`
  - `ManagementQueue.test.tsx`:
    - `'shows the Confirm Dismissal panel with the generic condition-clears copy when a row's Dismiss is clicked'`
    - `'clicking "Keep alert open" hides the confirm panel without calling dismissAlert'`
    - `'clicking "Confirm dismiss" calls dismissAlert with the alertId and hides the panel on success'`
    - `'shows an inline ErrorAlert with the server message and keeps the row visible when dismissAlert rejects (e.g. NOT_OPEN)'`
  - `useDismissAlert.test.ts`:
    - `'invalidates the ["alerts","queue"] query on success'`
  - Run `pnpm test ManagementQueue` — all new tests must fail
- [x] **[Green]** Implement — `ManagementQueueRow.tsx`, `ManagementQueue.tsx`, `DismissConfirmPanel.tsx` (new), `useDismissAlert.ts` (new) _(depends on: Renderer UI Red ✓)_
  - Mockup reference: `mockups/us-59-dismiss-alert.mdx` — `open`/`confirm`/`dismissed` states, stacked "Management Queue" + "Confirm Dismissal" panels (not a modal)
  - `ManagementQueueRow.tsx`: new `onDismissClick: (alertId: string) => void` prop; Dismiss button styled with `wb-red` danger tokens (matching `ErrorAlert`'s `bg-wb-red-dim text-wb-red`), distinct from the gold `quickAction` button
  - `ManagementQueue.tsx`: owns `confirmingAlertId` state + `useDismissAlert()` mutation; passes `onDismissClick` to rows; renders `DismissConfirmPanel` below the queue list when a row is in confirm state
  - `DismissConfirmPanel.tsx`: heading `Hide this alert until the condition clears?`; body `{ticker} will disappear from the open queue, but the dismissal will be recorded with a timestamp. If the condition clears and later returns, a fresh alert can appear.`; `Confirm dismiss` (solid `wb-red`, white text) / `Keep alert open` (ghost) buttons; uses `SectionCard` + `ErrorAlert` for the rejection case
  - `useDismissAlert.ts`: `useMutation` wrapping `dismissAlert`; `onSuccess` invalidates `['alerts', 'queue']`
  - Run `pnpm test ManagementQueue` — all tests must pass
- [x] **[Refactor]** `/refactor` — `ManagementQueueRow.tsx`, `ManagementQueue.tsx`, `DismissConfirmPanel.tsx` _(depends on: Renderer UI Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check the row's grid layout (`grid-cols-[96px_110px_1fr_160px]`) still fits two action buttons — may need a wrapping flex container
  - Check `DismissConfirmPanel` reuses shared button classes/tokens rather than hand-rolled styles
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — E2E Tests

**Requires:** All Green tasks from Layers 1–5 ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/dismiss-alert.spec.ts` _(depends on: all Green tasks ✓)_
  - One `it()` per AC bullet from `docs/epics/07-stories/US-59-dismiss-alert.md` — test names must mirror AC language:
    - AC-1: "Trader dismisses an alert from the queue" → `it('trader dismisses an alert from the queue')` — click Dismiss, click Confirm dismiss, assert row disappears from `QUEUE_ROW` and `readAlertRows(dbPath)` shows `status: 'dismissed'` with a non-null `dismissed_at`
    - AC-2: "Dismissed alert does not immediately reappear while the condition is unchanged" → `it('dismissed alert does not immediately reappear while the condition is unchanged')` — re-run evaluation with the leg unchanged, assert no AAPL row in queue and exactly one row for the `(AAPL, MANAGEMENT_WINDOW)` key in the DB
    - AC-3: "Dismissed alert can reappear after the condition clears and later returns" → `it('dismissed alert can reappear after the condition clears and later returns')` — move to 30 DTE + evaluate (dismissed row → `resolved`), then back to 14 DTE + evaluate, assert a new queue row with a strictly later `triggered_at`
    - AC-4: "Dismissing an already resolved alert is rejected" → `it('dismissing an already resolved alert is rejected')` — resolve an alert by closing its leg, then call `window.api.alerts.dismiss({ alertId })` directly via `page.evaluate`, assert `{ ok: false, errors: [{ code: 'NOT_OPEN', message: 'Only open alerts can be dismissed' }] }`
  - Extend `e2e/alert-helpers.ts`: add `dismissed_at` to the `AlertRow` type; add a `dismissAlertViaQueue(page, ticker)` helper (click Dismiss → click Confirm dismiss) if not already covered by existing helpers
  - Run `pnpm test:e2e dismiss-alert` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - No new production code expected — this area only confirms Layers 1–5 satisfy every AC end to end
  - Run `pnpm test:e2e dismiss-alert` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests — `e2e/dismiss-alert.spec.ts` _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check for duplication against `e2e/management-queue.spec.ts` and `e2e/expiration-imminent-alert.spec.ts`; share helpers via `alert-helpers.ts`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (Scenarios 1–4)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
- [x] Run `/update-spec us-59` once complete, per CLAUDE.md's post-story spec-refresh rule
