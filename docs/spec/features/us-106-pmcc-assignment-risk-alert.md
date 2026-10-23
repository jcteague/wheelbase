# US-106: PMCC Assignment-Risk Alert

<!-- generated:from us-106 -->

## Summary

Adds the `PMCC_ASSIGNMENT_RISK` rule to the pure alert registry (see [alerts](../domain/alerts.md)).
A medium-urgency alert opens when the underlying trades within 2% **below** a PMCC short-call strike
and stays open at any price at or above the strike. The band is a floor with no ceiling.

The reason is the PMCC's shape. A PMCC has no shares to deliver. If the short call is assigned, the
LEAPS has to be exercised or sold to cover, which ends the position. So the moment to roll
up-and-out comes on the way **up** to the strike, not at it. A two-sided band like the CSP rule's
([US-55](us-53-54-55-market-data-alert-rules.md)) would wrongly resolve the alert as the stock ran
through the strike.

Shipping the rule also makes a PMCC evaluable by the alert engine for the first time. The evaluated
leg is the PMCC's **current short call**, found by replaying its legs, and never the LEAPS. The
generic short-leg rules (`EXPIRATION_IMMINENT`, `MANAGEMENT_WINDOW`, `PROFIT_TARGET`,
`EARNINGS_PROXIMITY`) therefore now apply to PMCC short calls as well. The two wheel-specific rules
(`STRIKE_PROXIMITY`, `COVERED_CALL_BREACH`) stay phase-gated to `CSP_OPEN` / `CC_OPEN`.

In the [management queue](us-51-management-queue-dashboard.md), a PMCC row shows a compact
`PMCC · short call` badge in place of the wheel phase badge.

**No schema, migration, or production IPC change.** Story: Linear OPT-14 / US-106 (Linear is the
requirements authority). Mockup: `mockups/us-106-pmcc-assignment-risk-alert.mdx`.

## Acceptance criteria

From Linear OPT-14. Background: valuation date 2026-09-28 in America/New_York; XYZ is a PMCC with
an open $80.00 LEAPS call expiring 2027-09-17 and an open $110.00 short call expiring 2026-10-16,
sold at $2.00 per share, 1 contract.

1. **Alert fires as the stock approaches or passes the short-call strike.** A medium-urgency
   `PMCC_ASSIGNMENT_RISK` alert is open with summary:
   - $107.80 → `Stock is 2.0% below the $110.00 short-call strike — approaching assignment`
   - $108.35 → `Stock is 1.5% below the $110.00 short-call strike — approaching assignment`
   - $110.00 → `Stock is 0.0% above the $110.00 short-call strike — in the money, LEAPS would have to cover`
   - $112.53 → `Stock is 2.3% above … — in the money, LEAPS would have to cover`
   - $118.80 → `Stock is 8.0% above … — in the money, LEAPS would have to cover`
2. **No alert while the stock is more than 2% below the strike.** $107.70 and $105.00 → no alert.
3. **The queue row identifies the position as a PMCC.** At $112.53 the row shows the MED pill, a PMCC
   badge in place of a wheel phase badge, and the summary; `Review position` opens the XYZ detail
   page.
4. **Alert resolves when the stock retreats below the band.** At $106.00 the open alert is resolved
   and the row leaves the queue.
5. **Alert resolves when the short call is rolled further from the money.** After rolling to a $115.00
   call expiring 2026-11-20, $112.53 is 2.1% below the new strike: the alert resolves and no new one
   opens.
6. **A PMCC with no open short call is not evaluated.** After the $110.00 short expires worthless,
   only the LEAPS remains; at $118.80 no alert is created and any open one is resolved.
7. **A missing quote keeps the alert open.** With no XYZ price the alert keeps its previous summary
   and the rule is skipped with reason `missing_underlying_price`.
8. **Classic wheel positions do not use the PMCC rule.** MSFT `CC_OPEN` $420.00 at $415.00 → no
   `COVERED_CALL_BREACH`; AAPL `CSP_OPEN` $180.00 at $178.50 → `STRIKE_PROXIMITY` reads `Stock is 0.8%
below the $180.00 put strike — now in the money`. Neither gets `PMCC_ASSIGNMENT_RISK`.
9. **Short-leg rules evaluate the PMCC short call, never the LEAPS.** On 2026-10-12 at $112.53 a HIGH
   `EXPIRATION_IMMINENT` reads `Expires in 4 days at $110.00 strike`, `PMCC_ASSIGNMENT_RISK` is also
   open, and no XYZ alert mentions the $80.00 strike or the 2027-09-17 expiration.

