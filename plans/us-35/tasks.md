# US-35 / US-46 — Assignment Detection & Auto-Transition + Polling Scheduler — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (no dependencies)

> These two areas can be started immediately and run in parallel.

### Area 1: PollingScheduler Service

- [x] **[Red]** Write failing tests — `src/main/services/polling-scheduler.test.ts`
  - Test cases:
    - `register()` adds a job to the registry; duplicate name throws `SchedulerError('already_registered')`
    - `start()` invokes every registered job's handler once immediately
    - Subsequent interval job invocations are scheduled `cadenceMs` after the previous run finishes (fake timers)
    - Interval job with `marketOpenMs: 60_000, marketClosedMs: null` runs once on start then parks while market is closed (mock `BrokerProvider.getMarketStatus`)
    - Interval job with `extendedHoursMs: 300_000` picks the extended cadence during pre/post sessions
    - `afterClose` job runs once at `marketClose + offsetMinutes`; not on weekends/holidays (fake timers + `getMarketStatus` fixtures)
    - `afterClose` job missed during app downtime is NOT backfilled on next start
    - Handler throwing an error logs at WARN and the job reschedules for next cadence (no pile-up)
    - `runNow(jobName)` invokes the handler immediately and resets the cadence clock to now
    - `stop()` cancels all pending invocations and drains in-flight handler promises with a 5-second timeout
    - `stop()` returns control after drain timeout even if a handler is still hung
    - System wake from sleep (large fake-time jump) does not fire a burst of missed ticks; next tick is from now forward
    - Unknown job name in `runNow` throws `SchedulerError('job_not_found')`
  - Run `pnpm test src/main/services/polling-scheduler.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/polling-scheduler.ts` _(depends on: Area 1 Red ✓)_
  - Implement `PollingScheduler` interface per `plans/us-35/data-model.md`
  - Use `setTimeout` chains (one timer handle per job); track in-flight promises in a `Set<Promise<void>>` for drain support
  - Pure helpers: `decideNextCadenceMs(policy, marketStatus)` and `decideAfterCloseFireAt(marketStatus, offsetMinutes)`
  - Cache `getMarketStatus()` result per-tick (single shared in-flight promise)
  - On handler error: WARN log via pino, continue scheduling
  - Inject `clock` boundary (Date.now / setTimeout) so fake timers work cleanly in tests
  - Export `SchedulerError` class with typed `code: 'already_registered' | 'job_not_found' | 'not_started'`
  - Run `pnpm test src/main/services/polling-scheduler.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/polling-scheduler.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify no global state leaks between scheduler instances (multiple instances must be safe for tests)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 2: Migrations — pending_assignments + app_settings

- [x] **[Red]** Write failing tests — `src/main/db/migrate.test.ts` (extend existing)
  - Test cases:
    - Migration 006 creates `pending_assignments` table with `UNIQUE(activity_id)` constraint — apply to fresh db, query `sqlite_master`
    - Migration 006 creates index on `status` and on `position_id`
    - Migration 007 creates `app_settings` table with `PRIMARY KEY(key)` (if not already present)
    - Migration runner is idempotent — running twice does not error
  - Run `pnpm test src/main/db/migrate.test.ts` — all new tests must fail
- [x] **[Green]** Implement migrations _(depends on: Area 2 Red ✓)_
  - Create `migrations/006_create_pending_assignments.sql` per `plans/us-35/data-model.md`
  - Create `migrations/007_create_app_settings.sql` using `CREATE TABLE IF NOT EXISTS`
  - Verify migration numbering is contiguous; confirm migration-count assertions still pass
  - Run `pnpm test src/main/db/migrate.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — migration files + test _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Core Services (depends on Layer 1)

> These two areas can run in parallel with each other **after** their Layer 1 dependencies are complete.

### Area 3: detect-assignments Service

**Requires:** Area 1 Green ✓ (scheduler interface), Area 2 Green ✓ (migrations applied)

