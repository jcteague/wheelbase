---
page: docs/spec/features/us-52-expiration-imminent-alert.md
audited_at: 2026-09-28
findings: 27
---

# Audit: docs/spec/features/us-52-expiration-imminent-alert.md

## Verified (21)

- ✓ `EXPIRATION_IMMINENT` is the first `RULES` entry, urgency `high` — `src/main/core/alerts.ts:232-240`
- ✓ Predicate `input.dte !== null && input.dte >= 0 && input.dte <= EXPIRATION_IMMINENT_MAX_DTE` — `src/main/core/alerts.ts:237-238`
- ✓ `EXPIRATION_IMMINENT_MAX_DTE = 5` — `src/main/core/alerts.ts:21`
- ✓ Skips with `missing_dte` when `dte === null` — `MISSING_DTE` at `src/main/core/alerts.ts:43`, `missingDteReason` used by the rule
- ✓ `expirationImminentSummary` → `Expires in ${dte} days at ${formatStrike(strike)} strike` — `src/main/core/alerts.ts:120-122`
- ✓ `formatStrike` formats to 2dp with `$` — `src/main/core/alerts.ts:116-118`
- ✓ `QUICK_ACTION_REVIEW = 'Review position'` — `src/main/core/alerts.ts:41`, applied to every match at line 328
- ✓ `MANAGEMENT_WINDOW` range `dte > 5 && dte <= managementWindowDte`, urgency `medium` — `src/main/core/alerts.ts:241-250`
- ✓ Default management window 21 — `DEFAULT_MANAGEMENT_WINDOW_DTE = 21`, `src/main/core/alerts.ts:24`
- ✓ `MANAGEMENT_WINDOW` summary `{dte} DTE remaining — review for roll or close` — `src/main/core/alerts.ts:124-126`
- ✓ `computeDte(expiration, now)` uses `differenceInCalendarDays(parseISO(expiration), now)` and returns `null` when absent — `src/main/core/dte.ts`
- ✓ Evaluation query gated on `p.status = 'ACTIVE' AND p.phase IN ('CSP_OPEN', 'CC_OPEN')` joined to `activeLegSubquery()` — `src/main/services/evaluate-alerts.ts:54-71`
- ✓ `toEvaluationInput` exists — `src/main/services/evaluate-alerts.ts:122`
- ✓ `ALERT_EVAL_JOB_NAME = 'alert-evaluation'` — `src/main/services/evaluate-alerts.ts:28`
- ✓ `upsertOpenAlert` preserves `triggered_at`, refreshes summary/urgency/quick action/last_evaluated_at — doc comment and function at `src/main/services/alerts.ts:74-80`
- ✓ `resolveAlertsNotIn(db, keepOpenKeys, now) => number` — `src/main/services/alerts.ts:176-182`
- ✓ `e2e/expiration-imminent-alert.spec.ts` has 4 AC-mapped tests (lines 32, 64, 94, 119); asserts the 6-DTE medium summary (line 108) and `status = 'resolved'` + `resolved_at` (lines 131-135)
- ✓ `e2e/alert-helpers.ts` exports `runAlertEvaluation`, `cspAtDte`, `listManagementQueueItems`, `readAlertRows`, `setActiveLegExpiration`, `QUEUE_ROW` (lines 6-86)
- ✓ `e2e/management-queue.spec.ts` reuses the helpers — `e2e/management-queue.spec.ts:25`
- ✓ ADR links exist: `alert-rule-registry.md`, `shared-dte-helper.md`, `alert-resolution-global.md` in `docs/spec/architecture/02-adrs/`
- ✓ `migrations/009_create_alerts.sql` exists; `../domain/alerts.md` exists

## Drift (3)

- ✗ `AlertEvaluationInput` listed as `{ positionId, phase, instrumentType, strike, dte, managementWindowDte? }`. The type now also has required `managementWindowDteOverride`, plus profit-target, underlying-price, earnings, and expiration fields — `src/main/core/alerts.ts:52-74`. Suggested fix: note that the shape grew in US-54/55/56/57-58, or link to the domain page rather than enumerating fields.
- ✗ `evaluateAlerts({ db, now?, managementWindowDte?, logger? })` signature is stale. It also takes `provider`, `profitTargetPercentDefault`, and `fetchEarnings` — `src/main/services/evaluate-alerts.ts:175-192`.
- ✗ `upsertOpenAlert(...) => 'inserted' | 'updated'` is stale. `UpsertOutcome = 'inserted' | 'updated' | 'suppressed'` (dismissal suppression, US-59) — `src/main/services/alerts.ts:72`.

## Unverifiable (3)

- ? "No production code changed in core/alerts.ts, core/dte.ts, services/evaluate-alerts.ts, services/alerts.ts" for US-52 — historical claim about a past diff.
- ? "Precedence is encoded in the ranges themselves rather than by emitting both and deduping" — design rationale (consistent with the registry comment at `src/main/core/alerts.ts:193-195`).
- ? Epic-level "`DTE <= 5` is fixed for this epic" — product intent.

## Missing files (0)
