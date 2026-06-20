# US-35: Assignment Detection & Auto-Transition

<!-- generated:from us-35 -->

## Summary

Wheelbase polls Alpaca for `OPASN` (option-assignment) activities on a recurring
cadence, matches each activity to one or more open CSP legs by OCC symbol, and
persists a `pending_assignments` row per match. The renderer surfaces every
pending row as a stacked notification banner on the positions list with a
pulsing amber indicator on the affected row. Confirming a banner calls
`assignCspPosition` and transitions the position into `HOLDING_SHARES`
atomically with the row's status update; dismissing it marks the row dismissed
so the next poll doesn't resurface it. State lives entirely in SQLite, so
detected assignments survive an app restart.

This story automates the workflow the trader previously did by hand — see
[us-6 — Record assignment](./us-6-record-assignment.md) for the manual entry
path that this feature replaces for Alpaca-connected positions. The polling
cadence and lifecycle are owned by the shared
[us-46 — PollingScheduler](./us-46-polling-scheduler.md) primitive.

## Acceptance criteria

- Detect assignment from `OPASN` activity and create a pending record.
- Ignore assignment activity for unknown positions (DEBUG log, skip; do not
  crash).
- Do not process the same activity twice (`INSERT OR IGNORE` on the compound
  UNIQUE).
- Handle multiple assignments in a single poll.
- API error during polling does not crash the app (WARN log; scheduler
  continues on its next tick).
- Assignment notification banner appears on the positions list.
- Confirming the assignment transitions the position to `HOLDING_SHARES` with
  success feedback.
- Dismissing the assignment removes the notification and prevents
  re-appearance on the next poll.
- Notification persists across app restarts (DB persistence).
- Pulsing amber row indicator on positions with a pending assignment.

## What was built

**Detection job.** `detectAssignments` (`src/main/services/detect-assignments.ts`)
runs as a registered job on the shared `PollingScheduler` under the name
`DETECT_ASSIGNMENTS_JOB_NAME = 'detect-assignments'`. Each tick:

1. Reads the per-environment watermark from `app_settings`
   (`assignments_last_poll_at:paper` or `:live`).
2. Captures `pollStartedAt = now()` **before** calling
   `brokerProvider.getActivities({ activity_types: ['OPASN'], after })`.
3. For every activity, runs `matchActivityToLegs` — a pure helper that joins
   `legs` to `positions` and returns every `(positionId, legId)` whose
   `option_symbol` equals the activity's OCC symbol and whose parent is
   `CSP_OPEN` with the leg still open.
4. Inserts one `pending_assignments` row per match using `INSERT OR IGNORE`
   against the compound UNIQUE; unknown symbols are skipped at DEBUG.
5. On batch completion writes `pollStartedAt` back to the watermark key — any
   activity that arrived **during** step 2 is replayed on the next poll and
   deduped by the UNIQUE index.

Broker errors are caught and returned to the caller as `{ brokerError }`; the
scheduler's exception handling reschedules normally so a Alpaca outage cannot
crash the app or stop the chain.

**Notification storage.** A "pending" row in `pending_assignments` IS the
notification — there's no separate inbox. The renderer queries the table via
`assignments:list-pending`, which joins to positions + legs and projects the
fields the banner needs (ticker, strike, expiration, contract type, qty,
transactionTime, positionId).

**Confirm path.** `confirmPending` wraps the lifecycle call and the row update
in an outer `db.transaction()` so that `assignCspPosition` and the
`status='confirmed'` write commit atomically (better-sqlite3 composes the
inner transaction as a savepoint). On success the IPC returns the transitioned
position; the renderer invalidates `['positions', 'list']` and
`['positions', positionId]`. The banner keeps the row visible locally in a
success state long enough to expose an "Open covered call →" link.

**Dismiss path.** `dismissPending` marks the row `status='dismissed'` and
stamps `dismissed_at`. It rejects confirmed rows with
`PendingAssignmentError('NOT_PENDING')` and missing rows with
`PendingAssignmentError('NOT_FOUND')`. Already-dismissed rows are idempotent.

