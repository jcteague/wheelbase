# US-105: Roll the PMCC LEAPS to a further expiration

<!-- generated:from us-105 -->

## Summary

A PMCC with an open LEAPS can now roll it. The trader opens `Roll LEAPS →` on the detail page,
enters the proceeds from selling the current LEAPS and the replacement call's terms and debit, and
confirms. The roll is recorded as one linked `ROLL_FROM` **SELL** / `ROLL_TO` **BUY** leg pair (the
inverse of a short-call roll) and one `PMCC_LEAPS_ROLL` cost-basis snapshot, in one transaction. The
position row and any open short call are not touched: the phase stays `PMCC_OPEN`.

Four pieces carry it:

- **A pure engine.** `rollPmccLeaps` (`src/main/core/lifecycle.ts`) checks ten rules in a fixed
  order and throws the first failure. Its cross-field rules live once, in the ordered list
  `pmccLeapsRollIssues` (`src/main/core/pmcc-rules.ts`), which the renderer form schema also runs.
- **A service.** `rollPmccLeapsPosition` validates and hands the pair to `recordPmccRoll`, the PMCC
  roll writer it now shares with US-104's short-call roll. It computes no basis of its own; US-103's
  `appendPmccSnapshot` does.
- **One IPC channel.** `positions:roll-pmcc-leaps`.
- **A sheet.** `Roll LEAPS` shows a coverage ruler, the current LEAPS and open short as context, a
  live `Net Debit` / `Net Credit` preview with a year-bearing roll label and replacement DTE, the
  post-roll basis, LEAPS cost to date and the **re-anchored** effective share cost, and two advisory
  notes.

The trader sees this behaviour today:

- **The roll contributes one net amount.** Selling the $80 LEAPS at $26.00 and buying an $85 LEAPS
  at $23.50 is a $2.50 credit. The basis moves from $21.80 to $19.30 and LEAPS cost to date from
  $25.00 to $22.50.
- **The effective share cost re-anchors to the replacement strike.** After that roll it reads $104.30
  — the $85.00 strike plus $19.30 basis — up from $101.80, even though cash came in.
- **A debit is normal.** Paying to extend coverage keeps confirm enabled.
- **Two advisories never block.** One warns when the post-roll effective share cost rises above the
  open short strike; the other notes when the replacement shortens coverage but still outlasts the
  short.
- **The replacement must keep covering the open short.** It must expire after the short and strike
  below it. With no short open, both checks are skipped and the sheet says so.
- **A recorded roll closes the sheet** and shows a banner naming the ledger line (`LEAPS roll #1
credit · $2.50 per share ($250.00 total)`) and the effective share cost if exercised.
- **The positions list follows the roll.** The PMCC row shows the open legs (the replacement LEAPS),
  and a PMCC with no open short reads `$80.00 / No short open`. Such a row still sorts by its LEAPS
  DTE; follow-up US-123 (Linear OPT-29) adds a `NO_SHORT_OPEN` alert and sorts it as DTE 0.
- **A classic wheel is unchanged.** No `Roll LEAPS` action appears on it.

**No migration.** `legs` and `cost_basis_snapshots` already hold everything the roll writes, and
US-103 already defined `PMCC_LEAPS_ROLL`.

Story: Linear OPT-13 / US-105, 5 points. Layout of record: `mockups/epic-09-pmcc-position-detail.mdx`
(`RollLeapsSheet`, presets `rl-entry` … `rl-no-short`). `mockups/us-105-roll-pmcc-leaps.mdx` is design
history and carries the Linear figures.

## Acceptance criteria

Scenario names come from Linear OPT-13. `e2e/pmcc-leaps-roll.spec.ts` has one named `it` per
scenario or outline row, and all 15 pass. The Background is US-103's `OPEN`, `EXPIRE_1`, `SHORT_2` and
`SHORT_ROLL`: XYZ PMCC, an $80 LEAPS (+368d) bought at $25.00, an open $112 short (+95d) sold at
$2.40, basis $21.80, effective share cost $101.80.

1. **The roll form shows the decision context for the open LEAPS.** `XYZ $80.00 CALL`, its
   expiration and DTE, `Bought at` `$25.00 / share`; the `$112.00` short with its DTE as read-only
   context; `Cost basis` `$21.80 / share`; `Effective share cost` `$101.80`. Inputs for proceeds,
   strike, expiration, debit and fill date. The net card is replaced by its placeholder.
