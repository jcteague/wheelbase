---
page: docs/spec/features/us-59-dismiss-alert.md
audited_at: 2026-09-28
findings: 25
---

# Audit: docs/spec/features/us-59-dismiss-alert.md

## Verified (19)

- ✓ `migrations/011_add_alerts_dismissal.sql` adds `alerts.dismissed_at TEXT` and partial unique index `idx_alerts_dismissed_unique ON alerts (position_id, rule_code) WHERE status = 'dismissed'`
- ✓ `AlertRecord.dismissedAt` — `src/main/schemas.ts:602`; `DismissAlertPayloadSchema` — `src/main/schemas.ts:607`
- ✓ `AlertError` with codes `NOT_FOUND | NOT_OPEN` — `src/main/services/alerts.ts:59-61`
- ✓ `dismissAlert(db, alertId, now)` throws `NOT_FOUND` (`Alert ${alertId} not found`) and `NOT_OPEN` (`Only open alerts can be dismissed`) for any non-open row — `src/main/services/alerts.ts:203-214`; sets `status='dismissed', dismissed_at` — `:217-219`
- ✓ `UpsertOutcome` includes `'suppressed'` — `src/main/services/alerts.ts:72`; `upsertOpenAlert` returns `'suppressed'` when a dismissed row exists, leaving it untouched — `:80-104` (implemented as a single UNION ALL lookup rather than a separate guard ahead of the open lookup; behaviour matches)
- ✓ `clearStaleDismissals(db, keepOpenKeys, now)` resolves dismissed rows absent from keep-open set — `src/main/services/alerts.ts:190-197`
- ✓ `clearStaleDismissals` runs in the same transaction immediately after `resolveAlertsNotIn` with the same `keepOpenKeys` — `src/main/services/evaluate-alerts.ts:282-283`
- ✓ `'suppressed'` excluded from `updatedCount` — `src/main/services/evaluate-alerts.ts:278-279`
- ✓ `alerts:dismiss` handler Zod-parses and calls `dismissAlert` via `handleIpcCall`, returning `{ alert }` — `src/main/ipc/alerts.ts:12-15`
- ✓ `handleIpcCall` has an `AlertError` `instanceof` branch alongside `PendingAssignmentError` — `src/main/ipc/utils.ts:28-33`
- ✓ `window.api.alerts.dismiss` invokes `alerts:dismiss` — `src/preload/index.ts:73`
- ✓ `dismissAlert` adapter uses shared `throwMappedIpcErrors` from `api/error.ts` — `src/renderer/src/api/alerts.ts:3,13-15`; `src/renderer/src/api/error.ts:24`; also used by `api/positions.ts:3`
- ✓ `ManagementQueueRow` `Dismiss` button with `wb-red` tokens calling `onDismissClick(alertId)` — `src/renderer/src/components/ManagementQueueRow.tsx:10,36-39`
- ✓ `DismissConfirmPanel` copy `{ticker} will disappear from the open queue...`, `Confirm dismiss` / `Keep alert open`, inline `ErrorAlert` — `src/renderer/src/components/DismissConfirmPanel.tsx:33-50`
- ✓ `useDismissAlert` `onSuccess` invalidates `['alerts', 'queue']` — `src/renderer/src/hooks/useDismissAlert.ts:10-11`
- ✓ `e2e/dismiss-alert.spec.ts` has one test per AC scenario (lines 34, 54, 80, 122)
- ✓ `e2e/alert-helpers.ts` has `dismissed_at` on `AlertRow` (:30), `dismissAlertViaQueue` (:79), `seedAndResolveAlert` (:103)
- ✓ All listed source files exist; mockup `mockups/us-59-dismiss-alert.mdx` exists
- ✓ Linked ADRs (`alerts-partial-unique-open`, `alert-resolution-global`, `ipc-envelope-contract`, `error-field-naming-convention`) and feature pages (us-50, us-51) exist

## Drift (4)

- ✗ Page says `dismissAlert(alertId): Promise<AlertRecord>`; actual signature returns `Promise<IpcDismissedAlertRecord>` — `src/renderer/src/api/alerts.ts:13` (service returns `DismissedAlertRecord`, `src/main/services/alerts.ts:207`; type at `src/main/schemas.ts:615`). Suggested fix: update the type name.
- ✗ Page says the confirm UI is "two stacked panels, not a modal", rendered "below the queue list". `DismissConfirmPanel` now renders via `createPortal` into a `SheetOverlay`/`SheetPanel` sheet — `src/renderer/src/components/DismissConfirmPanel.tsx:1,22-24`.
- ✗ Page says `ManagementQueue` owns the `useDismissAlert()` mutation. The mutation is actually owned by `DismissConfirmPanel` (`src/renderer/src/components/DismissConfirmPanel.tsx:3,20`). `ManagementQueue` only holds confirm state (`src/renderer/src/components/ManagementQueue.tsx:12`).
- ✗ Page says `ManagementQueue` owns `confirmingAlertId` state and clears stale errors via `mutation.reset()`. The actual state is `confirmingAlert: { alertId, ticker }` (`ManagementQueue.tsx:7,12`), and stale-error clearing happens by remounting through `key={confirmingAlert.alertId}` (`:43`). No `reset()` call exists.

## Unverifiable (2)

- ? "Shipped as a single story across 6 sequential layers; no follow-up revision plan": this is history and cannot be checked against code.
- ? "No dedicated Alert History read path or component": this is a negative, design-rationale claim. No `AlertHistory` symbol was found, but the claim is left for human review.

## Missing files (0)

None.
