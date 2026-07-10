# US-59: Dismiss an Alert with a Record of the Dismissal

<!-- generated:from us-59 -->

## Summary

US-59 adds a `Dismiss` action to open management-queue alerts. Dismissing an
alert transitions it to `status = 'dismissed'` with a `dismissed_at`
timestamp, removes it from the open queue, and makes the evaluation job's
upsert logic dismissal-aware so a still-true condition doesn't silently
re-open it on the next tick. When the underlying condition genuinely clears,
the dismissed row is retired to `resolved`; if the condition later returns, a
brand-new open row is created with a fresh `triggered_at` — the same
resolve→refire lifecycle [US-50](us-50-alert-engine.md) already established
for open alerts.

## Acceptance criteria

```gherkin
Background:
  Given AAPL has an open MANAGEMENT_WINDOW alert in the dashboard queue

Scenario: Trader dismisses an alert from the queue
  When the trader clicks "Dismiss" on the AAPL alert
  Then the alert status changes to dismissed
  And the alert stores a dismissed_at timestamp
  And the alert no longer appears in the open management queue

Scenario: Dismissed alert does not immediately reappear while the condition is unchanged
  Given the AAPL MANAGEMENT_WINDOW alert was dismissed today
  And AAPL still has 12 DTE remaining
  When the alert engine evaluates active positions again
  Then the dismissed alert remains hidden from the open queue
  And no new MANAGEMENT_WINDOW alert is created for AAPL

Scenario: Dismissed alert can reappear after the condition clears and later returns
  Given the AAPL MANAGEMENT_WINDOW alert was dismissed
  And AAPL is later rolled to 30 DTE
  And on a future cycle AAPL returns to 14 DTE
  When the alert engine evaluates active positions
  Then a new MANAGEMENT_WINDOW alert is created for AAPL
  And the new alert has a new triggered_at timestamp

Scenario: Dismissing an already resolved alert is rejected
  Given the AAPL alert has already been resolved
  When the trader attempts to dismiss it again
  Then the request is rejected with message "Only open alerts can be dismissed"
```

## What was built

**Schema.** Migration `011_add_alerts_dismissal.sql` adds `alerts.dismissed_at TEXT`
(nullable, set once on `open → dismissed`, never cleared) and a partial unique
index `idx_alerts_dismissed_unique` on `(position_id, rule_code) WHERE status =
'dismissed'`, mirroring `idx_alerts_open_unique` — see
[alerts-partial-unique-open](../architecture/02-adrs/alerts-partial-unique-open.md).

**Service layer** (`src/main/services/alerts.ts`). `dismissAlert(db, alertId,
now)` transitions an `open` row to `dismissed`, throwing a dedicated
`AlertError` (`NOT_FOUND` | `NOT_OPEN`) otherwise — `NOT_OPEN` covers both an
already-`resolved` and an already-`dismissed` row with the same message,
`Only open alerts can be dismissed`. `upsertOpenAlert` gained a
dismissed-row guard ahead of its existing open-row lookup: if a dismissed row
already exists for the key, it returns a new `'suppressed'` outcome and
leaves the row untouched instead of inserting a duplicate open row.
`clearStaleDismissals(db, keepOpenKeys, now)` transitions a dismissed row to
`resolved` once its key drops out of the evaluation run's keep-open set — see
[alert-resolution-global](../architecture/02-adrs/alert-resolution-global.md).

**Evaluation job wiring** (`src/main/services/evaluate-alerts.ts`).
`clearStaleDismissals` runs inside the same persist transaction as
`resolveAlertsNotIn`, immediately after it, reusing the identical
`keepOpenKeys` set — no separate "did this condition clear" computation for
dismissed rows. The `'suppressed'` upsert outcome is excluded from
`updatedCount`.

**IPC** (`src/main/ipc/alerts.ts`, `src/main/ipc/utils.ts`). The
`alerts:dismiss` handler Zod-parses `{ alertId }`, calls `dismissAlert`, and
returns `{ alert }` through `handleIpcCall`. `handleIpcCall` gained an
`AlertError` branch mapping `NOT_FOUND`/`NOT_OPEN` to the standard `{ ok:
false, code, errors }` envelope — the same `instanceof`-dispatch pattern
already used for `PendingAssignmentError`, per
[ipc-envelope-contract](../architecture/02-adrs/ipc-envelope-contract.md) and
[error-field-naming-convention](../architecture/02-adrs/error-field-naming-convention.md).

