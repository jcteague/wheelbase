# US-115: Sell a subsequent short call against an open LEAPS

<!-- generated:from us-115 -->

## Summary

A PMCC whose last short call has been retired can now sell the next one. The detail page offers
`Sell Short Call →` when the position is in `PMCC_OPEN`, holds an open LEAPS and has no open short.
It opens a 460px sheet with:

- the open LEAPS as coverage context (strike, expiration, DTE, delta);
- the previous cycle's outcome (`Cycle 8 expired worthless 2027-07-16 · 7 days uncovered`);
- US-101's short-call picker, bounded by the live LEAPS;
- a live `After this sale` preview computed by US-103's ledger.

Confirming records one `SHORT_CALL_OPEN` SELL leg and one `PMCC_SHORT_OPEN` cost-basis snapshot in
one transaction. The `positions` row is not touched: the phase stays `PMCC_OPEN`. There is still no
LEAPS-only phase. "LEAPS open · no short call" and "LEAPS + short call open" are labels derived
from the open legs, and the detail header now reads them through `pmccCoverageLabel`. A partial
short reads `N of M covered`.

The trader sees this behaviour today:

- **Partial coverage is allowed and stated.** Selling fewer contracts than the LEAPS holds is
  accepted. The header and the positions-list card read `1 of 3 covered`, and the preview notes the
  uncovered contracts.
- **Only one short call can be open at a time** (v1). Selling more contracts than the LEAPS holds,
  or selling while a short is open, is rejected.
- **The below-the-line advisory never blocks.** It reuses US-104's threshold and wording, and the
  confirm button stays enabled.
- **A closed PMCC never offers the action.** The header gate checks the phase as well as the legs.
- **A classic wheel is unchanged.** `HOLDING_SHARES` still offers `Open Covered Call →`.

**No migration.** The leg role, the trigger event and both tables already existed. `PMCC_SHORT_OPEN`
had no production writer before this story.

The story also closes US-102's two deferred subsequent-short scenarios (S5/S6) through the real
form, service and IPC.

Story: Linear OPT-23 / US-115. Layout of record: `mockups/epic-09-pmcc-position-detail.mdx`
(`SellShortSheet`, presets `sell-short` and `healthy`). Builds on US-101, US-102, US-103,
US-104/US-105, US-108 and US-109.

## Acceptance criteria

Scenario names come from Linear OPT-23 (the advisory example was corrected in Linear). The
Background is US-109's XYZ PMCC on 2027-07-23 in America/New_York: one $85.00 LEAPS expiring
2028-01-21, 1 contract, LEAPS cost $22.50/share. Cycle 8 expired worthless on 2027-07-16, credits to
date are $14.00/share, basis is $8.50 and effective share cost is $93.50.
`e2e/pmcc-sell-short.spec.ts` has one `it` per scenario. The two outlines are `it.each` with 4 and
6 rows, giving 20 tests.

1. **Sell the next short call.** $118.00 · 2027-08-20 · $1.95 · fill 2027-07-23 records a SELL short
   leg. The position reads `LEAPS + short call open`. Basis becomes $6.55, `Effective share cost`
   $91.55 and `Premium recovered` 70.9%. The timeline shows cycle 9 opened after 7 uncovered days.
   No `broker:*` channel is invoked.
2. **The sheet shows the LEAPS as coverage context and the previous cycle's outcome.** The coverage
   card reads `$85.00 · 2028-01-21 · 182 DTE · Δ 0.81`. The previous-cycle line is shown. The picker
   is filtered to calls expiring before the LEAPS with strikes above $85.00, defaulting to 20–45 DTE
   and Δ 0.25–0.35.
3. **The preview shows the cash and the new guardrails.** `Credit $195.00 · 28 DTE`; basis, effective
   share cost and premium recovered shown "after (from …)". A green line reads `Strike $118.00 is
+$26.45 above your effective share cost`.
4. **Warn when the strike is below the effective share cost.** With XYZ at $86.50, $90.00 @ $1.50
   shows `Short strike $90.00 is below your effective share cost of $92.00 after this sale. If
assigned, covering from the LEAPS realizes roughly $2.00 per share of loss. You can still record
it.` Confirm stays enabled.
5. **Outline: Reject a short call that breaks the PMCC shape.** An expiration on or after the LEAPS
   gives `Short call must expire before the LEAPS call.`. A strike at or below the LEAPS gives
   `Short-call strike must be above the LEAPS strike.`. There are 4 rows. Each row's entries are kept
   and nothing is written.
