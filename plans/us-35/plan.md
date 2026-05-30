# Implementation Plan: Polling Scheduler + Assignment Detection (US-46 + US-35)

## Summary

Build a shared `PollingScheduler` service (US-46) and use it to poll Alpaca for OPASN activities, matching detected assignments to open CSP positions, surfacing notification banners, and transitioning positions on trader confirmation (US-35). Done when assignments detected via real Alpaca paper polling appear as banners in the renderer, can be confirmed to auto-transition positions, and survive app restarts.

## Supporting Documents

- **User Stories & Acceptance Criteria:**
  - `docs/epics/06-stories/US-46-polling-scheduler.md`
  - `docs/epics/06-stories/US-35-assignment-detection-and-auto-transition.md`
- **Research & Design Decisions:** `plans/us-35/research.md`
- **Data Model & Migrations:** `plans/us-35/data-model.md`
- **IPC Contracts:** `plans/us-35/contracts/ipc-channels.md`
- **Quickstart & Verification:** `plans/us-35/quickstart.md`

## Prerequisites

**Hard prereq:** `plans/us-39/` is fully implemented. This plan calls `BrokerProvider.getActivities` and `BrokerProvider.getMarketStatus` — both ship in that plan.

Already exists in the repo:

- `src/main/services/assign-csp-position.ts` — confirmation step calls this unchanged.
- `src/main/core/option-symbol.ts` — OCC symbol parsing.
- `src/main/db/migrate.ts` — migration runner.

## Implementation Areas

Order matters — scheduler first, then migration, then service, then IPC, then renderer, then e2e.

---

### 1. PollingScheduler service (US-46 core)

**Files to create or modify:**

- `src/main/services/polling-scheduler.ts` — new
- `src/main/services/polling-scheduler.test.ts` — new

**Red — tests to write:**

- "register() adds a job to the registry; duplicate name throws SchedulerError('already_registered')".
- "start() invokes every registered job's handler once immediately".
- "subsequent invocations of an interval job are scheduled cadenceMs after the previous run finishes" — use fake timers, assert next call timing.
- "interval job with marketOpenMs:60000 marketClosedMs:null runs once on start and then parks while market is closed" — mock `BrokerProvider.getMarketStatus` to return closed; assert no further runs scheduled until simulated open.
- "interval job with extendedHoursMs:300000 picks the extended cadence during pre/post sessions".
- "afterClose job runs once at marketClose + offsetMinutes; not on weekends/holidays" — fake timers + getMarketStatus fixtures.
- "afterClose job missed during app downtime is NOT backfilled on next start".
- "handler throwing an error logs at WARN and the job reschedules for next cadence (no exponential pile-up)".
- "runNow(jobName) invokes the handler immediately and resets the cadence clock to 'now'".
- "stop() cancels all pending invocations and drains in-flight handler promises with a 5-second timeout".
- "stop() returns control after drain timeout even if a handler is still hung".
- "system wake from sleep (simulated by jumping fake time forward by hours) does not fire a burst of missed ticks; next tick is from 'now' forward".
- "unknown job name in runNow throws SchedulerError('job_not_found')".

**Green — implementation:**

- Implement `PollingScheduler` interface per `plans/us-35/data-model.md`.
- Use `setTimeout` chains (one timer handle per job). Track in-flight promises in a `Set<Promise<void>>` for drain support.
- `decideNextCadenceMs(policy, marketStatus)` pure helper — easy to test in isolation.
- `decideAfterCloseFireAt(marketStatus, offsetMinutes)` pure helper — given today's `nextClose`, returns a Date.
- Cache `getMarketStatus()` result per-tick (single in-flight promise shared by simultaneous decisions).
- On handler error: `WARN` log via pino, continue scheduling.

**Refactor — cleanup to consider:**

- Extract `clock` boundary (Date.now / setTimeout) into an injectable so tests can use fake timers cleanly.
- Verify no global state leaks between scheduler instances (multiple instances should be possible for tests).

**Acceptance criteria covered:**

- US-46: every scenario.

---

### 2. Migrations: pending_assignments + app_settings

**Files to create or modify:**

- `migrations/006_create_pending_assignments.sql` — new
- `migrations/007_create_app_settings.sql` — new IF the table doesn't already exist (verify first)
- `src/main/db/migrate.test.ts` — extend if it has a migration-count assertion

**Red — tests to write:**

- "migration 006 creates pending_assignments table with UNIQUE(activity_id) constraint" — apply migrations to fresh db, query sqlite_master.
- "migration 006 creates index on status and on position_id".
- "migration 007 creates app_settings table with PRIMARY KEY(key)" — only if added.
- "migration runner is idempotent — running twice does not error" — already tested generically; just verify still passes.

