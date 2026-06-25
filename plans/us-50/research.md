# Research: US-50 — Scheduled alert-rule evaluation against active positions

## Context

US-50 is the **foundational backend/persistence story** for Epic 07 (Management
Alerts). It establishes three things the rest of the epic builds on:

1. A **pure rule-evaluation engine** (`src/main/core/alerts.ts`) that takes plain
   position + market-state values and returns alert matches — no DB/broker.
2. An **alerts persistence layer** (SQLite table + service) that upserts open
   alerts in place, resolves cleared conditions, and never deletes (audit trail).
3. A **scheduled evaluation job** registered on the existing US-46 polling
   scheduler, reusing the same cadence machinery as `detect-assignments`.

The story's own acceptance criteria reference exactly two rules —
`EXPIRATION_IMMINENT` (DTE ≤ 5) and `MANAGEMENT_WINDOW` (6 ≤ DTE ≤ 21). Those two
rules are therefore in scope for US-50. The remaining Classic Wheel rules
(`PROFIT_TARGET`, `STRIKE_PROXIMITY`, `EARNINGS_PROXIMITY`,
`COVERED_CALL_BREACH`) are dedicated later stories (US-54, US-55, US-56, US-62)
and are **not** implemented here — but the engine and table are designed so they
slot in without schema changes.

No external/third-party research was required: every primitive this story needs
(scheduler, per-position SQL, migration runner, transaction pattern, pure-engine
convention, DTE calculation) already exists in the codebase. The decisions below
record how US-50 composes those primitives.

---

## Architecture Decisions

### ADR: Pure alert engine returns matches + skips, never logs or throws

- **Decision:** `src/main/core/alerts.ts` exposes `evaluatePosition(input): { matches: AlertMatch[]; skipped: SkippedRule[] }`. It is a pure function with no DB/broker/logger imports (per the `src/main/core/` rule). Each built-in rule is a small pure predicate. When a rule cannot evaluate because a required input is absent (e.g. `dte === null`), the engine records a `SkippedRule { ruleCode, reason }` instead of throwing. The service layer is responsible for logging skips at DEBUG.
- **Why:** Keeps core engines pure and side-effect-free, matching `costbasis.ts`/`lifecycle.ts`/`profit-target.ts`. Returning structured `skipped` entries lets the service satisfy the "earnings rule is skipped … with a debug log entry" AC without putting logging in core. Not throwing on missing data keeps one rule's missing input from aborting evaluation of the rest.
- **Alternatives considered:** (a) Throwing inside the engine and catching in the service — rejected because it conflates "no data" with "bug" and complicates the pure-function contract. (b) Passing a logger into the engine — rejected, violates the no-I/O core rule.

### ADR: Rule precedence — EXPIRATION_IMMINENT suppresses MANAGEMENT_WINDOW

- **Decision:** Within a single position evaluation, if `dte <= 5` the engine emits `EXPIRATION_IMMINENT` (high urgency) and does **not** emit `MANAGEMENT_WINDOW`. `MANAGEMENT_WINDOW` (medium urgency) is emitted only when `6 <= dte <= managementWindowDte` (default threshold 21). This is encoded as a lower bound of 6 on the management window so the two rules never both fire on the same leg.
- **Why:** US-53 AC "Expiration-imminent takes precedence inside 5 DTE" and the epic success criterion of avoiding duplicate queue noise. Encoding the lower bound in the management window (rather than a post-filter) makes the rule self-contained and order-independent.
- **Alternatives considered:** Emitting both then de-duping by urgency at persistence — rejected as more code and less obvious than a clean window boundary.

### ADR: `alerts` table with a partial unique index keyed on open status

- **Decision:** New migration `009_create_alerts.sql` creates an `alerts` table with columns `id` (uuid PK), `position_id`, `rule_code`, `urgency`, `summary`, `quick_action`, `status` (`open` | `resolved` | `dismissed`), `triggered_at`, `last_evaluated_at`, `resolved_at` (nullable), `created_at`, `updated_at`. A **partial unique index** `UNIQUE (position_id, rule_code) WHERE status = 'open'` guarantees at most one open alert per (position, rule) while allowing any number of historical resolved/dismissed rows for the same pair.
- **Why:** Re-evaluation must update the existing open alert in place (no duplicate). Resolution must never delete (audit trail) — and a later re-firing of the same rule should create a _new_ open row, leaving the old resolved row intact. A partial unique index expresses exactly that invariant at the DB layer; full uniqueness on `(position_id, rule_code)` would block re-firing after resolution.
- **Alternatives considered:** (a) Full unique `(position_id, rule_code)` + reusing the resolved row on re-fire — rejected because it loses the distinct triggered_at history. (b) No DB constraint, rely on service logic only — rejected; the index is a cheap integrity guard against double-insert bugs.

