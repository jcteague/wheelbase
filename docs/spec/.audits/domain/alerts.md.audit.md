---
page: docs/spec/domain/alerts.md
audited_at: 2026-06-27
findings: 1
---

# Audit: docs/spec/domain/alerts.md

## Verified (19)

- ✓ `listManagementQueue(db)` exists in `src/main/services/alerts.ts:184`, joins
  `alerts` → `positions` to add `ticker`/`phase`.
- ✓ Sort order is urgency tier (`high`→`medium`→`low`) then `triggered_at ASC` —
  `src/main/services/alerts.ts:199-201` (`CASE a.urgency WHEN 'high' THEN 0 ...`,
  then `a.triggered_at ASC`).
- ✓ `ManagementQueueItem` view-model defined in `src/main/schemas.ts:484-493`
  with exactly `alertId, positionId, ticker, phase, urgency, summary,
quickAction, triggeredAt` — audit fields (`lastEvaluatedAt`, `resolvedAt`,
  `createdAt`, `updatedAt`, `status`) excluded as documented.
- ✓ `listManagementQueue` exposed over `alerts:list` IPC channel via
  `handleIpcCall` in `src/main/ipc/alerts.ts:7-8` (`{ items: listManagementQueue(db) }`).
- ✓ Renderer api at `src/renderer/src/api/alerts.ts` exists.
- ✓ `listOpenAlerts` kept distinct/stable — `src/main/services/alerts.ts:141`.
- ✓ ADR `management-queue-read-path.md` exists at
  `docs/spec/architecture/02-adrs/management-queue-read-path.md`.
- ✓ Two rules `EXPIRATION_IMMINENT` (high) and `MANAGEMENT_WINDOW` (medium) in
  the `RULES` registry — `src/main/core/alerts.ts:80-99`.
- ✓ DTE ranges: `EXPIRATION_IMMINENT` is `0 ≤ dte ≤ 5` (`EXPIRATION_IMMINENT_MAX_DTE = 5`,
  line 14) and `MANAGEMENT_WINDOW` is `dte > 5 && dte ≤ managementWindowDte`
  (lines 93-96); mutually exclusive as documented.
- ✓ Default management window 21 — `DEFAULT_MANAGEMENT_WINDOW_DTE = 21`
  (`src/main/core/alerts.ts:17`).
- ✓ Summary templates match: `Expires in ${dte} days at ${strike} strike`
  (line 59) and `${dte} DTE remaining — review for roll or close` (line 63).
- ✓ Strike formatted `$` + `toFixed(2)` via `decimal.js` — `formatStrike`
  (`src/main/core/alerts.ts:54-56`).
- ✓ Quick action "Review position" — `QUICK_ACTION_REVIEW`
  (`src/main/core/alerts.ts:19`).
- ✓ `computeDte` helper exists in `src/main/core/dte.ts:11`.
- ✓ Pure engine returns `{ matches, skipped }` with `SkippedRule { ruleCode, reason }`
  — `src/main/core/alerts.ts:40-48,101-120`.
- ✓ Migration `009_create_alerts.sql` creates `alerts` with
  `status DEFAULT 'open'`, `triggered_at`/`last_evaluated_at`/`resolved_at`,
  partial unique `idx_alerts_open_unique ON (position_id, rule_code) WHERE status='open'`
  and `idx_alerts_status_urgency` — `migrations/009_create_alerts.sql:18-23`.
- ✓ Compute-then-persist + global resolution: `upsertOpenAlert` /
  `resolveAlertsNotIn` (`src/main/services/alerts.ts:68,115`); resolution marks
  every open key absent from the matched set.
- ✓ Reuses polling scheduler with cadence 60 s open / 5 min extended / parked
  when closed, not broker-gated — `src/main/index.ts:219-228`
  (`marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null`),
  `ALERT_EVAL_JOB_NAME = 'alert-evaluation'` (`src/main/services/evaluate-alerts.ts:21`).
- ✓ All linked ADR/feature pages exist (`alert-engine-pure-matches-skips`,
  `alert-rule-registry`, `alerts-partial-unique-open`, `alert-compute-then-persist`,
  `alert-evaluation-job-cadence`, `us-50-alert-engine`,
  `us-51-management-queue-dashboard`, `schema/tables.md`, `schema/migrations.md`).

## Drift (0)

(none)

## Unverifiable (1)

- ? "rows are never deleted — the table is an audit trail" / `dismissed` reserved
  for US-59. No `CHECK` constraint on `status` in migration 009, and no current
  write path emits `dismissed`; the claim is consistent with code (nothing
  deletes), but the "never deleted" invariant is a convention not enforced by a
  constraint. Flag for human review only.

## Missing files (0)

(none)