- [x] **[Red]** Write failing tests — `src/main/services/detect-assignments.test.ts` _(depends on: Areas 1 + 2 Green ✓)_
  - Test cases:
    - Reads `assignments_last_poll_at:{env}` watermark; defaults to 24h ago if missing
    - Calls `brokerProvider.getActivities` with `type: 'OPASN'` and `since: watermark`
    - Matches OPASN activity to open CSP leg via `legs.option_symbol = activity.symbol`; creates `pending_assignments` row
    - Logs INFO `'Assignment detected for AAPL CSP at $180 strike'` on match (pino logger spy)
    - Activity with no matching CSP leg is logged at DEBUG and skipped; no row inserted
    - Re-running with same `activity_id` is a no-op (`INSERT OR IGNORE`; row count unchanged)
    - Multiple OPASN events in one batch create multiple rows
    - Watermark updates to now() after a successful batch even if some activities were skipped
    - `BrokerError` with code `'network_error'` is logged at WARN; no rows inserted; watermark NOT updated; function returns gracefully
    - `BrokerError` with code `'auth_failed'` surfaces as a typed result for scheduler back-off decisions
  - Run `pnpm test src/main/services/detect-assignments.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/detect-assignments.ts` + `src/main/services/app-settings.ts` _(depends on: Area 3 Red ✓)_
  - Implement `detectAssignments({ db, brokerProvider, env, logger })` returning `{ detected: number, skipped: number }`
  - Use `appSettings.get/set` for watermark key `assignments_last_poll_at:{env}`
  - Query open CSP legs once at start; build `Map<option_symbol, { positionId, legId }>` for O(1) match
  - Pure helper: `matchActivityToLeg(activity, openLegMap)` for direct unit coverage
  - Single transaction wraps `INSERT OR IGNORE` + watermark update
  - Catch `BrokerError`; log; return early without updating watermark
  - Run `pnpm test src/main/services/detect-assignments.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/detect-assignments.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 4: Pending-Assignment Queries + Confirm/Dismiss Services

**Requires:** Area 2 Green ✓ (pending_assignments table exists)

- [x] **[Red]** Write failing tests — `src/main/services/pending-assignments.test.ts` _(depends on: Area 2 Green ✓)_
  - Test cases:
    - `listPending()` returns rows where `status='pending'` joined with positions + legs for ticker/strike/expiration
    - `confirmPending(id)` sets `status='confirmed'`, `confirmed_at=now()`, and calls `assignCspPosition(db, positionId, { assignmentDate: transaction_time })`
    - `confirmPending(id)` on a row already confirmed throws `PendingAssignmentError('NOT_PENDING')`
    - `confirmPending(id)` propagates lifecycle rejection from `assignCspPosition` with code `'TRANSITION_REJECTED'`
    - `dismissPending(id)` sets `status='dismissed'`, `dismissed_at=now()`
    - `dismissPending(id)` on a row already dismissed is a no-op (returns ok, no state change)
  - Run `pnpm test src/main/services/pending-assignments.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/pending-assignments.ts` _(depends on: Area 4 Red ✓)_
  - `listPending(db)` — join query returning `PendingAssignmentNotification[]` shaped per `contracts/ipc-channels.md`
  - `confirmPending(db, id)` — transaction: assert status, call `assignCspPosition`, update row
  - `dismissPending(db, id)` — simple UPDATE inside transaction
  - All SQL goes through prepared statements (project convention)
  - Export `PendingAssignmentError` with typed code
  - Run `pnpm test src/main/services/pending-assignments.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/pending-assignments.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — IPC (depends on Layer 2)

### Area 5: IPC Handlers + Schemas

**Requires:** Area 3 Green ✓, Area 4 Green ✓

