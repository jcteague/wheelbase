# ADR: Scheduler is a module-level singleton with a safe-broker fallback

<!-- generated:from us-35 -->

## Decision

`src/main/services/scheduler-instance.ts` exports `const scheduler = createPollingScheduler(getSafeBroker)` evaluated at module load. Note the scheduler receives the `getSafeBroker` factory reference (uninvoked), not a constructed broker. `getSafeBroker()` wraps `brokerFactory.create()` in try/catch and returns a stub `BrokerProvider` when broker credentials are missing: its `getMarketStatus` reports `session: 'closed'`, `getActivities` returns `[]`, and `getAccountInfo` rejects with `Error('Broker not configured')`.

## Why

Multiple stories register on the same scheduler (US-35 detect-assignments, future US-44 IVR collector). Node's module cache guarantees singleton semantics across imports — no need for a separate registry. Eager evaluation simplifies the call sites: anyone can `import { scheduler }` and immediately `scheduler.register(...)` without first instantiating anything.

The safe-broker fallback exists so the module doesn't throw at import time when Alpaca credentials aren't configured. The degraded mode (parked jobs, no ticks) is the right behaviour for that environment — better than crashing at startup and preventing the user from even reaching the broker-configuration UI.

## Alternatives considered

- **Lazy `getScheduler()` factory** — improves test ergonomics (a fresh scheduler per test instead of `resetSchedulerForTests()`). Deferred to a follow-on per `code-review-fixes.md` Area H1 — the current singleton has worked through 1228 tests, so the refactor isn't blocking.
- **Throw at import when credentials are missing** — would block app startup before the user can reach Settings to enter their key; degraded mode is friendlier.

## Source

- `plans/us-35/green-phase-area6-results.md`
- `plans/us-35/code-review-fixes.md` (Area H1, deferred)
- Feature page: `../../features/us-46-polling-scheduler.md`
<!-- /generated -->
