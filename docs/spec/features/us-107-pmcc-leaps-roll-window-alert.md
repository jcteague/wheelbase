# US-107: Fire alert when LEAPS DTE drops below 60 days

<!-- generated:from us-107 -->

## Summary

Adds the `PMCC_LEAPS_ROLL_WINDOW` rule to the pure alert registry (see [alerts](../domain/alerts.md)).
A medium-urgency alert opens while a PMCC's LEAPS has **0–60 calendar days** to expiration, whether
or not a short call is open. It refreshes its summary as the days count down and resolves only when
the LEAPS is rolled past the window ([US-105](us-105-roll-pmcc-leaps.md)) or the position stops being
evaluable.

The LEAPS is the PMCC's synthetic stock. It decays slowly far out and faster inside roughly 90 DTE,
and traders roll it in the 60–90 DTE window, so 60 DTE is the point where the routine roll is
overdue. Nothing else surfaces it: the short-call rules read the short leg only, and
[US-106](us-106-pmcc-assignment-risk-alert.md) forbids feeding the LEAPS to them. A PMCC with only
the LEAPS open is the most exposed case, because no short-call rule brings it into the queue.

So the story also changes two things around the rule:

- **Every rule declares the leg it reads** (`short` or `leaps`). A rule whose leg is absent is
  _inapplicable_: it produces neither a match nor a skip, so its stale alert resolves. This is what
  lets a LEAPS-only PMCC be evaluated without freezing the expired short's alerts open. See
  [alert-rules-declare-their-leg](../architecture/02-adrs/alert-rules-declare-their-leg.md).
- **A PMCC is evaluable whenever its LEAPS is open**, widening US-106's "current short call open".
  The short-leg rules still read only the short; the new rule reads only the LEAPS. The LEAPS is
  never quoted.

In the [management queue](us-51-management-queue-dashboard.md), the PMCC badge is now leg-aware:
`PMCC · LEAPS` on the LEAPS row and `PMCC · short call` on every other PMCC row. To make that
possible, `alerts:list` items gain an additive `ruleCode` field.

**No schema or migration change.** Story: Linear OPT-15 / US-107 (Linear is the requirements
authority). Mockup: `mockups/us-107-pmcc-leaps-dte-alert.mdx`.

## Acceptance criteria

From Linear OPT-15. Background: XYZ is a PMCC with one open $80.00 LEAPS call expiring 2027-09-17,
bought at $25.00 per share, 1 contract, and one open $112.00 short call expiring 2027-08-20, sold at
$2.10 per share. Valuation dates are in America/New_York.

1. **Alert fires once the LEAPS has 60 days or fewer to expiration.** A medium-urgency
   `PMCC_LEAPS_ROLL_WINDOW` alert is open with summary:
   - 2027-07-19 → `LEAPS expires in 60 days at $80.00 strike — review for roll or close`
   - 2027-07-20 → `LEAPS expires in 59 days at $80.00 strike — review for roll or close`
   - 2027-08-18 → `LEAPS expires in 30 days at $80.00 strike — review for roll or close`
2. **No alert while the LEAPS has more than 60 days left.** 2027-07-18 (61) and 2027-07-09 (70) → no
   `PMCC_LEAPS_ROLL_WINDOW` alert.
3. **The queue row identifies the position as a PMCC and the LEAPS as the leg.** On 2027-07-20 the
   row shows the MED pill, the PMCC badge and the 59-day summary; `Review position` opens the XYZ
   detail page.
4. **A PMCC with only the LEAPS open is still evaluated.** The short expired worthless on
   2027-08-20; the 2027-08-19 run left a HIGH `EXPIRATION_IMMINENT` open. On 2027-09-15 the LEAPS
   alert reads `LEAPS expires in 2 days at $80.00 strike — review for roll or close`, the
   `EXPIRATION_IMMINENT` alert is resolved, and no other XYZ alert is open.
5. **Alert resolves when the LEAPS is rolled out past the window.** After rolling to a $85.00 call
   expiring 2028-01-21 (185 DTE), the alert is resolved, leaves the queue, and no new one opens.
6. **The short-call rules and the LEAPS rule co-fire without reading each other's leg.** On
   2027-08-18 a HIGH `EXPIRATION_IMMINENT` reads `Expires in 2 days at $112.00 strike`, the MED LEAPS
   alert reads the 30-day summary, and no `EXPIRATION_IMMINENT` / `MANAGEMENT_WINDOW` alert mentions
   $80.00 or 2027-09-17.
