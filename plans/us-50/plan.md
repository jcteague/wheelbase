---
story: us-50
kind: feature
parent: null
topics: [management-alerts, wheel-lifecycle, market-data]
status: planned
---

# Implementation Plan: US-50 — Evaluate built-in alert rules against all active positions on a schedule

## Summary

This story builds the backbone of Epic 07: a pure rule-evaluation engine, a
SQLite `alerts` table with in-place upsert + resolution semantics, an evaluation
service that loads active positions and persists results atomically, and a
recurring job registered on the existing US-46 polling scheduler. When done, the
scheduler wakes on the market-data cadence, evaluates every active CSP/CC
position against the built-in `EXPIRATION_IMMINENT` (DTE ≤ 5) and
`MANAGEMENT_WINDOW` (6–21 DTE) rules, and maintains a deduplicated, restart-safe
alert set that resolves cleared conditions without deleting history.

## Supporting Documents

Read these before starting implementation:

- **User Story & Acceptance Criteria:** `docs/epics/07-stories/US-50-alert-engine-scheduled-evaluation.md`
- **Research & Design Decisions:** `plans/us-50/research.md`
- **Data Model & Selection Logic:** `plans/us-50/data-model.md`
- **Quickstart & Verification:** `plans/us-50/quickstart.md`

> No `contracts/` directory: US-50 adds no IPC surface. The `alerts:list` /
> `alerts:dismiss` / `alerts:calendar` handlers are US-51 / US-59 / US-60.

## Prerequisites

- `src/main/services/polling-scheduler.ts` + `scheduler-instance.ts` provide the
  shared `scheduler` singleton and `JobConfig`/interval cadence machinery (US-46).
- `src/main/db/migrate.ts` auto-applies numbered `.sql` migrations; `makeTestDb()`
  in `src/main/test-utils.ts` runs them against an in-memory DB.
- `src/main/services/active-leg-sql.ts` provides the phase-aware
  `activeLegSubquery()` for finding a position's current open option leg.
- `src/main/services/list-positions.ts` already contains the `computeDte` logic
  to be extracted/centralized.
- `src/main/index.ts` already registers jobs and calls `scheduler.start()` once
  after registration; `db` is in scope there.
- `createPosition` and the covered-call open service exist for seeding test positions.

## AC Audit

Every acceptance criterion from US-50 is represented as a named e2e test in Area 6:

- `Scheduled evaluation creates open alerts for triggered rules` → `AC: Scheduled evaluation creates open alerts for triggered rules`
- `Re-evaluation updates an existing open alert instead of duplicating it` → `AC: Re-evaluation updates an existing open alert instead of duplicating it`
- `Cleared conditions resolve the alert` → `AC: Cleared conditions resolve the alert`
- `Positions without an active option leg are skipped` → `AC: Positions without an active option leg are skipped`
- `Missing data for one rule does not fail the whole evaluation job` → `AC: Missing data for one rule does not fail the whole evaluation job`

## Implementation Areas

### 1. DTE helper extraction (shared pure calculation)

**Files to create or modify:**

- `src/main/core/dte.ts` — new pure module exporting `computeDte(expiration: string | null, now?: Date): number | null`.
- `src/main/core/dte.test.ts` — new.
- `src/main/services/list-positions.ts` — remove the private `computeDte`, import the shared one.

**Red — tests to write (`src/main/core/dte.test.ts`):**

- Returns `null` when `expiration` is `null`.
- Returns `0` when `expiration` equals `now`'s calendar date.
- Returns `5` when `expiration` is 5 calendar days after `now` (use a fixed injected `now`).
- Returns a negative number when `expiration` is in the past.
- Is timezone-stable: a `now` late in the local day and an `expiration` date string produce the same whole-day count as midnight (no off-by-one from string slicing).

**Green — implementation:**

- Implement `computeDte` in `src/main/core/dte.ts` using `date-fns`
  (`differenceInCalendarDays(parseISO(expiration), now)` on a calendar-day basis),
  defaulting `now` to `new Date()`. No DB/broker imports (pure core module).
- Update `list-positions.ts` to import and use it; delete the local copy.

**Refactor — cleanup to consider:**

