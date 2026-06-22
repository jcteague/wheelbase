# US-46: Polling Scheduler

<!-- generated:from us-35,us-47-49,us-48 -->

## Summary

A shared, market-session-aware job scheduler for the main process. Stories that need to poll something (broker activities, IVR collection, future cron-style background jobs) register a named handler plus a cadence policy and let one singleton scheduler own the timing. The scheduler uses a chained `setTimeout` per job — one tick at a time, decided per-tick from current market status — so async handlers serialise naturally, system sleep never produces a burst of missed-tick fires, and `setInterval` pile-up is structurally impossible. The scheduler is in-memory only; handlers that need watermarks own their own persistence. The first consumer is [US-35 assignment detection](./us-35-assignment-detection.md), which registers `detect-assignments` with an `interval` policy.

## Acceptance criteria

- **AC-1:** Register an interval job.
- **AC-2:** `start()` invokes every registered job once and then on cadence.
- **AC-3:** Market-hours-aware interval with `marketClosedMs: null` parks the job at market close and schedules a wake timer at `status.nextOpen`; the job auto-resumes when the timer fires (US-49).
- **AC-4:** Market-hours-aware interval with extended hours uses a different cadence from regular hours.
- **AC-5:** After-market-close cron-style job runs once per trading day at `marketClose + offsetMinutes`; skips weekends/holidays; missed runs are not backfilled.
- **AC-6:** Handler exception does not stop the scheduler (WARN log, reschedule next tick, no pile-up).
- **AC-7:** `runNow(jobName)` triggers an out-of-band invocation.
- **AC-8:** `stop()` cancels all pending invocations and drains in-flight handler promises with a 5-second timeout.
- **AC-9:** System wake from sleep does not fire missed ticks (structurally impossible with the setTimeout-chain primitive).
- **AC-10:** Concurrent registration of the same job name is rejected with `SchedulerError('already_registered')`.

Coverage lives in `e2e/polling-scheduler.spec.ts` (10 scenarios, one per AC).

## What was built

The `PollingScheduler` interface and `createPollingScheduler(getBroker: () => BrokerProvider, clock?)` factory in `src/main/services/polling-scheduler.ts`. The factory accepts a broker **getter** rather than a broker instance (changed in US-48) so the scheduler always resolves fresh credentials per tick — credential changes propagate without app restart. Each `register(config)` call appends a `JobRegistryEntry` keyed by name; duplicate names throw `SchedulerError('already_registered')`. `start()` flips a started flag, invokes every registered handler once, then schedules each job's next tick via `setTimeout(handlerWrapper, cadenceMs)`. Jobs registered after `start()` auto-schedule on registration. Each tick:

1. Reads `BrokerProvider.getMarketStatus()` once (cached for the tick to avoid double-calls).
2. Resolves cadence via `decideNextCadenceMs(policy, status)` (interval) or `decideAfterCloseFireAt(nextClose, offsetMinutes, nowMs)` (afterClose).
3. If cadence is `null` (market closed + `marketClosedMs: null`), schedules a park-wake timer at `status.nextOpen` via `scheduleTick(state, wakeDelayMs)` (US-49). If `nextOpen` is stale or missing, falls back to `scheduleTick(state, cadence.marketOpenMs)` with a WARN log. No burst is possible because only one timer occupies `state.timerId` at a time.
4. Otherwise schedules the next `setTimeout`.
5. Awaits the handler. On rejection, logs WARN and continues — never tears down the chain.

The handler's promise is tracked in an in-flight set; `stop()` cancels all pending timers and awaits `Promise.all([...inFlight])` racing a 5-second `setTimeout` so a stuck handler can't block app shutdown. The race's losing timer is cleared after `Promise.race` resolves (see Revisions).

`runNow(jobName)` invokes the handler immediately and resolves when it settles, without disturbing the regular chain. `getRegistry()` returns a snapshot of registered jobs plus per-state invocation counters (used by the dev-only test IPC).