7. **A LEAPS with no readable expiration keeps the alert open.** The alert keeps its previous
   summary and the rule is recorded as skipped with reason `missing_leaps_dte`.
8. **Classic wheel positions do not use the PMCC rule.** MSFT `CC_OPEN` at 59 DTE → no alert at all;
   AAPL `CSP_OPEN` at 20 DTE → `MANAGEMENT_WINDOW` reads `20 DTE remaining — review for roll or
close`. Neither gets a `PMCC_LEAPS_ROLL_WINDOW` alert or skip.

`e2e/pmcc-leaps-roll-window-alert.spec.ts` covers all eight scenario families in 12 named cases.

Out of scope: a configurable threshold, a high-urgency or 90/60/45 escalation tier, LEAPS delta or
price alerts, auto-exercise modelling, reconciling an already-expired LEAPS, a "roll now" deep link,
and any alert on the PMCC card or detail page. Closing the LEAPS is US-120.

## What was built

### Rule

`PMCC_LEAPS_ROLL_WINDOW` is one new entry in `RULES` in `src/main/core/alerts.ts`, following the
[alert rule registry pattern](../architecture/02-adrs/alert-rule-registry.md).

| Field      | Value                                                                                   |
| ---------- | --------------------------------------------------------------------------------------- |
| Leg        | `leaps` — present iff `phase === 'PMCC_OPEN'`                                           |
| Predicate  | `0 ≤ leapsDte ≤ PMCC_LEAPS_ROLL_WINDOW_MAX_DTE` (60), inclusive at both ends            |
| Skip guard | `leapsDte === null` → `missing_leaps_dte`; non-numeric `leapsStrike` → `missing_strike` |
| Urgency    | `medium`; quick action `Review position`                                                |
| Input      | `PmccLeapsRollWindowInput` — `Pick<AlertEvaluationInput, 'leapsDte' \| 'leapsStrike'>`  |

```text
summary = "LEAPS expires " + inDays(leapsDte) + " at $" + strike(2dp) + " strike — review for roll or close"
inDays(0) = "today", inDays(1) = "in 1 day", inDays(n) = "in n days"
```

`AlertEvaluationInput` gains two fields, `leapsDte` and `leapsStrike`. The existing `dte`, `strike`,
`expiration` and `instrumentType` keep meaning the **short** leg, so no short-leg rule's input
changed. The 60-day bound is inclusive because every rule fires at its named number. The `≥ 0` lower
bound mirrors `EXPIRATION_IMMINENT`, so an expired LEAPS nobody recorded stops matching and resolves.
`inDays` was extracted from `earningsProximitySummary`, which now shares it. The `missing_strike`
guard only stops `formatStrike` rendering a fake `$0.00`; a LEAPS leg always has a strike in
practice.

### Rules declare their leg

`RuleDefinition` gains a required `leg: RuleLeg` (`'short' | 'leaps'`), and a `LEG_PRESENT` record
answers whether that leg is open on the input:

```text
LEG_PRESENT.short(input) = input.instrumentType ≠ null
LEG_PRESENT.leaps(input) = input.phase = 'PMCC_OPEN'
applicable               = RULES where LEG_PRESENT[rule.leg](input)
```

`evaluatePosition` filters the registry to `applicable` once, then runs the unchanged skip and match
passes over it. Every pre-existing rule, including US-106's `PMCC_ASSIGNMENT_RISK`, is `leg: 'short'`.

| Position state                    | Short-leg rules                 | `PMCC_LEAPS_ROLL_WINDOW`        |
| --------------------------------- | ------------------------------- | ------------------------------- |
| Wheel, `CSP_OPEN` / `CC_OPEN`     | apply (unchanged)               | inapplicable: no match, no skip |
| PMCC, LEAPS + short open          | apply to the short only         | applies to the LEAPS            |
| PMCC, LEAPS only                  | inapplicable → stale rows clear | applies                         |
| PMCC, LEAPS expiration unreadable | apply to the short if open      | skips `missing_leaps_dte`       |
| PMCC with no LEAPS, or inactive   | not evaluated                   | not evaluated                   |

LEAPS presence uses the phase, not `leapsDte !== null`, so an unreadable LEAPS expiration **skips**
(keeping the alert, AC 7) instead of being inapplicable (which would resolve it). Because `leg` is
required and `LEG_PRESENT` is an exhaustive `Record`, a future rule that forgets its leg, or a new leg
kind without a presence test, fails to compile.