- Confirm `list-positions.ts` behavior is unchanged (its existing tests stay green).
- Check no other file re-implements DTE; consolidate if found (mention only, don't expand scope).

**Acceptance criteria covered:**

- Supports US-50 rule evaluation (DTE is the sole input for both rules) and the
  US-52 note "use the same DTE calculation already established."

### 2. `alerts` table migration

**Files to create or modify:**

- `migrations/009_create_alerts.sql` — new.

**Red — tests to write:**

- In `src/main/services/alerts.test.ts` (created in Area 3), a setup assertion via
  `makeTestDb()` that the `alerts` table and `idx_alerts_open_unique` partial
  unique index exist (e.g. inserting two `open` rows with the same
  `(position_id, rule_code)` throws a SQLite uniqueness error; a second row with
  `status='resolved'` does not).

**Green — implementation:**

- Create the `alerts` table with the columns and types in `data-model.md`
  (`id` PK, `position_id` FK → positions, `rule_code`, `urgency`, `summary`,
  `quick_action`, `status DEFAULT 'open'`, `triggered_at`, `last_evaluated_at`,
  `resolved_at`, `created_at`, `updated_at`).
- Add `CREATE UNIQUE INDEX idx_alerts_open_unique ON alerts (position_id, rule_code) WHERE status = 'open'`.
- Add `CREATE INDEX idx_alerts_status_urgency ON alerts (status, urgency)`.

**Refactor — cleanup to consider:**

- Match SQL style/formatting of `007_create_ivr_snapshot.sql` and `008`.

**Acceptance criteria covered:**

- Persistence substrate for AC #1 (stores all alert fields) and the no-duplicate
  invariant (AC #2).

### 3. Alert persistence service (primitives)

**Files to create or modify:**

- `src/main/services/alerts.ts` — new. Functions: `upsertOpenAlert`, `resolveAlertsNotIn`, `listOpenAlerts`.
- `src/main/schemas.ts` — add `AlertRecord`, `AlertUrgency`, `AlertStatus`, `EvaluateAlertsResult` types (per `data-model.md`).
- `src/main/services/alerts.test.ts` — new.

**Red — tests to write (`src/main/services/alerts.test.ts`):**

- `upsertOpenAlert` inserts a new row with `status='open'`, equal `triggered_at`
  and `last_evaluated_at`, and stores `position_id`, `rule_code`, `urgency`,
  `summary`, `quick_action`.
- `upsertOpenAlert` called again for the same `(position_id, rule_code)` with a
  later `now` and changed `summary`: **no second row**; `triggered_at` unchanged;
  `last_evaluated_at` and `summary` updated.
- Partial unique index guard: two raw `open` inserts for the same pair throw; an
  `open` + a `resolved` insert for the same pair both succeed.
- `resolveAlertsNotIn(db, matchedKeys, now)` sets `status='resolved'` +
  `resolved_at` for open alerts whose `(position_id, rule_code)` is absent from
  `matchedKeys`, and leaves matched ones open. Already-resolved rows are untouched.
- `listOpenAlerts(db)` returns only `status='open'` rows mapped to `AlertRecord`
  (camelCase), excluding resolved/dismissed.

**Green — implementation:**

- Implement `upsertOpenAlert(db, match, positionId, now)`: `SELECT` the existing
  open row for `(position_id, rule_code)`; if present `UPDATE summary, urgency,
quick_action, last_evaluated_at, updated_at`; else `INSERT` a new row with a
  fresh `crypto.randomUUID()` id, `triggered_at = last_evaluated_at = now`,
  `status='open'`.
- Implement `resolveAlertsNotIn(db, matchedKeys: Set<string>, now)` where each key
  is `` `${positionId}::${ruleCode}` ``; `UPDATE alerts SET status='resolved',
resolved_at=?, updated_at=? WHERE status='open'` filtered to rows not in the set.
- Implement `listOpenAlerts(db): AlertRecord[]` mapping snake_case rows to the
  `AlertRecord` shape.
- Add DEBUG logs for insert vs update branch and resolve count.

**Refactor — cleanup to consider:**

- Centralize the `${positionId}::${ruleCode}` key builder so the service and the
  orchestrator (Area 5) share one function. Check column-mapping duplication
  against other services.

**Acceptance criteria covered:**

- AC #1 (stores all fields), AC #2 (in-place update, triggered_at preserved),
  AC #3 (resolution + excluded from open-queue reads).

### 4. Pure alert engine

**Files to create or modify:**

- `src/main/core/alerts.ts` — new. Exports `DEFAULT_MANAGEMENT_WINDOW_DTE`, rule constants, and `evaluatePosition(input: AlertEvaluationInput): PositionEvaluation`.
- `src/main/core/alerts.test.ts` — new.
- `src/main/core/types.ts` — add `AlertUrgency`, `AlertStatus`, `RuleCode`, and the engine input/output interfaces (or co-locate in `alerts.ts`).

**Red — tests to write (`src/main/core/alerts.test.ts`):**

- `dte = 5` (CSP_OPEN, strike `180.0000`) → one match `EXPIRATION_IMMINENT`,
  urgency `high`, summary `Expires in 5 days at $180.00 strike`, quick action
  `Review position`; no `MANAGEMENT_WINDOW` match.
- `dte = 3` → summary updates to `Expires in 3 days at $180.00 strike` (precedence still high-only).
- `dte = 6` → one match `MANAGEMENT_WINDOW`, urgency `medium`, summary
  `6 DTE remaining — review for roll or close`; no expiration match.
- `dte = 21` (default threshold) → one `MANAGEMENT_WINDOW` match.
- `dte = 22` → no matches, no skips.
- `dte = 4` with default threshold → only `EXPIRATION_IMMINENT` (precedence; not also management window).
- `dte = null` → no matches; `skipped` contains entries for the DTE-dependent
  rules with `reason: 'missing_dte'`.
- `managementWindowDte = 14`: `dte = 18` → no match (intentional gap above the
  trader's tighter window, per US-53 note); `dte = 14` → `MANAGEMENT_WINDOW`.
- Strike formatting: strike `7.5000` → `$7.50`; strike `1250.0000` → `$1250.00`.

**Green — implementation:**

- Implement `evaluatePosition` as a pure function: compute matches via small rule
  predicates. `EXPIRATION_IMMINENT` when `dte !== null && dte <= 5`.
  `MANAGEMENT_WINDOW` when `dte !== null && 6 <= dte <= managementWindowDte`.
- When `dte === null`, return both DTE rules in `skipped` with `reason:'missing_dte'`
  and no matches.
- Format strike via `new Decimal(strike).toFixed(2)` prefixed with `$`.
- Export `DEFAULT_MANAGEMENT_WINDOW_DTE = 21`; default the `managementWindowDte`
  param to it. No DB/broker/logger imports.

**Refactor — cleanup to consider:**

- Express rules as a small ordered list of pure predicates so US-54/55/56/62 can
  append without touching precedence logic. Keep summary builders as named pure helpers.

**Acceptance criteria covered:**

- AC #1 (rules fire with correct urgency/summary/quick-action), and the
  EXPIRATION_IMMINENT/MANAGEMENT_WINDOW behavior underpinning AC #1–#3.

### 5. Evaluation orchestration service

**Files to create or modify:**

- `src/main/services/evaluate-alerts.ts` — new. Exports `ALERT_EVAL_JOB_NAME` and `evaluateAlerts({ db, now?, managementWindowDte?, logger? }): EvaluateAlertsResult`.
- `src/main/services/evaluate-alerts.test.ts` — new (integration: real in-memory DB via `makeTestDb`).

**Red — tests to write (`src/main/services/evaluate-alerts.test.ts`):**

- Loads only evaluable positions: seed AAPL `CSP_OPEN` (4 DTE), MSFT `CC_OPEN`
  (17 DTE), TSLA `HOLDING_SHARES` (no CC) → after run, `listOpenAlerts` has one
  AAPL `EXPIRATION_IMMINENT` and one MSFT `MANAGEMENT_WINDOW`, and **no** TSLA row.
- Returned `EvaluateAlertsResult` counts: `createdCount` reflects new inserts on
  first run; on an immediate second run with unchanged DTE, `createdCount=0` and
  `updatedCount` covers the re-matched alerts, with no new rows.
- Re-match preserves `triggered_at` and advances `last_evaluated_at` (read rows
  directly to assert).
- Resolution: after a first run creates an MSFT `MANAGEMENT_WINDOW`, mutate the
  active leg's expiration to 29 DTE and run again → that alert row is `resolved`
  with `resolved_at` set and absent from `listOpenAlerts`.
- Per-rule isolation + atomicity: with a position whose engine input yields a
  skipped rule (e.g. force `dte = null` via a leg expiration the helper can't
  resolve) alongside a triggering AAPL position → AAPL alert is still persisted,
  the skipped rule is logged at DEBUG (spy on logger.debug), and no partial rows
  exist (assert the `alerts` write set is consistent / count matches expectations).
- Uses an injected `now` so DTE is deterministic.

**Green — implementation:**

- Implement `evaluateAlerts`:
  1. Query evaluable positions with the `JOIN activeLegSubquery()` SQL from
     `data-model.md` (status ACTIVE, phase in CSP_OPEN/CC_OPEN).
  2. **Compute phase:** map each row to an `AlertEvaluationInput` (compute `dte`
     via `core/dte.ts`, pass `managementWindowDte` default 21); call
     `evaluatePosition` inside a per-position `try/catch`; accumulate matches and
     skips; `logger.debug` each skip (`{ positionId, ruleCode, reason }`).
  3. **Persist phase (single `db.transaction`):** `upsertOpenAlert` for every
     match (tracking created vs updated), build the matched-key set, then
     `resolveAlertsNotIn(db, matchedKeys, now)`.
  4. Return `EvaluateAlertsResult` and `logger.info` a one-line summary.
- Export `ALERT_EVAL_JOB_NAME = 'alert-evaluation'`.

**Refactor — cleanup to consider:**

- Share the matched-key builder with `services/alerts.ts` (Area 3).
- Mirror the `collectIVRSnapshots` result/log shape for consistency.

**Acceptance criteria covered:**

- AC #1 (creates alerts for triggered rules, stores all fields), AC #2 (no
  duplicate, triggered_at preserved, last_evaluated_at updated), AC #3 (resolve +
  drop from open queue), AC #4 (no active leg → skipped), AC #5 (missing data
  skipped with debug log, others persist, no partial writes).