The module-level singleton in `src/main/services/scheduler-instance.ts` exports `const scheduler = createPollingScheduler(getSafeBroker)` (getter passed through, not called at import time — changed in US-48). `getSafeBroker()` wraps `brokerFactory.create()` in try/catch; on failure (missing credentials, bad config) it returns a stub `BrokerProvider` that reports `session: 'closed'` and otherwise no-ops. The singleton therefore loads cleanly at boot even with no broker configured — jobs simply park rather than crash the main process. When credentials are later saved and `brokerFactory.configure()` runs, the next tick picks up the new provider automatically via the getter.

Dev-only test IPC channels (`_test:scheduler-registry`, `_test:scheduler-run-now`, `_test:scheduler-register`, `_test:scheduler-simulate-wake`) are exposed via `src/main/ipc/test-scheduler.ts` and guarded by `NODE_ENV === 'test'`. `seedTestJobsFromEnv()` reads the `WHEELBASE_TEST_JOBS` env var (comma-separated job names) and registers tracked no-op handlers, letting Playwright specs assert registration without depending on a real broker.

`src/main/index.ts` registers the `detect-assignments` job at boot, calls `scheduler.start()`, and on `app.on('before-quit')` awaits `Promise.all([scheduler.stop(), marketDataProvider.disconnect()])` before `app.exit(0)`.

## Architecture decisions

- **setTimeout-chain primitive over `setInterval` or `node-cron`.** `setInterval` ignores async handlers and will fire a fresh tick even if the previous handler is still in flight, producing pile-up. Chained `setTimeout` serialises naturally and composes cleanly with per-tick market-session reads. `node-cron` is overkill, adds a dependency, and doesn't model "interval that varies by market session". RxJS `interval()` would work but the team prefers plain primitives here to keep cognitive load low. The chain is also why AC-9 holds without code: when a sleeping laptop wakes, only one timer is queued — there are no missed ticks to fire. Driven by US-46. See [`../architecture/02-adrs/`](../architecture/02-adrs/).
- **Scheduler does not persist state.** No `last_run_at`, no settings row, no journal. The scheduler is pure in-memory. Handlers that need "what did I see last time" own their own watermark (US-35 keeps `assignments_last_poll_at` in `app_settings`). Keeps the scheduler dumb, fast, and trivially testable. Driven by US-46.
- **Module-level singleton with safe-broker fallback.** Node module caching guarantees one scheduler instance; multiple stories (US-35 today, US-44 IVR collector and beyond) register on the same object. `getSafeBroker()` wraps the broker factory so missing credentials degrade to "parked jobs" rather than crashing at import time. A lazy `getScheduler()` factory with `resetSchedulerForTests()` is filed as a follow-on (Area H1) for cleaner test ergonomics. Driven by US-46.
- **Cadence is decided per tick, not per job.** Two pure helpers — `decideNextCadenceMs(policy, status)` and `decideAfterCloseFireAt(nextClose, offsetMinutes, nowMs)` — take the current market status and return the next delay (or `null` to park). This is what lets a single `interval` policy quote 60s during regular hours, 5 minutes during extended hours, and `null` while closed.
- **Consolidated `before-quit` shutdown.** A single `app.on('before-quit')` handler awaits `Promise.all([scheduler.stop(), marketDataProvider.disconnect()])` then `app.exit(0)`. Both subsystems shut down concurrently and cleanly; the previous fire-and-forget `disconnect()` no longer races the exit. `scheduler.stop()` drains in-flight handlers under a 5-second timeout so a stuck handler can't hang the quit. Driven by US-46.
- **Dev-only `_test:scheduler-*` IPC kept off the production surface.** E2E specs need to introspect the registry and trigger out-of-band runs without polluting `window.api`. The test IPC lives in its own handler file, registers only when `NODE_ENV === 'test'`, and exposes `getRegistry`, `runNow`, `register`, and a `simulateWake` stub. `WHEELBASE_TEST_JOBS` env-var seeding lets specs assert registration without depending on real broker credentials. Driven by US-46.

## Contracts touched