**Green — implementation:**

- Author the two SQL files per `plans/us-35/data-model.md`. Use `IF NOT EXISTS`.
- Confirm migration count assertions still pass.

**Refactor — cleanup to consider:**

- Verify migration numbering is contiguous (no gaps from concurrent work).

**Acceptance criteria covered:**

- US-35 background scenario: `pending_assignments` table exists.

---

### 3. detect-assignments service (US-35 core logic)

**Files to create or modify:**

- `src/main/services/detect-assignments.ts` — new
- `src/main/services/detect-assignments.test.ts` — new
- `src/main/services/app-settings.ts` — new tiny key/value helper (or extend an existing one)

**Red — tests to write:**

- "detectAssignments reads assignments_last_poll_at:{env} watermark; defaults to 24h ago if missing".
- "detectAssignments calls brokerProvider.getActivities with type:'OPASN' and since:watermark".
- "Matches OPASN activity to open CSP leg by `legs.option_symbol = activity.symbol`; creates pending_assignments row".
- "Logs INFO 'Assignment detected for AAPL CSP at $180 strike' on match" — pino logger spy.
- "Activity with no matching CSP leg is logged at DEBUG and skipped, no row inserted".
- "Re-running with the same activity_id is a no-op (UNIQUE constraint handled with INSERT OR IGNORE; row count unchanged)".
- "Multiple OPASN events in one batch create multiple rows".
- "Watermark updates to now() after a successful batch even if some activities were skipped".
- "BrokerError with code 'network_error' from brokerProvider is logged at WARN; no rows inserted; watermark NOT updated; function returns gracefully (does not throw)".
- "BrokerError with code 'auth_failed' surfaces as a typed result so the scheduler can decide to back off".

**Green — implementation:**

- Implement `detectAssignments({ db, brokerProvider, env, logger })` returning `{ detected: number, skipped: number }`.
- Use `appSettings.get/set` for watermark.
- Query open CSP legs once at the start of the run; build an in-memory `Map<option_symbol, { positionId, legId }>` for O(1) match.
- Single transaction wraps INSERT OR IGNORE + watermark update.
- Catch BrokerError; log; return early.

**Refactor — cleanup to consider:**

- Extract `matchActivityToLeg(activity, openLegMap)` as a pure helper for direct unit coverage.

**Acceptance criteria covered:**

- US-35: "Detect assignment from OPASN activity and create pending record"
- US-35: "Ignore assignment activity for unknown positions"
- US-35: "Do not process the same activity twice"
- US-35: "Handle multiple assignments in a single poll"
- US-35: "API error during polling does not crash the app"

---

### 4. Pending-assignment queries + confirm/dismiss services

**Files to create or modify:**

- `src/main/services/pending-assignments.ts` — new
- `src/main/services/pending-assignments.test.ts` — new

**Red — tests to write:**

- "listPending() returns rows where status='pending' joined with positions + legs for ticker/strike/expiration".
- "confirmPending(id) sets status='confirmed', confirmed_at=now(), and calls assignCspPosition(db, positionId, { assignmentDate: transaction_time })".
- "confirmPending(id) on a row already confirmed throws PendingAssignmentError('NOT_PENDING')".
- "confirmPending(id) propagates a lifecycle rejection from assignCspPosition with code 'TRANSITION_REJECTED'".
- "dismissPending(id) sets status='dismissed', dismissed_at=now()".
- "dismissPending(id) on a row already dismissed is a no-op (returns ok, no state change)".

**Green — implementation:**

- `listPending(db)` runs a join query and returns the renderer-shaped notification list per `contracts/ipc-channels.md`.
- `confirmPending(db, id)` wraps a transaction: assert status, call `assignCspPosition`, update row.
- `dismissPending(db, id)` simple UPDATE inside transaction.

**Refactor — cleanup to consider:**

- Verify all SQL goes through prepared statements (project convention).

**Acceptance criteria covered:**

- US-35: "Confirming the assignment transitions the position"
- US-35: "Dismissing the assignment removes the notification"
- US-35: "Assignment notification persists across app restarts" (no special code — DB persistence does this)

---

### 5. IPC handlers + schemas

**Files to create or modify:**

- `src/main/ipc/assignments.ts` — new
- `src/main/ipc/assignments.test.ts` — new
- `src/main/schemas.ts` — add Zod request schemas per `plans/us-35/contracts/ipc-channels.md`

**Red — tests to write:**