### Selecting PMCCs by open LEAPS

`loadPmccEvaluableRows({ db, heldIds, logger })` in `src/main/services/evaluate-alerts.ts` now calls
`pmccOpenLegs` (`src/main/services/pmcc-ledger.ts`) instead of `currentShortCallLeg`. `pmccOpenLegs`
replays both sides of the ledger in one pass, so a US-105 LEAPS roll is followed.

- `null` (no LEAPS) → the candidate yields no row and its alerts resolve.
- `{ long, short }` → one `EvaluableRow`. The short-leg fields come from `short`, or are all `null`
  with `instrumentType: null` when no short is open. The new `leapsStrike` / `leapsExpiration` come
  from `long`.
- A throw keeps US-106's held path: `alert_evaluation_failed` is logged and the id joins `heldIds`,
  so the position's existing alerts are kept.

`EvaluableRow.instrumentType` widens to `'PUT' | 'CALL' | null`. The wheel `EVALUABLE_QUERY` selects
`NULL` for both LEAPS columns and is otherwise unchanged. `occSymbolForRow` returns `null` when
`instrumentType` is null, so a LEAPS-only PMCC requests no option snapshot, and the LEAPS OCC symbol
is never built. `toEvaluationInput` adds `leapsDte = computeDte(leapsExpiration, now)` and
`leapsStrike`. A non-date expiration makes `computeDte` return `null`, which is the AC 7 skip; the
service test confirms the ledger replay tolerates such a value rather than throwing.

The selection decision builds on, and amends,
[pmcc-alerts-select-current-short-by-ledger-replay](../architecture/02-adrs/pmcc-alerts-select-current-short-by-ledger-replay.md).

### Alert lifecycle

Persistence is reused unchanged: `upsertOpenAlert`, `resolveAlertsNotIn`, `clearStaleDismissals`.

| Event                           | Result                                                         |
| ------------------------------- | -------------------------------------------------------------- |
| First evaluation at ≤ 60 DTE    | Insert an open MED row                                         |
| Next day, still in the window   | Summary refreshed in place; same id and `triggered_at`         |
| Dismissed, still in the window  | Stays dismissed; no new open row                               |
| LEAPS rolled to > 60 DTE        | No match → resolved; no new row                                |
| LEAPS expiration unreadable     | Skip → key kept → row unchanged with its previous summary      |
| Short expires, LEAPS still open | Short-leg rules inapplicable → their rows resolve; LEAPS stays |
| Position closed                 | Not evaluated → resolved                                       |

A dismissed LEAPS alert stays silent until the roll, because its condition never clears in between.
An escalation tier would need a second rule code or a change to US-59 dismissal, so it is out of
scope.

### Queue item and badge

