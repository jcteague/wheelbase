# US-52: Expiration-Imminent Alert

<!-- generated:from us-52 -->

## Summary

US-52 formalizes the `EXPIRATION_IMMINENT` alert rule: a dedicated, high-urgency
management signal that fires for any active short option leg (an `ACTIVE`
`CSP_OPEN` or `CC_OPEN` position with an open option leg) whose days-to-expiration
fall in the fixed built-in window `0 <= dte <= 5`. When it matches, the rule emits
`urgency: 'high'`, the summary `Expires in {dte} days at ${strike} strike`, and the
quick action `Review position`.

Nearly all of this behavior already existed inside the shared alert engine from
[US-50](us-50-alert-engine.md) (rule registry, `computeDte`, the
`evaluateAlerts` compute/persist lifecycle) and the management-queue read path from
[US-51](us-51-management-queue-dashboard.md). US-52 was therefore primarily
**regression hardening**: it added US-52-named direct coverage at the core, service,
and e2e layers, plus an e2e helper consolidation. No production code changed in
`src/main/core/alerts.ts`, `src/main/core/dte.ts`,
`src/main/services/evaluate-alerts.ts`, or `src/main/services/alerts.ts`, and there is
no new migration, IPC contract, or renderer view-model.

## Acceptance criteria

- **Alert fires at 5 DTE remaining** — a qualifying active CSP/CC at exactly 5 DTE
  produces a high-urgency open alert with summary
  `Expires in 5 days at $180.00 strike` and the `Review position` quick action.
- **Alert remains open inside the final 5-day window** — re-evaluating the same
  position later (e.g. at 3 DTE) keeps the same open alert row (same `alertId`,
  preserved `triggered_at`) and refreshes the summary to the live DTE
  (`Expires in 3 days at $180.00 strike`).
- **Alert does not fire before the threshold** — a position at 6 DTE produces no
  `EXPIRATION_IMMINENT` alert. At 6 DTE the `MANAGEMENT_WINDOW` rule fires instead at
  **medium** urgency (it covers `dte > 5 && dte <= managementWindowDte`, default
  window 21); the e2e asserts the `EXPIRATION_IMMINENT` summary is absent while the
  medium `6 DTE remaining — review for roll or close` row is present.
- **Alert resolves after the leg is closed or expires** — closing/removing the active
  short option leg (or it otherwise leaving the evaluable set) causes the next
  evaluation to transition the open row to `status = 'resolved'` with a `resolved_at`
  timestamp, via the global open-alert resolution flow.

## What was built

The `EXPIRATION_IMMINENT` rule is the first entry in the pure `RULES` registry in
`src/main/core/alerts.ts`. Its predicate matches when
`input.dte !== null && input.dte >= 0 && input.dte <= EXPIRATION_IMMINENT_MAX_DTE`
(where `EXPIRATION_IMMINENT_MAX_DTE = 5`); it does not match `dte >= 6` or `dte < 0`,
and it skips with reason `missing_dte` when `dte === null`. On a match it produces an
`AlertMatch` with `ruleCode: 'EXPIRATION_IMMINENT'`, `urgency: 'high'`, a summary from
`expirationImminentSummary` (`Expires in {dte} days at ${strike} strike`, formatting
the strike via `formatStrike` to two decimals), and the shared
`QUICK_ACTION_REVIEW` (`Review position`).

The threshold is a **fixed built-in** distinct from the configurable
management-window threshold. `MANAGEMENT_WINDOW` is kept mutually exclusive by DTE
range (`dte > 5 && dte <= managementWindowDte`) so the louder expiration-imminent
alert and the lower-urgency management reminder never fire together — precedence is
encoded in the ranges themselves rather than by emitting both and deduping downstream.

DTE feeding the rule comes solely from `computeDte(expiration, now)` in
`src/main/core/dte.ts`, which uses `differenceInCalendarDays(parseISO(expiration), now)`
so time-of-day never causes an off-by-one, and returns `null` when the expiration is
absent (surfacing as the `missing_dte` skip).

Phase gating lives in the evaluation target query, not the engine.
`src/main/services/evaluate-alerts.ts` restricts the evaluable set with a query on
`p.status = 'ACTIVE' AND p.phase IN ('CSP_OPEN', 'CC_OPEN')` joined to
`activeLegSubquery()`, so `HOLDING_SHARES` and legs without an active option are never
considered. `toEvaluationInput(...)` builds the pure `AlertEvaluationInput` and
`evaluateAlerts(...)` runs the compute-then-persist lifecycle.

Persistence and resolution reuse the US-50 primitives in
`src/main/services/alerts.ts`. `upsertOpenAlert` refreshes `summary`, `urgency`,
`quick_action`, `last_evaluated_at`, and `updated_at` on an existing open
`(positionId, ruleCode)` row while **preserving `triggered_at`** — this is what keeps
the alert row stable as DTE ticks down. `resolveAlertsNotIn` marks every open alert
whose key is absent from the current match set as `resolved`, which is how an
expiration-imminent alert clears once its leg is closed or leaves scope. The story
observes results through the US-51 `listManagementQueue` read model for e2e
verification but adds no new read contract.