**Preload / renderer API adapter.** `window.api.alerts.dismiss` invokes
`alerts:dismiss`; `dismissAlert(alertId): Promise<AlertRecord>`
(`src/renderer/src/api/alerts.ts`) unwraps the envelope, throwing a mapped
`ApiError` via `throwMappedIpcErrors` — promoted from `api/positions.ts` into
a shared `api/error.ts` during this story's own refactor pass, since two
adapters now need it.

**Renderer UI.** Per the mockup (`mockups/us-59-dismiss-alert.mdx`), the
interaction is two stacked panels, not a modal: `ManagementQueueRow` gained a
danger-styled `Dismiss` button (`wb-red` tokens) that only calls
`onDismissClick(alertId)` — no direct mutation from the row.
`ManagementQueue` owns `confirmingAlertId` state and the `useDismissAlert()`
mutation, rendering the new `DismissConfirmPanel` below the queue list when a
row is in confirm state (clearing any stale mutation error via
`mutation.reset()` whenever a new row enters confirm state).
`DismissConfirmPanel` shows generic condition-clears copy (`{ticker} will
disappear from the open queue...`), `Confirm dismiss` / `Keep alert open`
buttons, and an inline `ErrorAlert` for the rejection case (e.g. a race where
the alert resolved between page load and the trader's confirm click). No
dedicated "dismissed" UI state was built — once the mutation succeeds,
`useDismissAlert`'s `onSuccess` invalidates the `['alerts', 'queue']` query,
and [US-51](us-51-management-queue-dashboard.md)'s existing `status = 'open'`
filter naturally excludes the row, so the existing empty state takes over
unchanged.

## Revisions

Shipped as a single story across 6 sequential layers (schema → service layer
→ evaluation-job wiring + IPC → preload/API adapter → renderer UI → e2e); no
follow-up revision plan.

## Architecture decisions

- **Model "condition cleared" as a dismissed→resolved transition, reusing the
  open-alert `keepOpenKeys` set** rather than a new status or column. See
  [alert-resolution-global](../architecture/02-adrs/alert-resolution-global.md).
- **`upsertOpenAlert` gains a dismissal-aware guard backed by a mirrored
  partial unique index**, rather than a most-recent-row query. See
  [alerts-partial-unique-open](../architecture/02-adrs/alerts-partial-unique-open.md).
- **`AlertError` follows the existing `PendingAssignmentError` /
  `handleIpcCall` dispatch pattern**, not a new error shape. See
  [ipc-envelope-contract](../architecture/02-adrs/ipc-envelope-contract.md).
- **No dedicated "Alert History" read path or component.** Only the
  persistence half of the audit trail (the `dismissed_at` column, the
  retained row) ships — none of the four Gherkin scenarios assert anything
  about a history _view_, only DB state and open-queue membership.

## Contracts touched

- **`alerts:dismiss`** (new IPC handler) — request `{ alertId: string }`;
  success `{ ok: true, alert: AlertRecord }` with `status: 'dismissed'`;
  errors `NOT_FOUND` (`Alert {alertId} not found`), `NOT_OPEN` (`Only open
alerts can be dismissed`), `internal_error`.

## Source files

- `migrations/011_add_alerts_dismissal.sql`
- `src/main/schemas.ts` — `AlertRecord.dismissedAt`, `DismissAlertPayloadSchema`
- `src/main/services/alerts.ts` — `AlertError`, `dismissAlert`, dismissal-aware `upsertOpenAlert`, `clearStaleDismissals`
- `src/main/services/evaluate-alerts.ts` — wires `clearStaleDismissals` into the persist transaction
- `src/main/ipc/alerts.ts` — `alerts:dismiss` handler
- `src/main/ipc/utils.ts` — `AlertError` envelope mapping in `handleIpcCall`
- `src/preload/index.ts` — `window.api.alerts.dismiss`
- `src/renderer/src/api/alerts.ts` — `dismissAlert` adapter
- `src/renderer/src/api/error.ts` — shared `throwMappedIpcErrors`
- `src/renderer/src/components/ManagementQueueRow.tsx` — `Dismiss` button, `onDismissClick` prop
- `src/renderer/src/components/ManagementQueue.tsx` — confirm-state wiring, mutation ownership
- `src/renderer/src/components/DismissConfirmPanel.tsx`
- `src/renderer/src/hooks/useDismissAlert.ts`
- `e2e/dismiss-alert.spec.ts` — one e2e test per AC scenario
- `e2e/alert-helpers.ts` — `dismissed_at` on `AlertRow`; `dismissAlertViaQueue`, `seedAndResolveAlert` helpers

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