`e2e/pmcc-assignment-risk-alert.spec.ts` covers all nine scenario families in 15 named cases.

Out of scope: a configurable threshold, ex-dividend / extrinsic-value modelling, urgency escalation,
the LEAPS DTE alert (US-107), and any change to `STRIKE_PROXIMITY`, `COVERED_CALL_BREACH`, dismiss
behaviour, or the PMCC card and detail page.

## What was built

### Rule

`PMCC_ASSIGNMENT_RISK` is one new entry in `RULES` in `src/main/core/alerts.ts`, following the
[alert rule registry pattern](../architecture/02-adrs/alert-rule-registry.md). The evaluation loop is
unchanged.

| Field      | Value                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------- |
| Phase      | exactly `PMCC_OPEN`; other phases produce neither a match nor a skip                          |
| Predicate  | `(strike − price) / strike × 100 ≤ PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW` (2), signed        |
| Skip guard | shared `priceVsStrikeMissingData('PMCC_OPEN')`: `missing_underlying_price` / `missing_strike` |
| Urgency    | `medium`; quick action `Review position`                                                      |
| Input      | `PmccAssignmentRiskInput`, an alias of the shared `PriceVsStrikeInput` slice                  |

The distance is **signed**, so any price at or above the strike gives a non-positive value and
matches. An absolute distance would wrongly clear a deep in-the-money call.

```text
signedPctBelow = (strike − price) / strike × 100      (unrounded Decimal)
fires          ⇔ signedPctBelow ≤ 2                   ⇔ price × 100 ≥ strike × 98
direction      = price ≥ strike ? "above" : "below"   (at the money reads "above")
displayPct     = |price − strike| / strike × 100, toFixed(1)
```

The predicate uses the unrounded value; only the display rounds. A price like $107.7999 displays as
`2.0% below` but stays outside the band, so display rounding cannot pull a price into the alert.

`pmccAssignmentRiskSummary` builds the summary from `proximityPercent` and `formatStrike`. It shares
an extracted `priceDirection` helper with `strikeProximitySummary`, which fixes the at-the-money
reading as "above" in one place.

### Selecting the PMCC short

The wheel's `EVALUABLE_QUERY` and `activeLegSubquery()` are deliberately unchanged.
`activeLegSubquery` also serves `get-position.ts` and `list-positions.ts`, and broadening it would
populate the deliberately `null` legacy `activeLeg` on a PMCC.

Instead, `evaluate-alerts.ts` adds a second source of evaluable rows:

1. `PMCC_CANDIDATE_QUERY` selects `ACTIVE` PMCC positions in `PMCC_OPEN`.
2. `loadPmccEvaluableRows({ db, failedIds, logger })` bulk-loads their legs with
   `readLegsByPosition` and resolves each short with `currentShortCallLeg` from
   `src/main/services/pmcc-ledger.ts` (the [US-104](us-104-roll-pmcc-short-call.md) replay).
3. A non-null short maps to the existing `EvaluableRow` shape, with the short's strike, expiration,
   premium, contracts and CALL OCC symbol, before the existing market-data prefetch. Only the short's
   OCC symbol is ever requested.
4. A null short excludes the position, so its prior alerts resolve.

`PMCC_OPEN` alone does not prove a short exists, and selecting the newest CALL or `ROLL_TO` in SQL
could pick the LEAPS or resurrect a closed short. The full reasoning is in
[pmcc-alerts-select-current-short-by-ledger-replay](../architecture/02-adrs/pmcc-alerts-select-current-short-by-ledger-replay.md).

### Failure isolation

Replay calls `groupRollChains`, which parses Decimals and can throw. A replay failure is **not** a
null short: the position's state is unknown, not confirmed closed. Per the
[alert-evaluation-failure-isolation](../architecture/02-adrs/alert-evaluation-failure-isolation.md)
rule:

- Each candidate's replay runs in its own `try/catch`. A failure adds the id to a local `failedIds`
  set and logs `alert_evaluation_failed` with the position id.
- The keys of a failed position's existing open or dismissed alerts are read (prepared query, bound
  parameters, failed ids only) and kept in the keep-open set, so they are not resolved.
- A failure of the bulk PMCC leg read marks every PMCC candidate failed; wheel rows still evaluate.
- No new skip reason or response field is introduced for a replay exception.

### Alert lifecycle

Persistence is reused unchanged: `upsertOpenAlert`, `resolveAlertsNotIn`, `clearStaleDismissals`
and `listManagementQueue` in `src/main/services/alerts.ts`. `rule_code` is plain TEXT, so the new
code needs no migration.