6. **Reject a bypassed short call that would outlast the LEAPS.** After a LEAPS roll to 2028-06-16, a
   direct IPC request for a 2028-06-16 short is rejected on `expiration`. It is judged against the
   **live** LEAPS, not the original entry.
7. **Outline: Reject invalid entry.** There are 6 rows: sale price $0.00, contracts 0, contracts 2
   (`Cannot sell more short calls than LEAPS contracts held (1).`), a future fill date, a fill before
   the previous short retired (`… (2027-07-16).`), and an expiration not after the fill.
8. **Partial coverage is allowed and stated.** With 3 LEAPS contracts, 1 contract records. The badge
   and the card read `1 of 3 covered`, and the preview names the 2 uncovered contracts.
9. **Reject when a short call is already open.** The request returns `This PMCC already has an open
short call — roll it instead.`, and nothing is written.
10. **Continue when market data cannot supply the picker.** The picker reads `Quotes unavailable.
Enter your filled trade manually.`, and every rule still applies.
11. **A failed save leaves the position LEAPS-only.** The sheet shows `Could not record the short
call. Your entries are preserved. Try again.`. No leg or snapshot is written, and the basis is
    still $8.50.
12. **The wheel is unchanged.** `HOLDING_SHARES` offers `Open Covered Call →`. It shows no sell-short
    action and no LEAPS or effective-share-cost context.

Recorded deviations: AC 1's `Effective share cost if exercised` is asserted under US-103's existing
`Effective share cost` label. The partial note is the longer sentence that explains one open short
per PMCC. The timeline is asserted as the cycle 9 header plus the `Uncovered · 7 days` gap row.

Rules not in the AC, covered by unit and integration tests:

- an already-expired expiration → `expired_contract`;
- a LEAPS bought after the previous short retired → `long_after_short`;
- no previous cycle → `No short call has been sold against this LEAPS yet`, with the LEAPS fill as
  the only floor;
- a closed PMCC gets no action and no sheet.

## What was built

### Engine

`sellPmccShort(input)` in `src/main/core/lifecycle.ts` returns `{ phase: 'PMCC_OPEN' }` or throws
the first broken rule as `ValidationError(field, code, message)`. Its input is the current phase,
the open short (or `null`), the live LEAPS terms and contracts, `previousShortRetiredOn`, `today`,
and the sale's strike, expiration, fill date, fill price, fees and contracts.

| #   | Rule                                   | field        | code                        |
| --- | -------------------------------------- | ------------ | --------------------------- |
| 1   | phase is not `PMCC_OPEN`               | `__phase__`  | `invalid_phase`             |
| 2   | a short call is already open           | `__root__`   | `short_call_already_open`   |
| 3   | contracts not a positive whole number  | `contracts`  | `must_be_positive_integer`  |
| 4   | strike ≤ 0                             | `strike`     | `must_be_positive`          |
| 5   | sale price ≤ 0                         | `fillPrice`  | `must_be_positive`          |
| 6   | fees < 0                               | `fees`       | `must_be_non_negative`      |
| 7   | contracts > LEAPS contracts            | `contracts`  | `exceeds_leaps_contracts`   |
| 8   | fill date after today                  | `fillDate`   | `cannot_be_future`          |
| 9a  | fill before the previous short retired | `fillDate`   | `before_previous_short`     |
| 9b  | fill before the live LEAPS fill        | `fillDate`   | `long_after_short`          |
| 10  | expiration before today                | `expiration` | `expired_contract`          |
| 11  | expiration ≤ fill date                 | `expiration` | `expiration_not_after_fill` |
| 12  | expiration not before the LEAPS        | `expiration` | `short_not_before_long`     |
| 13  | strike not above the LEAPS strike      | `strike`     | `strike_not_above_long`     |

Rule 2 wins even when every other field is invalid. Rules 3–6 repeat the form's field-shape checks
so that a bypassed request gets the same message. `contracts: 0` reports
`must_be_positive_integer`, not `exceeds_leaps_contracts`. ISO dates compare as strings.

### Shared rules in `pmcc-rules.ts`

- **`pmccSubsequentShortIssues(input)`** returns rules 7–13 in order as
  `PmccIssue<PmccSubsequentShortField>[]`. An `undefined` value means "not decided yet" and skips
  that rule. The engine throws the first issue, and the form's `superRefine` reports the first issue
  per field.
