# US-107 — Research and decisions

Planning only; checked against `main` (c3fc14a) on 2026-10-16 and re-checked against `main`
(8242372, US-106 merged 2026-10-23) on 2026-10-24. Requirements live in
[OPT-15 / US-107](https://linear.app/optionswheel/issue/OPT-15/us-107-fire-alert-when-leaps-dte-drops-below-60-days).
No unresolved research questions remain.

## Starting point: US-106 is merged

US-106 shipped in `18e1617` and is on `main`. `wb-107` branches from it. The names below are
the **shipped** ones (US-106's own plan used different ones; the 2026-10-16 draft of this file
pointed at those):

| Shipped US-106 name                                               | File                                                 | What US-107 does with it                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `PMCC_ASSIGNMENT_RISK` rule, `PmccAssignmentRiskInput`            | `src/main/core/alerts.ts`                            | Tags it as a short-leg rule (ADR 2)                                      |
| `priceVsStrikeMissingData('PMCC_OPEN')` skip guard                | `src/main/core/alerts.ts`                            | Must not run on a LEAPS-only PMCC — ADR 2's leg filter prevents it       |
| `alerts.property.test.ts` with a local `input()` builder          | `src/main/core/`                                     | Builder gains `leapsDte` / `leapsStrike`; new properties appended        |
| camelCase `EvaluableRow` (`instrumentType: 'PUT' \| 'CALL'`)      | `src/main/services/evaluate-alerts.ts`               | Gains `leapsStrike` / `leapsExpiration`; `instrumentType` nullable       |
| `PmccCandidateRow`, `PMCC_CANDIDATE_QUERY`                        | `src/main/services/evaluate-alerts.ts`               | Reused unchanged                                                         |
| `loadPmccEvaluableRows({ db, heldIds, logger })`                  | `src/main/services/evaluate-alerts.ts`               | `currentShortCallLeg` → `pmccOpenLegs` (ADR 3)                           |
| `heldPositionIds` → `AlertsToKeep.positionIds`                    | `evaluate-alerts.ts`, `services/alerts.ts`           | Reused unchanged (the "held" keep-open set)                              |
| `evaluate-alerts-pmcc.test.ts` (`seedBackground`, `run`, …)       | `src/main/services/`                                 | Extended with LEAPS-window cases                                         |
| `PhaseBadge` `label` prop; `'PMCC · short call'` keyed on phase   | `src/renderer/src/components/ManagementQueueRow.tsx` | Label becomes leg-aware via `ruleCode` (ADR 5)                           |
| preload `ManagementQueueItem` = alias of the schema type          | `src/preload/index.d.ts`                             | No preload edit; the schema type alone gains `ruleCode`                  |
| `e2e/pmcc-assignment-risk-alert.spec.ts` (`launch`, `evaluateAt`) | `e2e/`                                               | Pattern for the new spec; shared setup extracted only if lifted verbatim |

## Architecture Decisions

### ADR: Append PMCC_LEAPS_ROLL_WINDOW to the rule registry

- **Decision:** Add `'PMCC_LEAPS_ROLL_WINDOW'` to `RuleCode`, a fixed
  `PMCC_LEAPS_ROLL_WINDOW_MAX_DTE = 60`, a missing-data reason
  `MISSING_LEAPS_DTE = 'missing_leaps_dte'`, and one `RULES` entry with `urgency: 'medium'`,
  test `0 <= leapsDte <= 60` and summary helper `pmccLeapsRollWindowSummary`. The engine
  reads two new inputs, `leapsDte: number | null` and `leapsStrike: string | null`; the
  existing `dte`/`strike`/`expiration` keep meaning the short leg.
- **Why:** The registry already provides dedupe, refresh-in-place, resolve-on-clear,
  skip-keeps-open and dismissal; the story is one more predicate. Separate LEAPS fields
  leave every existing rule's input untouched, so no short-leg rule can read the LEAPS
  by accident. Inclusive 60 matches how every other rule fires at its named number; the
  `>= 0` lower bound mirrors EXPIRATION_IMMINENT, so an unrecorded expired LEAPS stops
  matching and resolves.
- **Alternatives considered:** Feeding the LEAPS through `dte`/`strike` as a second
  evaluation input per position (would trip MANAGEMENT_WINDOW/EXPIRATION_IMMINENT on the
  LEAPS, which US-106 forbids). A configurable threshold or 90/60/45 escalation (out of
  scope per the story). Reusing the renderer-only `LEAPS_DECAY_WINDOW_DAYS = 90`
  (`src/renderer/src/lib/pmcc-roll-coverage.ts`) — a different window for a different
  purpose, and the core cannot import from the renderer.

### ADR: Rules declare which leg they read; an absent leg makes a rule inapplicable

- **Decision:** Add a required `leg: 'short' | 'leaps'` field to `RuleDefinition` and a
  `LEG_PRESENT: Record<RuleLeg, (input) => boolean>` table in `alerts.ts`:
  `short` → `input.instrumentType !== null`; `leaps` → `input.phase === 'PMCC_OPEN'`.
  `evaluatePosition` filters `RULES` to those whose leg is present **before** computing
  skips and matches. Every existing rule (including US-106's `PMCC_ASSIGNMENT_RISK`)
  declares `leg: 'short'`; the new rule declares `leg: 'leaps'`.
- **Why:** This is the hazard the story calls out. A LEAPS-only PMCC has no short leg;
  if the short-leg rules ran they would skip with `missing_dte` / `missing_strike` /
  `missing_option_mark`, and the US-50 keep-open set would then hold the expired short's
  EXPIRATION_IMMINENT and US-106's PMCC_ASSIGNMENT_RISK open forever. US-106's shipped
  `priceVsStrikeMissingData('PMCC_OPEN')` is the concrete case: on a LEAPS-only PMCC it
  would return `missing_strike` (null short strike) and freeze a stale assignment alert.
  "Inapplicable" must produce neither a match nor a skip. One table answers "which leg
  does this rule read" for every rule, and it makes "neither rule reads the other's leg"
  (S6) a property of the registry instead of a convention. The LEAPS presence test uses
  phase, not `leapsDte !== null`, because a PMCC whose LEAPS expiration is unreadable must
  **skip** (S7), not be inapplicable. Wheel positions always have `instrumentType` set,
  because the wheel query inner-joins an option leg, and every core fixture sets it. So no
  existing wheel outcome changes (S8).
- **Alternatives considered:** A per-rule `instrumentType === null` check inside each
  `missingData` guard (five copies of the same gate, easy to forget on the next rule).
  A new LEAPS-only PMCC phase (US-101 uses `PMCC_OPEN` for both states; adding a phase
  ripples into the lifecycle engine, list and detail).

### ADR: A PMCC is evaluable whenever its LEAPS is open

- **Decision:** In US-106's `loadPmccEvaluableRows({ db, heldIds, logger })`, replace the
  `currentShortCallLeg(legs)` call with the existing `pmccOpenLegs(legs)` from
  `src/main/services/pmcc-ledger.ts`. `null` (no LEAPS) → not evaluable; otherwise emit one
  `EvaluableRow` whose short-leg fields come from `short` (all `null` when no short is
  open, with `instrumentType: short ? 'CALL' : null`) and whose new `leapsStrike` /
  `leapsExpiration` fields come from `long`. `EvaluableRow.instrumentType` widens from
  `'PUT' | 'CALL'` to `'PUT' | 'CALL' | null`, and `occSymbolForRow` returns `null` when it
  is null (before it reaches `buildOccSymbol`). The wheel `EVALUABLE_QUERY` selects
  `NULL AS leapsStrike, NULL AS leapsExpiration`. `toEvaluationInput` adds
  `leapsDte: computeDte(row.leapsExpiration, now)` and `leapsStrike: row.leapsStrike`.
- **Why:** `pmccOpenLegs` already replays both sides in one pass over shared roll chains
  (`currentLeapsLeg` follows LEAPS-side `ROLL_TO`, so a US-105 roll to 2028-01-21 is seen
  as 185 DTE and the alert resolves). A null short makes `occSymbolForRow` return null,
  so no option snapshot is requested for a LEAPS-only PMCC and the LEAPS OCC is never
  requested. US-106's per-candidate catch and `heldIds` keep-open set (carried to
  `resolveAlertsNotIn` / `clearStaleDismissals` as `AlertsToKeep.positionIds`) apply
  unchanged.
- **Alternatives considered:** Extending `activeLegSubquery` as the issue's technical
  note suggests. US-106 already rejected that because the subquery also feeds
  `get-position` and `list-positions`, where PMCC `activeLeg` is deliberately null
  ([pmcc-alerts-select-current-short-by-ledger-replay](../../docs/spec/architecture/02-adrs/pmcc-alerts-select-current-short-by-ledger-replay.md)).
  A second SQL join for the LEAPS (duplicates replay logic and mis-handles LEAPS rolls).

### ADR: Share the today / in 1 day / in N days phrase

- **Decision:** Extract `inDays(days: number): string` in `alerts.ts` from
  `earningsProximitySummary`; both that summary and `pmccLeapsRollWindowSummary` use it.
  The LEAPS summary is
  `` `LEAPS expires ${inDays(leapsDte)} at ${formatStrike(leapsStrike)} strike — review for roll or close` ``.
- **Why:** Story technical note; two callers now exist. The "LEAPS" prefix and the
  leap strike make the row distinguishable from the short call's EXPIRATION_IMMINENT row.
- **Alternatives considered:** Reusing `expirationImminentSummary`'s `in ${dte} days`
  form (wrong at 0 and 1, which S4 at 2 days does not exercise, but the edge is real).

### ADR: Leg-aware PMCC queue badge, carried by rule code on the queue item

- **Decision:** Add `ruleCode: RuleCode` to `ManagementQueueItem` in `src/main/schemas.ts`,
  selected as `a.rule_code AS rule_code` in `listManagementQueue`. The preload global
  `ManagementQueueItem` is already an alias of the schema type (US-106), so it needs no
  edit. In `ManagementQueueRow`, the `label` passed to US-106's `PhaseBadge` reads
  `PMCC · LEAPS` when `item.ruleCode === 'PMCC_LEAPS_ROLL_WINDOW'` and `PMCC · short call`
  otherwise; tint, dot and the 150px column are unchanged. Leg labels live in one map from
  rule leg; see data-model § Type Design. US-106's test "the branch follows phase, not rule
  or summary" is renamed, since the branch now reads the rule code; its assertion (a HIGH
  EXPIRATION_IMMINENT PMCC row reads `PMCC · short call`) still holds.
