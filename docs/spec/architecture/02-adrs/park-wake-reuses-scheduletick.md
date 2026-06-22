# ADR: Park-wake timer reuses scheduleTick; stale nextOpen falls back to marketOpenMs

<!-- generated:from us-47-49 -->

## Decision

When a `marketClosedMs: null` interval job parks at market close, the wake timer is queued via the same `scheduleTick(state, delayMs)` path as a normal cadence tick — no new state slot (`state.parkTimerId`) is introduced. If `status.nextOpen` is missing, unparseable, or in the past, the job falls back to `scheduleTick(state, cadence.marketOpenMs)` rather than staying permanently parked.

## Why

**Reusing scheduleTick** means `state.timerId` always holds the one pending callback for the job — whether it's a regular tick, a park-wake, or a stale-nextOpen fallback. The existing `stop()` loop clears `state.timerId` unconditionally, so park-wake timers are cancelled at shutdown at zero extra cost. A separate `state.parkTimerId` would double the cleanup surface.

**Stale-nextOpen fallback** prevents permanent parking when the broker returns a `nextOpen` in the past due to clock skew, a malformed response, or a date that was correct when fetched but is now stale. `marketOpenMs` is always present on interval policies; the next tick re-evaluates session and re-parks if the market is still closed.

Re-fetching market status immediately (zero delay) was rejected: it could busy-loop under persistent clock skew or bad broker data.

## Consequences

- `reschedule()` in `src/main/services/polling-scheduler.ts` extended with an `else` branch inside the interval-job block:
  - Valid future `nextOpen` → `scheduleTick(state, wakeDelayMs)` + INFO log: `"job {name} parked until next market open at {nextOpen}"`
  - Stale/missing `nextOpen` → `scheduleTick(state, cadence.marketOpenMs)` + WARN log: `"nextOpen was unusable for {name}; scheduling fallback re-check"`
- `stop()`, `scheduleTick()`, and the public `PollingScheduler` interface are unchanged.
- The e2e suite (`e2e/polling-scheduler.spec.ts`) gained 3 new AC scenarios verifying park-wake timing and clean shutdown.

## Sources

- [extract: us-47-49](../../.extracts/us-47-49.md) — ADRs "park-wake timer reuses scheduleTick" and "stale-nextOpen fallback uses marketOpenMs"
- [feature: us-47-49-broker-ac-hardening](../../features/us-47-49-broker-ac-hardening.md)
- [feature: us-46-polling-scheduler](../../features/us-46-polling-scheduler.md)
<!-- /generated -->