### 6. Scheduler registration

**Files to create or modify:**

- `src/main/index.ts` — register the `alert-evaluation` job before `scheduler.start()`.

**Red — tests to write:**

- This is wiring in the Electron entrypoint (consistent with how
  `detect-assignments` / `ivr-collect` are registered there without a dedicated
  index unit test). Coverage of the job behavior is the `evaluate-alerts.test.ts`
  integration suite plus Area 6's AC-driven e2e tests, which invoke the same
  service the handler calls. If `src/main/index.test.ts` already asserts the job
  registry, add an expectation that `alert-evaluation` is registered.

**Green — implementation:**

- Add `scheduler.register({ name: ALERT_EVAL_JOB_NAME, cadence: { kind: 'interval',
marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null },
handler: async () => evaluateAlerts({ db }) })`, before `scheduler.start()`.
- Import `ALERT_EVAL_JOB_NAME` and `evaluateAlerts` from `services/evaluate-alerts`.
- Not broker-gated — the DTE rules need no broker call.

**Refactor — cleanup to consider:**

- Keep registration adjacent to the other `scheduler.register` blocks; match
  their comment style.

**Acceptance criteria covered:**

- AC background ("the polling scheduler is running during market hours") — the
  job runs on the shared US-46 cadence.

### 7. E2e Tests

