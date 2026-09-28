---
page: docs/spec/features/us-35-assignment-detection.md
audited_at: 2026-09-28
findings: 7
---

# Audit: docs/spec/features/us-35-assignment-detection.md

## Verified (27)

- ✓ All 20 listed source / migration / e2e files exist (incl. `e2e/polling-scheduler.spec.ts`, `e2e/assignment-detection.spec.ts`, `e2e/assignment-helpers.ts`)
- ✓ `DETECT_ASSIGNMENTS_JOB_NAME = 'detect-assignments'` — `src/main/services/detect-assignments.ts:8`
- ✓ Per-env watermark key `assignments_last_poll_at:${env}` — `src/main/services/detect-assignments.ts:87`
- ✓ `pollStartedAt` captured before the broker call and written back at end — `src/main/services/detect-assignments.ts:95,153`
- ✓ `INSERT OR IGNORE INTO pending_assignments` — `src/main/services/detect-assignments.ts:117`
- ✓ Broker errors returned as `{ brokerError }` — `src/main/services/detect-assignments.ts:10,104`
- ✓ `matchActivityToLegs` returns `OpenLegMatch[]`; restricted to `CSP_OPEN` / `ACTIVE` positions — `src/main/services/detect-assignments.ts:32-50`
- ✓ Migration 008: `pending_assignments` with TEXT FKs to `positions`/`legs`, status CHECK, compound `UNIQUE(activity_id, position_id)` index — `migrations/008_create_pending_assignments.sql:1-19`
- ✓ `app_settings` table created in `migrations/006_add_credential_settings.sql:13`; `appSettings` service — `src/main/services/app-settings.ts:3`
- ✓ IPC `assignments:list-pending`, `:confirm`, `:dismiss`, `:run-detection-now` — `src/main/ipc/assignments.ts:16,20,27,35`; run-now calls `scheduler.runNow(DETECT_ASSIGNMENTS_JOB_NAME)` and returns `{}` (E2 still open)
- ✓ `assignments:dismiss` returns `{ dismissedAt }` — `src/main/ipc/assignments.ts:31`
- ✓ `ConfirmAssignmentPayloadSchema` / `DismissAssignmentPayloadSchema` `{ pendingAssignmentId: positive int }` — `src/main/schemas.ts:503-510`
- ✓ `confirmPending` wraps `assignCspPosition` in `db.transaction` — `src/main/services/pending-assignments.ts:88-106`
- ✓ `dismissPending` stamps `dismissed_at`, throws `NOT_FOUND` / `NOT_PENDING` — `src/main/services/pending-assignments.ts:85,118-130`
- ✓ Scheduler registration policy `{ marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }` — `src/main/index.ts:241-246`; `scheduler.start()` — `:329`
- ✓ Module-level singleton `scheduler` — `src/main/services/scheduler-instance.ts:37`; `stop()` drains with 5 s cap — `src/main/services/polling-scheduler.ts:252-267`
- ✓ `_test:scheduler-registry`, `-run-now`, `-register`, `-simulate-wake` — `src/main/ipc/test-scheduler.ts:46,48,59,79`; `seedTestJobsFromEnv` reads `WHEELBASE_TEST_JOBS` — `:26-27`; gated by `NODE_ENV === 'test'` — `src/main/index.ts:308`
- ✓ Preload `window.api.assignments.{listPending, confirm, dismiss, runDetectionNow}` — `src/preload/index.ts:63-69`
- ✓ `PendingAssignmentNotification.positionId: string` — `src/preload/index.d.ts:625`
- ✓ `usePendingAssignments` key `['assignments','pending']`, 30 s refetch — `src/renderer/src/api/assignments.ts:9-13`
- ✓ Pulsing indicator `bg-wb-gold animate-wb-pulse`, `data-testid={`pending-assignment-indicator-${item.id}`}` — `src/renderer/src/components/PositionCard.tsx:115-116`
- ✓ "Open covered call →" link in banner — `src/renderer/src/components/AssignmentNotificationBanner.tsx:56`

## Drift (7)

- ✗ Step 2 claims `brokerProvider.getActivities({ activity_types: ['OPASN'], after })`. Actual call is `getActivities({ type: 'OPASN', since })` — `src/main/services/detect-assignments.ts:99`.
- ✗ Matching is described as joining on `legs.option_symbol` ("OCC-symbol matching ... joins on `legs.option_symbol` directly. Parsing is deferred to the display layer"). No `option_symbol` column exists in `migrations/` or `src/main`; the service builds OCC symbols from `ticker/expiration/strike/instrument_type` via `buildOccSymbol` into an in-memory map — `src/main/services/detect-assignments.ts:32-43,52-75`.
- ✗ "The singleton is created with a safe-broker fallback (`getSafeBroker()`)". `getSafeBroker` does not exist anywhere in `src/main`; the singleton is built on a market-data status source that degrades `auth_failed` to a closed session (US-116) — `src/main/services/scheduler-instance.ts:10-37`.
- ✗ `before-quit` described as `Promise.all([scheduler.stop(), marketDataProvider.disconnect()])`. Actual: `ivrAbort.abort()` then `Promise.all([scheduler.stop(), marketDataFactory.disconnect()])` — `src/main/index.ts:337-341`.
- ✗ `PendingAssignmentError` documented with codes `NOT_FOUND | NOT_PENDING | TRANSITION_REJECTED`, and `assignments:confirm` with a `TRANSITION_REJECTED` error code. The class only has `'NOT_PENDING' | 'NOT_FOUND'` — `src/main/services/pending-assignments.ts:6-8`; `TRANSITION_REJECTED` appears nowhere in `src/main`.
- ✗ `assignments:list-pending` "returns `PendingAssignmentNotification[]`". It returns the envelope `{ assignments: [...] }` — `src/main/ipc/assignments.ts:17`.
- ✗ On confirm the renderer "invalidates `['positions', 'list']` and `['positions', positionId]`". It invalidates `positionQueryKeys.all` (`['positions']`), `positionQueryKeys.detail(id)`, and `['assignments','pending']` — `src/renderer/src/components/AssignmentNotificationBanner.tsx:106-108`, `src/renderer/src/hooks/positionQueryKeys.ts:1-4`. (Minor; the prefix still covers the list.)

## Unverifiable (4)

- ? "Migration 008 was edited in place — no shipped data to preserve" — history.
- ? Rejected alternative (`MAX(transaction_time)` watermark) — design rationale.
- ? Unknown symbols skipped "at DEBUG" — log level not grep-checked against every branch.
- ? Banner success-state duration / "long enough" — narrative.

## Missing files (0)
