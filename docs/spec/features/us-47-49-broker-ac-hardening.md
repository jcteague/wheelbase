# US-47 / US-49: AlpacaBrokerProvider Hardening + Scheduler Park-Wake Resume

<!-- generated:from us-47-49 -->

## Summary

US-47 completes the remaining correctness gaps in `AlpacaBrokerProvider` that were deferred from US-40: money normalization to 4dp, consistent auth-error shape with a navigation deeplink, and paper+live-key mismatch detection in both directions. US-49 adds parked-job self-resume to `PollingScheduler` so `marketClosedMs: null` interval jobs automatically schedule a wake timer at `status.nextOpen` instead of parking permanently. No new database tables, IPC channels (beyond the `deeplink` field on the error envelope), or UI components were introduced.

## Acceptance criteria

### US-47

- **AC-1:** `getAccountInfo` normalizes `buyingPower`, `portfolioValue`, and `cash` to 4dp strings; `environment` and `accountNumberMasked` are unchanged.
- **AC-2:** Every broker method rejects missing credentials with `BrokerError('auth_failed', 'Alpaca credentials not configured', 'settings/credentials/alpaca')`.
- **AC-3:** Broker IPC error payload includes `code`, `message`, and `deeplink` for auth failures; forwarded via `handleIpcCall`.
- **AC-4:** Paper environment with a live key (starts with `AK`) returns `BrokerError('environment_mismatch', 'Environment mismatch — these are LIVE keys, not paper keys')` on HTTP 401.
- **AC-5:** Paper environment with a paper key (starts with `PK`) on HTTP 401 returns `auth_failed`, not `environment_mismatch`.
- **AC-6:** Live environment routes to live Alpaca host (`paper: false`); returned `environment` field is `'live'`.

### US-49

- **AC-1:** A `marketClosedMs: null` interval job schedules a single wake timer at `status.nextOpen` when market is closed; logs INFO `job {name} parked until next market open at {nextOpen}`.
- **AC-2:** When the wake timer fires and market is open, the job resumes `marketOpenMs` cadence.
- **AC-3:** When the wake timer fires during pre/post-market, the job resumes `extendedHoursMs` cadence.
- **AC-4:** Launching after hours parks the job after the initial tick with exactly one pending timer.
- **AC-5:** `stop()` cancels the park-wake timer (structural: `scheduleTick` stores the id in `state.timerId`, which the existing `clearTimeout` loop already clears).
- **AC-6:** Stale/past `nextOpen` falls back to `marketOpenMs` re-check; logs WARN `nextOpen was unusable for {name}; scheduling fallback re-check`.
- **AC-7:** System wake does not fire a burst — structurally guaranteed because only one timer is queued per job at any time.

## What was built

**US-47 broker hardening:**

`BrokerError` (in `src/main/integrations/broker-provider.ts`) gained an optional `deeplink?: string` constructor parameter stored as a readonly field. `requireCredentials()` in `AlpacaBrokerProvider` now throws with `deeplink: 'settings/credentials/alpaca'`. Both `getActivities()` and `getMarketStatus()` now call `this.requireCredentials()` as their first line, ensuring missing-credential errors are consistently typed `auth_failed` with the deeplink rather than falling through to `wrapError` as `unknown`. The paper-env + AK-key mismatch direction was added to `wrapError()` (the opposite direction, live-env + PK-key, was already handled). `getAccountInfo()` now normalizes all three money fields via `toMoney(s: string) = new Decimal(s).toFixed(4)`. `handleIpcCall` in `src/main/ipc/utils.ts` has a dedicated `BrokerError` branch that spreads `deeplink` onto the `{ ok: false }` envelope when present.

**US-49 park-wake resume:**

Inside `reschedule()` in `src/main/services/polling-scheduler.ts`, the interval branch previously had `if (delayMs !== null) scheduleTick(state, delayMs)` and silently did nothing when `delayMs` was null. It now has an `else` branch that computes `wakeDelayMs = new Date(status.nextOpen).getTime() - clock.now()`. If positive, it calls `scheduleTick(state, wakeDelayMs)` (logging INFO) — reusing the same timer slot, so `stop()` cancels it at no extra cost. If zero or negative (stale `nextOpen`), it falls back to `scheduleTick(state, cadence.marketOpenMs)` and logs WARN. The `stop()` method and the `PollingScheduler` public interface are unchanged.

## Architecture decisions

- **deeplink as top-level IPC envelope field** — `deeplink?: string` sits alongside `errors[]` on `{ ok: false }` so the renderer can navigate the user directly without digging into `errors[0]`. See [ADR: deeplink-in-ipc-error-envelope](../architecture/02-adrs/deeplink-in-ipc-error-envelope.md).
- **park-wake timer reuses scheduleTick** — No new `state.parkTimerId` field; the wake timer occupies the same `state.timerId` slot as a normal tick so `stop()` cancels it without any changes. See [ADR: park-wake-reuses-scheduletick](../architecture/02-adrs/park-wake-reuses-scheduletick.md).
- **stale-nextOpen fallback to marketOpenMs** — Prevents permanent parking when the broker returns a past `nextOpen` due to clock skew or a malformed response. See [ADR: park-wake-reuses-scheduletick](../architecture/02-adrs/park-wake-reuses-scheduletick.md).

## Contracts touched

- `BrokerError` class — `deeplink?: string` field added. Source: `src/main/integrations/broker-provider.ts`. See [contracts/alpaca-integration.md](../contracts/alpaca-integration.md).
- IPC error envelope — `{ ok: false, deeplink?: string, errors: [...] }`. Source: `src/main/ipc/utils.ts`. See [contracts/ipc-handlers.md](../contracts/ipc-handlers.md).
- `AccountInfo` — `buyingPower`, `portfolioValue`, `cash` normalized to 4dp strings. Source: `src/main/integrations/alpaca-broker.ts`.
- `createPollingScheduler` cadence behaviour — `marketClosedMs: null` now parks + schedules wake, not park-forever. Source: `src/main/services/polling-scheduler.ts`. See [US-46](./us-46-polling-scheduler.md).

## Source files

- `src/main/integrations/broker-provider.ts` — `BrokerError` class: `deeplink` field
- `src/main/integrations/alpaca-broker.ts` — `requireCredentials()`, `getActivities()`, `getMarketStatus()`, `wrapError()`, `getAccountInfo()`, `toMoney()` helper
- `src/main/ipc/utils.ts` — `handleIpcCall`: split `BrokerError` branch; `deeplink` forwarding
- `src/main/services/polling-scheduler.ts` — `reschedule()`: park-wake block in interval branch
- `e2e/polling-scheduler.spec.ts` — 3 US-49 AC scenarios appended (AC-1, AC-4, AC-5)

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
