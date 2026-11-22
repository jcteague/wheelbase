# Research: US-115 — Sell a subsequent short call against an open LEAPS

Story: Linear [OPT-23](https://linear.app/optionswheel/issue/OPT-23) (`US-115`). Linear is the
source; there is no story file. The issue has no comments (read 2026-11-22). Mockup:
`mockups/epic-09-pmcc-position-detail.mdx` — `SellShortSheet`, presets `sell-short` (the sheet over
the LEAPS-only page, 2027-07-23) and `healthy` (the state it produces).

## What the code already provides

| Need                                  | Where it is                                                                                                                                                                                                                                                                         | Notes                                                                                                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The one PMCC phase                    | `WheelPhase` `PMCC_OPEN`, `PmccPhase` in `src/main/core/types.ts`                                                                                                                                                                                                                   | No `PMCC_LEAPS_ONLY`; the spec reserves the name only (`docs/spec/domain/wheel-lifecycle.md` § Phases)                                                                                             |
| The roles this story writes and reads | `LegRole` `SHORT_CALL_OPEN` (write); `SHORT_CALL_EXPIRED`, `SHORT_CALL_CLOSE`, `SHORT_CALL_ASSIGNED` (read for the fill-date floor)                                                                                                                                                 | All six PMCC roles already exist; nothing is added to the enum                                                                                                                                     |
| The snapshot trigger                  | `PmccTriggerEvent` `PMCC_SHORT_OPEN` in `src/main/schemas.ts`                                                                                                                                                                                                                       | Already in the enum (used by the `_test:pmcc-record-leg-event` seam); no production writer yet                                                                                                     |
| "Is a short call open?"               | `pmccOpenLegs(legs)` → `{ long, short: PmccShortLeg \| null }`, `currentShortCallLeg`, `currentLeapsLeg` in `src/main/services/pmcc-ledger.ts`; on `positions:get` as `pmccOpenLegs`                                                                                                | Replays the legs; a closing role (`SHORT_CALL_CLOSING_ROLES`) ends the short. This is the live-pair lookup both roll services use                                                                  |
| The live LEAPS                        | `loadPmccRollContext(db, positionId)` → `{ detail, openLegs }` in `src/main/services/pmcc-roll-record.ts`                                                                                                                                                                           | `openLegs.long` is the `ROLL_TO` of the latest LEAPS roll, so its expiration is the live one (the bypass scenario)                                                                                 |
| Rejection logging                     | `logPmccRollRejection(positionId, event, fn)` in `pmcc-roll-record.ts`                                                                                                                                                                                                              | Logs a `ValidationError` at INFO and rethrows                                                                                                                                                      |
| The US-102 comparator                 | `shortExpiresBeforeLeaps(shortExpiration, longExpiration)` and `SHORT_NOT_BEFORE_LONG` in `src/main/core/pmcc-rules.ts`                                                                                                                                                             | Message `Short call must expire before the LEAPS call.`, code `short_not_before_long`                                                                                                              |
| The US-101 strike rule                | `shortStrikeAboveLeaps(shortStrike, longStrike)` in `pmcc-rules.ts`; its `{ code: 'strike_not_above_long', message }` is **inline** inside `pmccCrossLegIssues`                                                                                                                     | Story: extract it now (US-105 needs it too). `cannot_be_future`, `expired_contract` and `long_after_short` are inline there as well                                                                |
| Shared rule shapes                    | `PmccIssue<F>`, `issueIf`, `EXPIRATION_NOT_AFTER_FILL`, `PmccFilledLegTerms`, `PmccLegTerms`                                                                                                                                                                                        | The engine throws the first issue; the form schema reports the first issue per field                                                                                                               |
| Field-level engine helpers            | `requirePositiveWholeContracts`, `requirePositiveFillPrice`, `requireNonNegativeFees`, `requirePositiveStrike`, `requirePmccOpenPhase`, `throwIssue` in `src/main/core/lifecycle.ts`                                                                                                | First four are typed on `PmccField`; widen to accept this story's field type                                                                                                                       |
| The cost-basis engine (US-103)        | `calculatePmccLedger`, `PmccContribution`, `PmccLedgerResult`, `PmccLedgerWithStrike`, `contributionDollars` in `src/main/core/costbasis.ts`                                                                                                                                        | Basis, effective share cost (`basis + longStrike`) and premium recovered (`credits ÷ LEAPS cost × 100`) all come from it                                                                           |
| The one snapshot writer               | `appendPmccSnapshot(db, positionId, { triggerEvent, eventDate, now })` in `pmcc-ledger.ts`                                                                                                                                                                                          | Re-reads legs inside the caller's transaction; logs `pmcc_basis_recalculated` at INFO                                                                                                              |
| Leg insert                            | `insertLegRow(db, record)` in `src/main/services/leg-rows.ts`                                                                                                                                                                                                                       |                                                                                                                                                                                                    |
| Roll numbering precedent              | `nextPmccRollNumber(legs, side)` in `pmcc-ledger.ts`                                                                                                                                                                                                                                | Model for `nextPmccCycleNumber`                                                                                                                                                                    |
| Eastern day of an injected clock      | `etDateOf` (`src/main/core/trading-calendar.ts`); `registerPositionsHandlers(db, { getCurrentDate })` in `src/main/ipc/positions.ts`; `fakeClock?.now` wired in `src/main/index.ts`                                                                                                 | `positions:get` already uses it (US-109)                                                                                                                                                           |
| US-101's **Sell short call** section  | `PmccLegSection` (`leg="short"`, title `Sell short call`) in `src/renderer/src/components/PmccLegSection.tsx`, rendered by `PmccEntryForm.tsx`                                                                                                                                      | Bound to `useFormContext<PmccEntryFormValues>()`; reads the form's `ticker` and `contracts`; fill label `Premium / share`; fill blur triggers `__pair__`                                           |
| The picker                            | `CallContractPicker.tsx`, `useCallChain` (`src/renderer/src/hooks/useCallChain.ts`), `filterCallChain`, `chainWindow`, `strikeBounds`, `SHORT_PRESET`, `CHAIN_NOTICE_COPY` in `src/renderer/src/lib/pmcc-entry.ts`                                                                  | `SHORT_PRESET` is the 20–45 DTE, Δ 0.25–0.35 band; `CHAIN_NOTICE_COPY.unavailable` is the AC's `Quotes unavailable. Enter your filled trade manually.`; no LEAPS bound exists yet                  |
| The leg's form schema                 | `pmccLegSchema`, `positiveWholeSchema`, `positiveFillSchema`, `required` (module-private) in `src/renderer/src/schemas/pmcc-entry.ts`                                                                                                                                               | Messages `Contracts must be a positive whole number.`, `Actual fill price must be greater than zero.`, `Fees cannot be negative.`                                                                  |
| The US-104 advisory                   | `pmccStrikeShortfall(strike, effectiveAfter)` in `src/renderer/src/lib/pmcc-roll.ts`; its sentence is inline JSX in `RollPmccShortCallForm.tsx`                                                                                                                                     | `Short strike $X is below your effective share cost of $Y after this roll. If assigned, covering from the LEAPS realizes roughly $Z per share of loss. You can still record it.`                   |
| Sheet frame, submit, error routing    | `PmccRollSheetDialog` (width 440), `useRollSheetSubmit`, `applyIpcFieldErrors`, `usePositionMutation`, `SAVE_FAILED` pattern in `RollPmccShortCallSheet.tsx`                                                                                                                        | US-101's sheet is 460 (`NewPositionSheet`)                                                                                                                                                         |
| New York calendar day in the renderer | `newYorkToday()` in `src/renderer/src/lib/dates.ts`                                                                                                                                                                                                                                 | The roll sheets' default `today`                                                                                                                                                                   |
| Header actions                        | `PositionDetailActions.tsx` (props `hasOpenShortCall`, `hasOpenLeaps`), `usePositionDetailSheets.ts` (one `RollSheet` slot), `PositionDetailPage.tsx`                                                                                                                               | US-118's action map does not exist (Backlog); the button goes here                                                                                                                                 |
| Coverage state copy                   | Private `stateLabel(shortCount)` in `src/renderer/src/lib/pmcc-card-display.ts`: `LEAPS open · no short call` / `LEAPS + short call open`; `coverage(legs)`: `1 of 3 covered`                                                                                                       | The detail header's `PhaseBadge` shows `PHASE_LABEL.PMCC_OPEN` (`LEAPS + short call open`) **even when no short is open** — a LEAPS-only detail page currently misreads                            |
| Previous cycle's outcome and date     | `positions:get` → `pmccTimeline.cycles` (US-109); `PmccCycle` with `status: 'ENDED'`, `outcome`, `endedOn`, `number`; `outcomeLabel` in `src/renderer/src/lib/pmcc-timeline-rows.ts`                                                                                                | `Expired worthless` / `Closed early` / `Assigned`                                                                                                                                                  |
| Cycle numbering                       | US-109 makes a cycle from each `SHORT_OPEN` event (a `SHORT_CALL_OPEN` leg); a short roll's `ROLL_TO` is not one                                                                                                                                                                    | The new leg starts cycle N + 1 with no extra data                                                                                                                                                  |
| Seed seam                             | `_test:pmcc-seed-position` (`seedPmccPosition` in `src/main/services/test-pmcc-seed.ts`), `window.api.testPmccSeedPosition`                                                                                                                                                         | Writes legs exactly as given, no snapshot, no validation — builds the LEAPS-only state without US-119                                                                                              |
| e2e building blocks                   | `e2e/pmcc-timeline-helpers.ts` (`BACKGROUND`, `backgroundLegs`, `VARIANTS` — module-private today), `e2e/pmcc-helpers.ts` (`launchPmcc`, `spyOnIpcChannels`, `invokedIpcChannels`, `sqlite`, `tableCount`, `occSymbol`), `e2e/helpers.ts` (`reachHoldingSharesState`, `selectDate`) | Storage failure is simulated with a `BEFORE INSERT ON cost_basis_snapshots` trigger (`open-pmcc-position.spec.ts`, `pmcc-cost-basis.spec.ts`); chain failure with `FAKE_MARKET_DATA_ERROR=unknown` |

## What does not exist

- **No engine, service, schema or channel for a subsequent short.** `openPmcc` requires both legs
  with equal contracts; nothing records a lone `SHORT_CALL_OPEN` against an existing LEAPS.
- **No way to filter the chain by the LEAPS.** `useCallChain` bounds only by DTE band, delta band
  and the underlying price.
- **No projection over an existing ledger.** The roll sheets rebuild one from per-share figures
  (`pmccPostRollEffectiveCost`, `pmccLeapsPostRoll`), which drops the LEAPS cost the
  premium-recovered figure needs and rounds through 4-dp per-share values.
- **No production path to the LEAPS-only state.** US-119 (retire the short) is unbuilt; the state
  is reachable today only through US-111's cover-and-keep (also unbuilt) or the seed seam.
- **The renderer clock is not pinnable in e2e.** `WHEELBASE_FAKE_NOW` moves the main process only;
  `useCallChain`, `computeDteFromInput` and `newYorkToday` read the real clock.

## Cross-story conventions (shared with US-119 and US-120, planned in parallel)

Verified in code, not assumed:

1. **One open PMCC phase.** The code already decides this. `rollPmccShortCall` and
   `rollPmccLeaps` take `openShort: … | null` ("`null` when the PMCC holds only its LEAPS"), US-104
   added `pmccOpenLegs` to `positions:get` because "no phase yet distinguishes 'PMCC with an open
   short'", US-107's ADR rejected "a new LEAPS-only phase", and US-108's card derives
   `LEAPS open · no short call` from the open short-leg count. This plan keeps `PMCC_OPEN` and
   derives coverage from `pmccOpenLegs.short`. The spec's reservation of `PMCC_LEAPS_ONLY` for
   US-115/US-119 is not taken up; `/update-spec` should drop it.
2. **Terminal short legs.** The fill-date floor is the latest `fill_date` among
   `SHORT_CALL_EXPIRED`, `SHORT_CALL_CLOSE` and `SHORT_CALL_ASSIGNED` legs — the same set
   `currentShortCallLeg` treats as closing. US-119 must write `SHORT_CALL_EXPIRED` with
   `fill_date` = the short's expiration date (as the US-109 seed does) and `SHORT_CALL_CLOSE` with
   `fill_date` = the buyback date.
3. **The detail header reads coverage from open legs.** This story moves `stateLabel` and the
   card's `N of M covered` text out of `pmcc-card-display.ts` into
   `src/renderer/src/lib/pmcc-coverage.ts` as
   `pmccCoverageLabel({ shortCount, shortContracts, leapsContracts })`: `LEAPS open · no short
call`, `LEAPS + short call open`, or `LEAPS + short call open · 1 of 3 covered` when the short
   covers fewer contracts than the LEAPS. `PositionDetailActions` passes it to `PhaseBadge`'s
   `label` for an open PMCC and the positions-list card uses it for its state line, so both read
   the same `N of M covered`. Whichever of US-115 / US-119 lands first creates it; the other
   reuses it.
4. **Header gating.** `Sell Short Call →` shows when `phase === 'PMCC_OPEN' && hasOpenLeaps &&
!hasOpenShortCall`; `Roll Short Call →` (and US-119's retire actions) when `hasOpenShortCall`.
   The phase check is required, not belt-and-braces: US-120 keeps `pmccOpenLegs` non-null on a
   closed PMCC (`PMCC_CLOSED`, LEAPS sold), so the legs alone would still offer this action. A
   sold LEAPS must never count as open on any surface this story adds (options-expert review,
   cross-story fixes).
5. **One fill-date floor helper.** `pmccFillDateFloor({ previousShortRetiredOn, leapsFillDate })`
   in `src/main/core/pmcc-rules.ts` picks the binding floor and breaks a tie toward the previous
   short (ADR below). US-120's LEAPS sale reuses it, with `lastShortRetiredOn(legs)` from
   `pmcc-ledger.ts`, so both stories show the previous-short message on a tie.

## Architecture Decisions

### ADR: `PMCC_OPEN` stays the only open PMCC phase; coverage is derived from open legs

- **Decision:** `sellPmccShort` requires `PMCC_OPEN` and `openShort === null`, and returns
  `{ phase: 'PMCC_OPEN' }`. The service leaves the `positions` row untouched. "LEAPS open · no
  short call" and "LEAPS + short call open" are labels computed from `pmccOpenLegs.short`
  (`pmccCoverageLabel`), not phases.
- **Why:** The code already answers "is a short open?" by replaying legs (US-104, US-105, US-106,
  US-107, US-108), and US-107 rejected a LEAPS-only phase. Adding one here would force a migration
  of every existing PMCC row, a phase write in US-104/105/119, and new entries in every
  `Record<WheelPhase, …>` map, for a fact the legs already carry. The shared convention for
  US-115/119/120 is the same.
- **Alternatives considered:** Add `PMCC_LEAPS_ONLY` as the spec reserves and as the story's
  Technical Notes word it ("requires the LEAPS-only phase … returns the LEAPS-plus-short phase")
  — rejected for the reasons above; Open Question 3 (resolved: kept).

### ADR: One shared rule list, `pmccSubsequentShortIssues`, for the engine and the form

- **Decision:** `pmccSubsequentShortIssues(input)` in `src/main/core/pmcc-rules.ts` returns every
  broken cross-field rule as `PmccIssue<PmccSubsequentShortField>[]`, in a fixed order: contracts
  cap → fill date not in the future → fill-date floor → expiration not already past → expiration
  after the fill → US-102 comparator → strike above the LEAPS. `sellPmccShort` throws the first;
  `sellPmccShortSchema(ctx)` reports the first per field. US-101's inline rules become named
  constants (`SHORT_STRIKE_NOT_ABOVE_LONG`, `FILL_DATE_IN_FUTURE`, `EXPIRED_CONTRACT`,
  `LEAPS_AFTER_SHORT`) that `pmccCrossLegIssues` also uses; the comparator's message stays
  US-102's `SHORT_NOT_BEFORE_LONG`.
- **Why:** The established pattern (ADR `pmcc-validation-pure-engine-mirrored-by-form-schema`):
  one home per message, so the bypass rejection and the sheet rejection cannot differ, and US-102's
  message is never re-spelled. Extracting the strike rule is what the story asks for and what
  US-105 needs.
- **Alternatives considered:** Call `pmccCrossLegIssues` with a synthetic long leg (its
  `long_after_short`, net-debit and equal-quantity rules do not apply to a later short) — rejected.
  Duplicate the checks in the form schema — rejected (drift).

### ADR: The fill-date floor is the later of the last retired short and the live LEAPS fill

- **Decision:** The service reads `previousShortRetiredOn = lastShortRetiredOn(legs)` (latest
  `fill_date` of a `SHORT_CALL_EXPIRED` / `SHORT_CALL_CLOSE` / `SHORT_CALL_ASSIGNED` leg, or
  `null`) and passes it with the live LEAPS (`openLegs.long`, including its `fillDate`). One pure
  helper, `pmccFillDateFloor({ previousShortRetiredOn, leapsFillDate })` in
  `src/main/core/pmcc-rules.ts`, returns the binding floor as `PmccFillDateFloor`
  (`{ kind: 'previousShort'; date } | { kind: 'leaps'; date }`): `previousShort` when
  `previousShortRetiredOn !== null && previousShortRetiredOn >= leapsFillDate` (a tie goes to the
  previous short), else `leaps`. The rule reports that one floor: `Fill date cannot be before the
previous short call was retired (YYYY-MM-DD).` for `previousShort`, US-101's `LEAPS must be
acquired no later than the short-call fill.` for `leaps`. A fill on the floor date is accepted.
- **Why:** The story names the previous short's terminal date. The LEAPS floor covers a case the
  story does not: a LEAPS rolled after the last short retired, where a back-dated sale would be
  judged against a LEAPS that was not yet held. Reporting only the binding floor means correcting
  to the shown date always clears the error. On a tie both messages are true; the previous-short
  one is kept because it names the date. US-120 (sell the LEAPS) has the same two floors and
  reuses `pmccFillDateFloor` (with its own messages), so the two stories cannot break a tie
  differently (options-expert review, US-120 Q9). Open Question 5 (resolved: kept).
- **Alternatives considered:** US-105's `latestFillDate(legs)` (`before_last_event`) — rejected:
  its message names neither cause and it would block on unknown-role legs. Previous short only —
  rejected (the rolled-LEAPS case above).

### ADR: The service judges dates against the Eastern day of the injected clock

- **Decision:** `sellPmccShortPosition(db, positionId, payload, { today })`; the IPC handler passes
  `today: etDateOf(getCurrentDate())`, the same clock and day `positions:get` uses. The renderer
  sheet uses `newYorkToday()` for the default fill date and DTE, as the roll sheets do. An omitted
  `fillDate` defaults to `today`.
- **Why:** The story judges dates in America/New_York; `localToday()` (used by
  `createPmccPosition` and the roll services) is the machine's zone and can disagree with the
  renderer near midnight. Injecting `today` also lets service tests use the story's literal dates.
- **Alternatives considered:** `localToday()` like the roll services — rejected for the zone
  mismatch; the siblings are advised to do the same (see "Cross-story conventions").

### ADR: The preview projects the current ledger through a new pure `projectPmccLedger`

- **Decision:** `projectPmccLedger({ ledger, leapsContracts, longStrike, contributions })` in
  `src/main/core/costbasis.ts` adds contributions to the ledger's **dollar totals**
  (`leapsCostTotal`, `shortCreditsTotal`) and derives the rest through the same
  `ledgerFromTotals` helper `calculatePmccLedger` is refactored onto. The sheet's "from" figures are
  `detail.pmccLedger`; the "to" figures are `projectPmccLedger` with the projected leg's
  `legContribution`-shaped `{ side: 'SHORT', cashPerShare: −price, contracts, fees }`.
- **Why:** The story requires the preview to come from US-103's function, called with the
  projected leg. Working from dollar totals is exact (4-dp dollars sum exactly), so the preview
  equals the snapshot the service then writes, for any contracts and fees — a property the test
  can assert as an oracle against `calculatePmccLedger` over all contributions. The roll helpers'
  per-share rebuild loses the LEAPS cost (needed for premium recovered) and rounds.
- **Alternatives considered:** Rebuild from per-share figures as `pmccPostRollEffectiveCost` does
  — rejected (above). Return a projected ledger from a new IPC read — rejected: a round trip per
  keystroke for arithmetic the renderer already has inputs for.

### ADR: Reuse US-101's section by generalising `PmccLegSection`, not by copying it

- **Decision:** `PmccLegSection` gains optional props — `ticker` (overrides the form's `ticker`),
  `bounds: ShortCallChainBounds` (LEAPS expiration and strike), `fillLabel`, `pairRule` (default
  `true`; whether the fill blur re-runs `__pair__`) and `children` (extra fields, used for
  Contracts) — and reads its form through a `PmccLegFormSlice` type derived from
  `PmccEntryFormValues`. The sell-short form's values put the leg at `short` and the quantity at
  `contracts`, so the section's field paths are the same in both sheets. `useCallChain` and
  `filterCallChain` take the optional `bounds`.
- **Why:** The story says to extract the section "rather than copying the picker". Keeping the
  `short.*` paths means the section, its `LegDatePicker` and its `Controller` wiring are untouched;
  only the inputs it read from the entry form become props.
- **Alternatives considered:** A new `ShortCallContractSection` copying the picker, quote strip and
  inputs — rejected by the story. Making `PmccLegSection` generic over a path prefix — rejected:
  RHF `Path<T>` over a generic prefix forces casts for no gain, since both forms can use `short`.

### ADR: The chain is bounded by the live LEAPS on both the request and the result

- **Decision:** With `bounds`, `chainWindow` clamps `expirationTo` to the day before
  `bounds.expirationBefore` when that is earlier than the preset's 45 DTE, and `filterCallChain`
  drops every quote where `!shortExpiresBeforeLeaps(q.expiration, bounds.expirationBefore)` or
  `!shortStrikeAboveLeaps(q.strike, bounds.strikeAbove)`. The kept (selected) contract is not
  exempt from these two filters.
- **Why:** The AC filters the picker to calls expiring before the LEAPS with strikes above it, on
  top of the 20–45 DTE / Δ 0.25–0.35 defaults; using US-101's and US-102's predicates means the
  picker can never offer a contract the rules reject.
- **Alternatives considered:** Filtering in the sheet after the hook — rejected: the request
  window would still fetch (and page through) contracts past the LEAPS.

### ADR: The effective-share-cost advisory reuses US-104's threshold and wording

- **Decision:** The gold advisory shows when `pmccStrikeShortfall(strike, effectiveAfter)` is
  non-null (strike strictly below the effective share cost **after this sale**), with US-104's
  sentence moved to a shared `shortfallWarningText({ strike, effectiveAfter, shortfall, event })`
  in `src/renderer/src/lib/pmcc-roll.ts` (`event: 'roll' | 'sale'`). At or above the line the
  preview shows the green `Strike $118.00 is +$26.45 above your effective share cost` (`+$0.00` at
  the line). The confirm button stays enabled either way. The example (Linear AC corrected): XYZ
  at $86.50, sell the $90.00 call expiring 2027-08-20 at $1.50 → basis 8.50 − 1.50 = 7.00,
  effective share cost after 85.00 + 7.00 = $92.00, strike $2.00 below → `Short strike $90.00 is
below your effective share cost of $92.00 after this sale. If assigned, covering from the LEAPS
realizes roughly $2.00 per share of loss. You can still record it.`
- **Why:** The story says "US-104's wording, reused". The AC's original example ($92.00 at $4.10)
  and the plan's first substitute ($89.00 at $4.10) were both impossible in the market: a call is
  worth at least S − K, so with XYZ near $104.60 neither could trade at $4.10, and the advisory
  can only fire once the stock is below the pre-sale effective share cost ($93.50). At $86.50 a
  28-DTE $90.00 call at $1.50 (Δ ≈ 0.30) is a plausible quote. The mockup uses the same threshold.
- **Alternatives considered:** A threshold against the effective share cost **before** the sale
  ($93.50) — rejected: it would make the sell sheet and the roll sheet disagree about the same
  strike.

### ADR: Wire money as numbers, rounded to 4 dp in the service

- **Decision:** `SellPmccShortPayloadSchema` carries `strike`, `fillPrice` and `fees` as
  `z.number()` and `contracts` as `z.number()` (no `.positive()` / `.int()` in Zod), formatted with
  `money4` in the service.
- **Why:** The story's Technical Notes say "money 4 dp strings", but every PMCC channel
  (`positions:create-pmcc`, `positions:roll-pmcc-short`, `positions:roll-pmcc-leaps`) wires numbers
  and the spec's `ipc-handlers.md` records that convention. Leaving range checks to the engine (as
  `CreatePmccPositionPayloadSchema` does) is what makes a bypassed `0` fill price or `0` contracts
  come back with the AC's domain message on the right field instead of a Zod message.
- **Alternatives considered:** 4-dp strings — rejected for consistency; a mixed convention would be
  the only one in the PMCC surface.

### ADR: E2e runs on the real clock with the Background shifted to the run day

- **Decision:** `e2e/pmcc-sell-short.spec.ts` seeds the US-109 XYZ Background without cycle 9
  through `_test:pmcc-seed-position`, with every date shifted by `Δ = T − 2027-07-23`, where `T`
  is the run day in America/New_York. Day counts (28 DTE, 182 DTE, 7 days uncovered) and every
  money figure are preserved literally; displayed dates are computed with `date-fns` from the same
  shift (`shift('2027-07-16')`). The app launches without `WHEELBASE_FAKE_NOW`.
- **Why:** The sheet computes DTE, the default fill date and the chain window in the renderer,
  which the fake clock does not reach; the US-104/US-105 sheet specs use run-day-relative dates for
  the same reason. Shifting one literal Background keeps the story's numbers and reuses US-109's
  fixture instead of a second copy. Seeding means this story's tests never depend on US-119's UI.
- **Alternatives considered:** Pin the main clock and feed the sheet `pmccTimeline.valuationDate`
  — rejected: it would thread a second "today" through `useCallChain` and `PmccLegSection` (US-101
  code) only for tests. Playwright's `clock` on the Electron context — unproven in this repo.

### ADR: The bypass and already-open scenarios go through the real IPC

- **Decision:** Their e2e tests call `window.api.sellPmccShort` from the page, after seeding, and
  assert the envelope's `field` / `code` / `message` plus `legs` and `cost_basis_snapshots` row
  counts read with `sqlite3`. The four shape rejections are entered in the real sheet and then
  confirmed through the real channel by a direct call with the same values, so the engine (not
  only the form) is shown to reject them.
- **Why:** The story's US-102 handoff requires "the real form, service and IPC — not a mocked
  result".
- **Alternatives considered:** Assert the form error only — rejected; it would not prove the
  service rejects a bypass.

## Open Questions

All resolved after the options-expert review (`options-expert-review.md`), approved by John on
2026-11-22.

1. **The advisory example and wording.** The AC's $92.00 call at $4.10 is above the $89.40 line
   and impossible in the market (see the advisory ADR). **Resolved: options-expert example, John
   approved 2026-11-22; Linear AC corrected.** US-104's threshold and sentence with "sale" for
   "roll"; XYZ at $86.50, the $90.00 call expiring 2027-08-20 at $1.50 → `Short strike $90.00 is
below your effective share cost of $92.00 after this sale. If assigned, covering from the LEAPS
realizes roughly $2.00 per share of loss. You can still record it.`
2. **"Effective share cost if exercised".** The AC names this label; US-103's Cost basis drawer
   labels it `Effective share cost`. Keep US-103's label (labels are out of scope) and assert
   `Effective share cost` = `$91.55`. **Resolved: kept (options-expert review, John approved
   2026-11-22).**
3. **LEAPS-only phase.** The story's Technical Notes speak of a LEAPS-only phase and the spec
   reserves `PMCC_LEAPS_ONLY`. No new phase (ADR above; shared with US-119/US-120). **Resolved:
   kept (options-expert review, John approved 2026-11-22).**
4. **An already-expired contract.** Not in the AC: a back-dated sale whose expiration is before
   today. Rejected with US-101's `Use an unexpired contract for opening a current position.` on
   the expiration, checked before "Expiration must be after the fill date." as US-101 orders them.
   **Resolved: rejection kept (John kept the default, 2026-11-22).** The options-expert leaned
   toward allowing it (journals lag; coherent with the timeline's UNRECORDED state); recorded as
   a possible later option, not v1.
5. **A LEAPS bought after the previous short retired.** The floor is the later of the two dates
   (`pmccFillDateFloor`), reported with US-101's `LEAPS must be acquired no later than the
short-call fill.` when the LEAPS date binds, and with the previous-short message on a tie.
   **Resolved: kept (options-expert review, John approved 2026-11-22).**
6. **No previous cycle.** A LEAPS-only position with no cycle ever sold (imported, or US-111's
   path before any cycle). The coverage card's line reads `No short call has been sold against
this LEAPS yet` (US-109's empty-state copy); the floor is the LEAPS fill date only. **Resolved:
   kept (options-expert review, John approved 2026-11-22).**
7. **Where "1 of 3 covered" is read, and one open short per PMCC.** **Resolved: John approved
   2026-11-22.** `N of M covered` shows on the detail header badge as well as the positions-list
   card, both from `pmccCoverageLabel` (convention 3). The one-open-short-per-PMCC rule stays for
   v1 (John kept the default; the options-expert noted it stops laddering shorts across the
   uncovered contracts), and the sheet's partial note says so: `2 LEAPS contracts remain
uncovered. Only one short call can be open at a time, so they stay uncovered until this one is
retired.`
8. **Mockup vs story on inputs.** The mockup shows contracts, fill date and fees read-only; the
   story's UI Changes make them inputs. Inputs, as the story says. **Resolved: kept
   (options-expert review, John approved 2026-11-22).**