**Scheduler wiring.** Main bootstrap (`src/main/index.ts`) imports the
module-level singleton from `src/main/services/scheduler-instance.ts`,
registers the `detect-assignments` job with the
`{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }`
policy, and calls `scheduler.start()`. The singleton is created with a
safe-broker fallback (`getSafeBroker()`) so missing Alpaca credentials degrade
to parked jobs rather than crashing at import time. The consolidated
`before-quit` handler awaits
`Promise.all([scheduler.stop(), marketDataProvider.disconnect()])` before
`app.exit(0)`.

**Renderer surface.** `usePendingAssignments` polls
`assignments:list-pending` every 30 s. `AssignmentNotificationBanner` mounts
on `PositionsListPage`, renders one banner per pending row stacked on top of
the list, and on confirm transitions in-place to a success view with the
"Open covered call →" link. `PositionCard` shows a pulsing amber dot
(`bg-wb-gold animate-wb-pulse`, `data-testid="pending-assignment-indicator"`)
when the row's `positionId` appears in the pending set.

**Dev IPC.** `src/main/ipc/test-scheduler.ts` exposes
`_test:scheduler-registry`, `_test:scheduler-run-now`,
`_test:scheduler-register`, and `_test:scheduler-simulate-wake` behind
`NODE_ENV === 'test'`. Test jobs can be seeded from `WHEELBASE_TEST_JOBS`
through `seedTestJobsFromEnv`. These channels back the E2E specs and do not
ship in production builds.

## Revisions

- **us-35** (original): shipped the detection job, `pending_assignments`
  table, IPC surface, banner, and scheduler wiring against the
  paper-trading Alpaca account.
- **us-35-code-review-fixes**: landed on the same branch and is reflected in
  the current state above. Notable items:
  - **Multi-CSP collision (A2)** — replaced the column-level
    `UNIQUE(activity_id)` on `pending_assignments` with a compound
    `UNIQUE(activity_id, position_id)` index so a single OPASN that matches
    two CSP positions on the same OCC symbol produces one pending row per
    position instead of silently dropping one. The match helper was renamed
    to `matchActivityToLegs` and now returns a list of `OpenLegMatch`.
  - **Watermark race (A1)** — moved the watermark capture to `pollStartedAt`
    (before the broker call) instead of `now()` after, so activities arriving
    during the broker round-trip are replayed and deduped on the next poll
    rather than silently skipped.
  - **`dismissPending` NOT_PENDING guard (B1)** — now throws
    `PendingAssignmentError('NOT_PENDING')` when called on a confirmed row;
    still idempotent for already-dismissed rows.
  - **Pulsing amber row indicator (D1)** — added to satisfy the original AC;
    rendered on `PositionCard` rows whose id is in the pending set.
  - **`positionId` UUID type (E1)** — `PendingAssignmentNotification.positionId`
    typed as `string` in `src/preload/index.d.ts` to match the UUID the
    service actually returns (was incorrectly `number`).

## Architecture decisions

- **Notification persistence via the table itself.** A pending row IS the
  notification — no separate notification store, no outbox. Survives restart
  automatically and confirm/dismiss are state transitions on the same row.
- **Watermark stored in `app_settings`, keyed by environment.**
  `assignments_last_poll_at:paper` and `assignments_last_poll_at:live` live
  in a tiny key/value table (see [tables.md](../schema/tables.md)). Computing
  the watermark from `MAX(transaction_time)` over `pending_assignments` was
  rejected because dismissed-and-cleared rows would lose the signal.
- **Watermark captured at poll start, not poll end.** Trades a small amount
  of duplicate work (deduped by the compound UNIQUE) for never missing an
  activity that posts during the broker call.
- **Compound UNIQUE on `(activity_id, position_id)`.** Supports the
  rare-but-real case of multiple CSP positions on the same OCC symbol. The
  original single-column UNIQUE would have silently dropped the second
  position's pending row. Migration 006 was edited in place — no shipped
  data to preserve.
- **OCC-symbol matching, not ticker/strike/expiration parsing.** The match
  query joins on `legs.option_symbol` directly. Parsing is deferred to the
  display layer.
- **Banner per pending assignment, stacked.** Bulk confirm/dismiss is
  explicitly out of scope; one banner per row keeps each decision discrete.
