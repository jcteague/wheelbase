# US-48: US-35 Code-Review Fixes (Scheduler + Settings)

<!-- generated:from us-48 -->

## Summary

Three small correctness fixes closing gaps surfaced by the post-merge code review on US-35: (1) `createPollingScheduler` now accepts a broker **getter** (`() => BrokerProvider`) so the scheduler always resolves fresh credentials on each tick rather than capturing a stale instance at creation time; (2) `stop()`'s 5-second drain-fallback timeout is cleared in `.finally` when the drain wins, preventing a timer leak that could delay process exit; (3) the three **Test Connection** handlers in `SettingsPage.tsx` now wrap `mutateAsync` in try/catch and surface the rejection via `getApiErrorMessage(error)` rather than swallowing it silently. No DB migrations, no new IPC channels, no schema changes.

## Acceptance criteria

- **Scheduler getter injection:** `reschedule()` and `startAfterClose()` call the getter fresh on every tick; swapping broker credentials propagates without app restart.
- **stop() timeout cleanup:** When the in-flight drain resolves before the 5-second fallback, the fallback timer is cleared. No pending timers remain after `stop()` resolves.
- **stop() fallback still fires:** When the drain stalls, the 5-second fallback timer fires and resolves `stop()`.
- **Settings Test Connection error surfacing (Massive):** Clicking **Test connection** under Market Data → Massive when `mutateAsync` rejects shows an error-tone message under the Massive section.
- **Settings Test Connection error surfacing (Alpaca, unsaved):** Clicking **Test connection** in the Alpaca card while in editing mode (no stored credentials) shows an error-tone message inside the card.
- **Settings Test Connection error surfacing (Alpaca, stored):** Clicking **Test connection** in the Alpaca card while credentials are already stored shows an error-tone message inside the card.

## What was built

**Broker getter injection (`polling-scheduler.ts` + `scheduler-instance.ts`):**

`createPollingScheduler` signature changed from `(brokerProvider: BrokerProvider, clock?)` to `(getBroker: () => BrokerProvider, clock?)`. The two internal call sites — `getBroker().getMarketStatus()` in `reschedule()` and `startAfterClose()` — now resolve the broker fresh per tick. `scheduler-instance.ts` changed from `createPollingScheduler(getSafeBroker())` (calling the getter once at import time) to `createPollingScheduler(getSafeBroker)` (passing the getter through). `getSafeBroker` continues to act as the bootstrap-window safety net that returns a stub `BrokerProvider` before `brokerFactory.configure()` runs.

**stop() timeout cleanup (`polling-scheduler.ts`):**

`stop()` now captures the drain-fallback `setTimeout` id and clears it inside `.finally(() => clock.clearTimeout(timeoutId))` so the timer is always cancelled whether the drain wins or the timeout fires first.

**Settings rejection handling (`SettingsPage.tsx`):**

`handleMassiveTestConnection`, `handleTestConnection`, and `handleStoredConnectionTest` each now wrap their `await mutateAsync(...)` call in try/catch. On rejection, they call the relevant `setMessage({ tone: 'error', text: getApiErrorMessage(error) })`. `getApiErrorMessage` is an existing helper that handles `ApiError` shapes and falls back to `'Unable to complete the request'` for unknown reject values.

## Architecture decisions

None recorded. These are correctness fixes; all three patterns (broker getter, timer cleanup, try/catch) were already established conventions elsewhere in the codebase.

## Contracts touched

- `createPollingScheduler` signature — parameter type changed from `BrokerProvider` to `() => BrokerProvider`. **Breaking change** (consumers must wrap broker instances in a getter). Source: `src/main/services/polling-scheduler.ts`. See [US-46: Polling Scheduler](./us-46-polling-scheduler.md).

## Source files

- `src/main/services/polling-scheduler.ts` — `createPollingScheduler` signature; `reschedule()` and `startAfterClose()` call sites; `stop()` timeout cleanup
- `src/main/services/scheduler-instance.ts` — `createPollingScheduler(getSafeBroker)` (getter, not result)
- `src/renderer/src/pages/SettingsPage.tsx` — `handleMassiveTestConnection`, `handleTestConnection`, `handleStoredConnectionTest` wrapped in try/catch

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
