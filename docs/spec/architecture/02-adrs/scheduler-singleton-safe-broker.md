# ADR: Scheduler is a module-level singleton with a safe-broker fallback

> **Superseded in part by US-116.** The module-level singleton stands. The _safe-broker_
> half does not: `getSafeBroker`, `fallbackBroker` and the `brokerFactory` import are
> deleted. `createPollingScheduler` now takes `getStatusSource: () => MarketStatusSource`
> — `Pick<MarketDataProvider, 'getMarketStatus'>` — because the exchange session is a
> market fact, not an account fact. See
> [market-status-pill](./market-status-pill.md) and
> [us-116](../../features/us-116-market-facts-from-market-data-provider.md).

<!-- generated:from us-35,us-116 -->

## Decision

`src/main/services/scheduler-instance.ts` exports `const scheduler = createPollingScheduler(() => statusSource)` evaluated at module load. The scheduler receives a getter (uninvoked), not a constructed provider, so a credential change takes effect on the next tick without a restart.

[US-116] `statusSource` is a `MarketStatusSource` object literal whose `getMarketStatus` wraps `marketDataFactory.create().getMarketStatus()`. Only a `MarketDataError` with code `auth_failed` — the unconfigured install — degrades to a synthetic `{ isOpen: false, session: 'closed' }`, logged at `debug` (not `warn`, or an unconfigured install spams the log every 60 s). Every other failure propagates to the scheduler's own "fall back to default cadence" branch, so a transient network blip cannot park a job until an unknown `nextOpen`.

The original wording described `getSafeBroker()` wrapping `brokerFactory.create()` and returning a stub `BrokerProvider`. That stub is gone: `marketDataFactory.create()` never throws (credentials resolve per request), so no try/catch is needed around construction at all — only around the call.

**Known limitation, carried over unchanged:** the synthetic status stamps `nextOpen` at module load, so it is always in the past. `decideNextCadenceMs` does return `null` for a `marketClosedMs: null` job, but `parkUntilNextOpen` then sees a non-positive delay and takes its fallback branch — a `warn` plus a re-tick at `marketOpenMs`. An unconfigured install therefore re-ticks rather than parking, which is the opposite of what this ADR's "Why" claims. Pre-existing (`fallbackBroker` behaved identically); fixing it needs a decision about how long an uncredentialed install should wait before retrying.

## Why

Multiple stories register on the same scheduler (US-35 detect-assignments, future US-44 IVR collector). Node's module cache guarantees singleton semantics across imports — no need for a separate registry. Eager evaluation simplifies the call sites: anyone can `import { scheduler }` and immediately `scheduler.register(...)` without first instantiating anything.

The degradation exists so the module doesn't raise on every tick when Alpaca credentials aren't configured. The intended degraded mode (parked jobs, no ticks) is the right behaviour for that environment — better than spinning against a provider that can only throw. See the known limitation above for how far that intent is actually realised.

## Alternatives considered

- **Lazy `getScheduler()` factory** — improves test ergonomics (a fresh scheduler per test instead of `resetSchedulerForTests()`). Deferred to a follow-on per `code-review-fixes.md` Area H1 — the current singleton has worked through 1228 tests, so the refactor isn't blocking.
- **Throw at import when credentials are missing** — would block app startup before the user can reach Settings to enter their key; degraded mode is friendlier.

## Source

- `plans/us-35/green-phase-area6-results.md`
- [extract: us-116](../../.extracts/us-116.md) — ADR "Unconfigured market data parks scheduled jobs"
- `plans/us-35/code-review-fixes.md` (Area H1, deferred)
- Feature page: `../../features/us-46-polling-scheduler.md`
<!-- /generated -->
