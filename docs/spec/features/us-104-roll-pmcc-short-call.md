# US-104: Roll the short call on a PMCC

<!-- generated:from us-104 -->

## Summary

A PMCC with an open short call can now roll it. The trader opens `Roll Short Call →` on the detail
page, enters the buy-to-close price and the replacement call, and confirms. The roll is recorded as
one linked `ROLL_FROM` BUY / `ROLL_TO` SELL leg pair and one `PMCC_SHORT_ROLL` cost-basis snapshot,
in one transaction. The position row is not touched: the phase stays `PMCC_OPEN`.

Four pieces carry it:

- **A pure engine.** `rollPmccShortCall` (`src/main/core/lifecycle.ts`) checks ten rules in a fixed
  order and throws the first failure. Its date and no-change rules live once, in
  `pmccShortRollIssues` (`src/main/core/pmcc-rules.ts`), which the renderer form schema also runs.
- **A service.** `rollPmccShortCallPosition` writes the pair and calls US-103's
  `appendPmccSnapshot`. It computes no basis of its own.
- **One IPC channel.** `positions:roll-pmcc-short`.
- **A sheet.** `Roll Short Call` shows a coverage ruler, the current short and LEAPS context, a live
  `Net Debit` / `Net Credit` preview with a roll label and replacement DTE, and an advisory warning
  when the replacement strike sits below the effective share cost.

The open legs of a PMCC are now derived by replaying its legs. `positions:get` returns them as
`pmccOpenLegs`, and the header action, the sheet and the leg reference all read that one answer.

The trader sees this behaviour today:

- **The roll contributes one net amount.** Buying back the $108 call at $3.00 and selling a $112
  call at $2.40 is a $0.60 debit. The basis moves from $21.20 to $21.80.
- **The confirm button is disabled until the roll is valid.** It stays disabled while any rule fails
  and reads as visibly disabled.
- **The below-effective-cost warning never blocks.** It names the shortfall and confirm stays
  enabled.
- **A recorded roll closes the sheet** and shows a banner naming the ledger line:
  `Short-call roll #1 debit · $0.60 per share ($60.00 total)`.
- **The leg reference shows the open legs, not the opening legs.** After the roll the `Sell short
call` card reads `$112.00`.
- **A classic wheel is unchanged.** Its `Roll CC →` sheet is untouched and the PMCC action never
  appears on it.

**No migration.** `legs` and `cost_basis_snapshots` already hold everything the roll writes, and
US-103 already defined `PMCC_SHORT_ROLL`.

Story: Linear OPT-12 / US-104, 5 points. Layout of record: `mockups/epic-09-pmcc-position-detail.mdx`
(`RollShortSheet`, presets `rs-entry` … `rs-recorded`). `mockups/us-104-roll-pmcc-short-call.mdx` is
design history.

## Acceptance criteria

Scenario names come from Linear OPT-12. `e2e/pmcc-short-call-roll.spec.ts` has one named `it` per
scenario or outline row, and all 12 pass. The Background is US-103's `OPEN` + `EXPIRE_1` +
`SHORT_2`: XYZ PMCC, LEAPS $80 call (+368d), an open $108 short sold at $1.80 (+67d), basis $21.20,
effective share cost $101.20.

1. **The roll form shows the decision context for the open short call.** The sheet shows `$108.00`,
   the current expiration with DTE, `$1.80 / share`, `LEAPS · read-only` `$80.00 · <LEAPS exp>` and
   `Effective share cost` `$101.20`. Five inputs are visible. The net card is replaced by its
   placeholder.
2. **Net debit preview for a roll up and out.** 3.00 / 112 / +95d / 2.40 shows `Net Debit: $0.60 per
share ($60.00 total)` and `Roll Up & Out: $108 to $112 strike, <Mon> to <Mon> expiration` with
   `N DTE`. Confirm is enabled.