| Input state                                                   | Outcome                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Rule matches, no blocking row                                 | Insert open row                                                   |
| Rule keeps matching                                           | Update the row; keep its id and triggered time                    |
| Quote missing or malformed                                    | Skipped key; keep the previous summary and open/dismissed state   |
| Price retreats, or the rolled replacement is outside the band | Key absent; resolve the row                                       |
| No current short, or position inactive                        | Position not evaluated; resolve its prior alerts                  |
| User dismissed and the rule still matches                     | Suppress a new open row                                           |
| Condition clears, then returns                                | Old lifecycle resolved; a fresh open row is created               |
| PMCC leg read or replay fails                                 | Keep the failed position's existing keys; other positions proceed |

A 4-DTE short can fire HIGH `EXPIRATION_IMMINENT` and MED `PMCC_ASSIGNMENT_RISK` together; each keeps
its own queue row, and HIGH sorts first. This follows the
[global resolution / co-firing model](../architecture/02-adrs/alert-resolution-global.md).

### Renderer

`ManagementQueueRow` branches only the badge cell on `item.phase === 'PMCC_OPEN'`, rendering a
`Badge` with a gold dot and `PMCC · short call`; wheel rows keep `PhaseBadge`. The badge column
widened from 110px to 150px. Because the branch keys on phase rather than rule code, every alert on a
PMCC (for example a HIGH `EXPIRATION_IMMINENT`) gets the same badge.

The preload global `ManagementQueueItem` is now an alias of the schema type (`phase: WheelPhase`),
removing the `as WheelPhase` cast so the new branch is type-checked.

Not shipped from the mockup: the explanatory panels, `StrikeRuler`, gold row highlighting, preset
controls, a missing-quote banner, and any detail-page alert.

### Logging

Existing INFO/DEBUG events and per-item catches are preserved. Selection errors log
`alert_evaluation_failed` with the position id when known. A missing quote surfaces as DEBUG
`alert_rule_skipped` with the rule and `missing_underlying_price`. Nothing in `core/`.

### Tests

- `alerts.property.test.ts` (new): fires iff `price × 100 ≥ strike × 98` against an independent
  multiplication oracle; a firing price keeps firing as it rises; non-PMCC phases never match or
  skip. Stressed at 500 runs across five seeds.
- `evaluate-alerts-pmcc.test.ts` (new): service cases pinned to the story's dates and money strings,
  run with `TZ=America/New_York` and explicit noon-UTC `now`.
- The US-101 test asserting that a PMCC produces no alerts was replaced by a 5-DTE
  `EXPIRATION_IMMINENT` expectation.
- E2E uses fake market data, scheduler run-now, real PMCC creation and short-roll IPC, and the
  [`_test:pmcc-record-leg-event`](../architecture/02-adrs/dev-only-pmcc-leg-event-ipc.md) seam for
  `SHORT_CALL_EXPIRED`. Dates are run-day-relative. `setActiveLegExpiration` updates every leg and is
  not used for PMCC. No alert rows are hand-inserted.

### Known gap (accepted 2026-10-17)

When US-106 shipped, no production path wrote `SHORT_CALL_EXPIRED`, `SHORT_CALL_CLOSE` or
`SHORT_CALL_ASSIGNED`; only the `_test:pmcc-record-leg-event` hook did. Closure follows recorded leg
events, not dates, so until **US-119** (OPT-25) records expiration/close and **US-111** (OPT-19)
records assignment, **a PMCC short past its expiration date remains the current short**, and
`PMCC_ASSIGNMENT_RISK` keeps firing while the stock is above its strike. Those stories close the gap
by writing the closing leg; the alert service needs no change. Both Linear issues carry a comment
with the details and the S6 e2e follow-up.

Other notes:

- `evaluate-alerts.ts` is about 390 lines. The PMCC selection helpers are module-private there; if
  the file keeps growing, splitting selection into its own module is the next step.
- Pre-existing, unchanged: a wheel row whose `evaluatePosition` throws still has its alerts resolved,
  because the per-row catch adds no keep-open keys. US-106 preserves keys only for PMCC selection
  failures.

## Architecture decisions

Recorded in this story:

- **Select the PMCC short by ledger replay, not by broadening the active-leg SQL.** See
  [pmcc-alerts-select-current-short-by-ledger-replay](../architecture/02-adrs/pmcc-alerts-select-current-short-by-ledger-replay.md).
