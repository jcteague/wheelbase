---
page: docs/spec/features/us-35-assignment-detection.md
audited_at: 2026-06-27
findings: 3
---

# Audit: docs/spec/features/us-35-assignment-detection.md

Services, IPC, schemas, and renderer surface verify well. Drift is in the
migration numbers (006/007) and one test-id, both attributable to migrations
being inserted ahead of this story's files.

## Verified (12)

- ✓ `detectAssignments` + `DETECT_ASSIGNMENTS_JOB_NAME = 'detect-assignments'`
  in `src/main/services/detect-assignments.ts:8,78`.
- ✓ `matchActivityToLegs` returns `OpenLegMatch[]`
  (`detect-assignments.ts:21,45-48`).
- ✓ `listPending` (`:54`), `confirmPending` (`:88`), `dismissPending` (`:118`),
  and `PendingAssignmentError` with `NOT_FOUND`/`NOT_PENDING` codes
  (`pending-assignments.ts:6,96,99,122,130`).
- ✓ IPC handlers `assignments:list-pending` (`:16`), `assignments:confirm`
  (`:20`), `assignments:dismiss` (`:27`), `assignments:run-detection-now`
  (`:35`) in `src/main/ipc/assignments.ts`.
- ✓ Zod `ConfirmAssignmentPayloadSchema` / `DismissAssignmentPayloadSchema`
  in `schemas.ts:451,456`.
- ✓ `pending_assignments` table uses compound
  `UNIQUE(activity_id, position_id)` (`uq_pending_assignments_activity_position`)
  with TEXT/UUID FKs to `positions` and `legs`
  (`migrations/008_create_pending_assignments.sql:3-5,19-20`).
- ✓ `app_settings` key/value table exists (in migration
  `006_add_credential_settings.sql`).
- ✓ `usePendingAssignments` renderer hook (`src/renderer/src/api/assignments.ts:9`),
  consumed by `AssignmentNotificationBanner.tsx:69` and
  `PositionsListPage.tsx:182`.
- ✓ Pulsing amber indicator on `PositionCard`:
  `bg-wb-gold animate-wb-pulse` (`PositionCard.tsx:103`).
- ✓ All US-35 source files exist: `scheduler-instance.ts`, `app-settings.ts`,
  `polling-scheduler.ts`, `test-scheduler.ts`, `api/assignments.ts`,
  `AssignmentNotificationBanner.tsx`, `e2e/polling-scheduler.spec.ts`,
  `e2e/assignment-detection.spec.ts`, `e2e/assignment-helpers.ts`.
- ✓ `_test:scheduler-*` dev IPC in `src/main/ipc/test-scheduler.ts`.
- ✓ All `./` and `../` spec links resolve.

## Drift (3)

- ✗ Page says "Migration 006 — `pending_assignments` table" (Contracts →
  Schema, and Architecture decisions "Migration 006 was edited in place").
  The actual file is `migrations/008_create_pending_assignments.sql`, not 006.
  Migration 006 is `006_add_credential_settings.sql` (unrelated). Source-file
  bullet lists `migrations/006_create_pending_assignments.sql` — that file
  does not exist.

- ✗ Page says "Migration 007 — `app_settings` key/value table" and lists
  source file `migrations/007_create_app_settings.sql`. No such file exists;
  migration 007 is `007_create_ivr_snapshot.sql`. The `app_settings` table is
  actually created in `migrations/006_add_credential_settings.sql`. The
  documented migration ordering for this story is wrong on both counts.

- ✗ Page documents the row indicator test-id as bare
  `data-testid="pending-assignment-indicator"`. Actual is
  `data-testid={`pending-assignment-indicator-${item.id}`}`
  (`PositionCard.tsx:102`) — suffixed with the position id.

## Unverifiable (1)

- ? Watermark capture at `pollStartedAt` before the broker call, INSERT OR
  IGNORE dedup behavior, and the savepoint-composed confirm transaction are
  described accurately at the symbol level but the runtime ordering is not
  mechanically asserted here; the relevant symbols all exist.

## Missing files (2)

- ✗ `migrations/006_create_pending_assignments.sql` (claimed) — actual is
  `008_create_pending_assignments.sql`.
- ✗ `migrations/007_create_app_settings.sql` (claimed) — `app_settings` lives
  in `006_add_credential_settings.sql`.

Suggested fix: renumber the migration references — pending_assignments is
migration 008, app_settings is folded into 006_add_credential_settings.sql.
Update the bare `pending-assignment-indicator` test-id to the id-suffixed form.
