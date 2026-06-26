# US-50 — Evaluate built-in alert rules against all active positions on a schedule — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

> **Note on "E2E" for this story:** US-50 is a backend/persistence story with no
> renderer surface. The AC-driven tests in Layer 5 are Vitest integration tests
> against `makeTestDb()` (run with `pnpm test`), **not** Playwright `pnpm test:e2e`.

---

## Layer 1 — Foundation (no cross-area dependencies)

> These three areas can be started immediately and run in parallel.

### Area 1 — DTE helper extraction

- [x] **[Red]** Write failing tests — `src/main/core/dte.test.ts`
  - Test cases:
    - returns `null` when `expiration` is `null`
    - returns `0` when `expiration` equals the injected `now` calendar date
    - returns `5` when `expiration` is 5 calendar days after a fixed injected `now`
    - returns a negative number when `expiration` is in the past
    - timezone-stable: a `now` late in the local day yields the same whole-day count as midnight (no off-by-one)
  - Run `pnpm test src/main/core/dte.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/dte.ts` _(depends on: Area 1 Red ✓)_
  - `computeDte(expiration: string | null, now: Date = new Date()): number | null` using `date-fns` `differenceInCalendarDays(parseISO(expiration), now)` on a calendar-day basis; no DB/broker imports
  - Update `src/main/services/list-positions.ts` to import the shared helper and delete its private `computeDte`
  - Run `pnpm test src/main/core/dte.test.ts src/main/services/list-positions.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/dte.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm `list-positions.ts` behavior unchanged; check no other file re-implements DTE
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 2 — `alerts` table migration

- [x] **[Red]** Write failing test — `src/main/services/alerts.test.ts` (migration-existence assertion)
  - Test cases (in a `describe('alerts schema')` block):
    - `makeTestDb()` has an `alerts` table (insert a minimal `open` row succeeds)
    - two raw `open` inserts for the same `(position_id, rule_code)` throw a SQLite uniqueness error (partial unique index)
    - an `open` + a `resolved` insert for the same pair both succeed
  - Run `pnpm test src/main/services/alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `migrations/009_create_alerts.sql` _(depends on: Area 2 Red ✓)_
  - Create `alerts` table: `id` PK, `position_id` `NOT NULL REFERENCES positions(id)`, `rule_code`, `urgency`, `summary`, `quick_action`, `status NOT NULL DEFAULT 'open'`, `triggered_at`, `last_evaluated_at`, `resolved_at` (nullable), `created_at`, `updated_at` (see `data-model.md`)
  - `CREATE UNIQUE INDEX idx_alerts_open_unique ON alerts (position_id, rule_code) WHERE status = 'open'`
  - `CREATE INDEX idx_alerts_status_urgency ON alerts (status, urgency)`
  - Run `pnpm test src/main/services/alerts.test.ts` — schema tests must pass
- [x] **[Refactor]** `/refactor` — `migrations/009_create_alerts.sql` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Match SQL style/formatting of `007_create_ivr_snapshot.sql` / `008`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 4 — Pure alert engine