- **Why:** User decision (2026-10-16): US-106's phase-driven badge would label the
  LEAPS row "short call". The queue item carries phase but not rule code, so the renderer
  cannot tell the rows apart without it. This is the one IPC response change in the story;
  the issue said "no IPC change", but that assumed US-106's badge needed no leg.
- **Alternatives considered:** Plain `PMCC` on every PMCC row as the US-107 mockup draws
  it (drops US-106's leg label; the short-call summaries do not name their leg). Parsing
  the summary for "LEAPS" (brittle). Keeping US-106's label (mislabels the row).

### ADR: The alert job's own clock; fixed dates in service tests, run-relative in e2e

- **Decision:** Service tests pin the issue's calendar (LEAPS 2027-09-17, short
  2027-08-20, `now` at 16:00Z on each example date, `TZ=America/New_York`). Electron e2e
  seeds legs at run-day-relative dates that preserve each scenario's DTE (e.g. LEAPS at
  `localDate(59)`, short at `localDate(32)`), as US-106 does. The unreadable-expiration
  scenario overwrites **only the LEAPS leg's** `expiration` to a non-date string via a
  new `setLegExpiration(dbPath, legId, value)` e2e helper built on the existing
  `sqlite(dbPath, sql)` from `e2e/pmcc-helpers.ts`. Do not use the existing
  `setActiveLegExpiration`, because it rewrites every leg of the position.