3. **Net credit preview for a roll out at the same strike.** 1.10 / 108 / +95d / 2.30 shows `Net
Credit: $1.20 per share ($120.00 total)` and `Roll Out: same $108 strike, …`.
4. **Recording the roll creates a linked leg pair and one net cost-basis line.** `ROLL_FROM` BUY $108
   @ 3.0000 and `ROLL_TO` SELL $112 @ 2.4000 share one non-null chain id. There are four snapshots;
   the last is `PMCC_SHORT_ROLL` at `21.8000`. `pmccOpenLegs.long` is the $80 LEAPS and `.short` the
   $112 call. The banner reads `Short-call roll #1 debit` · `$0.60 per share`, the drawer `$21.80`,
   and the `Sell short call` card `$112.00`.
5. **Warning when the replacement strike sits below the effective share cost.** 3.00 / 98 / +95d /
   2.50 shows `Short strike $98.00 is below your effective share cost of $101.70 after this roll. If
assigned, covering from the LEAPS realizes roughly $3.70 per share of loss.` Confirm stays enabled.
6. **Reject a replacement expiration that would outlast the LEAPS.** An expiration equal to the
   LEAPS shows `Short call must expire before the LEAPS call.` and disables confirm. The IPC bypass
   returns `newExpiration` / `short_not_before_long`, writes no legs and leaves the $108 short open.
7. **Reject a roll that changes neither strike nor expiration.** `Roll must change the strike, the
expiration, or both`; confirm disabled.
8. **Reject a replacement expiration earlier than the current short call.** `Replacement expiration
must be on or after the current expiration (<MMM d, yyyy>)`; confirm disabled.
9. **Outline: Reject a non-positive cost to close.** `Cost to close must be greater than zero`;
   confirm disabled.
10. **Outline: Reject a non-positive replacement premium.** `Replacement premium must be greater than
zero`; confirm disabled.
11. **Reject a roll when the PMCC has no open short call.** In the LEAPS-only state there is no `Roll
Short Call →`. The bypass returns `This PMCC has no open short call to roll.`; legs and snapshots
    are unchanged.
12. **Leave a classic wheel covered-call roll unaffected.** A `CC_OPEN` wheel has no
    `roll-pmcc-short-btn`. Its `Roll CC →` sheet reads `Roll Covered Call` and contains no `Effective
share cost`, `LEAPS` or `Roll Short Call`.

Two review-driven rules are not Linear AC; unit and integration tests cover them in both the engine
and the form schema:

- A roll fill date before the open short's fill date → `fillDate` / `close_date_before_open`.
- A replacement expiring on or before the roll's fill date → `newExpiration` /
  `expiration_not_after_fill`.

## What was built

### Engine

`rollPmccShortCall` is generic over the caller's short-leg type. Its input is the current phase, the
open short (`strike`, `expiration`, `fillDate`, or `null`), the LEAPS expiration, the roll's fill
date, an optional new strike, the new expiration and the two per-share prices. It returns
`{ phase: 'PMCC_OPEN', openShort, newStrike }`: the caller's own short, now known to be non-null, and
the strike resolved to the current one when the input omitted it. No logging, no I/O.

Rules, in order; the first failure throws `ValidationError(field, code, message)`:

| #   | Rule                                           | field                    | code                          |
| --- | ---------------------------------------------- | ------------------------ | ----------------------------- |
| 1   | phase is not `PMCC_OPEN`                       | `__phase__`              | `invalid_phase`               |
| 2   | no open short                                  | `__root__`               | `no_open_short_call`          |
| 3   | roll fill date < open short's fill date        | `fillDate`               | `close_date_before_open`      |
| 4   | cost to close ≤ 0                              | `costToClosePerContract` | `must_be_positive`            |
| 5   | replacement premium ≤ 0                        | `newPremiumPerContract`  | `must_be_positive`            |
| 6   | new strike ≤ 0                                 | `newStrike`              | `must_be_positive`            |
| 7   | new expiration not before the LEAPS expiration | `newExpiration`          | `short_not_before_long`       |
| 8   | new expiration < current short's expiration    | `newExpiration`          | `must_be_on_or_after_current` |
| 9   | new expiration ≤ roll fill date                | `newExpiration`          | `expiration_not_after_fill`   |
| 10  | strike and expiration both unchanged           | `__roll__`               | `no_change`                   |

