---
page: docs/spec/features/us-46-polling-scheduler.md
audited_at: 2026-09-28
findings: 7
---

# Audit: us-46-polling-scheduler.md

## Verified (15)

- ✓ All 5 listed source files exist (`polling-scheduler.ts`, `scheduler-instance.ts`, `ipc/test-scheduler.ts`, `index.ts`, `e2e/polling-scheduler.spec.ts`).
- ✓ `PollingScheduler` interface with `register`, `start`, `stop(): Promise<void>`, `runNow`, `getRegistry` — `src/main/services/polling-scheduler.ts:33-39`.
- ✓ `SchedulerError` with `code: 'already_registered' | 'job_not_found' | 'not_started'` — `polling-scheduler.ts:41-49`.
- ✓ Duplicate registration throws `already_registered` — `polling-scheduler.ts:238`; `runNow` on an unknown job throws `job_not_found` — `polling-scheduler.ts:281`.
- ✓ `CadencePolicy` union `{ kind: 'interval'; marketOpenMs; extendedHoursMs?; marketClosedMs? }` | `{ kind: 'afterClose'; offsetMinutes }` — `polling-scheduler.ts:4-11`.
- ✓ Pure helpers `decideNextCadenceMs(policy, status)` and `decideAfterCloseFireAt(nextClose, offsetMinutes, nowMs)` — `polling-scheduler.ts:53,68`.
- ✓ Park-wake: `null` cadence schedules `scheduleTick(state, wakeDelayMs)` at `status.nextOpen`; an unusable `nextOpen` falls back to `marketOpenMs` with a WARN — `polling-scheduler.ts:152-168`.
- ✓ A rejected handler is logged at WARN and swallowed, and the chain continues — `polling-scheduler.ts:143-149`.
- ✓ `stop()` clears timers, races `Promise.all([...inFlight])` against a 5 s timeout, and clears the losing timer in `.finally` — `polling-scheduler.ts:250-273`.
- ✓ Jobs registered after `start()` auto-schedule — `polling-scheduler.ts:241`.
- ✓ Dev-only IPC `_test:scheduler-registry`, `_test:scheduler-run-now`, `_test:scheduler-register`, `_test:scheduler-simulate-wake` — `src/main/ipc/test-scheduler.ts:46-83`; registered only under `NODE_ENV === 'test'` — `src/main/index.ts:308-310`.
- ✓ Bootstrap registers the detect-assignments job (`DETECT_ASSIGNMENTS_JOB_NAME`) and calls `scheduler.start()` — `src/main/index.ts:240,329`.
- ✓ `before-quit` awaits `Promise.all([scheduler.stop(), marketDataFactory.disconnect()])`, then `app.exit(0)` — `src/main/index.ts:337-341`.
- ✓ The US-35 watermark lives in `app_settings` under key `assignments_last_poll_at:<env>` — `src/main/services/detect-assignments.ts:87`.
- ✓ The e2e spec has 13 `it(` blocks: 10 US-46 ACs (`e2e/polling-scheduler.spec.ts:52-229`) plus 3 US-49 (`:260,281,299`). All relative links resolve.

## Drift (7)

- ✗ **The scheduler no longer takes a broker.** The page (What was built, Contracts) says `createPollingScheduler(getBroker: () => BrokerProvider, clock?)` and that each tick reads `BrokerProvider.getMarketStatus()`. The code has `createPollingScheduler(getStatusSource: () => MarketStatusSource, clock)` — `src/main/services/polling-scheduler.ts:111-114` — and imports `MarketStatusSource` from `integrations/market-data-provider` (`:1`). Market status moved to the MarketDataProvider port. Suggested fix: rename to a status-source getter throughout.
- ✗ **`getSafeBroker()` no longer exists.** The page says the singleton is `createPollingScheduler(getSafeBroker)`, which wraps `brokerFactory.create()` with a closed-session stub. The code has `export const scheduler = createPollingScheduler(() => statusSource)` — `src/main/services/scheduler-instance.ts:36`. `statusSource` wraps `marketDataFactory.create().getMarketStatus()`, degrades to a closed status only on `MarketDataError` `auth_failed`, and re-throws every other error (`scheduler-instance.ts:23-34`). A grep for `getSafeBroker` in `src/` finds nothing. Credential changes propagate through `marketDataFactory`, not `brokerFactory.configure()`.
- ✗ **Tick order.** The page's step list says a tick reads status, schedules the next `setTimeout`, then awaits the handler. The code runs the handler first and reschedules after (`tick()` → `runTracked` → `reschedule`) — `polling-scheduler.ts:204-208`. When the market-status read fails, the job falls back to `marketOpenMs` (`:173-183`); the page does not describe this.
- ✗ **`runNow` changes the chain.** The page says `runNow` "invokes the handler immediately ... without disturbing the regular chain". The code clears the pending timer, runs, then reschedules, and joins an in-flight run instead of starting a second one — `polling-scheduler.ts:285-297`. The signature is `runNow(jobName, opts?: { trigger?: JobTrigger }): Promise<unknown>` (`:37`), not `Promise<void>`.
- ✗ **`JobConfig.handler` shape.** The page says `handler: () => Promise<void>`. The code has `handler: JobHandler` = `(ctx: JobRunContext) => Promise<unknown>`, with `trigger: 'scheduled' | 'explicit'` — `polling-scheduler.ts:15-25`.
- ✗ **`WHEELBASE_TEST_JOBS` format.** The page says it is "comma-separated job names". The code `JSON.parse`s it as `TestJobFixture[]` (`{ name, cadence, throws? }`) — `src/main/ipc/test-scheduler.ts:26-33`.
- ✗ **The test IPC list is incomplete, and it does reach `window.api`.** A fifth channel, `_test:scheduler-run-scheduled`, exists (`src/main/ipc/test-scheduler.ts:55`) and is not listed. The page says the test IPC avoids "polluting `window.api`", but the preload exposes `testScheduler*` methods unconditionally — `src/preload/index.ts:94-98`.

## Unverifiable (3)

- ? AC-9's claim that missed ticks are "structurally impossible" is argued from the setTimeout-chain design and cannot be checked statically.
- ? "`start()` invokes every registered job once": interval jobs get `scheduleTick(state, 0)` (`polling-scheduler.ts:227-229`), but afterClose jobs only compute a fire time (`:212-224`). It is unclear whether AC-2 is meant to cover afterClose jobs.
- ? The follow-on "Area H1" lazy `getScheduler()` is a backlog note, not code.

## Missing files (0)
