---
page: docs/spec/features/us-51-management-queue-dashboard.md
audited_at: 2026-06-27
findings: 0
---

# Audit: docs/spec/features/us-51-management-queue-dashboard.md

## Verified (16)

- ✓ All 13 cited source files exist (schemas.ts, services/alerts.ts, ipc/alerts.ts, index.ts, preload/index.ts, preload/index.d.ts, api/alerts.ts, hooks/useManagementQueue.ts, UrgencyPill.tsx, ManagementQueueRow.tsx, ManagementQueue.tsx, PositionsListPage.tsx, e2e/management-queue.spec.ts).
- ✓ `listManagementQueue(db)` in `src/main/services/alerts.ts` (line 184); `listOpenAlerts` left intact (line 141). Index `idx_alerts_status_urgency` exists in migration 009 to serve the status filter.
- ✓ `src/main/ipc/alerts.ts`: `registerAlertsHandlers({ db })` (line 6) registers `alerts:list` (line 7) via `handleIpcCall('alerts_list_error', () => ({ items: listManagementQueue(db) }))` (line 8) — matches contract exactly.
- ✓ `src/main/index.ts` wires `registerAlertsHandlers({ db })` (line 175).
- ✓ Preload bridge: `src/preload/index.ts` exposes `alerts: { list: () => invoke('alerts:list') }` (lines 68-69); typed in `src/preload/index.d.ts` with `ManagementQueueItem` interface (line 394) and `alerts.list` returning `{ ok: true; items: ManagementQueueItem[] } | { ok: false; ... }` (lines 504-506).
- ✓ `ManagementQueueItem` view-model in `src/main/schemas.ts` (lines 484-492) carries exactly `alertId`, `positionId`, `ticker`, `phase` (WheelPhase), `urgency` (AlertUrgency), `summary`, `quickAction`, `triggeredAt` — and omits audit fields. Matches contract.
- ✓ Renderer adapter `src/renderer/src/api/alerts.ts`: `listManagementQueue()` reads `window.api.alerts.list()` and returns `result.ok ? result.items : []` (lines 4-5).
- ✓ Hook `useManagementQueue` with `queryKey: ['alerts','queue']` and `refetchInterval: 30_000` (hook lines 4-8).
- ✓ UI: `ManagementQueue` reuses `SectionCard` header "Management Queue" (ManagementQueue.tsx lines 2,10); `ManagementQueueRow` uses `UrgencyPill` (line 14) and `PhaseBadge ... variant="short"` (line 16).
- ✓ `UrgencyPill` tier → wb-\* token mapping: high → HIGH `text-wb-red bg-wb-red-dim`, medium → MED `text-wb-gold bg-wb-gold-dim`, low → LOW `text-wb-blue bg-wb-blue-dim` (lines 4-6).
- ✓ `<ManagementQueue />` mounted in `PositionsListPage` immediately after `AssignmentNotificationBanner` (lines 207, 210).
- ✓ All spec links resolve: `us-50-alert-engine.md`, `../architecture/02-adrs/management-queue-read-path.md`, `../domain/alerts.md`, `../contracts/ipc-handlers.md`.

## Drift (0)

None.

## Unverifiable (2)

- ? "ordered by urgency tier (high → medium → low) then triggered_at ASC via SQL CASE rank" — the SQL ordering lives inside `listManagementQueue`'s query string; ordering correctness is a runtime/test concern, not mechanically confirmed here beyond the function's existence.
- ? "inner JOIN drops any alert whose position is missing" — JOIN semantics asserted; not separately verified against the query text.

## Missing files (0)

None.