- **Module-level scheduler singleton with safe-broker fallback.** Node
  module caching gives singleton semantics; `getSafeBroker()` lets the
  module load without crashing when Alpaca credentials are absent — parked
  jobs are the safe degraded state. A lazy `getScheduler()` factory was
  filed as a follow-on (Area H1) for cleaner test ergonomics.
- **Consolidated `before-quit` handler.** Awaits scheduler drain and
  market-data disconnect concurrently before `app.exit(0)`; the scheduler's
  `stop()` drains in-flight handlers with a 5-second cap.
- **Dev-only test-scheduler IPC.** `_test:scheduler-*` channels are guarded
  by `NODE_ENV === 'test'` so they don't pollute the production IPC surface.

Cadence policy itself (60 s / 5 min / parked) and the setTimeout-chain
rationale are owned by [us-46 — PollingScheduler](./us-46-polling-scheduler.md);
the assignment job registers with that policy rather than choosing its own
mechanism.

## Contracts touched

IPC handlers (see [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)):

- `assignments:list-pending` — no payload; returns
  `PendingAssignmentNotification[]` (joined view of pending rows).
- `assignments:confirm` — `{ pendingAssignmentId: positive int }`; on success
  returns the transitioned position; error codes `NOT_FOUND`, `NOT_PENDING`,
  `TRANSITION_REJECTED`.
- `assignments:dismiss` — `{ pendingAssignmentId: positive int }`; on success
  returns `{ dismissedAt }`; error codes `NOT_FOUND`, `NOT_PENDING`.
- `assignments:run-detection-now` — no payload; invokes
  `scheduler.runNow('detect-assignments')`; tracked open item E2 (return real
  `{ detected, skipped, durationMs }` instead of bare `{ ok: true }`).

Preload bridge (`src/preload/index.ts`, `src/preload/index.d.ts`):

- `window.api.assignments` namespace exposes `listPending`, `confirm`,
  `dismiss`, `runDetectionNow`.
- `PendingAssignmentNotification.positionId` is `string` (UUID).

Zod payload schemas (`src/main/schemas.ts`):
`ConfirmAssignmentPayloadSchema`, `DismissAssignmentPayloadSchema`.

Services:

- `detectAssignments(args)` and exported `DETECT_ASSIGNMENTS_JOB_NAME`.
- `matchActivityToLegs` (pure helper returning `OpenLegMatch[]`).
- `listPending` / `confirmPending` / `dismissPending` and
  `PendingAssignmentError` (`NOT_FOUND` | `NOT_PENDING` | `TRANSITION_REJECTED`).
- `appSettings.get` / `appSettings.set` (key/value).

Renderer hook: `usePendingAssignments` (TanStack Query, key
`['assignments', 'pending']`, 30 s refetch).

Lifecycle: confirm calls into `assignCspPosition`, the same
`CSP_OPEN → HOLDING_SHARES` transition used by the manual path — see
[wheel-lifecycle.md](../domain/wheel-lifecycle.md).

Schema (see [schema/tables.md](../schema/tables.md) and
[schema/migrations.md](../schema/migrations.md)):

- Migration 006 — `pending_assignments` table with `(activity_id, position_id)`
  compound UNIQUE; TEXT (UUID) foreign keys to `positions` and `legs`.
- Migration 007 — `app_settings` key/value table.

## Source files

- `src/main/services/polling-scheduler.ts`
- `src/main/services/scheduler-instance.ts`
- `src/main/services/detect-assignments.ts`
- `src/main/services/pending-assignments.ts`
- `src/main/services/app-settings.ts`
- `src/main/ipc/assignments.ts`
- `src/main/ipc/test-scheduler.ts`
- `src/main/schemas.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/api/assignments.ts`
- `src/renderer/src/components/AssignmentNotificationBanner.tsx`
- `src/renderer/src/pages/PositionsListPage.tsx`
- `src/renderer/src/components/PositionCard.tsx`
- `migrations/006_create_pending_assignments.sql`
- `migrations/007_create_app_settings.sql`
- `e2e/polling-scheduler.spec.ts`
- `e2e/assignment-detection.spec.ts`
- `e2e/assignment-helpers.ts`

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