- [ ] **[Red]** Write failing tests — `src/main/ipc/assignments.test.ts` _(depends on: Areas 3 + 4 Green ✓)_
  - Test cases:
    - `assignments:list-pending` returns `{ ok: true, assignments }` with display fields populated
    - `assignments:confirm` rejects invalid `pendingAssignmentId` via Zod with `{ ok: false, errors }`
    - `assignments:confirm` returns `{ ok: true, position }` on success
    - `assignments:confirm` returns `{ ok: false, errors, code: 'NOT_PENDING' }` when row is not pending
    - `assignments:dismiss` returns `{ ok: true, dismissedAt }`
    - `assignments:run-detection-now` invokes `scheduler.runNow('detect-assignments')` and returns batch summary
  - Run `pnpm test src/main/ipc/assignments.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/ipc/assignments.ts` + extend `src/main/schemas.ts` _(depends on: Area 5 Red ✓)_
  - Register handlers per `plans/us-35/contracts/ipc-channels.md`
  - Add Zod request schemas for `assignments:confirm` and `assignments:dismiss`
  - Validate payloads with Zod; return `{ ok: false, errors }` on failure
  - Wrap service calls in try/catch; map service errors to IPC error codes (`NOT_FOUND`, `NOT_PENDING`, `TRANSITION_REJECTED`)
  - Export single `registerAssignmentsIpc(deps)` function for clean bootstrap
  - Run `pnpm test src/main/ipc/assignments.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` — `src/main/ipc/assignments.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Wiring + Renderer (depends on Layer 3)

> These two areas can run in parallel with each other **after** Area 5 Green is complete.

### Area 6: Wire Scheduler into Main Process Bootstrap

**Requires:** Area 1 Green ✓, Area 5 Green ✓

> **Important — shared instance for future consumers (US-44 and beyond):**
> The single `PollingScheduler` instance created here is the one all future jobs register on.
> US-44 (IVR collection) will call `scheduler.register({ name: 'ivr-collect', cadence: { kind: 'afterClose', offsetMinutes: 30 }, handler: collectIVRSnapshots })` in its own bootstrap, using this same instance.
> Do NOT call `scheduler.start()` until all jobs for the current story are registered — future stories add their `register()` calls before `start()` is moved later.
> Export the scheduler instance from a dedicated module (e.g. `src/main/services/scheduler-instance.ts`) so other stories can import it without circular dependencies on `src/main/index.ts`.

- [ ] **[Red]** Write failing tests — `src/main/index.test.ts` (modify if present) _(depends on: Areas 1 + 5 Green ✓)_
  - Test cases:
    - Main process bootstrap registers `'detect-assignments'` job on the scheduler (assert via spy or registry inspection)
    - `before-quit` handler calls `scheduler.stop()` and awaits it before completing (spy)
    - Importing the scheduler instance module twice returns the same object (singleton guarantee)
  - Run `pnpm test src/main/index.test.ts` — all new tests must fail
- [ ] **[Green]** Implement wiring — `src/main/services/scheduler-instance.ts` + `src/main/index.ts` _(depends on: Area 6 Red ✓)_
  - Create `src/main/services/scheduler-instance.ts` that exports a lazily-created singleton `PollingScheduler`; this is the importable handle for all future job registrations
  - In `src/main/index.ts`: import the singleton, register `detect-assignments` with cadence `{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }` and handler `() => detectAssignments({ db, brokerProvider, env, logger })`
  - Call `scheduler.start()` after all IPC handlers register, after `app.whenReady()`
  - Wire `app.on('before-quit', ...)` to call `scheduler.stop()` and await before `app.exit(0)`
  - Run `pnpm test src/main/index.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` — `src/main/services/scheduler-instance.ts` + `src/main/index.ts` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 7: Preload + Renderer Hook + AssignmentNotificationBanner

**Requires:** Area 5 Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/components/AssignmentNotificationBanner.test.tsx` _(depends on: Area 5 Green ✓)_
  - Test cases:
    - `AssignmentNotificationBanner` renders ticker, strike, contract type, and transaction date (fixture render)
    - Shows `Confirm` and `Dismiss` buttons
    - Clicking Confirm calls `window.api.assignments.confirm` with the id and shows a success toast on `{ ok: true }`
    - Clicking Dismiss calls `window.api.assignments.dismiss` and the banner unmounts after success
    - Success toast includes an `'Open covered call →'` link that routes to the position detail's open-CC sheet (test the link target)
    - `usePendingAssignments` polls every 30s — query options assertion (`refetchInterval: 30_000`)
  - Run `pnpm test src/renderer/src/components/AssignmentNotificationBanner.test.tsx` — all new tests must fail
