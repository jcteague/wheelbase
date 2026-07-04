# US-50: Scheduled alert-rule evaluation engine

<!-- generated:from us-50 -->

## Summary

US-50 is the backbone of Epic 07 (Management Alerts). It delivers a pure
rule-evaluation engine, a persisted `alerts` table with in-place upsert +
resolution semantics, an orchestration service that loads active positions and
writes results atomically, and a recurring job registered on the existing
[US-46 polling scheduler](./us-46-polling-scheduler.md). When running, the
scheduler wakes on the market-data cadence, evaluates every active CSP/CC
position against the two built-in rules — `EXPIRATION_IMMINENT` (DTE ≤ 5,
high urgency) and `MANAGEMENT_WINDOW` (6–21 DTE, medium urgency) — and maintains
a deduplicated, restart-safe alert set that resolves cleared conditions without
deleting history.

The two in-scope rules are the only ones implemented. The remaining Classic
Wheel rules (`PROFIT_TARGET`, `STRIKE_PROXIMITY`, `EARNINGS_PROXIMITY`,
`COVERED_CALL_BREACH`) are later stories, but the engine's rule registry and the
`alerts` table are designed so those rules slot in without schema changes or
control-flow edits.

## Acceptance criteria

- **Scheduled evaluation creates open alerts for triggered rules** — each
  persisted row stores all eight fields (position id, rule code, urgency tier,
  summary, quick action, status, `triggered_at`, `last_evaluated_at`).
- **Re-evaluation updates an existing open alert instead of duplicating it** — at
  most one open row per `(position_id, rule_code)`; `triggered_at` is preserved
  and `last_evaluated_at` (and `summary`) advance.
- **Cleared conditions resolve the alert** — resolution sets `status='resolved'`
  - `resolved_at`; the row is retained and excluded from open-queue reads.
- **Positions without an active option leg are skipped** — e.g.
  `HOLDING_SHARES` with no open covered call is naturally excluded by the join on
  the active-leg subquery.
- **Missing data for one rule does not fail the whole evaluation job** — a
  skipped rule produces no alert row and a DEBUG log entry, must not affect other
  positions' alerts, and a compute error must not leave partially written rows.

## What was built

**Pure engine (`src/main/core/alerts.ts`).** `evaluatePosition(input)` returns
`{ matches, skipped }` with no DB/broker/logger imports — it follows the same
purity contract as `costbasis.ts` and `lifecycle.ts`. Rules are expressed as an
ordered registry of pure predicate objects (`code`, `urgency`, `requiresDte`, a
`test` predicate, and a named `summary` builder); `evaluatePosition` is a generic
two-filter pass over that registry. When a rule's required input is absent (e.g.
`dte === null`), the engine records a `SkippedRule` rather than throwing.
EXPIRATION_IMMINENT precedence over MANAGEMENT_WINDOW is encoded as
mutually-exclusive DTE ranges (`≤ 5` vs `6 … managementWindowDte`), not as
order-dependent early returns. The management-window threshold is a parameter
defaulting to `DEFAULT_MANAGEMENT_WINDOW_DTE = 21` — the seam US-57/US-58 will
later feed from settings.

**Shared DTE helper (`src/main/core/dte.ts`).** `computeDte(expiration, now?)`
was extracted from `list-positions.ts` into a pure `date-fns`-based helper
(`differenceInCalendarDays` on a calendar-day basis), so the engine input builder
and the positions list compute DTE identically.

**Persistence service (`src/main/services/alerts.ts`).** `upsertOpenAlert`
(SELECT existing open → UPDATE in place or INSERT a new UUID row),
`resolveAlertsNotIn` (mark every open alert whose key is absent from this run's
keep-open set — matched rules plus rules skipped for missing data — as resolved),
`listOpenAlerts` (open rows only, snake_case →
camelCase via a local `mapAlertRow`), and an exported `alertKey(positionId,
ruleCode)` identity-key builder shared with the orchestrator.