- **`pmccFillDateFloor({ previousShortRetiredOn, leapsFillDate })`** returns the one binding floor:

  ```text
  floor = previousShort   if previousShortRetiredOn ≠ null and previousShortRetiredOn ≥ leapsFillDate
          leaps           otherwise
  ```

  A tie goes to the previous short because its message names the date. A fill on the floor date is
  accepted. Correcting to the shown date always clears the error. US-120 reuses this helper with its
  own messages.

- US-101's inline rules became named constants: `SHORT_STRIKE_NOT_ABOVE_LONG`,
  `FILL_DATE_IN_FUTURE`, `EXPIRED_CONTRACT` and `LEAPS_AFTER_SHORT`. `pmccCrossLegIssues` uses them
  too, with unchanged codes and messages. The new rules are `SHORT_CALL_ALREADY_OPEN`,
  `exceedsLeapsContracts(n)` and `beforePreviousShortRetired(date)`. The comparator message stays
  US-102's `SHORT_NOT_BEFORE_LONG`.

### Ledger projection

`projectPmccLedger({ ledger, leapsContracts, longStrike, contributions })` in
`src/main/core/costbasis.ts` adds contributions to the ledger's dollar totals and derives every
other figure through `ledgerFromTotals`. `calculatePmccLedger` is refactored onto `ledgerFromTotals`
too, and its output is unchanged:

```text
leapsCostTotal'    = leapsCostTotal    + Σ LONG  contributionDollars
shortCreditsTotal' = shortCreditsTotal + Σ SHORT contributionDollars
```

Working in 4-dp dollars is exact, so the preview equals the snapshot the service then writes, for
any contracts and fees. A property test checks `project(calculate(a), b) == calculate(a ++ b)`.

### Service

`sellPmccShortPosition(db, positionId, payload, { today })` is in
`src/main/services/sell-pmcc-short-position.ts`, modelled on the short-roll service. The handler
passes `today = etDateOf(getCurrentDate())`, the Eastern day `positions:get` uses, and an omitted
`fillDate` defaults to it. The flow:

1. `loadPmccRollContext` reads the live LEAPS (`openLegs.long`, the latest roll's `ROLL_TO`) and the
   open short.
2. `lastShortRetiredOn(legs)` finds the floor date. `sellPmccShort` runs inside
   `logPmccRollRejection`.
3. One `db.transaction` calls `insertLegRow` for the `SHORT_CALL_OPEN` SELL CALL, then
   `appendPmccSnapshot(… 'PMCC_SHORT_OPEN', eventDate: fillDate …)`.
4. `nextPmccCycleNumber(legs)` is the count of `SHORT_CALL_OPEN` legs + 1.

Nothing about the LEAPS is accepted from the renderer. If the snapshot write fails, the leg is
rolled back too; e2e simulates this with a SQLite trigger. Both helpers live in
`src/main/services/pmcc-ledger.ts`. `lastShortRetiredOn` reads `SHORT_CALL_EXPIRED`,
`SHORT_CALL_CLOSE` and `SHORT_CALL_ASSIGNED` legs only, never `LEAPS_CLOSE` or a short-roll
`ROLL_FROM`.

### Renderer

- **Entry point.** `PositionDetailActions` shows `Sell Short Call →` (`sell-pmcc-short-btn`) when
  `phase === 'PMCC_OPEN'`, the LEAPS is open and no short is open. `Roll Short Call →` shows when a
  short is open. The phase check is required because US-120 keeps `pmccOpenLegs` non-null on a
  closed PMCC. `usePositionDetailSheets` gains the `'pmccSellShort'` sheet, and `PositionDetailPage`
  mounts it under the same condition.
- **Coverage label.** `pmccCoverageLabel({ shortCount, shortContracts, leapsContracts })` in
  `src/renderer/src/lib/pmcc-coverage.ts` returns `LEAPS open · no short call`,
  `LEAPS + short call open` or `… · 1 of 3 covered`. It feeds `PhaseBadge`'s label on the detail
  header (in `PMCC_OPEN` only) and the positions-list card's state line. The card's coverage line
  drops its partial branch. US-119 reuses the helper.
- **Sheet.** `SellPmccShortSheet` uses `PmccRollSheetDialog`, which gains an optional `width`. It
  holds `SellPmccShortForm`, made of `SellShortCoverageCard`, `PmccLegSection` with a Contracts
  child, `SellPmccShortPreview` and a `Cancel` / `Record Short Call` footer, then shows
  `SellPmccShortSuccess` (`PMCC updated`, `Cycle N opened`). It uses `useSellPmccShortForm`
  (`mode: 'onChange'`) and `useRollSheetSubmit`. `today` is `newYorkToday()`.
- **Section reuse.** `PmccLegSection` is generalised with optional props instead of being copied:
  `ticker`, `bounds`, `fillLabel`, `pairRule` and `children`. Its props are a `form: 'entry' |
'sell'` union, and the sell form keeps the `short.*` field paths.
- **Bounded chain.** `ShortCallChainBounds { expirationBefore, strikeAbove }` is optional on
  `chainWindow`, `filterCallChain` and `useCallChain`, and is part of the query key. The request
  window is clamped to the day before the LEAPS. Results that fail `shortExpiresBeforeLeaps` or
  `shortStrikeAboveLeaps` are dropped, including the selected contract.
- **Preview.** `sellPmccShortPreview` in `src/renderer/src/lib/pmcc-sell-short.ts` takes "from" =
  `detail.pmccLedger` and "to" = `projectPmccLedger` over `{ side: 'SHORT', cashPerShare: −price,
contracts, fees }`. The credit line is gross, and fees appear only in the basis.
- **Strike line.** The line is green `+$X above`, or the advisory when
  `pmccStrikeShortfall(strike, effectiveAfter)` is non-null. The advisory sentence is shared with
  US-104 through `shortfallWarningText({ …, event: 'roll' | 'sale' })` in `pmcc-roll.ts`. The
  `'roll'` sentence is unchanged byte for byte.
- **Form schema.** `sellPmccShortSchema(ctx)` in `src/renderer/src/schemas/sell-pmcc-short.ts` reuses
  `pmccLegSchema` and runs `pmccSubsequentShortIssues` in `superRefine`. `SELL_SHORT_FORM_FIELDS`
  routes server field errors. Contracts default to the LEAPS count, the fill date to today and fees
  to `0.00`.

### Logging

- INFO `pmcc_short_call_sold` with `positionId`, `cycleNumber`, `contracts` and `basisPerShare`.
- INFO `pmcc_basis_recalculated` from `appendPmccSnapshot`.
- INFO `pmcc_sell_short_rejected` with `code` and `field`.
- DEBUG the payload, the comparator inputs, the floor dates and the projected basis.

### E2e

`e2e/pmcc-sell-short.spec.ts` seeds US-109's Background without cycle 9 through
`_test:pmcc-seed-position`. Every date is shifted by `Δ = T − 2027-07-23`, where `T` is the run day
in New York, so the day counts and money figures stay literal. The app runs on the real clock with
no `WHEELBASE_FAKE_NOW`, because the sheet computes DTE, the default fill date and the chain window
in the renderer. Seeding the LEAPS-only state means no test depends on US-119's UI. The bypass and
already-open scenarios call `window.api.sellPmccShort`, assert the envelope and count rows with
`sqlite3`. The shape rejections are entered in the sheet and then re-submitted through the real
channel.

### Worked figures

The Background starts from basis `8.5000`, effective share cost `93.5000` and 62.2% recovered:

| Case                       | Entry                      | Basis after | Effective after | Recovered | Strike line           |
| -------------------------- | -------------------------- | ----------- | --------------- | --------- | --------------------- |
| Sell the next short        | $118 · $1.95 · 1 · $0      | `6.5500`    | `91.5500`       | 70.9%     | `+$26.45 above`       |
| Below the line (XYZ 86.50) | $90 · $1.50 · 1 · $0       | `7.0000`    | `92.0000`       | 68.9%     | shortfall `2.0000`    |
| Fees                       | $118 · $1.95 · 1 · $1.00   | `6.5600`    | `91.5600`       | 70.8%     | `+$26.44 above`       |
| Partial, 3 LEAPS           | $118 · $1.95 · 1 of 3 · $0 | `7.8500`    | `92.8500`       | 65.1%     | `+$25.15 above`; note |

At the line (strike = effective share cost after), the preview shows a green `+$0.00 above`.

### Deliberate limits

- **One open short per PMCC** in v1. This prevents laddering shorts across uncovered contracts, and
  the partial note says so.
- **An already-expired contract is rejected.** Allowing it is recorded as a possible later option.
- **Contracts, fill date and fees are inputs**, although the mockup shows them read-only.
- **US-119 is the production path to the LEAPS-only state.** It must write `SHORT_CALL_EXPIRED` with
  `fill_date` = the short's expiration and `SHORT_CALL_CLOSE` with `fill_date` = the buyback date.
  Until it lands, users reach the state only through US-111's unbuilt cover-and-keep path.
- **Not done here:** rewriting `pmccPostRollEffectiveCost` / `pmccLeapsPostRoll` over
  `projectPmccLedger`, and US-118's action map. `PHASE_LABEL.PMCC_OPEN` stays in place for the list.
  `rollPmccShortCall`'s `no_open_short_call` and this story's `short_call_already_open` are mirror
  guards, kept separate.

## Architecture decisions

Recorded in this story:

- **`PMCC_OPEN` stays the only open PMCC phase.** Coverage is derived from the open legs. A
  LEAPS-only phase would mean migrating every PMCC row, writing the phase in US-104/105/119 and
  adding entries to every `Record<WheelPhase, …>` map, all for a fact the legs already carry. US-107
  had rejected it too. This retires the `PMCC_LEAPS_ONLY` reservation in
  [pmcc-phase-and-leg-role-names](../architecture/02-adrs/pmcc-phase-and-leg-role-names.md).
- **One shared rule list, `pmccSubsequentShortIssues`, serves engine and form.** Each message has one
  home, and US-102's message is never re-spelled. Calling `pmccCrossLegIssues` with a synthetic long
  leg was rejected. This extends
  [pmcc-validation-pure-engine-mirrored-by-form-schema](../architecture/02-adrs/pmcc-validation-pure-engine-mirrored-by-form-schema.md).
- **The fill-date floor is the later of the last retired short and the live LEAPS fill.** The rule
  reports only the binding one. US-105's `latestFillDate` was rejected because its message names
  neither cause.
- **Dates are judged against the Eastern day of the injected clock**, not `localToday()`, which can
  disagree with the renderer near midnight.
- **The preview projects through the new pure `projectPmccLedger`** over dollar totals. The roll
  helpers' per-share rebuild and a new IPC read per keystroke were rejected. See
  [pure-pmcc-ledger-engine](../architecture/02-adrs/pure-pmcc-ledger-engine.md).
- **`PmccLegSection` is generalised, not copied.** A generic path-prefix version was rejected, since
  RHF `Path<T>` over a prefix forces casts.
- **The chain is bounded by the live LEAPS on both the request and the result**, so the picker can
  never offer a contract the rules reject.
- **The advisory reuses US-104's threshold and wording.** A threshold against the pre-sale cost was
  rejected, because the sell and roll sheets would disagree about the same strike. See
  [soft-client-side-warnings](../architecture/02-adrs/soft-client-side-warnings.md).
- **Money crosses the IPC as numbers, rounded to 4 dp in the service**, as on every PMCC channel. The
  story's "4-dp strings" were rejected. Range checks are left to the engine so a bypass gets the
  domain message. See [zod-payload-validation](../architecture/02-adrs/zod-payload-validation.md).
- **One shared `pmccCoverageLabel` drives the header and the card.** Before this story, a LEAPS-only
  detail page wrongly read `LEAPS + short call open`.
- **Header gating requires `PMCC_OPEN` as well as the open legs.** See
  [action-buttons-phase-gated](../architecture/02-adrs/action-buttons-phase-gated.md).
- **E2e runs on the real clock with the Background shifted to the run day.**
- **The bypass and already-open scenarios go through the real IPC.**

Existing decisions this story builds on:

- [pmcc-snapshot-single-writer-in-caller-transaction](../architecture/02-adrs/pmcc-snapshot-single-writer-in-caller-transaction.md).
- [pmcc-contributions-by-role-and-action](../architecture/02-adrs/pmcc-contributions-by-role-and-action.md):
  the new leg reads as `{ side: 'SHORT', cashPerShare: −fillPrice }`.
- [append-only-cost-basis-snapshots](../architecture/02-adrs/append-only-cost-basis-snapshots.md).
- [storage-failure-e2e-via-sqlite-trigger](../architecture/02-adrs/storage-failure-e2e-via-sqlite-trigger.md).
- [react-hook-form-zod](../architecture/02-adrs/react-hook-form-zod.md).
- [ipc-envelope-contract](../architecture/02-adrs/ipc-envelope-contract.md).

See [domain/wheel-lifecycle](../domain/wheel-lifecycle.md) and
[domain/cost-basis](../domain/cost-basis.md) for the phase and ledger rules in context.

## Contracts touched

- **`positions:sell-pmcc-short` (new).** The payload is `SellPmccShortPayloadSchema`: `positionId`,
  `strike`, `expiration`, `contracts`, `fillPrice`, `fillDate?` and `fees` (default 0). Money and
  contracts are plain `z.number()`. Success returns `SellPmccShortResult`:
  - `position`, with phase `PMCC_OPEN`;
  - `shortLeg`, US-101's `CreatePmccPositionResult['shortLeg']`;
  - `snapshot`, the `PMCC_SHORT_OPEN` row;
  - `ledger`, a `PmccLedgerWithStrike`;
  - `cycleNumber`.

  Errors are the 13 engine rules plus `not_found`, `no_active_leg`, Zod issues and `internal_error`.
  Only the first failure is returned, and nothing is written on any error. The preload exposes it
  as `sellPmccShort`, with the adapter in `api/positions.ts` and the hook `useSellPmccShort`. See
  [contracts/ipc-handlers](../contracts/ipc-handlers.md) and
  [contracts/zod-schemas](../contracts/zod-schemas.md).

- **Schema.** No migration. There are new row conventions on `legs` (a subsequent
  `SHORT_CALL_OPEN`) and `cost_basis_snapshots` (the first production `PMCC_SHORT_OPEN` writer).
  `positions` is untouched. See [schema/tables](../schema/tables.md).

## Source files

- **Core:**
  - `src/main/core/lifecycle.ts` (`sellPmccShort`)
  - `src/main/core/pmcc-rules.ts` (`pmccSubsequentShortIssues`, `pmccFillDateFloor`, rule
    constants)
  - `src/main/core/costbasis.ts` (`projectPmccLedger`, `ledgerFromTotals`)
- **Schemas and IPC:** `src/main/schemas.ts` (`SellPmccShortPayloadSchema`),
  `src/main/ipc/positions.ts`
- **Services:**
  - `src/main/services/sell-pmcc-short-position.ts`
  - `src/main/services/pmcc-ledger.ts` (`lastShortRetiredOn`, `nextPmccCycleNumber`)
  - `src/main/services/create-pmcc-position.ts`
  - `src/main/services/test-fixtures/pmcc-legs.ts`
- **Preload:** `src/preload/index.ts`, `src/preload/index.d.ts`
- **Renderer:**
  - `src/renderer/src/api/positions.ts`
  - `src/renderer/src/components/SellPmccShortSheet.tsx`, `SellPmccShortForm.tsx`,
    `SellPmccShortPreview.tsx`, `SellPmccShortSuccess.tsx`, `SellShortCoverageCard.tsx`,
    `PmccLegSection.tsx`, `PmccEntryForm.tsx`, `PmccRollSheetDialog.tsx`,
    `RollPmccShortCallForm.tsx`, `PositionDetailActions.tsx`
  - `src/renderer/src/hooks/useSellPmccShort.ts`, `useSellPmccShortForm.ts`, `useCallChain.ts`
  - `src/renderer/src/lib/pmcc-coverage.ts`, `pmcc-sell-short.ts`, `pmcc-entry.ts`, `pmcc-roll.ts`,
    `pmcc-card-display.ts`, `ipc-field-errors.ts`
  - `src/renderer/src/schemas/sell-pmcc-short.ts`, `src/renderer/src/schemas/pmcc-entry.ts`
  - `src/renderer/src/pages/PositionDetailPage.tsx`,
    `src/renderer/src/pages/usePositionDetailSheets.ts`
  - `src/renderer/src/test-fixtures/pmcc-sell-short.ts`
- **E2E:**
  - `e2e/pmcc-sell-short.spec.ts`, which covers all 12 scenarios in 20 tests
  - `e2e/pmcc-sell-short-helpers.ts`, `e2e/dates.ts`, `e2e/pmcc-helpers.ts`,
    `e2e/pmcc-timeline-helpers.ts`, `e2e/pmcc-position-card.spec.ts`

Sources: [extract: us-115](../.extracts/us-115.md), `plans/us-115/`.

Related stories:

- [us-101](./us-101-open-pmcc-position.md): the picker, leg section and cross-leg rules reused here.
- [us-102](./us-102-pmcc-expiration-safety.md): the comparator. Its deferred S5/S6 scenarios are
  closed here.
- [us-103](./us-103-pmcc-cost-basis.md): the ledger and `appendPmccSnapshot`.
- [us-104](./us-104-roll-pmcc-short-call.md): the advisory wording and the roll-service pattern.
- [us-105](./us-105-roll-pmcc-leaps.md): the LEAPS roll that makes the live LEAPS differ from the
  entry.
- [us-107](./us-107-pmcc-leaps-roll-window-alert.md): first rejected a LEAPS-only phase.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
