---
page: docs/spec/features/us-46-polling-scheduler.md
audited_at: 2026-06-27
findings: 1
---

# Audit: us-46-polling-scheduler.md

## Verified (15)

- ✓ All 5 listed source files exist.
- ✓ `PollingScheduler` interface with `register(config)`, `start()`, `stop()`, `runNow(jobName)`, `getRegistry()` — `src/main/services/polling-scheduler.ts:27-32`.
- ✓ `createPollingScheduler(getBroker, clock?)` factory taking a broker getter — `src/main/services/polling-scheduler.ts:99`.
- ✓ `SchedulerError` with `code: 'already_registered' | 'job_not_found' | 'not_started'` — `src/main/services/polling-scheduler.ts:35-41`.
- ✓ Duplicate registration throws `already_registered`; missing job in `runNow` throws `job_not_found` — `polling-scheduler.ts:214,254`.
- ✓ Pure helpers `decideNextCadenceMs(policy, status)` and `decideAfterCloseFireAt(nextClose, offsetMinutes, nowMs)` — `polling-scheduler.ts:47,62`.
- ✓ `CadencePolicy` union `{ kind: 'interval'; marketOpenMs; extendedHoursMs?; marketClosedMs? }` | `{ kind: 'afterClose'; offsetMinutes }` — `polling-scheduler.ts:4-11`.
- ✓ `JobConfig` `{ name; cadence; handler }` and `JobRegistryEntry` — `polling-scheduler.ts:15-17,21`.
- ✓ `scheduleTick` park-wake path used for `null` cadence and stale-nextOpen fallback to `marketOpenMs` — `polling-scheduler.ts:108,131,137,152`.
- ✓ Module-level singleton `export const scheduler = createPollingScheduler(getSafeBroker)` (getter passed, not called) + `getSafeBroker()` fallback — `src/main/services/scheduler-instance.ts:26,18`.
- ✓ Dev-only IPC `_test:scheduler-registry`, `_test:scheduler-run-now`, `_test:scheduler-register`, `_test:scheduler-simulate-wake` — `src/main/ipc/test-scheduler.ts:46,48,52,72`.
- ✓ `seedTestJobsFromEnv()` reads `WHEELBASE_TEST_JOBS` — `src/main/ipc/test-scheduler.ts:26-27`.
- ✓ Bootstrap registers `detect-assignments` and starts scheduler — `src/main/index.ts:19`.
- ✓ e2e file has 13 `test(`/`it(` blocks (10 US-46 ACs + 3 US-49 park-wake) — matches page.
- ✓ All `../`-relative links resolve, including `architecture/02-adrs/park-wake-reuses-scheduletick.md`, `architecture/01-overview.md`, and the cross-referenced feature pages (us-35, us-47-49, us-48).

## Drift (1)

- ✗ Page (lines 42, 50, 69) states `before-quit` awaits `Promise.all([scheduler.stop(), marketDataProvider.disconnect()])`. The actual call is `Promise.all([scheduler.stop(), marketDataFactory.disconnect()])` — `src/main/index.ts:261`. The behavior (concurrent stop + disconnect, then `app.exit(0)`) is correct; only the collaborator name (`marketDataProvider` → `marketDataFactory`) differs. Low severity. Suggested fix: update the name in the page.

## Unverifiable (1)

- ? AC-9 ("system wake fires no missed ticks — structurally impossible") and the 5-second drain-timeout cleanup in `.finally` are design/runtime claims; the setTimeout-chain structure is present in code but the no-missed-tick guarantee is argued, not statically assertable.

## Missing files (0)
