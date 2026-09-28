---
page: docs/spec/architecture/02-adrs/polling-scheduler-stateless.md
audited_at: 2026-09-28
findings: 2
---

# Audit: polling-scheduler-stateless.md

## Verified (4)

- ✓ No persisted scheduler state: no `last_run_at` / scheduler table in `migrations/`, and `src/main/services/polling-scheduler.ts` has no DB import.
- ✓ Handlers own watermarks: detect-assignments uses per-environment key `assignments_last_poll_at:${env}` — `src/main/services/detect-assignments.ts:87`.
- ✓ Per-job `timerId` and `invocations` counter — `polling-scheduler.ts:93-102`.
- ✓ `getRegistry()` exposes registry entries for tests/diagnostics — `polling-scheduler.ts:38, 299-300`; used by `_test:scheduler-registry` (`src/main/ipc/test-scheduler.ts:46`).

## Drift (1)

- ✗ Line 13: "The scheduler's only in-memory state is the per-job timer id and an invocation counter." `JobState` also holds `running: Promise | null` (in-flight handler, used to skip overlapping ticks and join `runNow`) — `polling-scheduler.ts:96-101`; the scheduler also keeps `inFlight`, `stopped`, `started` — `:115-118`. Still non-persisted, so the decision holds; the enumeration is stale.

## Unverifiable (1)

- ? Coupling rationale (IVR collector needs a different shape) — design intent.

## Missing files (1)

- ✗ Source `plans/us-35/research.md` — `plans/us-35/` no longer exists.