2. **Net credit preview for a roll up and out.** 26.00 / 85 / +494d / 23.50 shows `Net Credit: $2.50
per share ($250.00 total)`, `Roll Up & Out: $80 to $85 strike, <Mon yyyy> to <Mon yyyy> expiration`
   with `N DTE`, `Cost basis after roll` `$19.30 / share`, `Effective share cost after roll` `$104.30
(from $101.80)` and `$85.00 strike + $19.30 basis · up $2.50`.
3. **Net debit preview for a roll out at the same strike.** 26.00 / 80 / +494d / 29.20 shows `Net
Debit: $3.20 per share ($320.00 total)`, `Roll Out: same $80 strike, …`, `$25.00 / share`,
   `$105.00`. Confirm stays enabled.
4. **Recording the roll creates a linked leg pair and one net cost-basis line.** `ROLL_FROM` SELL $80
   @ 26.0000 and `ROLL_TO` BUY $85 @ 23.5000 share one chain id, distinct from the `SHORT_ROLL`
   chain. `pmccLedger` reads basis `19.3000`, LEAPS cost `22.5000`, effective `104.3000`. Five
   snapshots, the last `PMCC_LEAPS_ROLL` at `19.3000`. `pmccOpenLegs.long` is the $85 LEAPS;
   `.short` is the same $112 leg. The banner names `LEAPS roll #1 credit` · `$2.50 per share`; the
   drawer and leg reference update.
5. **Warning when the effective share cost after the roll rises above the open short strike.** 26.00
   / 80 / +860d / 37.00 shows `Net Debit: $11.00 per share ($1,100.00 total)` and `Open short strike
$112.00 is below your effective share cost of $112.80 after this roll. If assigned, covering from
the LEAPS realizes roughly $0.80 per share of loss.` Confirm stays enabled.
6. **Outline: Reject a replacement strike not below the open short strike** ($112.00, $115.00).
   `LEAPS strike must be below the short-call strike ($112.00).` beside the strike; confirm disabled.
   The $115 bypass returns `newStrike` / `strike_not_below_short` and writes no legs.
