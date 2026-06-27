# US-51: Display Management Queue on Dashboard Ordered by Urgency Tier

<!-- generated:from us-51 -->

## Summary

US-51 surfaces US-50's persisted open alerts as a prioritized "management
queue" at the top of the dashboard. It adds an enriched, sorted read path
(`listManagementQueue`) that JOINs the `alerts` table to `positions` to attach
`ticker` and `phase`, exposes it through a new `alerts:list` IPC channel, a
preload bridge, a renderer adapter, and a polling TanStack Query hook
(`useManagementQueue`), and renders the result as a `SectionCard`-wrapped queue
above the positions grid. Each row shows ticker, phase badge, trigger summary,
an urgency pill, and a "Review position" action that navigates to the position
detail page; an empty state renders when no alerts are open.

No new migration or engine work is required — the entire alert backend (table,
engine, scheduled evaluation) shipped in [US-50](us-50-alert-engine.md). US-51
is a read-and-display slice over that backend.

## Acceptance criteria

- The queue appears above the position cards, ordered by urgency tier
  (high → medium → low) then by time.
- Each queue item shows the key fields a trader needs to act: ticker, phase
  badge, trigger summary, and a "Review position" button.
- The quick action opens the related position's detail page.
- An empty state renders when there are no open alerts (message only, no action
  buttons).

## What was built

A dedicated read path projects open alerts into a purpose-built view-model and
the renderer mounts it unconditionally above the positions grid.

**Service.** `listManagementQueue(db)` in `src/main/services/alerts.ts` JOINs
open `alerts` to `positions`, attaching `ticker` and the current `phase`, and
returns rows already sorted by urgency tier then `triggered_at` ascending. The
existing `listOpenAlerts` primitive is left untouched (still relied on by US-50
evaluation tests). Sorting is done in SQL via a `CASE urgency` rank so the
service stays a thin snake→camel mapper and the existing
`idx_alerts_status_urgency` index serves the status filter. An inner JOIN drops
any alert whose position is missing — not expected given the FK, but keeps the
result well-formed.