- **Why:** The alert scheduler uses real `new Date()`; there is no production clock seam
  and the story adds none. `legs.expiration` is `TEXT NOT NULL`, so "unreadable" means a
  non-ISO string, which `computeDte` already maps to `null`. A service test must first
  prove `pmccOpenLegs` / `groupRollChains` tolerate a non-date expiration. If replay
  threw, the position would take US-106's held path, which keeps the alert open but
  does not record a `missing_leaps_dte` skip, and S7 needs that skip.
- **Alternatives considered:** A test-only clock IPC (new surface for one story).

## Open Questions

None. The badge question was resolved by the user (leg-aware, ADR 5).

## Out of scope (from the issue; noted so Green doesn't drift)

- Configurable threshold, escalation tiers, delta/price LEAPS alerts, auto-exercise,
  reconciling an already-expired LEAPS, a "roll now" deep link, detail-page/card alerts.
- `LEAPS_CLOSE` is not handled by `currentLeapsLeg`; closing the LEAPS is US-120 and
  closes the position, which already removes it from evaluation.
- The Linear technical note still says "extend `EVALUABLE_QUERY` and `activeLegSubquery`".
  US-106 rejected that route for reasons recorded in its ADR; ADR 3 above follows the
  shipped design. The issue text is left as is.

## Sources checked

- Linear OPT-15 (story + technical notes), OPT-14 relation.
- `mockups/us-107-pmcc-leaps-dte-alert.mdx`, `mockups/us-106-pmcc-assignment-risk-alert.mdx`.
- `git show --stat 18e1617` (US-106 as merged); `plans/us-106/`.
- `src/main/core/{alerts,dte,types}.ts`, `src/main/core/alerts.property.test.ts`,
  `src/main/services/{evaluate-alerts,alerts,pmcc-ledger,active-leg-sql,roll-pmcc-leaps-position}.ts`,
  `src/main/services/evaluate-alerts-pmcc.test.ts`, `src/main/services/evaluate-alerts-test-utils.ts`,
  `src/main/services/test-fixtures/pmcc-legs.ts`, `src/main/schemas.ts`,
  `src/preload/{index.ts,index.d.ts}`, `src/renderer/src/components/{ManagementQueueRow,PhaseBadge}.tsx`,
  `src/renderer/src/components/ManagementQueueRow.test.tsx`, `src/main/ipc/alerts.ts`.
- `e2e/{alert-helpers,pmcc-helpers,pmcc-ledger-helpers,pmcc-roll-helpers,assignment-helpers,dates}.ts`,
  `e2e/pmcc-assignment-risk-alert.spec.ts`.
- Spec: `docs/spec/domain/alerts.md`, `docs/spec/features/us-106-pmcc-assignment-risk-alert.md`,
  `docs/spec/features/us-105-roll-pmcc-leaps.md`,
  `docs/spec/architecture/02-adrs/{alert-rule-registry,alert-resolution-global,alert-evaluation-failure-isolation,pmcc-alerts-select-current-short-by-ledger-replay}.md`.
