---
page: docs/spec/architecture/02-adrs/dev-only-test-scheduler-ipc.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/architecture/02-adrs/dev-only-test-scheduler-ipc.md

## Verified (5)

- ✓ `src/main/ipc/test-scheduler.ts` registers `_test:scheduler-registry`, `_test:scheduler-run-now`, `_test:scheduler-register`, `_test:scheduler-simulate-wake` — `test-scheduler.ts:46,48,59,79`.
- ✓ Registration guarded by `NODE_ENV === 'test'` — `src/main/index.ts:308-310` (`seedTestJobsFromEnv`, `registerTestSchedulerIpc`).
- ✓ `seedTestJobsFromEnv` reads `WHEELBASE_TEST_JOBS` — `test-scheduler.ts:26-31`.
- ✓ `simulate-wake` is a no-op returning `{ ok: true }` — `test-scheduler.ts:75-81`.
- ✓ `_test:` prefix keeps channels off `window.api` — none of the scheduler channels appear in the production `api` namespaces of `src/preload/index.ts` (e2e invokes them directly).

## Drift (1)

- ✗ Line 7 says the file registers **four** channels (and line 18 calls "the four scheduler channels" cohesive). It registers **five**: `_test:scheduler-run-scheduled` was added (`src/main/ipc/test-scheduler.ts:52-57`), running a job on the `scheduled` trigger via `scheduler.runNow(jobName, { trigger: 'scheduled' })`. Suggested fix: add the fifth channel. (Side note, not spec drift: its code comment at `:52-54` still says a scheduled run "refuses a weekend", which US-121 removed from the IVR collector — `src/main/services/ivr-collector.ts:5-7`.)

## Unverifiable (1)

- ? "If the implementation ever switches to absolute fire-at timestamps ... this stub becomes a real wake-up trigger" — forward-looking.

## Missing files (1)

- ✗ Source `plans/us-35/refactor-phase-area8-results.md` does not exist (no `plans/us-35/` directory). `../../features/us-46-polling-scheduler.md` and `../../contracts/ipc-handlers.md` exist.