The order is deliberate. Structural guards come first. Money guards come next, so a $0.00 cost to
close is reported beside its field even when the dates are also wrong. The coverage invariant (rule 7) is safety-critical, so it runs before the softer date and no-change rules. Strike equality in
rule 10 is `Decimal.eq`, so `108` and `108.0000` are `no_change`. Rule 8's message formats the
current expiration as `MMM d, yyyy`.

Rules 3 and 9 came out of review:

- **Rule 3.** Without it, a too-early roll would sort before the open short in the fill-date replay.
  The closed short would read as still open, a second roll would close it twice, and the snapshot
  would get an out-of-order `eventDate`.
- **Rule 9.** Without it, the engine recorded an already-expired `ROLL_TO` that the replay then
  treated as the open short forever.

### Shared rules in `pmcc-rules.ts`

- **`shortExpiresBeforeLeaps(short, long)`** and **`SHORT_NOT_BEFORE_LONG`** are the short-side half
  of US-102's comparator extraction, carried here because US-102 had not started.
  `pmccCrossLegIssues` now calls them, so the message exists once. US-102 keeps the inverse message
  and the US-105 / US-115 boundaries.
- **`EXPIRATION_NOT_AFTER_FILL`** is shared by `openPmcc`'s per-leg rule, the roll engine and the
  roll form.
- **`pmccShortRollIssues`** reports rules 3 and 7–10 over a `PmccShortRollInput`, where an
  `undefined` field means "not decided yet" and its rule is skipped. The field type is derived from
  the engine input's keys, so form paths and `ValidationError.field` cannot diverge. The engine
  throws the first issue; the form's `superRefine` reports the first issue per path.
- `issueIf` now takes a `{ code, message }` rule object, and `PmccIssue` is generic over its field.

### Open legs by replay

`src/main/services/pmcc-ledger.ts` exports:

- **`currentLeapsLeg(legs)`**: the newest long-side BUY (US-103's private `newestLongBuy`, renamed).
- **`currentShortCallLeg(legs)`**: a replay in leg order. `SHORT_CALL_OPEN` or a short-side chain's
  `ROLL_TO` opens; `SHORT_CALL_EXPIRED`, `SHORT_CALL_CLOSE` or `SHORT_CALL_ASSIGNED` closes.
- **`pmccOpenLegs(legs)`**: `{ long, short }`, or `null` when there is no LEAPS leg.

A private `orderedLedgerEvents` feeds the contributions fold and both replays, so the merge-and-sort
exists once. "Has an open short call" cannot be read from `phase` yet: nothing changes phase until
US-115 / US-119 introduce `PMCC_LEAPS_ONLY`. `activeLegSubquery` deliberately does **not** learn PMCC
phases, because US-101 keeps the alert, polling and calendar jobs off PMCC rows by having it return
no leg for them.

### Service

`rollPmccShortCallPosition(db, positionId, payload)` in
`src/main/services/roll-pmcc-short-call-position.ts`:

1. `getPosition` → `not_found`.
2. `detail.pmccOpenLegs` is `null` → `__phase__` / `invalid_phase` for a row not in `PMCC_OPEN` (a
   wheel), else `no_active_leg` (a PMCC with no LEAPS, unreachable through the app).
3. Money to 4 dp, then `rollPmccShortCall`. The open short is passed through possibly `null`, so "no
   open short" is the engine's `no_open_short_call`, not `no_active_leg`.
4. One `db.transaction`: `insertLegRow` for the `ROLL_FROM` BUY CALL (open short's strike, expiration
   and contracts; premium = fill = cost to close), `insertLegRow` for the `ROLL_TO` SELL CALL
   (replacement strike and expiration; premium = fill = new premium), one fresh `roll_chain_id`, both
   `fees '0.0000'`, then `appendPmccSnapshot` with `PMCC_SHORT_ROLL` and the roll's fill date.

A failed snapshot write rolls back both legs. `fillDate` defaults to today. `shortCallRollNumber` is
one plus the count of existing chains whose `ROLL_FROM` is a BUY. The ledger is returned so the
success state shows post-roll figures without a refetch.

`insertLegRow(db, leg)` (`src/main/services/leg-rows.ts`) is now the one full-column leg INSERT, the
inverse of `readLegs`' mapping. The roll service, `createPmccPosition`, the PMCC unit fixtures and
the `_test:pmcc-record-leg-event` seam all use it. The wheel roll and open services keep their own
literal SQL, because they never build a `LegRecord` first.

### Types

`RollResultBase<Phase>` now owns the `position` block for every roll result. `RollCspResult` and
`RollCcResult` are aliases of it, and `RollPmccShortCallResult` extends `RollResultBase<'PMCC_OPEN'>`
with a narrowed snapshot, `ledger` and `shortCallRollNumber`.

### Renderer

- **Entry point.** `PositionDetailActions` renders `Roll Short Call →` only when the position is a
  PMCC with an open short call.
- **`RollPmccShortCallSheet`** is a portal `SheetPanel` (`role="dialog"`, `aria-label="Roll Short
Call"`). Escape, the scrim and Cancel close it without recording. It mounts only when
  `pmccLedger.effectiveShareCost` is non-null. It holds an RHF instance from
  `useRollPmccShortCallForm` (`mode: 'onChange'`, Zod resolver over `rollPmccShortCallSchema(ctx)`).
- **`RollPmccShortCallForm`** stacks the coverage ruler (`PmccCoverageRuler`), the current short and
  LEAPS context, the replacement inputs (`RollPmccShortCallFields`), the net card or its dashed
  placeholder (`PmccRollNetPreview`), the warning, the no-change error and the footer (`Your draft is
kept until the roll is valid. No order is placed.`).
- **Confirm** is disabled when `schema.safeParse(watchedValues)` fails, not on RHF's `isValid`.
  `setError` forces `isValid` false, which would disable the retry a save error invites. RHF `deps`
  re-run the no-change rule on strike/expiration edits and rule 9 on fill-date edits.
- **Live figures** come from pure helpers in `src/renderer/src/lib/pmcc-roll.ts`: `pmccRollNet`,
  `pmccRollLabel`, `pmccPostRollEffectiveCost`, `pmccStrikeShortfall` and `pmccRecordedRollNet`.

  ```text
  net            = newPremium − costToClose          (per share; negative = debit)
  postBasis      = basisPerShare − net
  effectiveAfter = leapsStrike + postBasis
  shortfall      = effectiveAfter − newStrike        (warning only when > 0)
  ```

  The net renders `text-wb-red` for a debit and `text-wb-green` for a credit. The roll label is
  `Roll Up & Out`, `Roll Out`, `Roll Up`, `Roll Down & Out` or `Roll Down`; months use `MMM`, with
  the day added when both dates fall in one month. The warning and the label render only once the
  roll is valid.

- **The warning** is `AlertBox variant="warning"` and never disables confirm.
- **Success.** `usePositionDetailSheets` closes the sheet and holds the result, and
  `PositionDetailPage` shows `PmccRollRecordedBanner`. The banner clears when the sheet reopens or
  the page is left. Until US-109 renders the history, it is the one place the recorded net line is
  shown. TanStack invalidation refetches the detail.
- **`PmccLegReference`** now takes `openLegs` and renders the LEAPS card from `openLegs.long` and the
  short card from `openLegs.short`. The short card is omitted when there is none. `PositionCockpit`
  passes `detail.pmccOpenLegs`.
- **`FormButton`** gains a visible disabled treatment (`cursor-not-allowed`, plus `opacity-40` when
  `disabled`). Wheel sheets inherit it.
- **`applyIpcFieldErrors`** (`src/renderer/src/lib/ipc-field-errors.ts`, backed by `ipcFieldErrorsOf`
  in `api/error.ts`) routes IPC field errors onto RHF paths. The roll sheet and `PmccEntryForm` use
  it. Unmapped errors become `root.save`: `Could not record the roll. Your entries are preserved.
Try again.`
- `moneySchema` and `inputToNumber` moved to `src/renderer/src/schemas/common.ts`, shared by the
  entry and roll schemas.

### Logging

- DEBUG `roll_pmcc_short_call_inputs`, `roll_pmcc_short_call_tx_start`,
  `roll_pmcc_short_call_tx_committed`.
- INFO `pmcc_short_call_rolled` (chain id, net credit, basis, roll number).
- INFO `pmcc_short_roll_rejected` (field, code) on a `ValidationError`.
- Nothing in `core/`.

### E2e

The spec launches with `NODE_ENV: 'test'` and reaches the Background through US-103's
`_test:pmcc-record-leg-event` seam (`createXyzPmcc` → `EXPIRE_1` + `SHORT_2`). It then drives the roll
through the real button and sheet, which keeps the form rules falsifiable. Dates are relative to the
run day. The recording test fills on `localDate(63)`, because the Background's events are
future-dated and a today-filled roll would sort before them (rule 3 now rejects that outright).
Bypass assertions call `window.api.rollPmccShortCall` and count rows directly.

### Worked figures

1 contract, $0 fees, from basis $21.20 and LEAPS strike $80:

| Roll                     | Net    | Basis after | Effective share cost after |
| ------------------------ | ------ | ----------- | -------------------------- |
| $108 → $112, 3.00 / 2.40 | −$0.60 | $21.80      | $101.80                    |
| $108 → $108, 1.10 / 2.30 | +$1.20 | $20.00      | $100.00                    |
| $108 → $98, 3.00 / 2.50  | −$0.50 | $21.70      | $101.70 (shortfall $3.70)  |

After the up-and-out roll the snapshot chain reads `PMCC_OPEN`, `PMCC_SHORT_EXPIRED`,
`PMCC_SHORT_OPEN`, `PMCC_SHORT_ROLL` at `23.0000`, `23.0000`, `21.2000`, `21.8000`.

### Deliberate limits

- **No fees input on the roll.** Both legs write `fees '0.0000'`, as wheel rolls do; fees can be
  added later.
- **Money crosses the IPC as numbers** and is formatted to 4 dp in the service, like every other roll
  channel. This departs from the story note's "money as strings".
- **Not refactored:** the three roll booleans in `usePositionDetailSheets`; a shared roll-sheet form
  hook; `money4` duplicated in two services; the 13 unextracted `api/positions.ts` unwrap bodies;
  other forms still hand-rolling the 400-`detail` extraction.
- **Out of scope:** LEAPS rolls (US-105), selling a new short when none is open (US-115), short
  assignment (US-111), retiring the short (US-119), the comparator's inverse message (US-102),
  history-line rendering (US-109), IVR context (US-114), term-structure guidance (US-113), alerts
  (US-106 / US-107), chain-driven strike selection and Greeks, broker-executed rolls (Epic 10),
  partial or multi-fill rolls, editing a recorded roll, and the final PMCC header (US-118).
- The plan's contract error table and `quickstart.md` predate rules 3 and 9; the code is
  authoritative.

## Architecture decisions

Recorded in this story:

- **Carry the short-side comparator extraction from US-102.** Waiting would block a 5-point story on
  one function; copying the comparison inline is the drift US-102 exists to prevent; reusing
  `pmccCrossLegIssues` whole would run entry-only rules against a roll.
- **A new pure `rollPmccShortCall`, not a `strategy` flag on `rollCc`.** The phase, the nullable leg
  and the coverage rule all differ, and US-14 already chose replicate over generalize. A shared
  `requireRollChanges` with `rollCc` was rejected because it would change `rollCc`'s strike
  comparison from string equality to `Decimal.eq`: a behaviour change, not a refactor.
- **Roll rules live once in `pmccShortRollIssues`**, consumed by engine and form schema. This extends
  [pmcc-validation-pure-engine-mirrored-by-form-schema](../architecture/02-adrs/pmcc-validation-pure-engine-mirrored-by-form-schema.md).
- **Open legs come from replaying legs in the main process**, not from teaching `activeLegSubquery`
  PMCC phases or deriving them in the renderer. See
  [server-side-dte-and-derived-fields](../architecture/02-adrs/server-side-dte-and-derived-fields.md).
- **One `insertLegRow`** replaces the fifth copy of the leg INSERT.
- **`RollResultBase<Phase>`** owns the `position` block that was written out by hand three times.
- **The sheet is the consolidated mockup's `RollShortSheet`**, not `RollCcForm` with props: the
  warning, label and coverage context all differ.
- **Confirm disabled from `safeParse`, not `isValid`**, so a save error never disables its own retry.
- **The net preview and roll label are new helpers**, because the AC quotes strings the wheel's
  `getCcRollTypeDetail` does not produce.

Existing decisions this story builds on:

- [rolls-as-linked-leg-pairs](../architecture/02-adrs/rolls-as-linked-leg-pairs.md): the
  `ROLL_FROM` / `ROLL_TO` pair on one `roll_chain_id`.
- [pmcc-snapshot-single-writer-in-caller-transaction](../architecture/02-adrs/pmcc-snapshot-single-writer-in-caller-transaction.md):
  the roll calls `appendPmccSnapshot` inside its own transaction and computes no basis.
- [pmcc-contributions-by-role-and-action](../architecture/02-adrs/pmcc-contributions-by-role-and-action.md):
  a chain whose `ROLL_FROM` is a BUY is the short side.
- [shared-roll-chain-helper](../architecture/02-adrs/shared-roll-chain-helper.md): `groupRollChains`
  nets the pair and counts prior short rolls.
- [pmcc-effective-share-cost-anchors-on-newest-long-buy](../architecture/02-adrs/pmcc-effective-share-cost-anchors-on-newest-long-buy.md):
  now exported as `currentLeapsLeg`.
- [append-only-cost-basis-snapshots](../architecture/02-adrs/append-only-cost-basis-snapshots.md).
- [soft-client-side-warnings](../architecture/02-adrs/soft-client-side-warnings.md): the
  below-effective-cost warning is advisory.
- [react-hook-form-zod](../architecture/02-adrs/react-hook-form-zod.md).
- [ipc-envelope-contract](../architecture/02-adrs/ipc-envelope-contract.md).
- [dev-only-pmcc-leg-event-ipc](../architecture/02-adrs/dev-only-pmcc-leg-event-ipc.md): the e2e
  reaches its Background through it.

See [domain/cost-basis](../domain/cost-basis.md) and
[domain/wheel-lifecycle](../domain/wheel-lifecycle.md) for the ledger and phase rules in context.

## Contracts touched

- **`positions:roll-pmcc-short` (new).** Payload `RollPmccShortCallPayloadSchema` =
  `RollPayloadBaseSchema` + `fillDate?` (ISO-checked):

  | Field                    | Type   | Notes                                                        |
  | ------------------------ | ------ | ------------------------------------------------------------ |
  | `positionId`             | string | a PMCC in `PMCC_OPEN` with an open short call                |
  | `costToClosePerContract` | number | positive, per share                                          |
  | `newPremiumPerContract`  | number | positive, per share                                          |
  | `newExpiration`          | string | current short exp ≤ it < LEAPS exp, and > the roll fill date |
  | `newStrike?`             | number | positive; defaults to the open short's strike                |
  | `fillDate?`              | string | `YYYY-MM-DD`; defaults to today; ≥ the open short's fill     |

  Only `fillDate` is tightened to ISO, here and not on the base, so wheel roll validation is
  unchanged. Success returns `position` (phase `PMCC_OPEN`), `rollFromLeg` (BUY), `rollToLeg`
  (SELL), `rollChainId`, `costBasisSnapshot` (`PMCC_SHORT_ROLL`, `finalPnl: null`), `ledger`
  (`PmccLedgerResult`) and `shortCallRollNumber`. Errors, first failure returned: `not_found`;
  `__phase__` / `invalid_phase` (also for a wheel id); `no_active_leg`; engine rules 2–10; any Zod
  issue (Zod `.positive()` fires before the engine for `0`); `internal_error` on a storage failure,
  with nothing written. Preload `rollPmccShortCall`; adapter
  `src/renderer/src/api/positions.ts#rollPmccShortCall`; hook `useRollPmccShortCall`. See
  [contracts/ipc-handlers](../contracts/ipc-handlers.md).

- **`positions:get`.** The result gains `pmccOpenLegs: PmccOpenLegs | null` (`{ long: LegRecord;
short: LegRecord | null }`), `null` for a wheel or a PMCC with no LEAPS leg. `activeLeg` stays
  `null` for a PMCC. The handler is unchanged.
- **Zod / types.** `RollPmccShortCallPayloadSchema`, `RollPmccShortCallPayload`,
  `RollPmccShortCallResult`, exported generic `RollResultBase<Phase>`. No new `LegRole` or
  `TriggerEvent` value. See [contracts/zod-schemas](../contracts/zod-schemas.md).
- **Schema.** No migration. New row conventions on `legs` (the PMCC short-roll pair) and
  `cost_basis_snapshots` (the `PMCC_SHORT_ROLL` row); `positions` untouched. See
  [schema/tables](../schema/tables.md).

## Source files

- **Core:**
  - `src/main/core/lifecycle.ts` (`rollPmccShortCall`, `PmccShortCallTerms`)
  - `src/main/core/pmcc-rules.ts` (`pmccShortRollIssues`, `shortExpiresBeforeLeaps`,
    `SHORT_NOT_BEFORE_LONG`, `EXPIRATION_NOT_AFTER_FILL`)
  - `src/main/core/test-fixtures/arbitraries.ts` (`strictlyOrderedDays`, used by the new
    `pmcc-rules` and extended `lifecycle` property tests)
- **Schemas and IPC:**
  - `src/main/schemas.ts` (`RollPmccShortCallPayloadSchema`, `RollResultBase`,
    `GetPositionResult.pmccOpenLegs`)
  - `src/main/ipc/positions.ts`, `src/main/ipc/test-pmcc-ledger.ts`
- **Services:**
  - `src/main/services/roll-pmcc-short-call-position.ts`
  - `src/main/services/pmcc-ledger.ts` (`currentLeapsLeg`, `currentShortCallLeg`, `pmccOpenLegs`)
  - `src/main/services/leg-rows.ts` (`insertLegRow`)
  - `src/main/services/get-position.ts`, `src/main/services/create-pmcc-position.ts`
  - `src/main/services/test-fixtures/pmcc-legs.ts` (`pmccOpenPayload`, `recordPmccLegEvent`)
- **Preload:** `src/preload/index.ts`, `src/preload/index.d.ts`
- **Renderer:**
  - `src/renderer/src/api/positions.ts`, `src/renderer/src/api/error.ts`
  - `src/renderer/src/components/RollPmccShortCallSheet.tsx`, `RollPmccShortCallForm.tsx`,
    `RollPmccShortCallFields.tsx`, `PmccCoverageRuler.tsx`, `PmccRollNetPreview.tsx`,
    `PmccRollRecordedBanner.tsx`, `PositionDetailActions.tsx`, `PmccEntryForm.tsx`
  - `src/renderer/src/components/ui/FormButton.tsx`
  - `src/renderer/src/components/position-cockpit/PmccLegReference.tsx`, `PositionCockpit.tsx`
  - `src/renderer/src/hooks/useRollPmccShortCall.ts`, `useRollPmccShortCallForm.ts`
  - `src/renderer/src/lib/pmcc-roll.ts`, `src/renderer/src/lib/ipc-field-errors.ts`
  - `src/renderer/src/schemas/roll-pmcc-short-call.ts`, `src/renderer/src/schemas/common.ts`,
    `src/renderer/src/schemas/pmcc-entry.ts`
  - `src/renderer/src/pages/PositionDetailPage.tsx`, `src/renderer/src/pages/usePositionDetailSheets.ts`
  - `src/renderer/src/test-fixtures/pmcc-roll.ts` (shared renderer fixtures)
- **E2E:**
  - `e2e/pmcc-short-call-roll.spec.ts`, which covers all 12 scenarios
  - `e2e/pmcc-roll-helpers.ts`

Sources: [extract: us-104](../.extracts/us-104.md), `plans/us-104/`,
`docs/us-104-implementation.md`.

Related stories:

- [us-103](./us-103-pmcc-cost-basis.md): the ledger, `appendPmccSnapshot`, `groupRollChains`,
  `readLegs` and the trigger vocabulary this story writes through.
- [us-101](./us-101-open-pmcc-position.md): opens the position and the short call being rolled.
- [us-14](./us-14-roll-cc.md): the wheel's covered-call roll, left unchanged.
- [us-34](./us-34-position-cockpit.md): the cockpit that hosts the leg reference.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
