# US-48 — US-35 Code-Review Fixes — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- After each area, run the verification block at the end of this file before opening the next

---

## Parallel Layers

| Layer | Areas                                                                          | Notes                                                                                           |
| ----- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1     | Area A (Scheduler getter), Area B (stop() cleanup), Area D (Settings handlers) | A and B both touch `polling-scheduler.ts` — serialize within the same agent or rebase carefully |
| 2     | Area C (scheduler-instance wiring)                                             | Depends on Area A — Green                                                                       |

Area D is fully independent of A/B/C and can run in parallel from the start.

---

## Area A — Polling Scheduler: Broker Getter Injection

**File:** `src/main/services/polling-scheduler.ts`

### Red

- [x] **A1.** Add test `reschedule uses the latest broker from the getter on every call` to `src/main/services/polling-scheduler.test.ts`. Register an interval-cadence job, advance the fake clock through one tick with broker A returning `session: 'closed'`, swap broker A → B (B returns `session: 'regular'`), advance another tick, assert the second `getMarketStatus` was invoked on B and the next scheduled delay matches `marketOpenMs`.
- [x] **A2.** Add test `startAfterClose uses the latest broker from the getter` — same shape for an `afterClose`-cadence job (initial register → swap broker → next tick uses new broker's `nextClose`).
- [x] **A3.** Update every existing test in `polling-scheduler.test.ts` that calls `createPollingScheduler(brokerInstance, ...)` to pass `() => brokerInstance`. Tests should still fail to compile (typecheck) or run because the implementation has not yet changed.
- [x] **A4.** Run `pnpm test src/main/services/polling-scheduler.test.ts` — confirm the new tests fail with the expected "broker getter not called fresh" or "wrong broker used" assertion error, and that A3 tests fail with type errors. **Red phase complete when failures are for the right reasons.**

### Green

- [x] **A5.** Change `createPollingScheduler` signature to `(getBroker: () => BrokerProvider, clock: Clock = realClock)`.
- [x] **A6.** Replace `brokerProvider.getMarketStatus()` at line 120 (inside `reschedule`) with `getBroker().getMarketStatus()`. Preserve the try/catch and fall-back-to-`marketOpenMs` behavior unchanged.
- [x] **A7.** Replace `brokerProvider.getMarketStatus()` at line 159 (inside `startAfterClose`) with `getBroker().getMarketStatus()`. Preserve the try/catch.
- [x] **A8.** Run `pnpm test src/main/services/polling-scheduler.test.ts` — confirm all tests (including A1, A2, A3) pass. **Green phase complete.**

### Refactor

- [x] **A9.** Add a one-line JSDoc above `createPollingScheduler` noting why the parameter is a getter (broker can change at runtime when credentials are saved).
- [x] **A10.** Run `pnpm test && pnpm lint && pnpm typecheck && pnpm format`. No new failures.

**Acceptance criteria covered after Area A:** Scenario "Assignment polling resumes after credentials are saved at runtime" (partial — needs C), Scenario "Switching the active broker environment refreshes the scheduler's broker source" (partial — needs C).

---

## Area B — Polling Scheduler: `stop()` Timeout Cleanup

**File:** `src/main/services/polling-scheduler.ts`

> Serialize with Area A: both edit the same file. Either complete Area A first and rebase, or do A then B in one branch.

### Red

- [x] **B1.** Add test `stop clears the drain timeout when drain wins` to `polling-scheduler.test.ts`. Register an interval job whose handler resolves immediately. Start the scheduler, force a tick, call `stop()`, await its returned promise. Assert no pending fake timers remain after `stop()` resolves (use whichever vitest fake-timer assertion the existing test file uses — `vi.getTimerCount()` if available, otherwise advance the clock by 5 s and assert no additional callbacks fire).
- [x] **B2.** Add test `stop falls back to the 5-second timeout when drain stalls`. Register an interval job whose handler returns a never-resolving promise (`new Promise(() => {})`). Call `stop()`. Advance the fake clock by exactly 5_000 ms. Assert `stop()` resolves and the timeout fired exactly once.
- [x] **B3.** Run `pnpm test src/main/services/polling-scheduler.test.ts` — confirm B1 fails (pending timer remains) and B2 passes or fails depending on the existing timer pattern. **Red phase complete when B1 fails for the right reason.**

### Green

- [x] **B4.** Rewrite `stop()` (lines 199–216 of current file) to capture the timer id, run the race, and clear the timer in `.finally`. Exact shape from the plan's Area 2 Green snippet.
- [x] **B5.** Run `pnpm test src/main/services/polling-scheduler.test.ts` — confirm B1 and B2 pass. **Green phase complete.**

### Refactor

- [x] **B6.** If the new code path duplicates timer-management between scheduleTick and stop, leave as-is — the duplication is small and localized. No extraction required for this story.
- [x] **B7.** Run `pnpm test && pnpm lint && pnpm typecheck && pnpm format`.

**Acceptance criteria covered after Area B:** Scenarios "stop() does not leak the drain timeout when the in-flight drain wins" and "stop() still falls back to the 5-second timeout when drain stalls".

---

## Area C — scheduler-instance.ts: Pass Getter Through

**File:** `src/main/services/scheduler-instance.ts`

> Depends on Area A — Green. Cannot start until **A5–A8** are checked off.

### Red

- [x] **C1.** This area is wired through Area A's tests. If a `scheduler-instance.test.ts` exists, add a test asserting that the singleton calls `brokerFactory.create()` (or the equivalent getter) once per tick rather than caching from import time. If no such test file exists, skip — the contract is already covered by A1/A2.
- [x] **C2.** If C1 added a test, run it and confirm it fails. Otherwise mark C1/C2 as N/A.

### Green

- [x] **C3.** Change `scheduler-instance.ts:26` from `createPollingScheduler(getSafeBroker())` to `createPollingScheduler(getSafeBroker)` (pass the function, not its result).
- [x] **C4.** Run `pnpm test src/main/services/` — confirm scheduler + scheduler-instance tests pass.
- [x] **C5.** Run `pnpm typecheck` — confirm no type errors anywhere in the codebase (the signature change in Area A might surface a missed caller).

### Refactor

- [x] **C6.** Re-read `fallbackBroker` (lines 5–16). It still acts as the bootstrap-window fallback before `brokerFactory.configure()` runs; no change required. Confirm no other code path imports `fallbackBroker` directly.
- [x] **C7.** Run `pnpm test && pnpm lint && pnpm typecheck && pnpm format`.

**Acceptance criteria covered after Area C:** Both scheduler-related scenarios now fully covered (Areas A + C composed).

---

## Area D — Settings Page: Test Connection Rejection Handling

**File:** `src/renderer/src/pages/SettingsPage.tsx`, tests in `src/renderer/src/pages/SettingsPage.test.tsx`

> Independent of Areas A/B/C. Can run in parallel from the start.

### Red

- [x] **D1.** Add test `handleMassiveTestConnection sets error message when mutateAsync rejects` to `SettingsPage.test.tsx`. Mock the `useTestSettingsConnection` hook so the returned mutation's `mutateAsync` returns a rejected promise (`Promise.reject(new ApiError(...))`). Render `<SettingsPage />`. Click the Market Data — Massive `Test connection` button. Assert that an error-tone `<p>` appears with the rejection's message text.
- [x] **D2.** Add test `handleTestConnection (paper card) sets error message when mutateAsync rejects` — scoped to `data-testid="alpaca-card-paper"`. Render the page with the paper card in editing mode (no stored credentials). Fill keyId/secret, click the editing-mode `Test connection` button, assert an error-tone message line inside the paper card.
- [x] **D3.** Add test `handleStoredConnectionTest (paper card) sets error message when mutateAsync rejects` — render the page with paper credentials configured so the card is in read-only mode. Click the stored `Test connection` button, assert an error-tone message line inside the paper card.
- [x] **D4.** Run `pnpm test src/renderer/src/pages/SettingsPage.test.tsx` — confirm D1, D2, D3 fail with "expected error message, found none" or "unhandled rejection". **Red phase complete.**

### Green

- [x] **D5.** Wrap the body of `handleMassiveTestConnection` (line 360) in try/catch. On catch, call `setMassiveMessage({ tone: 'error', text: getApiErrorMessage(error) })`.
- [x] **D6.** Wrap the body of `handleTestConnection` inside `AlpacaCredentialCard` (line 133) in try/catch. On catch, call `setMessage({ tone: 'error', text: getApiErrorMessage(error) })`.
- [x] **D7.** Wrap the body of `handleStoredConnectionTest` inside `AlpacaCredentialCard` (line 171) in try/catch. On catch, call `setMessage({ tone: 'error', text: getApiErrorMessage(error) })`.
- [x] **D8.** Run `pnpm test src/renderer/src/pages/SettingsPage.test.tsx` — confirm D1, D2, D3 pass. **Green phase complete.**

### Refactor

- [x] **D9.** If the three handlers now share more than ~10 lines of mostly-duplicated shape, optionally extract a small helper `applyTestResult(result, setMessage)` at file scope and reuse from all three. Defer if it does not measurably simplify — this story is a bug fix, not a refactor.
- [x] **D10.** Run `pnpm test && pnpm lint && pnpm typecheck && pnpm format`.

**Acceptance criteria covered after Area D:** All three Settings Test Connection scenarios.

---

## Final Verification

After all four areas are checked off:

- [x] **V1.** `pnpm test` — full suite passes (1304/1304).
- [x] **V2.** `pnpm lint` — clean.
- [x] **V3.** `pnpm typecheck` — clean.
- [x] **V4.** `pnpm format` — clean.
- [ ] **V5.** If `better-sqlite3` ABI breaks the e2e build after `pnpm test`, run `npx electron-rebuild -f -w better-sqlite3 && pnpm rebuild better-sqlite3` in that order.
- [ ] **V6.** `pnpm test:e2e -- assignment-detection.spec.ts polling-scheduler.spec.ts settings-environment.spec.ts` — existing US-35 / US-46 / US-37 e2e suites still green.
- [ ] **V7.** Manual smoke (use the `run` skill or `pnpm dev`):
  1. Launch the app with no Alpaca credentials.
  2. Open Settings, save paper credentials.
  3. Confirm the next scheduler tick (within `marketOpenMs` or `extendedHoursMs`) shows a log line that the detect-assignments job hit the configured Alpaca broker, not the fallback.
  4. Open Settings, click `Test connection` for Massive with the shared key intentionally invalid (e.g. set `WHEELBASE_MASSIVE_API_KEY=` empty in the launch env); confirm an error-tone message appears under the Massive section instead of nothing.
- [ ] **V8.** Open a PR titled `us-48: close us-35 code-review gaps (scheduler + Settings handlers)`.

---

## Notes for Implementers

- The scheduler signature change (Area A) is the highest-risk change. Run the full unit test suite after A8 before moving on.
- Do not introduce a "broker change" event bus or callback registry. The getter pattern is sufficient; matching `registerBrokerHandlers(() => brokerFactory.create())` in `src/main/index.ts:143` is the goal.
- Do not change cadence values, scheduler API surface, or IPC channels.
- Do not address the broader code-review findings in this PR — they are out of scope and tracked separately.
