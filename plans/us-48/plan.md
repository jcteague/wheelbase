---
story: us-48
kind: fix
parent: us-35
topics: [scheduler, settings, broker]
status: planned
---

# Implementation Plan: US-48 — US-35 Code-Review Fixes

## Summary

Three small, independent fixes that close correctness gaps surfaced by the post-merge code review on `us-35`:

1. **Scheduler stale-broker bug** — `createPollingScheduler` takes a broker getter, not a broker instance; `scheduler-instance.ts` passes the getter through. `reschedule()` and `startAfterClose()` always resolve a fresh broker, so credential changes propagate without app restart.
2. **`stop()` timeout leak** — `stop()` clears its 5 s drain-fallback `setTimeout` whether the drain or the timeout wins.
3. **Settings Test Connection rejection handling** — `handleMassiveTestConnection`, `handleTestConnection`, and `handleStoredConnectionTest` wrap the `mutateAsync` await in try/catch and surface `getApiErrorMessage(error)` to the corresponding message state on rejection.

All three fixes are in the main process (1 + 2) and renderer (3). No DB migrations, no IPC surface changes, no schema changes.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/06-stories/US-48-us-35-code-review-fixes.md`
- **Originating reviews:**
  - First reviewer's P1/P2 list (this conversation, 2026-06-07)
  - This conversation's code-review JSON (findings #1, #15, sibling Settings handler analysis)
- **Affected files (existing):**
  - `src/main/services/polling-scheduler.ts`
  - `src/main/services/scheduler-instance.ts`
  - `src/renderer/src/pages/SettingsPage.tsx`
  - Test fixtures: `src/main/services/polling-scheduler.test.ts`, `src/renderer/src/pages/SettingsPage.test.tsx`

## Prerequisites

- No migrations.
- No new dependencies.
- Run order before starting: `pnpm test` to confirm green baseline; `npx electron-rebuild -f -w better-sqlite3 && pnpm rebuild better-sqlite3` if vitest reports ABI mismatch.

## Implementation Areas

---

### 1. Polling Scheduler — Broker Getter Injection

**Files to create or modify:**

- `src/main/services/polling-scheduler.ts` — change `createPollingScheduler(brokerProvider: BrokerProvider, clock?)` to `createPollingScheduler(getBroker: () => BrokerProvider, clock?)`; replace `brokerProvider.getMarketStatus()` in `reschedule()` (line 120) and `startAfterClose()` (line 159) with `getBroker().getMarketStatus()`.

**Red — tests to write:**

In `src/main/services/polling-scheduler.test.ts`:

- Test: `reschedule uses the latest broker from the getter on every call` — register an interval job, advance one tick, swap the broker returned by the getter (from "closed" to "regular"), advance another tick; assert the second `getMarketStatus` call hit the new broker instance and the next scheduled delay reflects `marketOpenMs`.
- Test: `startAfterClose uses the latest broker from the getter` — same shape for an `afterClose` cadence job.
- Test: `createPollingScheduler accepts a getter` — type-level / construction smoke test ensuring the signature matches.
- Update existing tests that pass a broker instance to wrap with `() => instance`.

**Green — implementation:**

- Change the signature: `export function createPollingScheduler(getBroker: () => BrokerProvider, clock: Clock = realClock): PollingScheduler`.
- Replace the two `brokerProvider.getMarketStatus()` call sites with `getBroker().getMarketStatus()`. Keep error handling identical (catch, warn, fall back to `marketOpenMs` for interval cadence).
- Do not cache the broker reference inside the closure beyond the single tick.

**Refactor — cleanup to consider:**

- Add a one-line JSDoc on `createPollingScheduler` explaining why a getter is required (broker can change at runtime when credentials are saved).
- Ensure the existing exported pure helpers (`decideNextCadenceMs`, `decideAfterCloseFireAt`) remain pure — no change needed.

**Acceptance criteria covered:**

- Scenario: Assignment polling resumes after credentials are saved at runtime
- Scenario: Switching the active broker environment refreshes the scheduler's broker source

---

### 2. Polling Scheduler — `stop()` Timeout Cleanup

**Files to create or modify:**

- `src/main/services/polling-scheduler.ts` — capture the `clock.setTimeout` id inside `stop()`, attach a `.finally` that always calls `clock.clearTimeout(timerId)`.

**Red — tests to write:**

In `src/main/services/polling-scheduler.test.ts`:

- Test: `stop clears the drain timeout when drain wins` — using `vi.useFakeTimers()` with the existing test clock helper, register an interval job whose handler resolves immediately, start the scheduler, call `stop()`, await the returned promise; assert no pending fake timers remain (`vi.getTimerCount() === 0` or equivalent project pattern).
- Test: `stop falls through the timeout when drain stalls` — register a job whose handler never resolves; call `stop()`; advance the fake clock by 5000 ms; assert the promise resolves and exactly one timeout fired.

**Green — implementation:**

- Inside `stop()` (lines 199–216), rewrite the race:

  ```ts
  if (inFlight.size === 0) return Promise.resolve()

  let timeoutId: TimerId | null = null
  const drainPromise = Promise.all([...inFlight]).then(() => {})
  const timeoutPromise = new Promise<void>((resolve) => {
    timeoutId = clock.setTimeout(resolve, 5_000)
  })

  return Promise.race([drainPromise, timeoutPromise]).finally(() => {
    if (timeoutId !== null) clock.clearTimeout(timeoutId)
  })
  ```

**Refactor — cleanup to consider:**

- If the test helper does not already abstract "advance fake clock", add a small helper in the test file (do not export from src).
- Confirm the project's clock abstraction (`type Clock`) already exposes `clearTimeout`; it does (`src/main/services/polling-scheduler.ts:78`).

**Acceptance criteria covered:**

- Scenario: stop() does not leak the drain timeout when the in-flight drain wins
- Scenario: stop() still falls back to the 5-second timeout when drain stalls

---

### 3. scheduler-instance.ts — Pass Getter Through

**Files to create or modify:**

- `src/main/services/scheduler-instance.ts` — change line 26 from `createPollingScheduler(getSafeBroker())` to `createPollingScheduler(getSafeBroker)`. Keep `fallbackBroker` and `getSafeBroker` as the bootstrap-window safety net.

**Red — tests to write:**

This area's behavior is exercised by the polling-scheduler tests in Area 1 (which prove the getter is called fresh). Add one integration-style test if a sibling test file exists for `scheduler-instance`:

- Test: `singleton scheduler resolves broker via the factory on each tick` — call `brokerFactory.configure(...)` after import, advance the scheduler one tick, assert the post-configure broker was used. (Skip this test if the module's singleton shape makes it impractical to test in isolation; the area-1 tests are sufficient to cover the contract.)

**Green — implementation:**

- One-line change: `export const scheduler = createPollingScheduler(getSafeBroker)`.

**Refactor — cleanup to consider:**

- The `fallbackBroker.getMarketStatus()` returns a `nextOpen`/`nextClose` captured at module-load time. This is fine as a bootstrap fallback; do not generalize.

**Acceptance criteria covered:**

- Scenario: Assignment polling resumes after credentials are saved at runtime (composed with Area 1)

**Cross-area dependency:** Depends on Area 1 (Green) being merged first because the new signature is required.

---

### 4. Settings Page — Test Connection Rejection Handling

**Files to create or modify:**

- `src/renderer/src/pages/SettingsPage.tsx` — wrap the `mutateAsync` await inside `handleMassiveTestConnection` (line 360), `handleTestConnection` (line 133), and `handleStoredConnectionTest` (line 171) in try/catch. On rejection, call `setMassiveMessage` / `setMessage` with the existing `{ tone: 'error', text: getApiErrorMessage(error) }` pattern already used by `handleSave` (line 163).

**Red — tests to write:**

In `src/renderer/src/pages/SettingsPage.test.tsx`:

- Test: `handleMassiveTestConnection sets error message when mutateAsync rejects` — mock `useTestSettingsConnection` to return a mutation whose `mutateAsync` rejects with a synthetic `ApiError`; click `Test connection` in the Market Data — Massive section; assert the page renders an error-tone `<p>` with the rejection message.
- Test: `handleTestConnection (paper card) sets error message when mutateAsync rejects` — same pattern, scoped to `data-testid="alpaca-card-paper"`; click the editing-mode `Test connection` button; assert error-tone message line.
- Test: `handleStoredConnectionTest (paper card) sets error message when mutateAsync rejects` — same pattern, with `configured: true` so the read-only view renders the stored `Test connection` button.

**Green — implementation:**

```ts
async function handleMassiveTestConnection(): Promise<void> {
  try {
    const result = await testConnection.mutateAsync({ vendor: 'massive' })
    if (result.ok && result.vendor === 'massive') {
      setMassiveMessage({ tone: 'success', text: 'Connected' })
      return
    }
    if (result.ok) return
    setMassiveMessage({ tone: 'error', text: result.message })
  } catch (error) {
    setMassiveMessage({ tone: 'error', text: getApiErrorMessage(error) })
  }
}
```

Apply the same try/catch shape to `handleTestConnection` and `handleStoredConnectionTest` inside `AlpacaCredentialCard`. Reuse the existing `getApiErrorMessage` helper at line 38 of `SettingsPage.tsx` — no new helper.

**Refactor — cleanup to consider:**

- If the three handlers share enough shape after the try/catch is added, extract a small `applyTestResult(result, setMessage)` helper at file scope and reuse from all three sites. Acceptable to defer if it does not measurably simplify; this story does not require the extraction.
- Confirm `getApiErrorMessage` correctly extracts a message from a non-`ApiError` reject value (it already falls through to `'Unable to complete the request'`). No change required.

**Acceptance criteria covered:**

- Scenario: Massive Test Connection surfaces IPC-level failures
- Scenario: Alpaca Test Connection (unsaved credentials) surfaces IPC-level failures
- Scenario: Alpaca Test Connection (stored credentials) surfaces IPC-level failures

---

## Verification Checklist

After each area, run:

- `pnpm test` — all unit + integration tests pass
- `pnpm lint` — no new lint errors
- `pnpm typecheck` — no new type errors
- `pnpm format` — formatted

After all four areas are merged:

- Manual smoke (use the `run` skill or `pnpm dev`): launch the app with no Alpaca credentials, configure paper credentials in Settings, wait for the next scheduler tick (60 s in market open or 300 s in extended hours), confirm a log line shows `getMarketStatus` against the configured broker rather than the fallback.
- `pnpm test:e2e -- assignment-detection.spec.ts polling-scheduler.spec.ts settings-environment.spec.ts` — confirm no regressions in the existing US-35 / US-46 e2e suite.

## Risks and Trade-offs

- **Scheduler getter swap.** Changing the constructor signature is API-breaking but the only consumer in the codebase is `scheduler-instance.ts`. Test fixtures that construct a scheduler ad-hoc will need a one-line wrap (`() => broker`). Acceptable trade-off for the correctness gain.
- **stop() cleanup with fake clocks.** Test must use whichever fake-clock pattern `polling-scheduler.test.ts` already uses; do not introduce a new vitest timer mode.
- **Settings handler try/catch.** `mutateAsync` rejects with an `ApiError` in the project's adapter pattern, but the catch should not assume the shape — `getApiErrorMessage(error)` already handles the unknown case.

## Out of Scope (reiterated)

Everything in the US-48 "Out of Scope" list. In particular, do not change the assignment banner query keys, the Alpaca `since` watermark, the `before-quit` Promise.all, the assignments IPC envelope, or the `AlpacaCredentialCard` derived-state pattern as part of this story.