**Orchestration service (`src/main/services/evaluate-alerts.ts`).**
`evaluateAlerts({ db, now?, managementWindowDte?, logger? })` runs in two phases:
a compute phase (load evaluable positions via a join on the phase-aware
`activeLegSubquery()`, build engine inputs, call the engine per position inside a
`try/catch`, accumulate matches + skips, DEBUG-log each skip) and a persist phase
(a single `db.transaction` that upserts every match and resolves every open alert
this run neither re-matched nor skipped for missing data). It returns `EvaluateAlertsResult`
(`createdCount`/`updatedCount`/`resolvedCount`/`skippedRuleCount`) and exports
`ALERT_EVAL_JOB_NAME = 'alert-evaluation'`.

**Scheduler registration (`src/main/index.ts`).** The `alert-evaluation` job is
registered on the shared scheduler singleton with an interval cadence
(`marketOpenMs: 60_000`, `extendedHoursMs: 300_000`, `marketClosedMs: null`)
before `scheduler.start()`. The DTE rules need no broker call, so the job is
**not** broker-gated.

US-50 adds **no IPC surface** — the `alerts:list` / `alerts:dismiss` /
`alerts:calendar` handlers belong to US-51 / US-59 / US-60.

## Architecture decisions

- [alert-engine-pure-matches-skips](../architecture/02-adrs/alert-engine-pure-matches-skips.md)
  — pure engine returns matches + skips, never logs or throws.
- [alert-rule-registry](../architecture/02-adrs/alert-rule-registry.md) —
  ordered open/closed rule registry; precedence via exclusive DTE ranges;
  threshold as a defaulted parameter.
- [alerts-partial-unique-open](../architecture/02-adrs/alerts-partial-unique-open.md)
  — partial unique index keyed on open status.
- [alert-compute-then-persist](../architecture/02-adrs/alert-compute-then-persist.md)
  — compute outside any transaction, then persist the whole result set in one
  transaction.
- [alert-resolution-global](../architecture/02-adrs/alert-resolution-global.md) —
  resolution spans every open alert neither re-matched nor skipped for missing
  data, including now-unevaluable positions.
- [alert-evaluation-job-cadence](../architecture/02-adrs/alert-evaluation-job-cadence.md)
  — reuse the US-46 scheduler with a `detect-assignments`-style interval cadence;
  not broker-gated.
- [shared-dte-helper](../architecture/02-adrs/shared-dte-helper.md) — extract DTE
  into a pure `src/main/core/dte.ts` helper shared by the engine and the
  positions list.

See also the [Alerts domain page](../domain/alerts.md) for the synthesized
rule/lifecycle model, and the [Tables](../schema/tables.md) and
[Migrations](../schema/migrations.md) pages for the `alerts` schema.

## Contracts touched

No IPC handlers. The engine/service entry points introduced:

- `evaluatePosition(input: AlertEvaluationInput): PositionEvaluation` — pure core
  engine; see `src/main/core/alerts.ts`.
- `evaluateAlerts({ db, now?, managementWindowDte?, logger? }): EvaluateAlertsResult`
  and `ALERT_EVAL_JOB_NAME` — see `src/main/services/evaluate-alerts.ts`.
- `upsertOpenAlert`, `resolveAlertsNotIn`, `listOpenAlerts`, `alertKey` — see
  `src/main/services/alerts.ts`.
- `alert-evaluation` scheduler job registration — see `src/main/index.ts`.

## Source files

- `src/main/core/dte.ts` — pure `computeDte` helper.
- `src/main/core/alerts.ts` — pure alert engine + rule registry, plus the
  engine input/output types (`AlertUrgency`, `AlertStatus`, `RuleCode`,
  `AlertEvaluationInput`, `AlertMatch`, `SkippedRule`, `PositionEvaluation`).
- `src/main/services/alerts.ts` — persistence primitives.
- `src/main/services/evaluate-alerts.ts` — orchestration service.
- `src/main/services/list-positions.ts` — adopts the shared `computeDte`.
- `src/main/schemas.ts` — adds `AlertRecord`, `EvaluateAlertsResult`; re-exports
  `AlertUrgency` / `AlertStatus`.
- `src/main/index.ts` — registers the `alert-evaluation` interval job.
- `migrations/009_create_alerts.sql` — `alerts` table + indexes.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
