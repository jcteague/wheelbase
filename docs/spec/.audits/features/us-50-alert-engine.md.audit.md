---
page: docs/spec/features/us-50-alert-engine.md
audited_at: 2026-06-27
findings: 1
---

# Audit: docs/spec/features/us-50-alert-engine.md

## Verified (18)

- ✓ `src/main/core/alerts.ts` exists: pure `evaluatePosition(input): PositionEvaluation` (line 101), no DB/broker/logger imports.
- ✓ Rule registry is an ordered list of predicate objects with `code`, `urgency`, `requiresDte`, `test`, `summary` (lines 73-100).
- ✓ `EXPIRATION_IMMINENT` (DTE ≤ 5; `EXPIRATION_IMMINENT_MAX_DTE = 5`, line 14) and `MANAGEMENT_WINDOW` (6 … managementWindowDte, line 95) encoded as mutually-exclusive DTE ranges — matches precedence-without-early-return claim.
- ✓ `DEFAULT_MANAGEMENT_WINDOW_DTE = 21` exported (line 17); used as default in `evaluatePosition` (line 102).
- ✓ Missing-data path records a `SkippedRule` instead of throwing (`hasMissingData` line 103; skipped mapping line 106).
- ✓ `src/main/core/dte.ts` exists: pure `computeDte(expiration, now?)` using `differenceInCalendarDays`/`parseISO` (lines 4, 11-13).
- ✓ `src/main/services/list-positions.ts` adopts shared `computeDte` (import line 6, use line 78).
- ✓ `src/main/services/alerts.ts` persistence primitives: `upsertOpenAlert` (68), `resolveAlertsNotIn` (115), `listOpenAlerts` (141), `alertKey(positionId, ruleCode)` (36), local `mapAlertRow` snake→camel (40).
- ✓ `src/main/services/evaluate-alerts.ts`: `evaluateAlerts({ db, ... }): EvaluateAlertsResult` (74-79); two phases — compute (load via `activeLegSubquery()` line 46, per-position `try/catch`, DEBUG skip log) and a single `db.transaction` persist (line 113). Returns `{ createdCount, updatedCount, resolvedCount, skippedRuleCount }` (128). Exports `ALERT_EVAL_JOB_NAME = 'alert-evaluation'` (21).
- ✓ `src/main/index.ts` registers `alert-evaluation` job with interval cadence `marketOpenMs: 60_000`, `extendedHoursMs: 300_000` (lines 220-224), and is not broker-gated.
- ✓ `migrations/009_create_alerts.sql` defines `alerts` table with the eight content fields + audit columns, partial unique index `idx_alerts_open_unique` (WHERE status='open'), and `idx_alerts_status_urgency`.
- ✓ `src/main/schemas.ts` adds `AlertRecord` (467), `EvaluateAlertsResult` (496) and re-exports `AlertUrgency`/`AlertStatus` from `./core/alerts` (line 465).
- ✓ All ADR + domain + schema spec links resolve (8 ADRs, `domain/alerts.md`, `schema/tables.md`, `schema/migrations.md`, `./us-46-polling-scheduler.md`).

## Drift (1)

- ✗ "Source files" section (lines 129-131) claims engine input/output types `AlertUrgency`, `AlertStatus`, `RuleCode`, `AlertEvaluationInput`, `AlertMatch`, `SkippedRule`, `PositionEvaluation` live in `src/main/core/types.ts`. Grep shows ALL of these are defined in `src/main/core/alerts.ts` (lines 8-10, 24, 33, 40, 45). `src/main/core/types.ts` is a Zod-schema file (StrategyType/WheelPhase/LegRole/etc.) and contains none of the alert types. Suggested fix: change the bullet to reference `src/main/core/alerts.ts` (or drop the separate `core/types.ts` bullet).

## Unverifiable (1)

- ? "follows the same purity contract as costbasis.ts and lifecycle.ts" — narrative purity assertion (no I/O imports confirmed in alerts.ts, but the comparison itself is descriptive).

## Missing files (0)

None.