- **`PollingScheduler`** — service interface with `register(config)`, `start()`, `stop(): Promise<void>`, `runNow(jobName): Promise<void>`. Implementation: `src/main/services/polling-scheduler.ts`. Detailed in [`../contracts/ipc-handlers.md`](../contracts/ipc-handlers.md) under dev-only channels.
- **`CadencePolicy`** — discriminated union: `{ kind: 'interval'; marketOpenMs; extendedHoursMs?; marketClosedMs? }` or `{ kind: 'afterClose'; offsetMinutes }`. `marketClosedMs: null` parks the job overnight; `afterClose` fires once per trading day at `marketClose + offsetMinutes`, skipping weekends/holidays with no backfill.
- **`JobConfig`** — `{ name: string; cadence: CadencePolicy; handler: () => Promise<void> }`.
- **`SchedulerError`** — `Error` subclass with `code: 'already_registered' | 'job_not_found' | 'not_started'`.
- **`decideNextCadenceMs(policy, status)`** and **`decideAfterCloseFireAt(nextClose, offsetMinutes, nowMs)`** — pure helpers used by each tick to compute the next delay.
- **`createPollingScheduler(getBroker: () => BrokerProvider, clock?)`** — factory; broker getter called fresh each tick. Optional `Clock` injection for deterministic tests.
- **Dev-only IPC** — `_test:scheduler-registry`, `_test:scheduler-run-now`, `_test:scheduler-register`, `_test:scheduler-simulate-wake`. Registered only when `NODE_ENV === 'test'`. See [`../contracts/ipc-handlers.md`](../contracts/ipc-handlers.md).
- **`WHEELBASE_TEST_JOBS` env var** — comma-separated list of job names; `seedTestJobsFromEnv()` registers tracked no-op handlers for each at boot when set.

## Source files

- `src/main/services/polling-scheduler.ts` — `PollingScheduler` factory, cadence helpers, drain-on-stop, dynamic auto-start, `JobRegistryEntry` + `getRegistry()`, per-state invocation counters
- `src/main/services/scheduler-instance.ts` — module-level singleton, `getSafeBroker()` fallback
- `src/main/ipc/test-scheduler.ts` — dev-only IPC handlers, `seedTestJobsFromEnv()`
- `src/main/index.ts` — bootstrap: registers `detect-assignments`, calls `scheduler.start()`, awaits `Promise.all([scheduler.stop(), marketDataProvider.disconnect()])` in `before-quit`
- `e2e/polling-scheduler.spec.ts` — 10 US-46 AC scenarios + 3 US-49 park-wake scenarios

## Revisions

- **us-35** (original bundled story): shipped the `PollingScheduler` interface, `setTimeout`-chain factory, singleton instance with safe-broker fallback, consolidated `before-quit` shutdown, and dev-only `_test:scheduler-*` IPC channels alongside the US-35 assignment-detection consumer.
- **us-48** (US-35 code-review fixes): `createPollingScheduler` now takes `getBroker: () => BrokerProvider` instead of a broker instance, so credential changes propagate without restart. `scheduler.stop()` now captures the 5-second drain-timeout id and clears it in `.finally`, preventing a timer leak when the drain wins. See [US-48](./us-48-scheduler-settings-fixes.md).
- **us-49** (park-wake self-resume): `marketClosedMs: null` jobs now schedule a wake timer at `status.nextOpen` rather than parking permanently. Stale `nextOpen` falls back to `marketOpenMs`. Three new e2e AC scenarios in `e2e/polling-scheduler.spec.ts`. See [US-47/49](./us-47-49-broker-ac-hardening.md) and [ADR: park-wake-reuses-scheduletick](../architecture/02-adrs/park-wake-reuses-scheduletick.md).

## Cross-references

- [US-35: Assignment Detection & Auto-Transition](./us-35-assignment-detection.md) — first consumer; registers `detect-assignments` job.
- [US-47/49: Broker AC Hardening + Park-Wake](./us-47-49-broker-ac-hardening.md) — park-wake self-resume.
- [US-48: Scheduler + Settings Fixes](./us-48-scheduler-settings-fixes.md) — broker getter + stop() cleanup.
- [IPC handlers](../contracts/ipc-handlers.md) — dev-only `_test:scheduler-*` channels.
- [Architecture overview](../architecture/01-overview.md) — main-process services topology.
- [ADR: park-wake-reuses-scheduletick](../architecture/02-adrs/park-wake-reuses-scheduletick.md)

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