### ADR: Compute-then-persist in a single transaction

- **Decision:** `evaluateAlerts` runs in two phases. **Compute phase** (outside any transaction): load evaluable positions, build engine inputs, call the engine per position wrapped in a per-position `try/catch` so one bad position cannot abort the run. Accumulate all matches + skips. **Persist phase** (one `db.transaction(...)`): upsert every matched alert and resolve every open alert not re-matched this run. The two phases are separate so that no DB writes happen until all pure computation has succeeded.
- **Why:** Directly satisfies "the job does not leave partially written alert rows if one rule evaluation errors" — computation errors are contained before any write, and the single transaction makes the write set atomic. Mirrors the `detect-assignments` pattern (build map → single `db.transaction`).
- **Alternatives considered:** Per-position transactions — rejected because a mid-run failure would leave some positions updated and others not, contradicting the atomicity AC.

### ADR: Resolution is global across all open alerts, not just evaluated positions

- **Decision:** The persist phase computes the set of matched `(position_id, rule_code)` keys for this run, then marks **every** currently-open alert whose key is absent from that set as `resolved` (`status = 'resolved'`, `resolved_at = now`). This includes open alerts for positions that are no longer evaluable (closed, rolled out of window, or now lacking an active option leg).
- **Why:** Covers all three "resolve" scenarios uniformly — cleared condition (DTE moved out of window), leg closed/expired (position drops out of the evaluable query), and rolled to a longer DTE. A position-scoped resolution would miss closed positions whose open alerts must still resolve.
- **Alternatives considered:** Resolving only alerts for positions returned by the evaluable query — rejected; closed positions never appear in that query, so their open alerts would leak forever.

### ADR: Reuse the US-46 scheduler with a `detect-assignments`-style interval cadence

- **Decision:** Register one job `alert-evaluation` on the shared `scheduler` singleton in `src/main/index.ts`, cadence `{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }`. The handler resolves `db` (already in scope) and calls `evaluateAlerts`. No broker credentials are required for the DTE rules, so the job is **not** broker-gated (unlike `detect-assignments`).
- **Why:** The epic and story both mandate reusing US-46 rather than introducing a second scheduling mechanism. The interval cadence matches the market-data polling cadence; `marketClosedMs: null` parks the job while the market is closed and the scheduler resumes it on next open.
- **Alternatives considered:** A second `afterClose` cadence like IVR — rejected; alerts must reflect intraday state on the polling cadence, not once after close.

### ADR: Extract DTE calculation into a shared pure helper

- **Decision:** Extract the existing `computeDte` logic from `src/main/services/list-positions.ts` into a pure helper `computeDte(expiration: string | null, now?: Date): number | null` in a new `src/main/core/dte.ts`, implemented with `date-fns` (`differenceInCalendarDays`) on an explicit calendar-day basis. `list-positions.ts` and the alert engine input builder both consume it.
- **Why:** US-52 requires "the same DTE calculation already established in market-data surfaces so queue messaging and dashboard badges stay consistent." Centralizing removes the current duplication and aligns with the project date-handling standard (use `date-fns`, avoid `timestamp.slice(0,10)` / ad-hoc string splitting).
- **Alternatives considered:** Importing the private `computeDte` from `list-positions.ts` — rejected; it is unexported and lives in a service file, so the engine (which must stay DB-free) cannot import it.

### ADR: Management-window threshold default lives in the engine; per-trader config deferred

- **Decision:** `evaluatePosition` accepts a `managementWindowDte` parameter defaulting to a `DEFAULT_MANAGEMENT_WINDOW_DTE = 21` constant. US-50 always passes the default. The configurable global threshold (US-57) and per-position override (US-58) will later supply this value from settings.
- **Why:** Keeps US-50 minimal (no settings surface) while making the seam for US-57/US-58 explicit and tested.
- **Alternatives considered:** Hard-coding 21 inline — rejected; the parameter seam is required by US-53's technical note about a configurable threshold and costs nothing now.

---

## Open Questions

None. All design points are resolved from existing codebase patterns and the
story/epic acceptance criteria.