- [x] **[Red]** Write failing tests — `src/main/core/alerts.test.ts`
  - Test cases:
    - `dte = 5` (CSP_OPEN, strike `180.0000`) → one `EXPIRATION_IMMINENT`, urgency `high`, summary `Expires in 5 days at $180.00 strike`, quick action `Review position`; no `MANAGEMENT_WINDOW`
    - `dte = 3` → summary `Expires in 3 days at $180.00 strike` (high-only)
    - `dte = 6` → one `MANAGEMENT_WINDOW`, urgency `medium`, summary `6 DTE remaining — review for roll or close`
    - `dte = 21` (default threshold) → one `MANAGEMENT_WINDOW`
    - `dte = 22` → no matches, no skips
    - `dte = 4` → only `EXPIRATION_IMMINENT` (precedence; not also management window)
    - `dte = null` → no matches; `skipped` contains the DTE-dependent rules with `reason: 'missing_dte'`
    - `managementWindowDte = 14`: `dte = 18` → no match; `dte = 14` → `MANAGEMENT_WINDOW`
    - strike formatting: `7.5000` → `$7.50`; `1250.0000` → `$1250.00`
  - Run `pnpm test src/main/core/alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/alerts.ts` (+ engine types in `src/main/core/types.ts`) _(depends on: Area 4 Red ✓)_
  - Add `AlertUrgency`, `AlertStatus`, `RuleCode`, `AlertEvaluationInput`, `AlertMatch`, `SkippedRule`, `PositionEvaluation` (see `data-model.md`)
  - `evaluatePosition(input): PositionEvaluation` — pure; `EXPIRATION_IMMINENT` when `dte !== null && dte <= 5`; `MANAGEMENT_WINDOW` when `dte !== null && 6 <= dte <= managementWindowDte`; `dte === null` → both DTE rules in `skipped` with `reason:'missing_dte'`
  - Format strike via `new Decimal(strike).toFixed(2)` prefixed with `$`; export `DEFAULT_MANAGEMENT_WINDOW_DTE = 21` and default the param to it; no DB/broker/logger imports
  - Run `pnpm test src/main/core/alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/alerts.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Express rules as an ordered list of pure predicates so later rules append cleanly; keep summary builders as named helpers
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Persistence service (after Layer 1)

> Runs after the migration exists.

### Area 3 — Alert persistence service (primitives)

**Requires:** Area 2 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/alerts.test.ts` _(depends on: Area 2 Green ✓)_
  - Test cases (alongside the schema block from Area 2):
    - `upsertOpenAlert` inserts a new `open` row with equal `triggered_at`/`last_evaluated_at` and stores `position_id`, `rule_code`, `urgency`, `summary`, `quick_action`
    - `upsertOpenAlert` again for same `(position_id, rule_code)` with later `now` + changed `summary`: no second row; `triggered_at` unchanged; `last_evaluated_at` and `summary` updated
    - `resolveAlertsNotIn(db, matchedKeys, now)` sets `status='resolved'` + `resolved_at` for open alerts absent from `matchedKeys`; leaves matched open; already-resolved untouched
    - `listOpenAlerts(db)` returns only `open` rows mapped to `AlertRecord` (camelCase), excluding resolved/dismissed
  - Run `pnpm test src/main/services/alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/alerts.ts` (+ types in `src/main/schemas.ts`) _(depends on: Area 3 Red ✓)_
  - Add `AlertRecord`, `AlertUrgency`, `AlertStatus`, `EvaluateAlertsResult` to `schemas.ts`
  - `upsertOpenAlert(db, match, positionId, now)`: SELECT existing open row → UPDATE `summary, urgency, quick_action, last_evaluated_at, updated_at` if present, else INSERT new (`crypto.randomUUID()` id, `triggered_at = last_evaluated_at = now`, `status='open'`)
  - `resolveAlertsNotIn(db, matchedKeys: Set<string>, now)` keyed `` `${positionId}::${ruleCode}` ``; UPDATE open rows not in the set to `resolved`
  - `listOpenAlerts(db): AlertRecord[]` mapping snake_case → camelCase
  - DEBUG logs for insert vs update branch and resolve count
  - Run `pnpm test src/main/services/alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/alerts.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Centralize the `${positionId}::${ruleCode}` key builder for reuse by Area 5; check column-mapping duplication
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Evaluation orchestration (after Layer 1 + Layer 2)

### Area 5 — Evaluation orchestration service

**Requires:** Area 1 Green ✓, Area 3 Green ✓, Area 4 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/evaluate-alerts.test.ts` _(depends on: Area 1 Green ✓, Area 3 Green ✓, Area 4 Green ✓)_
  - Test cases (integration, `makeTestDb()`, injected `now`):
    - loads only evaluable positions: AAPL `CSP_OPEN` (4 DTE), MSFT `CC_OPEN` (17 DTE), TSLA `HOLDING_SHARES` (no CC) → `listOpenAlerts` has AAPL `EXPIRATION_IMMINENT` + MSFT `MANAGEMENT_WINDOW`, no TSLA row
    - `EvaluateAlertsResult` counts: first run `createdCount` > 0; immediate second run unchanged DTE → `createdCount=0`, `updatedCount` covers re-matches, no new rows
    - re-match preserves `triggered_at`, advances `last_evaluated_at` (assert on raw rows)
    - resolution: create MSFT `MANAGEMENT_WINDOW`, move leg to 29 DTE, re-run → row `resolved` with `resolved_at`, absent from `listOpenAlerts`
    - per-rule isolation + atomicity: a skipped-rule position (force `dte = null`) alongside triggering AAPL → AAPL alert persisted, skip logged at DEBUG (spy on `logger.debug`), no partial rows
  - Run `pnpm test src/main/services/evaluate-alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/evaluate-alerts.ts` _(depends on: Area 5 Red ✓)_
  - Export `ALERT_EVAL_JOB_NAME = 'alert-evaluation'` and `evaluateAlerts({ db, now?, managementWindowDte?, logger? }): EvaluateAlertsResult`
  - Query evaluable positions via `JOIN activeLegSubquery()` (status ACTIVE, phase IN CSP_OPEN/CC_OPEN) — see `data-model.md`
  - Compute phase: map each row → `AlertEvaluationInput` (`computeDte` from `core/dte.ts`, default `managementWindowDte` 21); call `evaluatePosition` in a per-position `try/catch`; accumulate matches/skips; `logger.debug` each skip
  - Persist phase (single `db.transaction`): `upsertOpenAlert` each match (track created vs updated), build matched-key set, `resolveAlertsNotIn(db, matchedKeys, now)`
  - Return `EvaluateAlertsResult`; `logger.info` one-line summary
  - Run `pnpm test src/main/services/evaluate-alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/evaluate-alerts.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Share the matched-key builder with `services/alerts.ts`; mirror `collectIVRSnapshots` result/log shape
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Scheduler registration (after Layer 3)

### Area 6 — Scheduler registration

**Requires:** Area 5 Green ✓

- [ ] **[Red]** Add/extend test — `src/main/index.test.ts` (if it asserts the job registry) _(depends on: Area 5 Green ✓)_
  - If `index.test.ts` checks `scheduler.getRegistry()`, add an expectation that `alert-evaluation` is registered with an interval cadence. If no such test exists, note that job behavior is covered by Area 5 + Layer 5 and skip a dedicated Red.
  - Run `pnpm test src/main/index.test.ts` — new expectation (if added) must fail
- [ ] **[Green]** Implement — `src/main/index.ts` _(depends on: Area 6 Red ✓)_
  - Import `ALERT_EVAL_JOB_NAME`, `evaluateAlerts` from `services/evaluate-alerts`
  - `scheduler.register({ name: ALERT_EVAL_JOB_NAME, cadence: { kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }, handler: async () => evaluateAlerts({ db }) })` before `scheduler.start()`; not broker-gated
  - Run `pnpm test src/main/index.test.ts` — tests must pass
- [ ] **[Refactor]** `/refactor` — `src/main/index.ts` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep registration adjacent to the other `scheduler.register` blocks; match comment style
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — AC-driven tests (after all previous Green)

**Requires:** All Green tasks from Layers 1–4 ✓

> Vitest integration tests against `makeTestDb()` with an injected `now` (run via
> `pnpm test`), invoked the way the scheduler handler invokes `evaluateAlerts`.

### Area 7 — E2E (AC-driven) Tests

- [ ] **[Red]** Write failing AC tests — `src/main/services/evaluate-alerts.e2e.test.ts` (or a `describe('US-50 acceptance', …)` block) _(depends on: all Green tasks ✓)_
  - One test per AC; names mirror the AC language:
    - AC-1: Scheduled evaluation creates open alerts for triggered rules → `it('AC: Scheduled evaluation creates open alerts for triggered rules')` — AAPL 4 DTE + MSFT 17 DTE; assert `EXPIRATION_IMMINENT` for AAPL and `MANAGEMENT_WINDOW` for MSFT, each row carrying all eight fields (position id, rule code, urgency, summary, quick action, status, triggered_at, last_evaluated_at)
    - AC-2: Re-evaluation updates an existing open alert instead of duplicating it → `it('AC: Re-evaluation updates an existing open alert instead of duplicating it')` — unchanged 17 DTE; exactly one MSFT row, `triggered_at` preserved, `last_evaluated_at` advanced
    - AC-3: Cleared conditions resolve the alert → `it('AC: Cleared conditions resolve the alert')` — move MSFT leg to 29 DTE; alert `resolved` and absent from `listOpenAlerts`
    - AC-4: Positions without an active option leg are skipped → `it('AC: Positions without an active option leg are skipped')` — TSLA `HOLDING_SHARES`, no CC; no alert rows for TSLA
    - AC-5: Missing data for one rule does not fail the whole evaluation job → `it('AC: Missing data for one rule does not fail the whole evaluation job')` — skipped-rule position + triggering AAPL; AAPL alert persisted, skip logged at DEBUG with no row, no partially written rows
  - Run `pnpm test src/main/services/evaluate-alerts.e2e.test.ts` — all new tests must fail
- [ ] **[Green]** Make AC tests pass _(depends on: Area 7 Red ✓)_
  - No new production code expected beyond Areas 1–6; add only a `seedActiveLegAtDte(db, position, dte, now)` test helper as needed
  - Run `pnpm test src/main/services/evaluate-alerts.e2e.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` — AC tests _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract the shared `seedActiveLegAtDte` helper to remove duplication across the AC tests
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for the right reason)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] AC tests cover every US-50 acceptance scenario (5 scenarios → 5 tests)
- [ ] `pnpm test && pnpm lint && pnpm typecheck` — all clean