- "assignments:list-pending returns { ok: true, assignments } with display fields populated".
- "assignments:confirm rejects invalid pendingAssignmentId via Zod with { ok: false, errors }".
- "assignments:confirm returns { ok: true, position } on success".
- "assignments:confirm returns { ok: false, errors, code: 'NOT_PENDING' } when row is not pending".
- "assignments:dismiss returns { ok: true, dismissedAt }".
- "assignments:run-detection-now invokes scheduler.runNow('detect-assignments') and returns batch summary".

**Green — implementation:**

- Register handlers per `plans/us-35/contracts/ipc-channels.md`.
- Validate request payloads with Zod; return `{ ok: false, errors }` shape on failure.
- Wrap service calls in try/catch; map service errors to IPC error codes.

**Refactor — cleanup to consider:**

- Pull the assignments router into a single `registerAssignmentsIpc(deps)` function for clean main-process bootstrap.

**Acceptance criteria covered:**

- IPC plumbing for all confirm/dismiss/list ACs.

---

### 6. Wire scheduler into main process bootstrap

**Files to create or modify:**

- `src/main/index.ts` — modify (start scheduler after IPC registration; stop on before-quit)
- `src/main/index.test.ts` — modify if present

**Red — tests to write:**

- (Mostly covered by area 1 scheduler tests; integration here is wiring only.)
- "Main process bootstrap registers 'detect-assignments' job on the scheduler" — assert via spy or via direct registry inspection.
- "before-quit handler calls scheduler.stop() and awaits it before completing" — spy.

**Green — implementation:**

- Construct a single `PollingScheduler` instance.
- Register `detect-assignments` with cadence `{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }` and handler `() => detectAssignments({ db, brokerProvider, env, logger })`.
- Call `scheduler.start()` after IPC handlers register, after `app.whenReady()`.
- Wire `app.on('before-quit', async (e) => { e.preventDefault(); await scheduler.stop(); app.exit(0); })` or equivalent.

**Refactor — cleanup to consider:**

- If US-44 (IVR collector) is implemented in parallel, share the same scheduler instance — its bootstrap registers a second job. No code change here.

**Acceptance criteria covered:**

- US-46 wiring; enables US-35 to actually run periodically in the live app.

---

### 7. Preload + Renderer hook + AssignmentNotificationBanner

**Files to create or modify:**

- `src/preload/index.ts` — add `assignments` namespace
- `src/renderer/src/api/assignments.ts` — new TanStack Query hook
- `src/renderer/src/components/AssignmentNotificationBanner.tsx` — new
- `src/renderer/src/components/AssignmentNotificationBanner.test.tsx` — new
- `src/renderer/src/components/PageLayout.tsx` (or positions list page) — mount the banner

**Red — tests to write:**

- "AssignmentNotificationBanner renders ticker, strike, contract type, and transaction date" — fixture render.
- "AssignmentNotificationBanner shows 'Confirm' and 'Dismiss' buttons" — UI render.
- "Clicking Confirm calls window.api.assignments.confirm with the id and shows a success toast on { ok: true }".
- "Clicking Dismiss calls window.api.assignments.dismiss and the banner unmounts after success".
- "Success toast includes an 'Open covered call →' link that routes to the position detail's open-CC sheet" — test the link target.
- "usePendingAssignments polls every 30s" — query options assertion.

**Green — implementation:**

- Expose `window.api.assignments.*` in preload (matches `contracts/ipc-channels.md`).
- `usePendingAssignments` hook with `refetchInterval: 30_000`.
- `<AssignmentNotificationBanner>` uses existing `AlertBox` primitive for visual consistency; one banner per pending row, stacked.
- On confirm success: TanStack Query invalidate `['positions', 'list']` and `['positions', positionId]` and `['assignments', 'pending']`; show success toast.
- On dismiss success: invalidate only `['assignments', 'pending']`.
- Apply pulsing amber indicator class (Tailwind `animate-wb-pulse` per project tokens) to the matching position row in the list — use existing class.

**Refactor — cleanup to consider:**

- Lift toast registration into the app shell so any future feature can reuse it.
- Check that the banner is keyboard-accessible (Confirm = Enter, Dismiss = Esc when focused).

**Acceptance criteria covered:**

- US-35: "Assignment notification banner appears on the position list"
- US-35: "Confirming the assignment transitions the position" (e2e + this UI)
- US-35: "Dismissing the assignment removes the notification"
- US-35: "Assignment notification persists across app restarts" (banner re-mounts from DB rows)

---

### 8. E2e Tests

**Files to create or modify:**

- `e2e/assignment-detection.spec.ts` — new (Playwright `_electron`)
- `e2e/polling-scheduler.spec.ts` — new

**Red — tests to write (each maps to one AC):**

US-46:

- "User Story US-46 — register an interval job" — boot app with a test job seeded; assert registry shape via dev-only IPC hook.
- "User Story US-46 — start invokes every registered job once and then on cadence" — fake-timer e2e via Playwright clock controls.
- "User Story US-46 — market-hours-aware interval respects marketClosedMs of null" — drive FakeBrokerProvider closed; assert no second tick.
- "User Story US-46 — market-hours-aware interval with extended hours uses different cadence".
- "User Story US-46 — after-market-close cron-style job" — simulated market close + advance clock.
- "User Story US-46 — handler exception does not stop the scheduler".
- "User Story US-46 — runNow triggers an out-of-band invocation".
- "User Story US-46 — stop cancels all pending invocations".
- "User Story US-46 — system wake from sleep does not fire missed ticks".
- "User Story US-46 — concurrent registration is rejected".

US-35:

- "User Story US-35 — Detect assignment from OPASN activity and create pending record" — seed FakeBrokerProvider with one OPASN event; trigger runNow; assert pending_assignments row + INFO log.
- "User Story US-35 — Ignore assignment activity for unknown positions" — seed OPASN for a symbol with no matching CSP; assert no row + DEBUG log.
- "User Story US-35 — Do not process the same activity twice" — runNow twice with same fake activity; assert row count = 1.
- "User Story US-35 — Handle multiple assignments in a single poll" — fixture with two OPASN events; assert two rows.
- "User Story US-35 — API error during polling does not crash the app" — fake provider throws BrokerError('network_error'); assert WARN log, scheduler continues.
- "User Story US-35 — Assignment notification banner appears on the position list" — UI test: seed pending row, navigate to positions list, assert banner visible with correct copy.
- "User Story US-35 — Confirming the assignment transitions the position" — click Confirm; assert position phase = HOLDING_SHARES, success toast.
- "User Story US-35 — Dismissing the assignment removes the notification" — click Dismiss; assert banner unmounts; runNow again; assert no re-appearance.
- "User Story US-35 — Assignment notification persists across app restarts" — close + relaunch Electron; assert banner still present.

**Green — implementation:**

- Reuse the FakeBrokerProvider seeding utility from `plans/us-39/` e2e setup.
- Expose a dev-only IPC `_test:scheduler-registry` for inspecting registered jobs in tests; guard with `process.env.NODE_ENV === 'test'`.
- For "persistence across restart," launch the Electron app a second time within the same test using Playwright `_electron.launch()`.

**Refactor — cleanup to consider:**

- Shared `seedAssignmentFixture()` helper across the two specs.

**Acceptance criteria covered:**

- Every AC from US-46 and US-35 mapped to a named e2e case above.

---

## AC Audit

### US-46

| AC                                                                     | Covered by               |
| ---------------------------------------------------------------------- | ------------------------ |
| Register an interval job                                               | Area 1 unit + Area 8 e2e |
| Start invokes every registered job once and then on cadence            | Area 1 unit + Area 8 e2e |
| Market-hours-aware interval respects marketClosedMs of null            | Area 1 unit + Area 8 e2e |
| Market-hours-aware interval with extended hours uses different cadence | Area 1 unit + Area 8 e2e |
| After-market-close cron-style job                                      | Area 1 unit + Area 8 e2e |
| Handler exception does not stop the scheduler                          | Area 1 unit + Area 8 e2e |
| runNow triggers an out-of-band invocation                              | Area 1 unit + Area 8 e2e |
| stop cancels all pending invocations                                   | Area 1 unit + Area 8 e2e |
| System wake from sleep does not fire missed ticks                      | Area 1 unit + Area 8 e2e |
| Concurrent registration is rejected                                    | Area 1 unit + Area 8 e2e |

### US-35

| AC                                                              | Covered by                  |
| --------------------------------------------------------------- | --------------------------- |
| Detect assignment from OPASN activity and create pending record | Area 3 unit + Area 8 e2e    |
| Ignore assignment activity for unknown positions                | Area 3 unit + Area 8 e2e    |
| Do not process the same activity twice                          | Area 3 unit + Area 8 e2e    |
| Handle multiple assignments in a single poll                    | Area 3 unit + Area 8 e2e    |
| API error during polling does not crash the app                 | Area 3 unit + Area 8 e2e    |
| Assignment notification banner appears on the position list     | Area 7 unit + Area 8 e2e    |
| Confirming the assignment transitions the position              | Area 4+7 unit + Area 8 e2e  |
| Dismissing the assignment removes the notification              | Area 4+7 unit + Area 8 e2e  |
| Assignment notification persists across app restarts            | Area 8 e2e (DB persistence) |

All ACs covered.