7. **Outline: Reject a replacement expiration that would leave the short call uncovered** (on the
   short's expiration; before it). `LEAPS call must expire after the short call.` beside the
   expiration; the ruler turns red; the footer says the $80 LEAPS stays open; confirm disabled. The
   bypass returns `newExpiration` / `long_not_after_short`; no legs or snapshot are written and the
   $80 LEAPS stays open.
8. **Allow a replacement that shortens coverage but still outlasts the short call.** 26.00 / 80 /
   +340d / 26.60 shows `Net Debit: $0.60 per share ($60.00 total)` and `Replacement LEAPS is N DTE, 28
days shorter than the current LEAPS. It still covers the open short call.` Confirm stays enabled.
9. **Reject a roll that changes neither strike nor expiration.** `Roll must change the strike, the
expiration, or both`; confirm disabled.
10. **Outline: Reject non-positive proceeds from close.** `Proceeds from close must be greater than
zero`; confirm disabled.
11. **Outline: Reject non-positive replacement debit.** `Replacement debit must be greater than
zero`; confirm disabled.
12. **Roll the LEAPS while no short call is open.** After `EXPIRE_2` there is no `Roll Short Call →`
    but `Roll LEAPS →` is offered. The sheet shows `No short call open` and `Open short call · none`.
    Values that would fail both shape checks raise no field error; the recorded roll lands at
    `19.3000` with `pmccOpenLegs.short === null`.
13. **Leave a classic wheel unaffected.** A `CC_OPEN` wheel has neither PMCC roll button; its `Roll
CC →` sheet reads `Roll Covered Call` with no `Effective share cost`, `LEAPS` or `Roll LEAPS`.

Three implementation-driven date rules are not Linear AC; unit tests cover them in both the engine
and the form schema:

- A roll fill date after the current LEAPS' expiration → `fillDate` /
  `close_date_after_expiration`.
- A roll fill date before the position's last recorded event → `fillDate` / `before_last_event`
  (`Fill date cannot be before the last recorded event (Jul 9, 2027)`).
- A replacement expiring on or before the roll's fill date → `newExpiration` /
  `expiration_not_after_fill`.

## What was built

### Engine

`rollPmccLeaps(input)` takes the current phase, the open LEAPS (`PmccLegTerms`: strike,
expiration), the open short (`PmccLegTerms` or `null`), `lastEventDate` (the latest fill
date among the position's legs, from the pure `latestFillDate(legs)` in `pmcc-rules.ts`), the
roll's fill date, the new strike and expiration, and the two per-share prices. It returns
`RollPmccLeapsAccepted` (`{ phase: 'PMCC_OPEN' }`); US-104's engine result is likewise
`RollPmccShortCallAccepted`, so neither clashes with the IPC result types. No logging,
no I/O.

Rules, in order; the first failure throws `ValidationError(field, code, message)`:

| #   | Rule                                              | field                         | code                          |
| --- | ------------------------------------------------- | ----------------------------- | ----------------------------- |
| 1   | phase is not `PMCC_OPEN`                          | `__phase__`                   | `invalid_phase`               |
| 2   | proceeds ≤ 0                                      | `proceedsPerContract`         | `must_be_positive`            |
| 3   | replacement debit ≤ 0                             | `replacementDebitPerContract` | `must_be_positive`            |
| 4   | new strike ≤ 0                                    | `newStrike`                   | `must_be_positive`            |
| 5   | fill date > current LEAPS expiration              | `fillDate`                    | `close_date_after_expiration` |
| 6   | fill date < last recorded event (`lastEventDate`) | `fillDate`                    | `before_last_event`           |
| 7   | replacement does not outlast the open short       | `newExpiration`               | `long_not_after_short`        |
| 8   | replacement strike ≥ open short strike            | `newStrike`                   | `strike_not_below_short`      |
| 9   | replacement expiration ≤ fill date                | `newExpiration`               | `expiration_not_after_fill`   |
| 10  | strike and expiration both unchanged (Decimal eq) | `__roll__`                    | `no_change`                   |

Rules 7 and 8 are skipped when no short is open — there is nothing to cover. There is deliberately
**no** "on or after the current expiration" rule: a replacement earlier than the current LEAPS is
legitimate as long as it outlasts the short, and the renderer shows an advisory note instead. Rule 8's
message names the short strike at 2 dp (`($112.00)`); rule 6's names the event date (`MMM d, yyyy`).
The LEAPS roll has **no** `close_date_before_open` rule: the last event is never before the LEAPS'
own fill, so rule 6 covers it. (The short-call roll keeps its `close_date_before_open`.)

Rules 5, 6 and 9 came out of TDD and review:

- **Rule 5.** A roll after the LEAPS expired would sell a contract that no longer exists.
- **Rule 6.** A roll back-dated before a later leg would sort before it: the latest snapshot would
  stay stale and the shape rules would judge today's short rather than the one open on the fill
  date. It replaced an earlier check against the LEAPS' own fill date only.
- **Rule 9.** An already-expired replacement would be recorded as the open LEAPS forever.

### Shared rules in `pmcc-rules.ts`

- **`pmccLeapsRollIssues`** reports rules 5–10 over a `PmccLeapsRollInput`, where an `undefined`
  fill date, strike or expiration means "not decided yet" and its rule is skipped. The field type
  `PmccLeapsRollField` is derived from `RollPmccLeapsInput`'s keys plus `__roll__`. The engine throws
  the first issue; the form's `superRefine` reports the first issue per path.
- **US-102's comparator, both halves:** `shortExpiresBeforeLeaps` is the one predicate;
  `SHORT_NOT_BEFORE_LONG` reports it against a short call (US-101, US-104) and the new
  `LONG_NOT_AFTER_SHORT` against a replacement LEAPS (`LEAPS call must expire after the short
call.`). The long side calls the predicate with the arguments swapped.
- **Strike ordering:** `shortStrikeAboveLeaps` is now shared by `pmccCrossLegIssues` (entry) and the
  LEAPS roll; `STRIKE_NOT_BELOW_SHORT_CODE` and `leapsStrikeNotBelowShortMessage` format the roll's
  rule once.
- **`ROLL_NO_CHANGE`** is the no-change rule shared by both PMCC rolls.
- **`latestFillDate(legs)`** returns the latest leg fill date (`''` with no legs); the service and
  `PositionDetailPage` both call it to build `lastEventDate`.

### Service and the shared PMCC roll writer

`rollPmccLeapsPosition(db, positionId, payload)` in
`src/main/services/roll-pmcc-leaps-position.ts`:

1. `loadPmccRollContext(db, positionId)`: `getPosition` → `not_found`, then
   `requirePmccOpenLegs(detail)` → `__phase__` / `invalid_phase` for a row not in `PMCC_OPEN` (a
   wheel), else `no_active_leg` (a PMCC with no LEAPS, unreachable through the app).
2. Money to 4 dp (`money4`, now in `leg-rows.ts`), `newStrike` defaulting to the open LEAPS strike,
   `lastEventDate = latestFillDate(detail.legs)`.
3. `rollPmccLeaps`.
4. `recordPmccRoll` with `from` = SELL the open LEAPS at the proceeds, `to` = BUY the replacement at
   the debit, the LEAPS' contracts and `PMCC_LEAPS_ROLL`.

`recordPmccRoll`, `requirePmccOpenLegs`, `loadPmccRollContext` and `logPmccRollRejection` (INFO
`pmcc_leaps_roll_rejected` on a `ValidationError`, rethrown) live in
`src/main/services/pmcc-roll-record.ts` and are shared with `rollPmccShortCallPosition`. One `db.transaction` inserts both legs through
`insertLegRow` (fresh `roll_chain_id`, `instrument_type 'CALL'`, fill = premium, `fees '0.0000'`)
and calls `appendPmccSnapshot`; a failed snapshot write rolls back both legs. `fillDate` defaults to
today. `leapsRollNumber = nextPmccRollNumber(legs, 'leaps')` (`pmcc-ledger.ts`, shared with the
short roll): one plus the count of existing long-side chains. The ledger (`PmccLedgerWithStrike`) is
returned so the banner shows post-roll figures without a refetch.

No flag is needed downstream: US-103's `groupRollChains` nets the pair by action (`+2.5000`), a chain
whose `ROLL_FROM` is a SELL contributes to the LEAPS side, and `currentLeapsLeg` picks the chain's
`ROLL_TO` as the open LEAPS — so the effective share cost re-anchors on the replacement strike.

### Types

`RollLegPair<From, To>` (default `BUY` / `SELL`) is the linked pair every roll records.
`RollResultBase<Phase, From, To>` extends it with `position` and `costBasisSnapshot`.
`RollPmccLeapsResult extends RollResultBase<'PMCC_OPEN', 'SELL', 'BUY'>` and adds a narrowed
snapshot, `ledger: PmccLedgerWithStrike` and `leapsRollNumber`. `PmccLedgerWithStrike`
(`src/main/core/costbasis.ts`) is `PmccLedgerResult` with a non-null `effectiveShareCost`, returned
by the `calculatePmccLedger` overload that takes a `longStrike`; `pmccLedgerFromLegs` and
`AppendPmccSnapshotResult.ledger` use it too. The wheel and short-call results compile unchanged through
the defaults. `PmccShortCallTerms` is now an alias of the new `PmccFilledLegTerms`.

### Positions list

`listPositions` now builds each PMCC row's leg summaries from `pmccOpenLegs(legs)` — the same answer
the detail page reads — so a rolled LEAPS shows its replacement and an expired short disappears.
`PmccListSummary.short` is nullable; `PmccPositionRow` renders `$80.00 / No short open` and omits the short's
expiration and DTE lines; `position-order.ts` orders such a row by its LEAPS DTE (follow-up US-123
/ OPT-29 will sort it as DTE 0 and raise a `NO_SHORT_OPEN` alert). US-103's
`pmccOpeningLegs` ("later rows win", rolls not consulted) was removed; `pmccEntryLegs` remains for
the entry net debit.

### Renderer

- **Entry point.** `PositionDetailActions` renders `Roll LEAPS →` (`roll-pmcc-leaps-btn`) after `Roll
Short Call →` whenever the PMCC has an open LEAPS (`hasOpenLeaps = Boolean(pmccOpenLegs)`), with or
  without an open short. The sheet mounts only when `pmccLeapsLedger(pmccLedger)` is non-null (the
  renderer helper that narrows to a known effective share cost, used by both PMCC sheet mounts) and
  receives the required `lastEventDate={latestFillDate(legs)}`.
- **`RollPmccLeapsSheet`** sits inside the shared `PmccRollSheetDialog` (portal, `role="dialog"`,
  `aria-label="Roll LEAPS"`, Escape and scrim close). It owns the RHF instance from
  `useRollPmccLeapsForm({ leaps, openShort, lastEventDate }, today)` (`mode: 'onChange'`, Zod
  resolver over `rollPmccLeapsSchema({ currentLeaps, openShort, lastEventDate })`) and
  submits through the shared `useRollSheetSubmit` (single-flight, routes 400 field errors with
  `applyIpcFieldErrors`). Field map: `proceedsPerContract → proceeds`, `replacementDebitPerContract →
newDebit`, `newStrike`, `newExpiration`, `fillDate`, `__roll__`. With `showUnplacedMessages: true`
  (both PMCC sheets), an error on any other field (`__root__`, `__phase__`) shows its own message in
  `root.save`; a failure with no field errors shows `Could not record the roll. Your entries are
  preserved. Try again.`
- **`RollPmccLeapsForm`** stacks Coverage (`PmccCoverageRuler` with marks from `leapsRollCoverage`:
  today, open short or `none`, current LEAPS, replacement; red when the comparator blocks), Current
  LEAPS (six rows and the re-anchors note), Open short call (read-only, or `No short call open —
nothing to cover, so the expiration and strike checks are skipped.`), the inputs
  (`RollPmccLeapsFields` over the shared `PmccRollFields` grid), the Net card (`RollPmccLeapsNetPreview`) or its placeholder, the warning
  (`pmcc-leaps-roll-warning`), the shortened-coverage note (`pmcc-leaps-roll-coverage-note`), the
  no-change error and the footer. Its derived figures come from the pure
  `leapsRollView(values, ctx)` (`src/renderer/src/lib/pmcc-leaps-roll-view.ts`): validity, DTEs,
  net, post-roll, shortfall, label, coverage change and whether a shape rejection leaves the LEAPS
  open.
- **Confirm** is disabled when `schema.safeParse(values)` fails (US-104's convention, so a save error
  never disables its own retry). RHF `deps` re-run the no-change rule on strike/expiration edits and
  rule 9 on fill-date edits (`deps: 'newExpiration'`); `PmccRollFields` owns these rules for both
  PMCC roll sheets.
- **Net card copy.** `Net Credit:` (green), `Net Debit:` (red) or `Net Even:` (grey) with the per-share
  and total figures, then one sentence: debit `You are buying time value; it lands in the basis.`;
  credit at the same or a lower strike `Cash came out; it lowers the basis.`; credit at a higher
  strike `Cash came out, but the strike moved up more than the credit.`; even `No net cash changed
hands.` The above-short-strike warning is exactly the AC sentence. The shortened-coverage note
  appears only once the replacement expiration parses, so its DTE is never `null`.
- **Live figures** come from pure helpers in `src/renderer/src/lib/pmcc-roll.ts`:

  ```text
  net             = proceeds − replacementDebit       (per share; negative = debit)
  postBasis       = basisPerShare − net
  leapsCostAfter  = leapsCostPerShare − net
  effectiveAfter  = newStrike + postBasis              (re-anchored on the replacement strike)
  shortfall       = effectiveAfter − openShort.strike  (warning only when > 0)
  coverageChange  = newExpiration − currentExpiration  (calendar days; note only when < 0)
  ```

  `pmccLeapsPostRoll` runs the core `calculatePmccLedger` over three contributions — the LEAPS cost
  so far (LONG), the short credits so far (SHORT) and the roll's net (LONG) — on the replacement
  strike, so it agrees with the ledger the service will write.
  `pmccRollNet({ received, paid, contracts })` returns the signed `Decimal` net plus display strings
  (grouped totals, `$1,100.00`); `pmccRollLabel(current, next, 'MMM yyyy')` gives the year-bearing
  label and an `In` direction for an earlier replacement; `pmccLeapsPostRoll` and
  `effectiveCostMove` give the post-roll rows and the `up $2.50 from $101.80` phrase;
  `leapsCoverageChange` gives the shortened-coverage figure.

- **Shared with the short-call roll (generalized in place):** `pmccRollNet` now takes direction-
  neutral `{ received, paid }`; `pmccRollLabel` takes a month format; `PmccCoverageRuler` is
  marks-based: it takes a `PmccRollCoverage` (`blocked`, `fillTo`, `marks: PmccRulerMark[]` with a
  `PmccRulerTone`, `note`) plus `today`, built by `shortRollCoverage` / `leapsRollCoverage` in
  `src/renderer/src/lib/pmcc-roll-coverage.ts`; both sheets use `PmccRollSheetDialog`,
  `PmccRollFields` and `useRollSheetSubmit`.
- **Success.** `usePositionDetailSheets` holds one `RollSheet` slot for all four roll sheets and one
  `PmccRecordedRoll | null` banner (`{ kind: 'short' | 'leaps'; result }`, in
  `src/renderer/src/lib/pmcc-roll-recorded.ts`). `PmccRollRecordedBanner` renders
  either kind; the LEAPS banner (`pmcc-leaps-roll-recorded-banner`) names both legs, `LEAPS roll #N
credit|debit · $X per share ($Y total)`, and `Effective share cost if exercised: $104.30 — the
$85.00 strike plus $19.30 basis.` It is the one place the recorded net line is shown until US-109
  renders the history.

### Logging

- DEBUG `roll_pmcc_leaps_inputs`, `roll_pmcc_leaps_comparator_inputs`.
- DEBUG `pmcc_roll_tx_start` / `pmcc_roll_tx_committed` (`positionId`, `rollChainId`,
  `triggerEvent`) from the shared writer, for both PMCC rolls.
- INFO `pmcc_leaps_rolled` (chain id, net credit, basis, effective share cost, roll number).
- INFO `pmcc_leaps_roll_rejected` (field, code) on a `ValidationError`, via the shared
  `logPmccRollRejection`.
- Nothing in `core/`.

### E2e

The spec launches with `NODE_ENV: 'test'`, reaches the Background through US-103's
`_test:pmcc-record-leg-event` seam (`createXyzPmcc` → `EXPIRE_1` + `SHORT_2` + `SHORT_ROLL`) and
drives the roll through the real button and sheet. The no-short scenario adds `EXPIRE_2` (the $112
short expires). Dates are run-day-relative; DTE and month labels come from `date-fns`. Bypass
assertions call `window.api.rollPmccLeaps` and count `legs` rows.

### Worked figures

1 contract, $0 fees, from basis $21.80, LEAPS cost $25.00, effective $101.80:

| Roll                        | Net     | Basis after | LEAPS cost after | Effective after           |
| --------------------------- | ------- | ----------- | ---------------- | ------------------------- |
| $80 → $85, 26.00 / 23.50    | +$2.50  | $19.30      | $22.50           | $104.30                   |
| $80 → $80, 26.00 / 29.20    | −$3.20  | $25.00      | $28.20           | $105.00                   |
| $80 → $80, 26.00 / 37.00    | −$11.00 | $32.80      | $36.00           | $112.80 (shortfall $0.80) |
| $80 → $80 (−28d), 26 / 26.6 | −$0.60  | $22.40      | $25.60           | $102.40                   |

After the up-and-out roll the snapshot chain reads `PMCC_OPEN`, `PMCC_SHORT_EXPIRED`,
`PMCC_SHORT_OPEN`, `PMCC_SHORT_ROLL`, `PMCC_LEAPS_ROLL` at `23.0000`, `23.0000`, `21.2000`,
`21.8000`, `19.3000`; `totalPremiumCollected` stays `320.0000`.

### Deliberate limits

- **No fees input on the roll.** Both legs write `fees '0.0000'`.
- **Money crosses the IPC as numbers**, formatted to 4 dp in the service, like every roll channel.
- **The "LEAPS roll #1 credit" timeline line** is US-109's; the banner names it until then.
- **The comparator's code `long_not_after_short`** is this story's name; US-102 may rename it at the
  constant.
- **No-short PMCC alert and ordering** are US-123 (Linear OPT-29): a `NO_SHORT_OPEN` alert, and
  sorting a no-short row as DTE 0 rather than by its LEAPS DTE.
- **Out of scope:** rolling the short call (US-104), selling a subsequent short (US-115), short
  assignment (US-111), closing the PMCC (US-120), the LEAPS DTE alert (US-107), IVR / term-structure
  context (US-113, US-114), the final PMCC header and hero (US-118), chain-driven strike selection,
  broker-executed rolls (Epic 10), partial rolls and editing a recorded roll.
- The plan's contract error table predates rules 5, 6 and 9, and its renderer schema spread
  individual constants rather than one rule list; the code is authoritative.

## Architecture decisions

Recorded in this story:

- **A new pure `rollPmccLeaps`, not a `side` flag** on `rollCc` or `rollPmccShortCall`: the leg that
  is nullable, the pair's direction, the extra strike rule and the dropped on-or-after-current rule
  all differ.
- **The LEAPS roll's rules are one ordered list, `pmccLeapsRollIssues`,** consumed by engine and
  form schema — extending
  [pmcc-validation-pure-engine-mirrored-by-form-schema](../architecture/02-adrs/pmcc-validation-pure-engine-mirrored-by-form-schema.md)
  to a third PMCC path.
- **Both halves of US-102's comparator share one predicate** in `pmcc-rules.ts`, reported with two
  messages from whichever side moved.
- **The inverted pair is recorded through a shared PMCC roll writer** (`recordPmccRoll`), so both
  PMCC rolls have one transaction body — see
  [rolls-as-linked-leg-pairs](../architecture/02-adrs/rolls-as-linked-leg-pairs.md).
- **`RollLegPair<From, To>` / `RollResultBase<Phase, From, To>`** derive the inverted pair's types
  from the shipped shape instead of a hand-copied interface.
- **A dedicated payload schema** whose money fields are named proceeds and debit, not cost to close
  and premium.
- **One sheet slot and one banner slot** in `usePositionDetailSheets`, so two roll sheets or two
  confirmations can never show at once.
- **The positions list reads `pmccOpenLegs`**, so list and detail agree after rolls and expiries.

Existing decisions this story builds on:

- [pmcc-snapshot-single-writer-in-caller-transaction](../architecture/02-adrs/pmcc-snapshot-single-writer-in-caller-transaction.md):
  the roll calls `appendPmccSnapshot` inside its own transaction and computes no basis.
- [pmcc-contributions-by-role-and-action](../architecture/02-adrs/pmcc-contributions-by-role-and-action.md):
  a chain whose `ROLL_FROM` is a SELL is the long side.
- [pmcc-effective-share-cost-anchors-on-newest-long-buy](../architecture/02-adrs/pmcc-effective-share-cost-anchors-on-newest-long-buy.md):
  the replacement LEAPS becomes the anchor.
- [shared-roll-chain-helper](../architecture/02-adrs/shared-roll-chain-helper.md): `groupRollChains`
  nets the pair and counts prior LEAPS rolls.
- [append-only-cost-basis-snapshots](../architecture/02-adrs/append-only-cost-basis-snapshots.md).
- [soft-client-side-warnings](../architecture/02-adrs/soft-client-side-warnings.md): the
  above-short-strike warning and the shortened-coverage note are advisory.
- [react-hook-form-zod](../architecture/02-adrs/react-hook-form-zod.md).
- [ipc-envelope-contract](../architecture/02-adrs/ipc-envelope-contract.md).
- [dev-only-pmcc-leg-event-ipc](../architecture/02-adrs/dev-only-pmcc-leg-event-ipc.md): the e2e
  reaches its Background through it.

See [domain/cost-basis](../domain/cost-basis.md) and
[domain/wheel-lifecycle](../domain/wheel-lifecycle.md) for the ledger and phase rules in context.

## Contracts touched

- **`positions:roll-pmcc-leaps` (new).** Payload `RollPmccLeapsPayloadSchema`:

  | Field                         | Type   | Notes                                                                                         |
  | ----------------------------- | ------ | --------------------------------------------------------------------------------------------- |
  | `positionId`                  | string | a PMCC in `PMCC_OPEN` with an open LEAPS                                                      |
  | `proceedsPerContract`         | number | positive, per share — sell-to-close price of the current LEAPS                                |
  | `replacementDebitPerContract` | number | positive, per share — buy-to-open price of the replacement                                    |
  | `newExpiration`               | string | after the open short's expiration (when one is open), and after `fillDate`                    |
  | `newStrike?`                  | number | positive; below the open short's strike (when one is open); defaults to the open LEAPS strike |
  | `fillDate?`                   | string | `YYYY-MM-DD` (ISO-checked); defaults to today; on/after the last event, on/before LEAPS exp.  |

  Success returns `position` (phase `PMCC_OPEN`), `rollFromLeg` (SELL), `rollToLeg` (BUY),
  `rollChainId`, `costBasisSnapshot` (`PMCC_LEAPS_ROLL`, `finalPnl: null`), `ledger`
  (`PmccLedgerWithStrike`) and `leapsRollNumber`. Errors, first failure returned: any Zod issue;
  `not_found`; `__phase__` / `invalid_phase` (also for a wheel id); `no_active_leg`; engine rules
  2–10; `internal_error` on a storage failure, with nothing written. Preload `rollPmccLeaps`;
  adapter `src/renderer/src/api/positions.ts#rollPmccLeaps`; hook `useRollPmccLeaps`. See
  [contracts/ipc-handlers](../contracts/ipc-handlers.md).

- **`positions:list`.** `PmccListSummary.short` is now `PmccLegSummary | null`, and both leg
  summaries come from `pmccOpenLegs`. The handler is unchanged.
- **Zod / types.** `RollPmccLeapsPayloadSchema`, `RollPmccLeapsPayload`, `RollLegPair`, the widened
  `RollResultBase<Phase, From, To>`, `RollPmccLeapsResult`, `PmccLedgerWithStrike`. No new
  `LegRole` or `TriggerEvent` value. See [contracts/zod-schemas](../contracts/zod-schemas.md).
- **Schema.** No migration. New row conventions on `legs` (the inverted LEAPS-roll pair) and
  `cost_basis_snapshots` (the `PMCC_LEAPS_ROLL` row); `positions` untouched. See
  [schema/tables](../schema/tables.md).

## Source files

- **Core:**
  - `src/main/core/lifecycle.ts` (`rollPmccLeaps`, `RollPmccLeapsAccepted`,
    `RollPmccShortCallAccepted`, `PmccLegTerms`, `PmccFilledLegTerms`)
  - `src/main/core/costbasis.ts` (`PmccLedgerWithStrike`)
  - `src/main/core/pmcc-rules.ts` (`pmccLeapsRollIssues`, `LONG_NOT_AFTER_SHORT`,
    `shortStrikeAboveLeaps`, `STRIKE_NOT_BELOW_SHORT_CODE`, `leapsStrikeNotBelowShortMessage`,
    `ROLL_NO_CHANGE`, `latestFillDate`)
  - `src/main/core/position-order.ts`
- **Schemas and IPC:**
  - `src/main/schemas.ts` (`RollPmccLeapsPayloadSchema`, `RollLegPair`, `RollResultBase`,
    `RollPmccLeapsResult`, `PmccListSummary`)
  - `src/main/ipc/positions.ts`
- **Services:**
  - `src/main/services/roll-pmcc-leaps-position.ts`
  - `src/main/services/pmcc-roll-record.ts` (`recordPmccRoll`, `requirePmccOpenLegs`,
    `loadPmccRollContext`, `logPmccRollRejection`)
  - `src/main/services/pmcc-ledger.ts` (`nextPmccRollNumber`, `pmccLedgerFromLegs`),
    `src/main/services/leg-rows.ts` (`money4`)
  - `src/main/services/roll-pmcc-short-call-position.ts`
  - `src/main/services/list-positions.ts`, `src/main/services/pmcc-opening-legs.ts`
  - `src/main/services/test-fixtures/pmcc-legs.ts` (`EXPIRE_2`)
- **Preload:** `src/preload/index.ts`, `src/preload/index.d.ts`
- **Renderer:**
  - `src/renderer/src/api/positions.ts`
  - `src/renderer/src/components/RollPmccLeapsSheet.tsx`, `RollPmccLeapsForm.tsx`,
    `RollPmccLeapsFields.tsx`, `RollPmccLeapsNetPreview.tsx`, `PmccRollSheetDialog.tsx`,
    `PmccRollFields.tsx`, `RollPmccShortCallFields.tsx`,
    `PmccCoverageRuler.tsx`, `PmccRollRecordedBanner.tsx`, `PositionDetailActions.tsx`,
    `PmccPositionRow.tsx`, `RollPmccShortCallSheet.tsx`, `RollPmccShortCallForm.tsx`
  - `src/renderer/src/hooks/useRollPmccLeaps.ts`, `useRollPmccLeapsForm.ts`, `useRollSheetSubmit.ts`
  - `src/renderer/src/lib/pmcc-roll.ts`, `src/renderer/src/lib/pmcc-roll-coverage.ts`,
    `src/renderer/src/lib/pmcc-leaps-roll-view.ts`, `src/renderer/src/lib/pmcc-roll-recorded.ts`,
    `src/renderer/src/lib/ipc-field-errors.ts`
  - `src/renderer/src/schemas/roll-pmcc-leaps.ts`, `src/renderer/src/schemas/common.ts`
    (`decidedDate`), `src/renderer/src/schemas/pmcc-entry.ts`,
    `src/renderer/src/schemas/roll-pmcc-short-call.ts`
  - `src/renderer/src/pages/PositionDetailPage.tsx`, `src/renderer/src/pages/usePositionDetailSheets.ts`
  - `src/renderer/src/test-fixtures/pmcc-leaps-roll.ts` (shared renderer fixtures)
- **E2E:**
  - `e2e/pmcc-leaps-roll.spec.ts`, which covers all 15 scenario / outline rows
  - `e2e/pmcc-roll-helpers.ts`, `e2e/pmcc-ledger-helpers.ts` (`EXPIRE_2`), `e2e/helpers.ts`

Sources: [extract: us-105](../.extracts/us-105.md), `plans/us-105/`,
`docs/us-105-implementation.md`.

Related stories:

- [us-104](./us-104-roll-pmcc-short-call.md): the short-call roll whose sheet, ruler, label and
  writer this story generalized.
- [us-103](./us-103-pmcc-cost-basis.md): the ledger, `appendPmccSnapshot`, `groupRollChains` and the
  `PMCC_LEAPS_ROLL` trigger this story writes through.
- [us-101](./us-101-open-pmcc-position.md): opens the position and the LEAPS being rolled.
- [us-14](./us-14-roll-cc.md): the wheel's covered-call roll, left unchanged.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