## Architecture decisions

- **Build on the existing US-50/US-51 alert backbone.** Implement US-52 on the
  existing alert-engine stack and management-queue read path with no new migration,
  IPC channel, or renderer contract, since the persistence, orchestration, and
  dashboard rendering already exist. See
  [alert-rule-registry ADR](../architecture/02-adrs/alert-rule-registry.md).
- **`EXPIRATION_IMMINENT` stays a fixed built-in threshold (`0 <= dte <= 5`).** No
  dependency on the configurable `managementWindowDte`; `DTE <= 5` is fixed for this
  epic and must stay distinct from later configurable management-window behavior.
- **Encode rule precedence via mutually exclusive DTE ranges.** Keep
  `EXPIRATION_IMMINENT` (`dte <= 5`) and `MANAGEMENT_WINDOW` (`dte > 5`) mutually
  exclusive in the registry rather than emitting both and deduping — simpler and
  easier to regression-test. See
  [alert-rule-registry ADR](../architecture/02-adrs/alert-rule-registry.md).
- **Use the shared calendar-day DTE helper.** Continue using `computeDte` as the only
  DTE source, per the repo `date-fns` calendar-comparison standard. See
  [shared-dte-helper ADR](../architecture/02-adrs/shared-dte-helper.md).
- **Phase gating lives in the evaluation target query.** Enforce "open short option
  legs only" in the service query, keeping the core engine focused on DTE and summary
  generation.
- **Resolution reuses global open-alert resolution.** Let expiration-imminent alerts
  resolve through `resolveAlertsNotIn(...)` rather than a story-specific branch. See
  [alert-resolution-global ADR](../architecture/02-adrs/alert-resolution-global.md).

## Contracts touched

- **`EXPIRATION_IMMINENT` rule (`AlertMatch`)** — pure rule output:
  `{ ruleCode: 'EXPIRATION_IMMINENT', urgency: 'high', summary: "Expires in {dte} days at ${strike} strike", quickAction: 'Review position' }`.
  Defined in `src/main/core/alerts.ts` (`RULES[0]`, `expirationImminentSummary`,
  `formatStrike`, `QUICK_ACTION_REVIEW`).
- **`AlertEvaluationInput`** — plain-value engine input:
  `{ positionId, phase, instrumentType: 'PUT'|'CALL'|null, strike: string|null (4dp TEXT), dte: number|null, managementWindowDte? }`.
  `managementWindowDte` is present on the shared input but **not used** by
  `EXPIRATION_IMMINENT` matching. Built by `toEvaluationInput(...)`.
- **`evaluateAlerts` orchestration** (unchanged, reused) —
  `evaluateAlerts({ db, now?, managementWindowDte?, logger? }) => { createdCount, updatedCount, resolvedCount, skippedRuleCount }`;
  job name `ALERT_EVAL_JOB_NAME = 'alert-evaluation'`.
- **`upsertOpenAlert` / `resolveAlertsNotIn`** (unchanged, reused) —
  `upsertOpenAlert(db, match, positionId, now) => 'inserted' | 'updated'`
  (updates in place, preserves `triggered_at`);
  `resolveAlertsNotIn(db, matchedKeys, now) => number` (resolves unmatched open rows).
- **`ManagementQueueItem`** (US-51 read model, verification surface only) —
  `{ alertId, positionId, ticker, phase, urgency, summary, quickAction, triggeredAt }`,
  sorted by urgency tier then `triggered_at` ascending. Consumed by US-52 only as an
  e2e observation surface.

The `alerts` table this rule reads/writes was created by migration
`migrations/009_create_alerts.sql` (US-50). US-52 adds no new migration, table, or
column. See [domain/alerts.md](../domain/alerts.md) for the full schema.

## Source files

- `src/main/core/alerts.ts` — `EXPIRATION_IMMINENT` rule, summary builders,
  exclusive-range precedence (unchanged by US-52)
- `src/main/core/dte.ts` — `computeDte` calendar-day helper (unchanged by US-52)
- `src/main/services/evaluate-alerts.ts` — `EVALUABLE_QUERY`, `toEvaluationInput`,
  `evaluateAlerts` orchestration (unchanged by US-52)
- `src/main/services/alerts.ts` — `upsertOpenAlert`, `resolveAlertsNotIn`,
  `listManagementQueue` (unchanged by US-52)
- `e2e/expiration-imminent-alert.spec.ts` — 4 tests mapped 1:1 to the ACs
- `e2e/alert-helpers.ts` — shared alert e2e helpers (`runAlertEvaluation`, `cspAtDte`,
  `listManagementQueueItems`, `readAlertRows`, `setActiveLegExpiration`, `QUEUE_ROW`),
  also reused by `e2e/management-queue.spec.ts`

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
