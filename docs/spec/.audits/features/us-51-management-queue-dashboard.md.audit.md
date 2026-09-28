---
page: docs/spec/features/us-51-management-queue-dashboard.md
audited_at: 2026-09-28
findings: 27
---

# Audit: docs/spec/features/us-51-management-queue-dashboard.md

## Verified (23)

- ✓ `listManagementQueue(db)` exists in `src/main/services/alerts.ts:274`; JOINs `alerts a` to `positions p` (inner `JOIN`, line 287), filters `a.status = 'open'`, orders by `CASE a.urgency ... END, a.triggered_at ASC` (lines 289-291)
- ✓ `listOpenAlerts` primitive still exists — `src/main/services/alerts.ts:231`
- ✓ Snake→camel mapper `mapQueueRow` — `src/main/services/alerts.ts:257`
- ✓ `idx_alerts_status_urgency` index exists — `migrations/009_create_alerts.sql:22`
- ✓ `ManagementQueueItem` with fields `alertId, positionId, ticker, phase (WheelPhase), urgency, summary, quickAction, triggeredAt` — `src/main/schemas.ts:622-631`
- ✓ `ManagementQueueItem` mirrored in `src/preload/index.d.ts:628`
- ✓ `registerAlertsHandlers({ db })` in `src/main/ipc/alerts.ts:7`; `alerts:list` body is `handleIpcCall('alerts_list_error', () => ({ items: listManagementQueue(db) }))` (lines 8-10), no Zod payload
- ✓ Wired in `src/main/index.ts:14,196`
- ✓ Preload `window.api.alerts.list` — `src/preload/index.ts:72`; typed success `{ ok: true; items: ManagementQueueItem[] }` at `src/preload/index.d.ts:768`
- ✓ Fallback error envelope root code `internal_error` — `src/main/ipc/utils.ts:66`
- ✓ Renderer adapter `listManagementQueue()` returns `[]` on non-ok — `src/renderer/src/api/alerts.ts:7-11`
- ✓ `useManagementQueue`: `queryKey: ['alerts','queue']`, `refetchInterval: 30_000` — `src/renderer/src/hooks/useManagementQueue.ts`
- ✓ `UrgencyPill` HIGH/MED/LOW → `text-wb-red bg-wb-red-dim` / `text-wb-gold bg-wb-gold-dim` / `text-wb-blue bg-wb-blue-dim` — `src/renderer/src/components/UrgencyPill.tsx:3-7`
- ✓ `ManagementQueue` wraps in `SectionCard header="Management Queue"` — `src/renderer/src/components/ManagementQueue.tsx:16`
- ✓ `ManagementQueue` renders `ManagementQueueRow` per item — `ManagementQueue.tsx:26`
- ✓ Row uses `PhaseBadge variant="short"` — `src/renderer/src/components/ManagementQueueRow.tsx:22`
- ✓ Empty-state message only — `ManagementQueue.tsx:34`
- ✓ Mounted in `PositionsListPage` right after `AssignmentNotificationBanner`, before positions content — `src/renderer/src/pages/PositionsListPage.tsx:206-209`
- ✓ `e2e/management-queue.spec.ts` exists with one test per AC (lines 42, 70, 89, 107)
- ✓ Link `../architecture/02-adrs/management-queue-read-path.md` exists
- ✓ Link `../contracts/ipc-handlers.md` exists
- ✓ Link `../domain/alerts.md` exists
- ✓ `migrations/009_create_alerts.sql` exists; "no migrations" for US-51 consistent

## Drift (1)

- ✗ Page claims `ManagementQueueItem` is "re-exported from the renderer adapter" (`src/renderer/src/api/alerts.ts`). The adapter has no type export; it relies on the ambient global declared under `declare global` in `src/preload/index.d.ts:616`. Grep of `ManagementQueueItem` in `src/renderer/src/api/alerts.ts` finds only the return annotation at line 7. Also minor: the preload mirror types `phase` as `string` (`src/preload/index.d.ts:632`), not `WheelPhase`; `ManagementQueueRow.tsx:22` casts `item.phase as WheelPhase`. Suggested fix: describe the type as an ambient global from `index.d.ts`.

## Unverifiable (3)

- ? "Matching the backend's 30–60s re-evaluation cadence" — rationale, not checked mechanically here.
- ? Rejected alternatives (`AlertRecord & {...}`, push channel, throwing `ApiError`) — design history.
- ? "An inner JOIN drops any alert whose position is missing — not expected given the FK" — intent narrative.

## Missing files (0)

Note (not drift): `src/main/ipc/alerts.ts` and `src/renderer/src/api/alerts.ts` now also carry `alerts:dismiss` / `dismissAlert` (US-59) — additive.
