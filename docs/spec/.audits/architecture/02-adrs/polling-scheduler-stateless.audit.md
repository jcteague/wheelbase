---
page: docs/spec/architecture/02-adrs/polling-scheduler-stateless.md
audited_at: 2026-06-27
findings: 0
---

# Audit: polling-scheduler-stateless.md

## Verified (4)

- ✓ Scheduler keeps no persisted state — no `last_run_at` column anywhere in `migrations/`; grep of `polling-scheduler.ts` shows only in-memory `JobState`.
- ✓ Scheduler's only in-memory state is per-job `timerId` and an `invocations` counter (`src/main/services/polling-scheduler.ts:89-90,114,216`).
- ✓ `getRegistry()` exists for tests/diagnostics (`src/main/services/polling-scheduler.ts:32,275`).
- ✓ The detect-assignments handler owns its own watermark `assignments_last_poll_at:${env}` stored in `app_settings`, not in the scheduler (`src/main/services/detect-assignments.ts:87,89,153`).

## Drift (0)

## Unverifiable (1)

- ? US-44 IVR collector "needs a different shape entirely" — forward-looking design rationale, not mechanically verifiable.

## Missing files (0)
