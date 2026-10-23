# US-106 — Data model and type design

Requirements: [OPT-14](https://linear.app/optionswheel/issue/OPT-14).
Implementation decisions: [research.md](./research.md).
This is a design, not a record of shipped behavior.

## Existing entities

| Entity                 | Fields used                                                                                                   | Relationship / rule                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `positions`            | `id`, `ticker`, `strategy_type`, `status`, `phase`, `profit_target_percent`, `management_window_dte_override` | PMCC candidates require `ACTIVE`, `PMCC`, `PMCC_OPEN`; wheel query retains its existing criteria. |
| `LegRecord` / `legs`   | role, action, roll chain, fill date, creation time, instrument, strike, expiration, premium, contracts        | `positionId` owns the history; replay chooses one current short or null.                          |
| `AlertEvaluationInput` | position id, phase, short-leg fields, live price/mid, earnings distance, resolved threshold inputs            | One input per eligible position. All option-specific fields come from the current short.          |
| `alerts`               | position id, rule code, urgency, summary, action, status, lifecycle timestamps                                | Existing dedupe and dismissal lifecycle per `(position_id, rule_code)`.                           |
| `ManagementQueueItem`  | alert id, position id, ticker, phase, urgency, summary, action, triggered time                                | Existing open-alert join and sorting; `PMCC_OPEN` selects the PMCC queue badge.                   |

No migration, new entity, settings field or production IPC surface is required.
Money stays in existing 4-dp strings; compute with Decimal and round only for display.

## Short-leg selection

1. Keep the existing wheel SQL rows.
2. Select PMCC candidates and bulk-read their histories with `readLegsByPosition`.
3. For each candidate, call `currentShortCallLeg` inside a per-position catch.
   `SHORT_CALL_OPEN` starts a short; a short-side roll replaces it with its paired
   `ROLL_TO`; LEAPS-side rolls do not change it. Closing, expiration and assignment
   clear it; a later opening makes it evaluable again.
4. Map a non-null result into `EvaluableRow` and append it to the wheel rows.
   Use short `premiumPerContract`, `contracts`, `strike`, `expiration`, and
   `instrumentType`. A confirmed null contributes no evaluation input.
5. Fetch deduplicated quotes, option snapshots and earnings through the existing
   boundary functions. The OCC symbol must identify the short CALL, never the LEAPS.

Do not infer closure merely from a past expiration date: closure follows recorded
leg events. Do not introduce a new PMCC phase for this story. Do not populate the
legacy `GetPositionResult.activeLeg` for PMCC.

**Known gap (accepted at review, 2026-10-17).** When US-106 shipped, no production
path wrote `SHORT_CALL_EXPIRED`, `SHORT_CALL_CLOSE` or `SHORT_CALL_ASSIGNED`; only the
`_test:pmcc-record-leg-event` hook did. Until US-119 ([OPT-25](https://linear.app/optionswheel/issue/OPT-25))
records expiration/close and US-111 ([OPT-19](https://linear.app/optionswheel/issue/OPT-19))
records assignment, a short past its expiration date remains the current short, and
`PMCC_ASSIGNMENT_RISK` keeps firing while the stock is above its strike. Those stories
close the gap by writing the closing leg; the alert service needs no change. Both
issues carry a comment with the details and the e2e follow-up for S6.

Selection failure is not a null short. Track failed candidate ids in a local
`Set<string>`, log `alert_evaluation_failed`, and preserve the keys of their existing
open/dismissed rows in the final keep-open set. Read those keys only for failed ids,
using a prepared query with bound parameters. A bulk PMCC history-read failure logs
and marks all PMCC candidates failed, allowing the wheel rows to continue. No new
rule skip reason or public response field is introduced for a replay exception.

## Rule computation and validation

- New literal: `PMCC_ASSIGNMENT_RISK`; urgency `medium`; action `Review position`.
- Phase: exactly `PMCC_OPEN`.
- Constant: `PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW = 2`.
- Predicate: unrounded `(strike - price) / strike * 100 <= 2` using Decimal.
  Existing entry validation provides positive strikes. This story reuses the
  price/strike guard rather than changing the sibling rules' validation contract.
- Shared missing-data guard: absent, nonnumeric or nonfinite price skips with
  `missing_underlying_price`; malformed/absent strike skips with `missing_strike`.
  Other phases produce neither a match nor a skip for this rule.
- Display: `proximityPercent(input).toFixed(1)`, strike formatted to two decimals,
  `price >= strike ? 'above' : 'below'`. Below uses the approach suffix; at/above
  uses the LEAPS-cover suffix defined in Linear. ATM deliberately reads above.
- Generic short-leg rules remain independent. A 4-DTE short can generate HIGH
  EXPIRATION_IMMINENT and MED PMCC_ASSIGNMENT_RISK simultaneously.

## Alert lifecycle

| Input state                                                    | Existing lifecycle operation                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| Rule matches, no blocking row                                  | Insert open row.                                                     |
| Rule continues matching                                        | Update existing row; preserve id and triggered time.                 |
| Quote is missing or malformed                                  | Add skipped key; retain previous summary and open/dismissed state.   |
| Price retreats, or rolled replacement is outside the threshold | Key absent; resolve existing open/dismissed row.                     |
| No current short, or position inactive                         | Position absent from eligible targets; resolve its prior alerts.     |
| User dismissed and rule still matches                          | Suppress new open row.                                               |
| Condition clears then returns                                  | Resolve old lifecycle; create fresh open row.                        |
| PMCC history read/replay fails                                 | Preserve existing keys for failed position; other positions proceed. |

Use the existing compute-then-persist transaction. No position, leg or basis mutation
is part of alert evaluation.

## Type Design

Applied the `typescript-advanced-types` skill. Plain types plus existing `Pick`
derivations are sufficient; no new generic abstraction or public union is needed.

| Type                                                | File                                            | Construct and purpose                                                                                                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RuleCode`                                          | `src/main/core/alerts.ts`                       | Append a string-literal union member, so registry codes remain checked.                                                                                                                               |
| `PmccAssignmentRiskInput`                           | `src/main/core/alerts.ts`                       | Alias `PriceVsStrikeInput`, itself `Pick<AlertEvaluationInput, 'strike' \| 'currentUnderlyingPrice'>`; summary fields cannot drift from the engine input.                                             |
| `PmccCandidateRow`                                  | `src/main/services/evaluate-alerts.ts`          | `Pick<EvaluableRow, 'position_id' \| 'ticker' \| 'profit_target_percent' \| 'management_window_dte_override'> & { phase: 'PMCC_OPEN' }`; reuse selected position fields and encode the query's phase. |
| `EvaluableRow`                                      | `src/main/services/evaluate-alerts.ts`          | Reuse existing interface unchanged; PMCC mapping supplies the same nullable leg fields.                                                                                                               |
| `PmccShortLeg`                                      | `src/main/services/pmcc-ledger.ts`              | Reuse existing `LegWithRole<'SHORT_CALL_OPEN' \| 'ROLL_TO'>`, returned as nullable by replay; do not duplicate it.                                                                                    |
| `AlertEvaluationInput`, `AlertMatch`, `SkippedRule` | `src/main/core/alerts.ts`                       | Existing interfaces; added RuleCode member flows through automatically.                                                                                                                               |
| `ManagementQueueItem`                               | `src/main/schemas.ts`, `src/preload/index.d.ts` | Unchanged. Renderer can compare existing `phase` directly to `PMCC_OPEN`; no strategy field is needed.                                                                                                |

Local failed-alert query rows can use `Pick<AlertRecord, 'ruleCode'>` with SQL alias
`rule_code AS ruleCode`; no new exported failure-result type is warranted.

## Renderer design

In `ManagementQueueRow`, branch only the badge cell when `item.phase === 'PMCC_OPEN'`.
Use `Badge` and the compact gold-dot `PMCC · short call` label from the mockup;
keep `PhaseBadge` for wheel rows. Preserve ticker, urgency, summary and actions,
with a 150px badge column and `wb-*` Tailwind classes. Review position keeps hash
navigation to `/positions/${item.positionId}`; Dismiss keeps the existing dialog.
Missing quotes leave the existing row visible. Resolution removes that alert row;
other alert rows for the same position may remain.
