# US-48: Close US-35 code-review gaps (scheduler + Settings handlers)

**As a** wheel trader who configured Alpaca after first launch,
**I want** assignment polling to resume immediately when I save credentials, the app to shut down cleanly, and the Settings page Test Connection buttons to surface failures,
**So that** the US-35 detection loop works end-to-end without restarts and credential mistakes are diagnosable.

---

## Context

A post-merge code review on the `us-35` branch surfaced three correctness defects that ship as part of US-35 / US-46:

1. **Scheduler captures a stale broker at module import** — `scheduler-instance.ts` resolves the broker once via `getSafeBroker()` at module load (before `brokerFactory.configure()` runs in `app.whenReady`). When the user starts the app without credentials and later saves them, `brokerFactory.recreate()` updates the broker for IPC handlers and the detect-assignments job handler, but the scheduler's own `reschedule()` loop still queries the captured fallback broker, which always returns `session: 'closed'`. Combined with the detect-assignments cadence (`marketClosedMs: null`), the job runs once at startup and never reschedules until the app is restarted.
2. **`stop()` leaks the 5-second drain timeout** — `polling-scheduler.ts` races the in-flight drain against a 5 s `setTimeout`, but never clears that timer when the drain wins. The orphaned timer keeps the Electron event loop alive for up to 5 s on every quit, and shows up in scheduler tests as unsettled timers under fake clocks.
3. **Settings page Test Connection handlers swallow rejections** — `handleMassiveTestConnection`, `handleTestConnection`, and `handleStoredConnectionTest` only branch on `result.ok` after the `mutateAsync` await. If the mutation itself rejects (IPC throws, preload missing, network failure on the shared Massive key), the rejection becomes an unhandled promise rejection and the user sees no feedback at all — particularly easy to hit on the first-run empty state for Massive.

This story does not add new behavior; it closes the gaps so the US-35 and US-46 acceptance criteria hold in steady state.

---

## Acceptance Criteria

```gherkin
Background:
  Given the Wheelbase Electron app is running with the US-35 / US-46 baseline

Scenario: Assignment polling resumes after credentials are saved at runtime
  Given the app started with no Alpaca credentials configured
  And the detect-assignments job is registered with cadence marketClosedMs:null
  When the trader saves valid Alpaca paper credentials via the Settings page
  And brokerFactory.recreate() runs
  Then the next scheduler reschedule resolves the broker fresh from brokerFactory
  And getMarketStatus is invoked on the live Alpaca broker (not the fallback)
  And the detect-assignments job reschedules at the market-open or extended-hours cadence
  And the job continues to poll until stop() is called

Scenario: Switching the active broker environment refreshes the scheduler's broker source
  Given Alpaca paper credentials are configured and active
  And the detect-assignments job is currently scheduled
  When the trader switches the active broker environment to live
  And brokerFactory.recreate() runs
  Then subsequent scheduler reschedule() calls use the live broker
  And no further calls are made against the previously cached paper broker

Scenario: stop() does not leak the drain timeout when the in-flight drain wins
  Given the scheduler has one in-flight job invocation
  When stop() is called
  And the in-flight handler resolves before the 5-second timeout
  Then the 5-second timeout is cleared
  And no further timer callbacks fire after stop() resolves
  And vitest fake-timer counts return to zero after the drain promise settles

Scenario: stop() still falls back to the 5-second timeout when drain stalls
  Given the scheduler has one in-flight job invocation that never resolves
  When stop() is called
  Then stop() resolves after at most 5 seconds via the timeout path
  And the timeout is fired exactly once (no orphan reschedules of the timeout)

Scenario: Massive Test Connection surfaces IPC-level failures
  Given the shared Massive API key is misconfigured or absent
  When the trader clicks Test Connection on the Massive section of the Settings page
  And the underlying mutateAsync({ vendor: 'massive' }) call rejects with an ApiError
  Then the Settings page shows an error-tone message line with the rejection's message
  And no unhandled promise rejection is logged

Scenario: Alpaca Test Connection (unsaved credentials) surfaces IPC-level failures
  Given the trader has typed unsaved Alpaca credentials into the paper or live card
  When the trader clicks Test connection
  And the underlying testConnection.mutateAsync call rejects with an ApiError
  Then the card shows an error-tone message line with the rejection's message
  And no unhandled promise rejection is logged

Scenario: Alpaca Test Connection (stored credentials) surfaces IPC-level failures
  Given the trader has saved Alpaca credentials for paper or live
  When the trader clicks Test connection on the read-only credential card
  And the underlying testStoredAlpacaConnection.mutateAsync call rejects with an ApiError
  Then the card shows an error-tone message line with the rejection's message
  And no unhandled promise rejection is logged
```

---

## Technical Notes

- **Scheduler broker provider injection.** Change `createPollingScheduler` in `src/main/services/polling-scheduler.ts` to accept a `BrokerProvider` getter `() => BrokerProvider` instead of a `BrokerProvider` instance. `reschedule()` and `startAfterClose()` resolve the broker on every call. Mirrors the lazy resolution already used by `registerBrokerHandlers(() => brokerFactory.create())` at `src/main/index.ts:143`.
- **scheduler-instance.ts.** Update `createPollingScheduler(getSafeBroker())` to pass `getSafeBroker` itself (the function, called fresh each tick). Keep `fallbackBroker` for the bootstrap window before `brokerFactory.configure()` runs.
- **stop() timeout cleanup.** Capture the `clock.setTimeout` id, attach a `.finally(() => clock.clearTimeout(timerId))` to the `Promise.race`, and ensure the cleanup runs whether drain or timeout wins.
- **Settings handlers.** Wrap each `mutateAsync` await in a try/catch. On rejection, call the existing `setMessage({ tone: 'error', text: getApiErrorMessage(error) })` pattern already used by `handleSave`. Both Alpaca handlers should set `message` on the card's local state; the Massive handler should set the page-level `massiveMessage`.
- **No new components, IPC channels, or schemas.** All changes are in `polling-scheduler.ts`, `scheduler-instance.ts`, and `SettingsPage.tsx`.

---

## Out of Scope

- The broader code-review findings flagged but not promoted to P1/P2 (assignment banner query-key mismatch, Alpaca `since` watermark `date` vs `after`, `before-quit` Promise.all hang risk, `assignments:confirm`/`dismiss` envelope shape, timezone-naive assignment date, PAPER pill `!== 'live'`, derived-state-from-props in `AlpacaCredentialCard`, `start()` non-idempotency, `stop()` irreversibility, `runNow` ignoring `stopped`, `_test:*` preload surface, asymmetric environment-mismatch check, swallowed non-auth broker errors).
- New polling cadences, new scheduler jobs, or scheduler API changes beyond the getter swap.
- Reworking the Settings page layout or React Hook Form structure.

---

## Dependencies

- US-35 (assignment detection)
- US-46 (polling scheduler)
- US-37 (Settings page / active broker environment toggle)

---

## Estimate

2 points