`ManagementQueueItem` (`src/main/schemas.ts`) gains `ruleCode: RuleCode`, selected as
`a.rule_code` in `listManagementQueue` (`src/main/services/alerts.ts`). The `alerts:list` handler and
the preload alias are unchanged. See [ipc-handlers](../contracts/ipc-handlers.md#alertslist).

`ManagementQueueRow` keeps US-106's `PhaseBadge` with a `label` override on `PMCC_OPEN` rows. The
label now comes from a small `PMCC_LEG_LABEL` map: `PMCC · LEAPS` for `PMCC_LEAPS_ROLL_WINDOW`,
`PMCC · short call` for everything else. Tint, dot and the 150px column are unchanged; wheel rows
still show the phase label. The component imports `RuleCode` from core **as a type only**, so no core
value reaches the renderer bundle.

Not shipped from the mockup: the gold row highlight, the explanatory `StatGrid`, the `DteRuler`, the
`AlertBox` panels and the preset controls. There is no new sheet or navigation, and no visual
treatment for the unreadable-expiration state; that row just keeps its last summary.

### Logging

No new log events. The generic DEBUG `alert_rule_skipped` carries
`ruleCode: 'PMCC_LEAPS_ROLL_WINDOW'`, `reason: 'missing_leaps_dte'` for AC 7. Nothing is logged from
`core/`.

### Tests

- `alerts.test.ts`: the 60/59/30/2/1/0 firing table with exact summaries; 61/70/185/−1 silent; both
  skip reasons; wheel phases produce neither match nor skip; a LEAPS-only PMCC yields an empty
  `skipped` list and exactly one match, including the US-106 hazard case at $118.80.
- `alerts.property.test.ts`: an oracle against the literal `0 ≤ leapsDte ≤ 60`; a non-PMCC guard;
  leg independence (setting the LEAPS fields never changes another rule's matches or skips); and a
  LEAPS-only guard (only this rule can appear). Stressed at 500 runs across about five seeds.
- `evaluate-alerts-pmcc.test.ts`: a new US-107 describe block on the story's calendar
  (`TZ=America/New_York`, `now` at 16:00Z), with its own $112 / 2027-08-20 short fixtures. It covers
  the window boundary, refresh in place, dismissal, the LEAPS-only resolution (and that no XYZ option
  snapshot is requested), the US-106 regression, co-firing, the real `rollPmccLeapsPosition` roll, an
  unreadable expiration, a candidate with no LEAPS, and a mixed wheel batch.
- `alerts.test.ts` (service) and `ipc/alerts.test.ts`: `ruleCode` on the queue item and envelope.
- `ManagementQueueRow.test.tsx`: `PMCC · LEAPS` vs `PMCC · short call`. US-106's "branch follows
  phase" test was renamed, since the branch now reads the rule code; its assertions stand.
- E2E: 12 cases in `e2e/pmcc-leaps-roll-window-alert.spec.ts`. Dates are run-day relative (LEAPS at
  the scenario's DTE, the short 28 days earlier); the fake market session stays closed; the short
  expires through the
  [`_test:pmcc-record-leg-event`](../architecture/02-adrs/dev-only-pmcc-leg-event-ipc.md) seam; the
  LEAPS rolls through the real IPC. The unreadable case rewrites only the LEAPS leg with the new
  `setLegExpiration(dbPath, legId, value)` helper; `setActiveLegExpiration` rewrites every leg and is
  not used. The S2 cases use a sibling CSP's `MANAGEMENT_WINDOW` row as a positive control, and S8
  asserts that the position's skips reached the log before asserting none is for this rule. US-106's
  spec-local launch harness and MSFT seed were moved into `e2e/pmcc-alert-helpers.ts`, now shared by
  both PMCC alert specs.
- Mutation (Stryker, changed lines): three survivors with no covering test were each killed when
  applied by hand; the `leapsDte !== null` conjunct in the rule's `test` is an equivalent mutant
  (`missingData` already skips a null DTE; the check only narrows the type) and is disabled in
  source with that reason.

## Architecture decisions

Recorded in this story:

- **Rules declare the leg they read; an absent leg makes a rule inapplicable, not skipped.** See
  [alert-rules-declare-their-leg](../architecture/02-adrs/alert-rules-declare-their-leg.md).
- **A PMCC is evaluable whenever its LEAPS is open**, through `pmccOpenLegs` rather than
  `currentShortCallLeg`, with the short-leg fields nullable. Amends
  [pmcc-alerts-select-current-short-by-ledger-replay](../architecture/02-adrs/pmcc-alerts-select-current-short-by-ledger-replay.md).
  Extending `activeLegSubquery`, as the Linear technical note suggests, was rejected for the same
  reasons US-106 rejected it; a second SQL join for the LEAPS would duplicate replay and mishandle
  LEAPS rolls.
- **Separate LEAPS inputs, not a second evaluation per position.** Feeding the LEAPS through
  `dte` / `strike` would trip `MANAGEMENT_WINDOW` and `EXPIRATION_IMMINENT` on it. A nested
  `short: {…} | null` input was judged out of proportion: it would rewrite every rule and fixture.
  Extends [alert-rule-registry](../architecture/02-adrs/alert-rule-registry.md).
- **A fixed, inclusive 60-day window at medium urgency.** Not configurable, no escalation, and not the
  renderer's 90-day `LEAPS_DECAY_WINDOW_DAYS` (a different window, and core cannot import from the
  renderer).
- **Share one `inDays` phrase** between the earnings and LEAPS summaries; `expirationImminentSummary`'s
  always-plural form would be wrong at 0 and 1 days.
- **Leg-aware badge carried by `ruleCode` on the queue item.** A user decision (2026-10-16): US-106's
  phase-driven badge would have labelled the LEAPS row "short call". Parsing the summary was rejected
  as brittle; the mockup's plain `PMCC` would drop US-106's leg label. This is the story's one IPC
  response change, although the issue had said "no IPC change".
- **No clock seam.** Service tests pin the calendar; e2e uses run-day-relative dates.

Existing decisions this story builds on:

- [alert-engine-pure-matches-skips](../architecture/02-adrs/alert-engine-pure-matches-skips.md)
- [alert-resolution-global](../architecture/02-adrs/alert-resolution-global.md)
- [alert-evaluation-failure-isolation](../architecture/02-adrs/alert-evaluation-failure-isolation.md)
- [alerts-partial-unique-open](../architecture/02-adrs/alerts-partial-unique-open.md)
- [management-queue-read-path](../architecture/02-adrs/management-queue-read-path.md)
- [shared-dte-helper](../architecture/02-adrs/shared-dte-helper.md)
- [shared-roll-chain-helper](../architecture/02-adrs/shared-roll-chain-helper.md)
- [dev-only-pmcc-leg-event-ipc](../architecture/02-adrs/dev-only-pmcc-leg-event-ipc.md)

See [domain/alerts](../domain/alerts.md) for the full rule set and lifecycle.

## Contracts touched

- **IPC.** `alerts:list` items gain `ruleCode: RuleCode` (additive; ordering unchanged; handler file
  unchanged). `alerts:dismiss` is unchanged. See [contracts/ipc-handlers](../contracts/ipc-handlers.md).
- **Types.** `RuleCode` gains `'PMCC_LEAPS_ROLL_WINDOW'`; `AlertEvaluationInput` gains `leapsDte` and
  `leapsStrike`; `RuleDefinition` gains required `leg: RuleLeg`; new `PmccLeapsRollWindowInput`;
  `EvaluableRow` gains `leapsStrike` / `leapsExpiration` and a nullable `instrumentType`;
  `ManagementQueueItem` gains `ruleCode`. The preload global stays an alias of the schema type. See
  [contracts/zod-schemas](../contracts/zod-schemas.md).
- **Schema.** None. `alerts.rule_code` is TEXT, so the new code needs no migration. See
  [schema/tables](../schema/tables.md).

## Source files

- `src/main/core/alerts.ts` — `PMCC_LEAPS_ROLL_WINDOW` entry, `PMCC_LEAPS_ROLL_WINDOW_MAX_DTE`,
  `missing_leaps_dte`, `RuleLeg`, `LEG_PRESENT`, `PmccLeapsRollWindowInput`, `inDays`,
  `pmccLeapsRollWindowSummary`
- `src/main/services/evaluate-alerts.ts` — `EvaluableRow` LEAPS fields, `loadPmccEvaluableRows` via
  `pmccOpenLegs`, `occSymbolForRow` null-type guard, `toEvaluationInput`
- `src/main/services/pmcc-ledger.ts` — `pmccOpenLegs`, reused unchanged
- `src/main/services/alerts.ts` — `QueueRow.rule_code`, `mapQueueRow`, `listManagementQueue`
- `src/main/schemas.ts` — `ManagementQueueItem.ruleCode`
- `src/renderer/src/components/ManagementQueueRow.tsx` — `PMCC_LEG_LABEL`, `pmccBadgeLabel`
- `e2e/pmcc-leaps-roll-window-alert.spec.ts` — eight scenario families, 12 cases
- `e2e/pmcc-alert-helpers.ts` — shared PMCC alert harness (`launch`, `disposeHarness`, `ruleSkips`,
  `queueRowWith`, `seedMsftCoveredCall`), extracted from US-106's spec
- `e2e/alert-helpers.ts` — `setLegExpiration`

Sources: [extract: us-107](../.extracts/us-107.md), `plans/us-107/`,
`docs/us-107-implementation.md`.

Related stories:

- [us-106](./us-106-pmcc-assignment-risk-alert.md): made PMCCs evaluable through the short call and
  added the PMCC badge; its selection is widened here.
- [us-105](./us-105-roll-pmcc-leaps.md): the LEAPS roll that resolves the alert.
- [us-101](./us-101-open-pmcc-position.md): PMCC entry and the `PMCC_OPEN` phase.
- [us-50](./us-50-alert-engine.md), [us-51](./us-51-management-queue-dashboard.md),
  [us-52](./us-52-expiration-imminent-alert.md), [us-59](./us-59-dismiss-alert.md): the engine, queue,
  expiration rule this mirrors, and dismissal.
- [us-56](./us-56-earnings-proximity-alert.md): the earnings summary whose day phrase is now shared.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