- [ ] **[Green]** Implement renderer layer _(depends on: Area 7 Red ✓)_
  - Add `assignments` namespace to `src/preload/index.ts` per `contracts/ipc-channels.md`
  - Create `src/renderer/src/api/assignments.ts` with `usePendingAssignments` hook (`refetchInterval: 30_000`)
  - Create `src/renderer/src/components/AssignmentNotificationBanner.tsx` using existing `AlertBox` primitive; one banner per pending row, stacked
  - On confirm success: invalidate `['positions', 'list']`, `['positions', positionId]`, `['assignments', 'pending']`; show success toast
  - On dismiss success: invalidate only `['assignments', 'pending']`
  - Apply `animate-wb-pulse` Tailwind token to matching position row in list
  - Mount banner in `src/renderer/src/components/PageLayout.tsx` (or positions list page)
  - Ensure banner is keyboard-accessible (Confirm = Enter, Dismiss = Esc when focused)
  - Run `pnpm test src/renderer/src/components/AssignmentNotificationBanner.test.tsx` — all tests must pass
- [ ] **[Refactor]** `/refactor` — renderer components _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### Area 8: E2E Tests

- [ ] **[Red]** Write failing e2e tests _(depends on: all Green tasks ✓)_
  - `e2e/polling-scheduler.spec.ts` — US-46 scenarios:
    - `it('registers an interval job')` — boot with test job, assert registry shape via dev-only IPC `_test:scheduler-registry`
    - `it('start invokes every registered job once and then on cadence')` — fake-timer e2e
    - `it('market-hours-aware interval respects marketClosedMs of null')` — drive FakeBrokerProvider closed; assert no second tick
    - `it('market-hours-aware interval with extended hours uses different cadence')`
    - `it('afterClose job fires after market close + offset minutes')` — simulated close + advance clock
    - `it('handler exception does not stop the scheduler')`
    - `it('runNow triggers an out-of-band invocation')`
    - `it('stop cancels all pending invocations')`
    - `it('system wake from sleep does not fire missed ticks')`
    - `it('concurrent registration of same job name is rejected')`
  - `e2e/assignment-detection.spec.ts` — US-35 scenarios:
    - `it('detects assignment from OPASN activity and creates pending record')` — seed FakeBrokerProvider with OPASN; trigger `runNow`; assert row + INFO log
    - `it('ignores assignment activity for unknown positions')` — OPASN for unknown symbol; assert no row + DEBUG log
    - `it('does not process the same activity twice')` — `runNow` twice with same fixture; assert row count = 1
    - `it('handles multiple assignments in a single poll')` — two OPASN events; assert two rows
    - `it('API error during polling does not crash the app')` — fake provider throws `BrokerError('network_error')`; assert WARN log, scheduler continues
    - `it('assignment notification banner appears on the position list')` — seed pending row, navigate, assert banner copy
    - `it('confirming the assignment transitions the position')` — click Confirm; assert `phase = HOLDING_SHARES`, success toast
    - `it('dismissing the assignment removes the notification')` — click Dismiss; assert banner gone; `runNow` again; assert no re-appearance
    - `it('assignment notification persists across app restarts')` — close + relaunch via `_electron.launch()`; assert banner present
  - Run `pnpm test:e2e` — all new tests must fail
- [ ] **[Green]** Make e2e tests pass _(depends on: Area 8 Red ✓)_
  - Reuse `FakeBrokerProvider` seeding utility from `plans/us-39/` e2e setup
  - Expose dev-only IPC `_test:scheduler-registry` guarded by `process.env.NODE_ENV === 'test'`
  - Shared `seedAssignmentFixture()` helper across both specs
  - Run `pnpm test:e2e` — all tests must pass
- [ ] **[Refactor]** `/refactor` — e2e test files _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for right reason)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] E2E tests cover every AC from US-46 and US-35
- [ ] `pnpm test && pnpm lint && pnpm typecheck` — all clean