- **Extend the registry with one rule, not a new engine.** A configurable threshold, an absolute
  band, DTE-dependent urgency and changes to the wheel predicates were rejected or excluded by the
  story. Extends [alert-rule-registry](../architecture/02-adrs/alert-rule-registry.md).
- **One-sided signed band; predicate on the unrounded value.** Absolute distance would clear a
  deep-ITM call; rounding before the comparison would let a display value pull a price into the band.
- **Generic short-leg rules ride along on the PMCC short.** Their predicates already fit; duplicating
  or suppressing them would contradict the story.
- **A replay failure is not a null short.** Failed positions keep their existing alerts open.
- **Queue badge branches on phase, not rule code**, as a small inline branch rather than a strategy
  component hierarchy.
- **Preload `ManagementQueueItem` aliases the schema type** instead of hand-copying it with
  `phase: string`.

Existing decisions this story builds on:

- [alert-engine-pure-matches-skips](../architecture/02-adrs/alert-engine-pure-matches-skips.md)
- [alert-compute-then-persist](../architecture/02-adrs/alert-compute-then-persist.md)
- [alert-evaluation-failure-isolation](../architecture/02-adrs/alert-evaluation-failure-isolation.md)
- [alert-resolution-global](../architecture/02-adrs/alert-resolution-global.md)
- [alerts-partial-unique-open](../architecture/02-adrs/alerts-partial-unique-open.md)
- [management-queue-read-path](../architecture/02-adrs/management-queue-read-path.md)
- [shared-roll-chain-helper](../architecture/02-adrs/shared-roll-chain-helper.md)
- [dev-only-pmcc-leg-event-ipc](../architecture/02-adrs/dev-only-pmcc-leg-event-ipc.md)

See [domain/alerts](../domain/alerts.md) and [domain/wheel-lifecycle](../domain/wheel-lifecycle.md)
for the rule set and PMCC phases in context.

## Contracts touched

- **IPC.** None. `alerts:list` and `alerts:dismiss` are unchanged; the new `rule_code` value and the
  existing `phase` field flow through. See [contracts/ipc-handlers](../contracts/ipc-handlers.md).
- **Types.** New `RuleCode` member `'PMCC_ASSIGNMENT_RISK'`, exported constant
  `PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW = 2`, and `PmccAssignmentRiskInput`. The preload global
  `ManagementQueueItem` becomes an alias of the schema's `ManagementQueueItem`, with no runtime shape
  change. See [contracts/zod-schemas](../contracts/zod-schemas.md).
- **Schema.** None. The rule reuses the [US-50 `alerts` table](us-50-alert-engine.md); no
  migration. See [schema/tables](../schema/tables.md).

## Source files

- `src/main/core/alerts.ts` — `PMCC_ASSIGNMENT_RISK` registry entry, threshold constant,
  `PmccAssignmentRiskInput`, `pmccAssignmentRiskSummary`, shared `priceDirection`
- `src/main/services/evaluate-alerts.ts` — `PmccCandidateRow`, `PMCC_CANDIDATE_QUERY`,
  `loadPmccEvaluableRows`, failed-id keep-open keys
- `src/main/services/pmcc-ledger.ts` — `currentShortCallLeg`, reused unchanged
- `src/main/services/alerts.ts` — persistence and `listManagementQueue`, reused unchanged
- `src/preload/index.d.ts` — `ManagementQueueItem` alias
- `src/renderer/src/components/ManagementQueueRow.tsx` — PMCC badge branch, 150px badge column
- `e2e/pmcc-assignment-risk-alert.spec.ts` — nine scenario families, 15 cases
- `e2e/alert-helpers.ts` — `readAlertRows` returns `[]` for an empty table (`sqlite3 -json` prints
  nothing in that case)

Sources: [extract: us-106](../.extracts/us-106.md), `plans/us-106/`,
`docs/us-106-implementation.md`.

Related stories:

- [us-104](./us-104-roll-pmcc-short-call.md): `currentShortCallLeg` and the short-call roll used in
  scenario 5.
- [us-101](./us-101-open-pmcc-position.md): opens the PMCC; its blanket alert exclusion is lifted
  here.
- [us-62](./us-62-covered-call-breach-alert.md): the wheel's covered-call breach rule, unchanged.
- [us-53-54-55](./us-53-54-55-market-data-alert-rules.md): the two-sided CSP strike-proximity rule.
- [us-51](./us-51-management-queue-dashboard.md): the queue that shows the PMCC badge.
- US-119 / US-111: will write the closing short-call legs that close the known gap.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
