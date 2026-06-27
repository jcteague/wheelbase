---
page: docs/spec/architecture/02-adrs/dev-only-test-scheduler-ipc.md
audited_at: 2026-06-27
findings: 0
---

# Audit: dev-only-test-scheduler-ipc.md

## Verified (7)

- ✓ `src/main/ipc/test-scheduler.ts` exists.
- ✓ `_test:scheduler-registry` registered: `src/main/ipc/test-scheduler.ts:46`.
- ✓ `_test:scheduler-run-now` registered: `src/main/ipc/test-scheduler.ts:48`.
- ✓ `_test:scheduler-register` registered: `src/main/ipc/test-scheduler.ts:52`.
- ✓ `_test:scheduler-simulate-wake` registered as a no-op (`return { ok: true }`): `src/main/ipc/test-scheduler.ts:72-74`.
- ✓ `seedTestJobsFromEnv` reads `WHEELBASE_TEST_JOBS`: `src/main/ipc/test-scheduler.ts:26-27`.
- ✓ Guarded by `NODE_ENV === 'test'`: registration happens only inside the `if (process.env.NODE_ENV === 'test')` block at `src/main/index.ts:230-232` (which calls both `seedTestJobsFromEnv` and `registerTestSchedulerIpc`). Note: the gate is at the call site in `index.ts`, not inside `test-scheduler.ts` itself, but the effect matches the ADR.

## Drift (0)

None.

## Unverifiable (1)

- ? "simulate-wake stub becomes a real wake-up trigger if the implementation switches to absolute fire-at timestamps" — forward-looking design note, not verifiable.

## Missing files (0)

- ✓ Feature page `../../features/us-46-polling-scheduler.md` and `../../contracts/ipc-handlers.md` exist.