AC-driven, one test per US-50 acceptance scenario. These exercise the full
backend path (migrated DB + `evaluateAlerts`, invoked the way the scheduler
handler invokes it) against `makeTestDb()` with an injected `now`. File:
`src/main/services/evaluate-alerts.e2e.test.ts` (or extend the integration suite
with a dedicated `describe('US-50 acceptance', ...)` block).

**Red — tests to write (one per AC, names mirror the AC language):**

- `AC: Scheduled evaluation creates open alerts for triggered rules` — seed AAPL
  CSP at 4 DTE and MSFT CC at 17 DTE; run evaluation; assert an
  `EXPIRATION_IMMINENT` alert exists for AAPL and a `MANAGEMENT_WINDOW` alert for
  MSFT, and that each persisted row carries all eight fields (position id, rule
  code, urgency, summary, quick action, status, triggered_at, last_evaluated_at).
- `AC: Re-evaluation updates an existing open alert instead of duplicating it` —
  given an open MSFT `MANAGEMENT_WINDOW` and unchanged 17 DTE, run again; assert
  exactly one MSFT management-window row, original `triggered_at` preserved,
  `last_evaluated_at` advanced.
- `AC: Cleared conditions resolve the alert` — given an open MSFT
  `MANAGEMENT_WINDOW`, move the leg to 29 DTE and run; assert the alert is
  `resolved` and absent from `listOpenAlerts`.
- `AC: Positions without an active option leg are skipped` — seed TSLA
  `HOLDING_SHARES` with no open covered call; run; assert no alert rows exist for TSLA.
- `AC: Missing data for one rule does not fail the whole evaluation job` — seed a
  position that yields a skipped rule (missing/unresolvable DTE) alongside an
  AAPL position meeting `EXPIRATION_IMMINENT`; run; assert the AAPL alert is still
  persisted, the skipped rule produced a DEBUG log entry and no row, and no
  partially written rows remain.

**Green — implementation:**

- No new production code beyond Areas 1–6; these tests confirm the integrated
  behavior. Add only test helpers needed to seed positions at a target DTE
  relative to the injected `now`.

**Refactor — cleanup to consider:**

- Extract a shared `seedActiveLegAtDte(db, position, dte, now)` test helper to
  remove duplication across the AC tests.

**Acceptance criteria covered:**

- All five US-50 acceptance scenarios (see AC Audit above), one e2e test each.