**View-model.** A dedicated `ManagementQueueItem` type (defined in
`src/main/schemas.ts`, mirrored in `src/preload/index.d.ts`, re-exported from
the renderer adapter) carries exactly the fields the UI needs — `alertId`,
`positionId`, `ticker`, `phase`, `urgency`, `summary`, `quickAction`,
`triggeredAt` — and deliberately omits `AlertRecord` audit fields
(`lastEvaluatedAt`, `resolvedAt`, `createdAt`, `updatedAt`, `status`). `alertId`
is included specifically to serve as a stable React key (one row per open alert
in US-51 scope). The `summary` string (e.g. "Expires in 3 days at $180.00
strike") is generated and stored by the US-50 engine and displayed verbatim —
US-51 does no summary generation.

**IPC + preload.** A new `src/main/ipc/alerts.ts` exposes
`registerAlertsHandlers({ db })`, registering the read-only `alerts:list`
channel whose body is `handleIpcCall('alerts_list_error', () => ({ items:
listManagementQueue(db) }))`. It is wired into `src/main/index.ts` alongside the
other `register*Handlers` calls and mirrors `assignments:list-pending`. The
preload exposes `window.api.alerts.list()`.

**Renderer.** `src/renderer/src/api/alerts.ts` adapts the bridge
(`listManagementQueue()` returns `[]` on a non-ok envelope so the queue degrades
to its empty state rather than crashing the dashboard). The
`useManagementQueue` hook (`src/renderer/src/hooks/useManagementQueue.ts`)
queries with `queryKey: ['alerts','queue']` and `refetchInterval: 30_000`,
matching the backend's 30–60s re-evaluation cadence and the existing
`usePendingAssignments` pattern. The UI reuses `SectionCard` (header
"Management Queue") and `PhaseBadge variant="short"`, adds a new `UrgencyPill`
(tier → `wb-*` token: `high` → HIGH `text-wb-red`/`bg-wb-red-dim`, `medium` →
MED `text-wb-gold`/`bg-wb-gold-dim`, `low` → LOW `text-wb-blue`/`bg-wb-blue-dim`),
and renders one `ManagementQueueRow` per item inside `ManagementQueue`.
`ManagementQueue` is mounted in `PositionsListPage` immediately after
`AssignmentNotificationBanner` and above the Active section; it self-fetches and
owns its loading and empty states.

## Architecture decisions

- **Dedicated `listManagementQueue` read path + urgency-tier SQL ordering** —
  see [ADR: Management queue read path](../architecture/02-adrs/management-queue-read-path.md).
  A new enriched, sorted service function rather than reusing or extending
  `listOpenAlerts`, with ordering done in SQL (`CASE urgency` rank then
  `triggered_at ASC`).

- **Dedicated `ManagementQueueItem` view-model (not raw `AlertRecord`).** The
  queue needs `ticker`/`phase` (not on the alert row) and none of the audit
  fields `AlertRecord` carries. A purpose-built type keeps the IPC contract
  honest and small; `alertId` is included as a stable React key. Returning
  `AlertRecord & { ticker, phase }` was rejected for leaking unused fields and
  blurring what the queue actually depends on.

- **`alerts:list` thin handler in a new `src/main/ipc/alerts.ts`.** Read-only
  with no request payload, so no Zod schema — just `handleIpcCall` wrapping a
  single `listManagementQueue(db)` call, registered via `registerAlertsHandlers`.
  A dedicated handler file matches the one-domain-per-file convention rather
  than folding the channel into `positions.ts`. See
  [IPC handlers](../contracts/ipc-handlers.md).

- **Polling `useManagementQueue` hook.** `useQuery` with a 30s
  `refetchInterval` keeps the queue fresh without manual refresh, matching the
  backend cadence and `usePendingAssignments`. A push/event channel was deferred
  as out-of-scope; throwing `ApiError` (like `usePositions`) was rejected
  because the queue is a secondary surface that should silently degrade to its
  empty state.

- **Reuse `PhaseBadge` (short variant) and `SectionCard`; new `UrgencyPill`.**
  The story mandates reusing `SectionCard`/`PhaseBadge` and gold/red urgency
  accents. A dedicated `UrgencyPill` isolates the tier → `wb-*` token mapping
  for reuse in future alert surfaces (US-59/60). Hand-rolling phase markup from
  the mockup's inline styles was rejected — it violates the
  Tailwind-tokens-not-inline-styles rule and duplicates `PhaseBadge`.

- **Mount the queue unconditionally above the positions grid.** `ManagementQueue`
  is always mounted and owns its own loading/empty rendering, so the empty-alerts
  state shows even when positions exist. Gating it behind the positions-present
  block was rejected because the queue is conceptually independent of the
  positions query.

## Contracts touched

- **`alerts:list`** (new IPC channel) — read-only, no request payload. Success:
  `{ ok: true, items: ManagementQueueItem[] }`, sorted high → medium → low then
  `triggered_at ASC`, `[]` when no open alerts. Standard error envelope only
  (`{ ok: false, errors: [...] }`, root code `internal_error`). Implemented in
  `src/main/ipc/alerts.ts` (`registerAlertsHandlers`); backed by
  `listManagementQueue` in `src/main/services/alerts.ts`. See
  [IPC handlers](../contracts/ipc-handlers.md).

- **`window.api.alerts.list` (preload bridge)** — `() => Promise<{ ok: true;
items: ManagementQueueItem[] } | { ok: false; errors: [...] }>`. Defined in
  `src/preload/index.ts`, typed in `src/preload/index.d.ts`.

- **`ManagementQueueItem` (view-model type)** — `alertId`, `positionId`,
  `ticker`, `phase` (`WheelPhase`), `urgency` (`'high' | 'medium' | 'low'`),
  `summary`, `quickAction`, `triggeredAt` (ISO string). Defined in
  `src/main/schemas.ts`, mirrored in `src/preload/index.d.ts`, re-exported from
  `src/renderer/src/api/alerts.ts`. See [alerts domain](../domain/alerts.md).

- **`listManagementQueue()` (renderer adapter)** — `() =>
Promise<ManagementQueueItem[]>`; reads `window.api.alerts.list()` and returns
  `result.ok ? result.items : []`. Defined in `src/renderer/src/api/alerts.ts`.

**Schema:** no migrations. US-51 reads the existing `alerts` table
([migration `009_create_alerts.sql`](../domain/alerts.md), US-50) joined to
`positions`.

## Source files

- `src/main/schemas.ts` — added `ManagementQueueItem` interface
- `src/main/services/alerts.ts` — added `listManagementQueue(db)` + snake→camel mapper
- `src/main/ipc/alerts.ts` — new `registerAlertsHandlers({ db })`, `alerts:list` channel
- `src/main/index.ts` — wired `registerAlertsHandlers({ db })`
- `src/preload/index.ts` — added `api.alerts.list`
- `src/preload/index.d.ts` — added `ManagementQueueItem` + `alerts.list` typing
- `src/renderer/src/api/alerts.ts` — `listManagementQueue()` adapter + type re-export
- `src/renderer/src/hooks/useManagementQueue.ts` — polling TanStack Query hook
- `src/renderer/src/components/UrgencyPill.tsx`
- `src/renderer/src/components/ManagementQueueRow.tsx`
- `src/renderer/src/components/ManagementQueue.tsx`
- `src/renderer/src/pages/PositionsListPage.tsx` — mounted `<ManagementQueue />`
- `e2e/management-queue.spec.ts` — Playwright/`_electron` spec, one test per AC

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
