---
story: us-115
kind: feature
parent: null
topics: [pmcc, cost-basis, wheel-lifecycle, ipc-handlers]
status: planned
---

# Implementation Plan: US-115 — Sell a subsequent short call against an open LEAPS

## Summary

A PMCC whose last short call has been retired gains a `Sell Short Call →` action on its detail
page. It opens a 460px sheet with the open LEAPS as coverage context, the previous cycle's
outcome, US-101's short-call picker bounded by the LEAPS, and a live `After this sale` preview
computed by US-103's ledger. Confirming records one `SHORT_CALL_OPEN` sell leg and one
`PMCC_SHORT_OPEN` snapshot in one transaction; the phase stays `PMCC_OPEN`, and the detail header
now reads coverage from the open legs. Fewer contracts than the LEAPS holds is allowed (partial
coverage); more is rejected. Done means all 12 acceptance scenarios (20 tests with outline rows)
pass end to end, and US-102's two deferred subsequent-short scenarios are proven through the real
form, service and IPC.

## Supporting Documents

Read these before starting implementation:

- **User Story & Acceptance Criteria:** Linear [OPT-23](https://linear.app/optionswheel/issue/OPT-23) (`US-115`). Linear is the source; there is no story file.
- **Mockup:** `mockups/epic-09-pmcc-position-detail.mdx` — `SellShortSheet` (Coverage card, picker caption, fields, `After this sale` card, footer); presets `sell-short` (the sheet over the LEAPS-only page) and `healthy` (the state it produces).
- **Research & Design Decisions:** `plans/us-115/research.md`
- **Data Model & Type Design:** `plans/us-115/data-model.md`
- **API Contracts:** `plans/us-115/contracts/positions-sell-pmcc-short.md`
- **Quickstart & Verification:** `plans/us-115/quickstart.md`

Three points differ from the story's Technical Notes, each an ADR in `research.md` and an Open
Question for John: no LEAPS-only phase (coverage is derived from open legs); money is wired as
numbers, not 4-dp strings; and the below-the-line advisory keeps US-104's threshold and wording,
so the AC's $92.00 example is replaced by a $89.00 one in the tests.

## Prerequisites

Already on `main`, reused by name:

- **US-101** (OPT-7): `PmccLegSection`, `CallContractPicker`, `QuoteStrip`, `LegDatePicker`,
  `useCallChain`, `filterCallChain`, `chainWindow`, `SHORT_PRESET`, `CHAIN_NOTICE_COPY`
  (`src/renderer/src/lib/pmcc-entry.ts`), `pmccLegSchema` (`src/renderer/src/schemas/pmcc-entry.ts`),
  `shortStrikeAboveLeaps` and `pmccCrossLegIssues` (`src/main/core/pmcc-rules.ts`),
  `requirePositiveWholeContracts`, `requirePositiveFillPrice`, `requireNonNegativeFees`,
  `requirePositiveStrike` (`src/main/core/lifecycle.ts`), `insertPmccLeg`'s leg shape
  (`src/main/services/create-pmcc-position.ts`), `CreatePmccPositionResult` (`src/main/schemas.ts`).
- **US-102** (OPT-11): `shortExpiresBeforeLeaps`, `SHORT_NOT_BEFORE_LONG`.
- **US-103** (OPT-9): `calculatePmccLedger`, `PmccContribution`, `PmccLedgerWithStrike`
  (`src/main/core/costbasis.ts`); `appendPmccSnapshot`, `pmccOpenLegs`, `legContribution`,
  `pmccLedgerFromLegs` (`src/main/services/pmcc-ledger.ts`); `PmccCostBasis`.
- **US-104** (OPT-12) / **US-105**: `loadPmccRollContext`, `logPmccRollRejection`
  (`src/main/services/pmcc-roll-record.ts`); `pmccStrikeShortfall` (`src/renderer/src/lib/pmcc-roll.ts`);
  `PmccRollSheetDialog`, `useRollSheetSubmit`, `applyIpcFieldErrors`, `usePositionMutation`;
  `PositionDetailActions` props `hasOpenShortCall` / `hasOpenLeaps`.
- **US-108**: the positions-list card's `N of M covered` (`src/renderer/src/lib/pmcc-card-display.ts`).
- **US-109** (OPT-17): `pmccTimeline` on `positions:get`, `outcomeLabel`, `etDateOf` wired to the
  injected clock in `registerPositionsHandlers`, the `_test:pmcc-seed-position` channel
  (`seedPmccPosition`, `window.api.testPmccSeedPosition`) and the e2e XYZ Background in
  `e2e/pmcc-timeline-helpers.ts`.

**US-119 is blocking in practice, not for the build.** It produces the LEAPS-only state and the
previous short's terminal leg this story starts from; without it, users reach the state only
through US-111's cover-and-keep path. This story does not wait for it: every service and e2e test
seeds the LEAPS-only state directly through `seedPmccPosition` / `_test:pmcc-seed-position`. The
two stories must agree on the terminal-leg dates (`research.md` § Cross-story conventions).

US-118's action map is not built; the header button goes into `PositionDetailActions` directly.
No migration.

## Implementation Areas

### 1. Shared rules — `pmccSubsequentShortIssues` and the extracted US-101 constants

**Files to create or modify:**

- `src/main/core/pmcc-rules.ts` — extract `SHORT_STRIKE_NOT_ABOVE_LONG`, `FILL_DATE_IN_FUTURE`, `EXPIRED_CONTRACT`, `LEAPS_AFTER_SHORT` from `pmccCrossLegIssues`'s inline objects (it uses the constants); add `SHORT_CALL_ALREADY_OPEN`, `exceedsLeapsContracts(n)`, `beforePreviousShortRetired(date)`, the types in `data-model.md` § Type Design and `pmccSubsequentShortIssues(input)`
- `src/main/core/pmcc-rules.test.ts` — extend
- `src/main/core/pmcc-rules.property.test.ts` — extend

**Red — tests to write** (Background context: LEAPS `85.0000 · 2028-01-21 · 1 contract · filled 2027-07-09`, previous short retired `2027-07-16`, today `2027-07-23`):

- valid `118.0000 · 2027-08-20 · 1 · fill 2027-07-23` → `[]`
- contracts `2` → one issue `contracts` / `exceeds_leaps_contracts` / `Cannot sell more short calls than LEAPS contracts held (1).`; with 3 LEAPS contracts, `3` → `[]`, `4` → `(3)` message
- fill `2027-07-24` → `fillDate` / `cannot_be_future`
- fill `2027-07-15` → `fillDate` / `before_previous_short` / `Fill date cannot be before the previous short call was retired (2027-07-16).`; fill `2027-07-16` → `[]`
- LEAPS filled `2027-07-20` (after the retirement) and fill `2027-07-18` → `fillDate` / `long_after_short` and **not** `before_previous_short`; both floors on `2027-07-16` and fill `2027-07-15` → `before_previous_short` only (tie)
- `previousShortRetiredOn: null`, fill before the LEAPS fill → `long_after_short`
- expiration `2027-07-22` with fill `2027-07-20` → `expiration` / `expired_contract` only
- expiration `2027-07-23` with fill `2027-07-23` → `expiration` / `expiration_not_after_fill` / `Expiration must be after the fill date.`
- expiration `2028-01-21` and `2028-02-18` → `expiration` / `short_not_before_long` / `Short call must expire before the LEAPS call.` (the message is `SHORT_NOT_BEFORE_LONG.message`, asserted by identity and by literal)
- strike `85.0000` and `80.0000` → `strike` / `strike_not_above_long` / `Short-call strike must be above the LEAPS strike.`
- issue order: an input breaking contracts, expiration and strike returns them in that order
- every `undefined` value skips only the rules that read it
- regression: `pmccCrossLegIssues` returns the same codes and messages as before for each existing case (existing tests stay unchanged and green)

**Property test** (`src/main/core/pmcc-rules.property.test.ts`, fast-check):

- _Agreement:_ for arbitrary decided inputs, `pmccSubsequentShortIssues` is empty **iff** `contracts ≤ leaps.contracts`, `fillDate ≤ today`, `fillDate ≥ max(floors)`, `expiration ≥ today`, `expiration > fillDate`, `shortExpiresBeforeLeaps(expiration, leaps.expiration)` and `shortStrikeAboveLeaps(strike, leaps.strike)` all hold (an oracle written with `date-fns` / `Decimal`, not string comparison).
- _One floor:_ at most one issue on `fillDate` comes from the floor rules, and correcting the fill date to the date named in a `before_previous_short` message clears it.
- _Fields:_ every issue's `field` is a member of `PmccSubsequentShortField`.

**Green — implementation:**

- Rule order per `data-model.md` § 3, rows 7–13. Floors: `const floor = max(previousShortRetiredOn, leaps.fillDate)`; report `beforePreviousShortRetired` when `previousShortRetiredOn !== null && previousShortRetiredOn >= leaps.fillDate`, else `LEAPS_AFTER_SHORT`.
- Reuse `issueIf`; no logging, no I/O.

**Refactor — cleanup to consider:**

- Move the per-rule `undefined` guards into one `decided(...values)` helper if it shortens both issue functions.
- Keep `PmccRule` module-private; export only the constants.

**Acceptance criteria covered:**

- Reject a short call that breaks the PMCC shape (all four rows); Reject invalid entry (contracts cap, both fill-date rows, expiration row); Reject a bypassed short call (the comparator rule).

### 2. Engine — `sellPmccShort`

**Files to create or modify:**

- `src/main/core/lifecycle.ts` — `SellPmccShortField`, `SellPmccShortInput`, `SellPmccShortAccepted`, `sellPmccShort(input)`; widen the `field` parameter of `requirePositiveWholeContracts`, `requirePositiveFillPrice`, `requireNonNegativeFees`
- `src/main/core/lifecycle.test.ts` — extend
- `src/main/core/lifecycle.property.test.ts` — extend

**Red — tests to write:**

- happy path (Background, `118.0000 · 2027-08-20 · 1 · 1.9500 · 0.0000 · 2027-07-23`) → `{ phase: 'PMCC_OPEN' }`
- partial coverage: 3 LEAPS contracts, `contracts: 1` → accepted
- phase `HOLDING_SHARES` → `__phase__` / `invalid_phase`
- `openShort` non-null → `__root__` / `short_call_already_open` / `This PMCC already has an open short call — roll it instead.`, even when every other field is also invalid
- `contracts` `0`, `-1`, `1.5` → `contracts` / `must_be_positive_integer` / `Contracts must be a positive whole number.`
- `fillPrice` `0.0000` → `fillPrice` / `must_be_positive` / `Actual fill price must be greater than zero.`
- `fees` `-1.0000` → `fees` / `must_be_non_negative`
- `strike` `0.0000` → `strike` / `must_be_positive`
- each Area 1 rule surfaces as a thrown `ValidationError` with the same `field` / `code` / `message`
- ordering: shape checks (rows 3–6) win over the shared rules; `contracts: 0` reports `must_be_positive_integer`, not `exceeds_leaps_contracts`

**Property test** (`src/main/core/lifecycle.property.test.ts`):

- _Phase guard:_ any phase other than `PMCC_OPEN` throws `invalid_phase`, whatever the rest of the input.
- _Open-short guard:_ in `PMCC_OPEN`, a non-null `openShort` always throws `short_call_already_open`.
- _Accepts iff no issues:_ with `PMCC_OPEN`, `openShort: null` and valid shapes, `sellPmccShort` returns `{ phase: 'PMCC_OPEN' }` iff `pmccSubsequentShortIssues` is empty, and otherwise throws exactly its first issue.

**Green — implementation:**

- `requirePmccOpenPhase` → open-short check → shape helpers → `pmccSubsequentShortIssues(...)[0]` through `throwIssue`.

**Refactor — cleanup to consider:**

- `rollPmccShortCall`'s `no_open_short_call` and this story's `short_call_already_open` are mirror guards; leave them separate (different messages and owners), but place them beside each other.

**Acceptance criteria covered:**

- Sell the next short call (engine accept); Reject when a short call is already open; Partial coverage is allowed and stated (contracts below the LEAPS count accepted); the rejection rows of both outlines and the bypass scenario.

### 3. Projection — `projectPmccLedger`

**Files to create or modify:**

- `src/main/core/costbasis.ts` — extract `ledgerFromTotals`, refactor `calculatePmccLedger` onto it, add `PmccLedgerTotals`, `ProjectPmccLedgerInput`, `projectPmccLedger`
- `src/main/core/costbasis.test.ts` — extend
- `src/main/core/costbasis.property.test.ts` — extend

**Red — tests to write** (every figure from `data-model.md` § 5):

- Background ledger (`leapsCostTotal` `2250.0000`, `shortCreditsTotal` `1400.0000`, 1 contract, strike `85.0000`) + `{ side: 'SHORT', cashPerShare: '-1.9500', contracts: 1, fees: '0.0000' }` → `basisPerShare` `6.5500`, `effectiveShareCost` `91.5500`, `premiumRecoveredPercent` `70.8889`
- `$4.10` → `4.4000` / `89.4000`; fees `1.0000` → `6.5600` / `91.5600` / `70.8444`
- 3 LEAPS contracts (`6750.0000` / `4200.0000`), 1 short contract → `7.8500` / `92.8500` / `65.1111`
- no contributions → the input ledger's figures
- existing `calculatePmccLedger` tests unchanged and green

**Property test** (`src/main/core/costbasis.property.test.ts`):

- _Oracle:_ for arbitrary contribution lists `a` and `b`, `projectPmccLedger({ ledger: calculatePmccLedger(a), contributions: b, … })` deep-equals `calculatePmccLedger(a ++ b)`.
- _Order independence:_ projecting `b` then `c` equals projecting `b ++ c`.

**Green — implementation:**

- Sum `contributionDollars` per side onto the two totals; `ledgerFromTotals` does the per-share division and `money4` / percent rounding once. No logging.

**Refactor — cleanup to consider:**

- Check whether `pmccPostRollEffectiveCost` / `pmccLeapsPostRoll` (US-104/105 renderer helpers) can be rewritten over `projectPmccLedger`; note it as follow-up rather than changing US-104/105 here.

**Acceptance criteria covered:**

- Sell the next short call (`$6.55`, `$91.55`, `70.9%`); The preview shows the cash and the new guardrails (every from → to figure); Partial coverage.

### 4. Ledger helpers — `lastShortRetiredOn`, `nextPmccCycleNumber`

**Files to create or modify:**

- `src/main/services/pmcc-ledger.ts` — add both, reading `SHORT_CALL_CLOSING_ROLES` (already there)
- `src/main/services/pmcc-ledger.test.ts` — extend

**Red — tests to write** (legs from `src/main/services/test-fixtures/pmcc-legs.ts`):

- `lastShortRetiredOn`: no closing leg → `null`; Background without cycle 9 → `2027-07-16`; an `SHORT_CALL_CLOSE` on `2027-07-18` after it → `2027-07-18`; a `SHORT_CALL_ASSIGNED` counts; a `LEAPS_CLOSE` and a short-roll `ROLL_FROM` do not
- `nextPmccCycleNumber`: one `SHORT_CALL_OPEN` → `2`; Background without cycle 9 (eight opens, one short roll) → `9`; equals `buildPmccTimeline(...).cycles.length + 1` on the same legs

**Green — implementation:** two pure reductions over the leg list; no I/O.

**Refactor — cleanup to consider:** none expected beyond naming.

**Acceptance criteria covered:**

- Reject invalid entry (the `(2027-07-16)` floor); Sell the next short call (cycle 9).

### 5. Schemas — payload and result

**Files to create or modify:**

- `src/main/schemas.ts` — `SellPmccShortPayloadSchema`, `SellPmccShortPayload`, `SellPmccShortResult`
- `src/main/schemas.test.ts` — extend

**Red — tests to write:**

- a full payload parses; `fees` omitted → `0`; `fillDate` omitted → `undefined`
- `contracts: 0`, `fillPrice: 0` and `strike: 80` all **parse** (range rules belong to the engine)
- `expiration: '2027-13-01'` and a missing `strike` fail with a Zod issue on that path
- type-level: `SellPmccShortResult['snapshot']['triggerEvent']` is `'PMCC_SHORT_OPEN'` (`expectTypeOf`)

**Green — implementation:** per `contracts/positions-sell-pmcc-short.md` § Request and § Response.

**Refactor — cleanup to consider:** none.

**Acceptance criteria covered:** Reject a bypassed short call (the bypass reaches the engine rather than stopping at Zod).

### 6. Service — `sellPmccShortPosition`

**Files to create or modify:**

- `src/main/services/sell-pmcc-short-position.ts` — new
- `src/main/services/sell-pmcc-short-position.test.ts` — new

**Red — tests to write** (`makeTestDb()`, Background seeded with `seedPmccPosition`, `today: '2027-07-23'`; every expected value a literal):

- happy path: returns `cycleNumber` `9`, `ledger.basisPerShare` `6.5500`, `effectiveShareCost` `91.5500`, `premiumRecoveredPercent` `70.8889`, `position.phase` `PMCC_OPEN`; one new leg `SHORT_CALL_OPEN` / `SELL` / `CALL` / `118.0000` / `2027-08-20` / `1` / `1.9500` / fees `0.0000` / `2027-07-23`; one snapshot `PMCC_SHORT_OPEN`, `event_date` `2027-07-23`, `basis_per_share` `6.5500`; the `positions` row unchanged
- `fillDate` omitted → `2027-07-23`
- `getPosition` afterwards: `pmccOpenLegs.short` is the new leg
- live LEAPS: after a seeded LEAPS roll to `85.0000 · 2028-06-16`, a `2028-06-16` short → `short_not_before_long`; a `2028-01-21` short (the _original_ LEAPS date) → accepted
- each rejection writes nothing: open short (full Background) → `short_call_already_open`; contracts `2`; fill `2027-07-15`; expiration `2028-01-21`; strike `85` — leg and snapshot counts unchanged
- storage failure: a `BEFORE INSERT ON cost_basis_snapshots` trigger raising `ABORT` → the call throws and the leg insert is rolled back
- `not_found` for an unknown id; `invalid_phase` for a wheel; logs `pmcc_sell_short_rejected` at INFO on a rejection and `pmcc_short_call_sold` on success (logger spy)

**Green — implementation:**

- `loadPmccRollContext` → `lastShortRetiredOn(detail.legs)` → `sellPmccShort` (inside `logPmccRollRejection(positionId, 'pmcc_sell_short_rejected', …)`) → `db.transaction`: `insertLegRow`, `appendPmccSnapshot(db, positionId, { triggerEvent: 'PMCC_SHORT_OPEN', eventDate: fillDate, now })`, `nextPmccCycleNumber`. Model on `roll-pmcc-short-call-position.ts`.

**Refactor — cleanup to consider:**

- If the leg-record builder matches `insertPmccLeg`'s, extract one `pmccLegRecord(...)` both use.

**Acceptance criteria covered:**

- Sell the next short call; Reject a bypassed short call; Reject when a short call is already open; A failed save leaves the position LEAPS-only; Partial coverage.

### 7. IPC handler, preload and renderer client

**Files to create or modify:**

- `src/main/ipc/positions.ts` — register `positions:sell-pmcc-short` with `registerParsedPositionHandler`, passing `{ today: etDateOf(getCurrentDate()) }`
- `src/main/ipc/positions-sell-pmcc-short.test.ts` — new
- `src/preload/index.ts`, `src/preload/index.d.ts` — `sellPmccShort`
- `src/renderer/src/api/positions.ts` — `sellPmccShort(payload)` with `throwMappedIpcErrors`

**Red — tests to write:**

- the channel is registered; a valid payload → `{ ok: true, … , cycleNumber: 9 }`
- with an injected `getCurrentDate` of `2027-07-24T03:30:00Z` (still 2027-07-23 in New York), a `2027-07-24` fill → `fillDate` / `cannot_be_future`
- rejection envelope `{ ok: false, errors: [{ field: 'expiration', code: 'short_not_before_long', message: 'Short call must expire before the LEAPS call.' }] }`
- a malformed payload → a Zod field error; a thrown non-validation error → `internal_error`

**Green — implementation:** thin handler; no logic beyond parse + one call.

**Refactor — cleanup to consider:** none.

**Acceptance criteria covered:** Reject a bypassed short call; Reject when a short call is already open (both go through the real channel).

### 8. Chain bounded by the LEAPS

**Files to create or modify:**

- `src/renderer/src/lib/pmcc-entry.ts` — `ShortCallChainBounds`; optional `bounds` on `chainWindow` and `filterCallChain`
- `src/renderer/src/lib/pmcc-entry.test.ts` — extend
- `src/renderer/src/hooks/useCallChain.ts`, `useCallChain.test.ts` — pass `bounds` through (and into the query key)

**Red — tests to write:**

- `filterCallChain` with bounds `{ expirationBefore: '2028-01-21', strikeAbove: '85.0000' }` drops an `85.0000` strike, an `80.0000` strike, a `2028-01-21` and a `2028-02-18` expiration; keeps `118.0000 · 2027-08-20`; the kept `keepContractId` is dropped too when it breaks a bound
- `chainWindow(SHORT_PRESET, today, bounds)` with a LEAPS 35 days out → `expirationTo` = the day before the LEAPS; with the LEAPS 182 days out → unchanged (45 DTE)
- no bounds → every existing assertion unchanged

**Green — implementation:** use `shortExpiresBeforeLeaps` and `shortStrikeAboveLeaps` from `src/main/core/pmcc-rules.ts` (the renderer already imports from it).

**Refactor — cleanup to consider:** none.

**Acceptance criteria covered:** The sheet shows the LEAPS as coverage context (picker filter).

### 9. Coverage label and the header action

**Files to create or modify:**

- `src/renderer/src/lib/pmcc-coverage.ts` — new: `pmccCoverageLabel(shortCount)` (moved from `stateLabel` in `pmcc-card-display.ts`, which imports it)
- `src/renderer/src/lib/pmcc-coverage.test.ts` — new
- `src/renderer/src/components/PositionDetailActions.tsx`, `PositionDetailActions.test.tsx` — `PhaseBadge label={pmccCoverageLabel(...)}` for a PMCC; `Sell Short Call →` (`sell-pmcc-short-btn`) and `onSellPmccShort`

**Mockup:** `epic-09-pmcc-position-detail.mdx`, `sell-short` preset header (badge `LEAPS open · no short call`, the action) and `healthy` (badge `LEAPS + short call open`, `Roll Short Call →`).

**Red — tests to write:**

- `pmccCoverageLabel(0)` → `LEAPS open · no short call`; `1`, `3` → `LEAPS + short call open`; the US-108 card tests stay green
- PMCC with LEAPS and no short: badge `LEAPS open · no short call`, `sell-pmcc-short-btn` visible with text `Sell Short Call →`, `roll-pmcc-short-btn` absent, `Roll LEAPS →` present; clicking calls `onSellPmccShort`
- PMCC with an open short: badge `LEAPS + short call open`, no `sell-pmcc-short-btn`
- PMCC with no LEAPS (`hasOpenLeaps` false): no `sell-pmcc-short-btn`
- `HOLDING_SHARES` wheel: `Open Covered Call →` present, no `sell-pmcc-short-btn`, badge from `PHASE_LABEL`

**Green — implementation:** gate on `hasOpenLeaps && !hasOpenShortCall`.

**Refactor — cleanup to consider:** if `PHASE_LABEL.PMCC_OPEN` is now read nowhere for a PMCC detail, leave it (the list still reads it) but comment where coverage comes from.

**Acceptance criteria covered:** Sell the next short call (header reads `LEAPS + short call open` afterwards); Reject a bypassed short call (`LEAPS open · no short call`); The wheel is unchanged.

### 10. Preview arithmetic and advisory text

**Files to create or modify:**

- `src/renderer/src/lib/pmcc-sell-short.ts` — new: `StrikeLine`, `SellPmccShortPreview`, `sellPmccShortPreview(...)`, `PmccEndedCycle`, `lastEndedCycle(timeline)`, `previousCycleLine(cycle, today)`, `coverageCardLine(leaps, dte, delta)`
- `src/renderer/src/lib/pmcc-sell-short.test.ts` — new
- `src/renderer/src/lib/pmcc-roll.ts`, `pmcc-roll.test.ts` — `ShortfallEvent`, `shortfallWarningText(...)`; `RollPmccShortCallForm.tsx` renders it (same output for `'roll'`)

**Mockup:** `SellShortSheet` — Coverage card and `After this sale` card.

**Red — tests to write** (literals from `data-model.md` § 5):

- preview for `$118 · 2027-08-20 · $1.95 · 1` on 2027-07-23: `creditTotal` `195.0000`, `dte` `28`, `from.basisPerShare` `8.5000` → `to.basisPerShare` `6.5500`, effective `93.5000` → `91.5500`, recovered `62.2222` → `70.8889`, `strikeLine` `{ kind: 'margin', margin: '26.4500' }`, `uncoveredContracts` `0`
- `$89 · $4.10` → `{ kind: 'shortfall', shortfall: '0.4000' }`; strike equal to the effective share cost after → `{ kind: 'margin', margin: '0.0000' }`
- 3 LEAPS, 1 contract → `uncoveredContracts` `2`, `to.basisPerShare` `7.8500`
- incomplete draft (no strike, or no price) → `null`
- `shortfallWarningText({ …, event: 'sale' })` → `Short strike $89.00 is below your effective share cost of $89.40 after this sale. If assigned, covering from the LEAPS realizes roughly $0.40 per share of loss. You can still record it.`; `'roll'` → US-104's existing sentence, byte for byte
- `previousCycleLine` for cycle 8 ended `EXPIRED` on `2027-07-16`, today `2027-07-23` → `Cycle 8 expired worthless 2027-07-16 · 7 days uncovered`; `CLOSED` → `closed early`; no ended cycle → `No short call has been sold against this LEAPS yet`
- `coverageCardLine` → `$85.00 · 2028-01-21 · 182 DTE · Δ 0.81`; no delta → `Δ —`

**Green — implementation:** build the projected `PmccContribution` the way `legContribution` would read the leg; call `projectPmccLedger` and `pmccStrikeShortfall`; format with `lib/format.ts`.

**Refactor — cleanup to consider:** keep formatting out of `sellPmccShortPreview` (values only); the card formats.

**Acceptance criteria covered:** The preview shows the cash and the new guardrails; Warn when the strike is below the effective share cost; The sheet shows the LEAPS as coverage context; Partial coverage (`2 LEAPS contracts remain uncovered`).

### 11. Form schema

**Files to create or modify:**

- `src/renderer/src/schemas/pmcc-entry.ts` — export `pmccLegSchema` and `PmccLegFormSlice`
- `src/renderer/src/schemas/sell-pmcc-short.ts` — new: `sellPmccShortSchema(ctx)`, `SellPmccShortFormValues`, `EMPTY_SELL_PMCC_SHORT_DEFAULTS(today, leapsContracts)`, `toSellPmccShortPayload(positionId, values)`
- `src/renderer/src/schemas/sell-pmcc-short.test.ts` — new

**Red — tests to write** (context = Background, today `2027-07-23`):

- defaults: `contracts` `'1'` (the LEAPS count), `short.fillDate` `2027-07-23`, `short.fees` `'0.00'`, empty strike / expiration / price
- the six invalid-entry rows → the AC message on `short.fillPrice`, `contracts`, `contracts`, `short.fillDate`, `short.fillDate`, `short.expiration`
- the four shape rows → the AC message on `short.expiration` / `short.strike`
- only the first issue per field is reported; a mid-edit (empty) field reports only its own `required` message
- `toSellPmccShortPayload` → numbers (`strike: 118`, `fillPrice: 1.95`, `fees: 0`, `contracts: 1`) and ISO dates
- type-level: `SellPmccShortFormValues` is assignable to `PmccLegFormSlice`

**Green — implementation:** reuse `pmccLegSchema` for `short` and `positiveWholeSchema`'s rule for `contracts`; `superRefine` runs `pmccSubsequentShortIssues` and maps `PmccSubsequentShortField` → form path (`contracts` → `contracts`, others → `short.*`).

**Refactor — cleanup to consider:** share the issue-to-path mapper with `schemas/roll-pmcc-short-call.ts` if their shapes match.

**Acceptance criteria covered:** Reject a short call that breaks the PMCC shape; Reject invalid entry.

### 12. `PmccLegSection` reused by both sheets

**Files to create or modify:**

- `src/renderer/src/components/PmccLegSection.tsx` — bind to `useFormContext<PmccLegFormSlice>()`; optional props `ticker`, `bounds`, `fillLabel`, `pairRule`, `children`
- `src/renderer/src/components/PmccLegSection.test.tsx` — extend
- `src/renderer/src/components/PmccEntryForm.tsx` — unchanged call sites (defaults reproduce today's behaviour); `PmccEntryForm.test.tsx` stays green

**Mockup:** `SellShortSheet` picker caption and fields (`Actual sale price / share`, Contracts hint `max N (LEAPS held)`).

**Red — tests to write:**

- with `ticker="XYZ"` and `bounds`, the picker lists `$118.00 · 2027-08-20` and not the `$85.00` strike or ABC rows (mocked `useCallChain` asserted to receive `bounds`)
- `fillLabel="Actual sale price / share"` renders that label; selecting a contract never fills the price
- `pairRule={false}`: blurring the price does not trigger `__pair__`
- `children` render inside the section (the Contracts field)
- `Enter manually` and `CHAIN_NOTICE_COPY.unavailable` (`Quotes unavailable. Enter your filled trade manually.`) behave as in US-101 when the chain fails

**Green — implementation:** replace the two `useWatch` reads of the entry form's `ticker` with the `ticker` prop when given; pass `bounds` to `useCallChain`.

**Refactor — cleanup to consider:** remove any `PmccEntryFormValues` import left in the section.

**Acceptance criteria covered:** The sheet shows the LEAPS as coverage context; Continue when market data cannot supply the picker.

### 13. The sheet

**Files to create or modify:**

- `src/renderer/src/components/PmccRollSheetDialog.tsx` — `width?: number` (default 440)
- `src/renderer/src/components/SellPmccShortSheet.tsx` — new: dialog (460), `SELL_SHORT_FORM_FIELDS`, save-failed copy, success view
- `src/renderer/src/components/SellPmccShortForm.tsx` — new: eyebrow `SELL SHORT CALL`, title `XYZ · against $85.00 LEAPS`, `SellShortCoverageCard`, `PmccLegSection` with Contracts as a child, `SellPmccShortPreview`, footer `Cancel` · `Record Short Call` (`Recording…`, disabled while invalid or pending)
- `src/renderer/src/components/SellShortCoverageCard.tsx`, `SellPmccShortPreview.tsx`, `SellPmccShortSuccess.tsx` — new
- `src/renderer/src/hooks/useSellPmccShort.ts`, `useSellPmccShortForm.ts` — new (mutation via `usePositionMutation`; form `mode: 'onChange'` as `useRollPmccShortCallForm`)
- `SellPmccShortSheet.test.tsx`, `SellPmccShortForm.test.tsx`, `useSellPmccShort.test.ts` — new

**Mockup:** `SellShortSheet` under preset `sell-short`; success state from the story's UI Changes (`PMCC updated`, `Cycle 9 opened`, `Done`).

**Red — tests to write:**

- header copy; coverage card line and previous-cycle line from props
- preview lines: `Credit $195.00 · 28 DTE`, `Cost basis after: $6.55 / share (from $8.50)`, `Effective share cost after: $91.55 (from $93.50)`, `Premium recovered after: 70.9% (from 62.2%)`, `Strike $118.00 is +$26.45 above your effective share cost` with `text-wb-green`
- `$89 · $4.10`: `AlertBox` warning (`data-testid="pmcc-sell-short-warning"`) with the `'sale'` sentence and `Record Short Call` enabled
- 3 LEAPS, 1 contract: `2 LEAPS contracts remain uncovered`
- an invalid field disables `Record Short Call`; `Recording…` while pending
- submit sends `toSellPmccShortPayload(...)`; a field error from the server lands on the routed field; an `internal_error` shows `Could not record the short call. Your entries are preserved. Try again.` and keeps every value
- success shows `PMCC updated` and `Cycle 9 opened`; `Done` calls `onClose`

**Green — implementation:** compose Areas 8, 10, 11, 12 on `useRollSheetSubmit`; `today` = `newYorkToday()`; the LEAPS delta from `useOptionSnapshots([leaps])`.

**Refactor — cleanup to consider:** share the footer with `RollPmccShortCallForm` if the markup is identical.

**Acceptance criteria covered:** every UI-facing scenario (1–5, 7, 8, 10, 11).

### 14. Detail-page wiring

**Files to create or modify:**

- `src/renderer/src/pages/usePositionDetailSheets.ts` — `RollSheet` gains `'pmccSellShort'`; `handleSellPmccShort`, `handleCloseSellPmccShort`
- `src/renderer/src/pages/PositionDetailPage.tsx` — pass `onSellPmccShort`; render `SellPmccShortSheet` when open with `pmccOpenLegs.long`, `pmccOpenLegs.short === null`, `pmccLedger`, `lastEndedCycle(data.pmccTimeline)`
- `src/renderer/src/pages/PositionDetailPage.test.tsx` (or the existing detail test) — extend

**Mockup:** `sell-short` preset (sheet over the LEAPS-only page).

**Red — tests to write:**

- LEAPS-only PMCC: pressing `Sell Short Call →` opens the sheet titled `XYZ · against $85.00 LEAPS`; opening it closes any other sheet
- the sheet is not rendered while a short is open, even if the slot was set

**Green — implementation:** follow the `rollPmccShortOpen` pattern.

**Refactor — cleanup to consider:** none.

**Acceptance criteria covered:** Sell the next short call; The sheet shows the LEAPS as coverage context.

### 15. E2e Tests

**Files to create or modify:**

- `e2e/pmcc-sell-short.spec.ts` — new
- `e2e/pmcc-sell-short-helpers.ts` — new: launch (no `WHEELBASE_FAKE_NOW`; `WHEELBASE_MOCK_OPTION_SNAPSHOTS` with the chain below), `T` = New York today, `shift(iso)` = `iso + (T − 2027-07-23)` days, `seedLeapsOnly(page, variant)`, sheet locators, `directSell(page, payload)` over `window.api.sellPmccShort`
- `e2e/pmcc-timeline-helpers.ts` — export `Variant` and `backgroundLegs`; add `VARIANTS.withoutCycle9` (`{ patch: { c9Sell: null } }`)
- `e2e/pmcc-helpers.ts` — `tableCount` accepts `'cost_basis_snapshots'`
- `e2e/dates.ts` — `nyToday()` (America/New_York)

Chain fixture (all shifted): `XYZ $118 · T+28 · Δ 0.30` (target), `$89 · T+28`, `$85 · T+28` and `$80 · T+28` (strike decoys), `ABC $118 · T+28` (other underlying), the LEAPS `$85 · T+182 · Δ 0.81`, and for the near-LEAPS check `NEAR $118 · T+42` / `T+28` with a `NEAR` LEAPS at `T+35`. Every displayed date in an assertion is `shift('2027-…')`; money and day counts are the story's literals. Every test seeds through `_test:pmcc-seed-position`.

**Red — tests to write** (one per scenario and outline row; names mirror the AC):

1. **Sell the next short call** — open detail, `Sell Short Call →`, pick `$118.00 · shift(2027-08-20)`, price `1.95`, fill `T`, `Record Short Call`; `PMCC updated` and `Cycle 9 opened`, `Done`; header `LEAPS + short call open`; `Cost basis / share` `$6.55`, `Effective share cost` `$91.55` (Q2), `Premium recovered` `70.9%`; `Leg timeline` cycle 9 header `sold {T} at 28 DTE` and gap `Uncovered · 7 days · {T−7} to {T}`; `legs` +1 with role `SHORT_CALL_OPEN`, one `PMCC_SHORT_OPEN` snapshot with `basis_per_share` `6.5500`; no `broker:*` channel in `invokedIpcChannels`. Falsifiable: the same assertions fail on a fixture still at `$8.50`.
2. **The sheet shows the LEAPS as coverage context and the previous cycle's outcome** — `$85.00 · {T+182} · 182 DTE · Δ 0.81`; `Cycle 8 expired worthless {T−7} · 7 days uncovered`; the picker lists XYZ `$118.00` and `$89.00` and none of `$85.00`, `$80.00`, ABC; the 20–45 DTE / Δ 0.25–0.35 presets show; on the `NEAR` position the `T+42` contract (past its `T+35` LEAPS) is absent and `T+28` present.
3. **The preview shows the cash and the new guardrails before confirming** — the five lines of Area 13, the strike line with `text-wb-green`.
4. **Warn when the strike is below the effective share cost** — `$89.00 · shift(2027-08-20)` at `4.10` (Q1): the `'sale'` sentence with `$89.00`, `$89.40`, `$0.40`; `Record Short Call` enabled.
5. **Reject a short call that breaks the PMCC shape** (`it.each`, 4 rows, manual entry): `$118 · {T+182}`, `$118 · {T+210}` → `Short call must expire before the LEAPS call.` beside expiration; `$85 · {T+28}`, `$80 · {T+28}` → `Short-call strike must be above the LEAPS strike.` beside strike; `Record Short Call` disabled; price, fill date and fees still hold their values; `directSell` with the same values returns the same `field` / `code` / `message`; `legs` and `cost_basis_snapshots` counts unchanged; header still `LEAPS open · no short call`.
6. **Reject a bypassed short call that would outlast the LEAPS without a partial record** — seed with an extra LEAPS roll `$85 · {T+182}` → `$85 · {T+329}` on `T−2`; `directSell` `$118 · {T+329}` → `{ field: 'expiration', code: 'short_not_before_long', message: 'Short call must expire before the LEAPS call.' }`; counts unchanged; detail header `LEAPS open · no short call`, LEAPS reference `$85.00` · `{T+329}`.
7. **Reject invalid entry** (`it.each`, 6 rows): price `0.00`; contracts `0`; contracts `2` → `(1)`; fill `{T+1}`; fill `{T−8}` → `… retired ({T−7}).`; expiration `{T}` with fill `{T}`; each message beside its field and `Record Short Call` disabled.
8. **Partial coverage is allowed and stated** — `threeContracts` without cycle 9; contracts defaults to `3`; set `1`; preview `2 LEAPS contracts remain uncovered`; record; the new leg has `contracts` `1`; the positions-list card reads `1 of 3 covered` (Q7).
9. **Reject when a short call is already open** — full Background (cycle 9 open); no `sell-pmcc-short-btn`; `directSell` → `{ field: '__root__', code: 'short_call_already_open', message: 'This PMCC already has an open short call — roll it instead.' }`; counts unchanged.
10. **Continue when market data cannot supply the picker** — relaunch with `FAKE_MARKET_DATA_ERROR=unknown`; `Quotes unavailable. Enter your filled trade manually.`; manual `$85 · {T+28}` shows the strike error; manual `$118 · {T+28}` at `1.95` records and the header reads `LEAPS + short call open`.
11. **A failed save leaves the position LEAPS-only** — `CREATE TRIGGER … BEFORE INSERT ON cost_basis_snapshots … RAISE(ABORT)`; a valid entry; `Could not record the short call. Your entries are preserved. Try again.`; strike, expiration, price and fill date still filled; `legs` unchanged and `0` snapshots for the position; `Cost basis / share` `$8.50`.
12. **The wheel is unchanged** — `reachHoldingSharesState`; `Open Covered Call →` visible; no `sell-pmcc-short-btn`, no `Coverage` card, no `Effective share cost`, no `LEAPS` text on the page.

**Green — implementation:**

- Nothing new should be needed; a failing e2e test means an earlier area is incomplete. Fix it there.

**Refactor — cleanup to consider:**

- Keep variants as patches over the one Background; keep `shift` the only place the date offset is applied.

**Acceptance criteria covered:**

- All 12 scenarios in OPT-23, one test each, with the outline rows as `it.each` (20 tests; AC audit below).

## AC Audit

| #   | Acceptance scenario (OPT-23)                                                       | Areas                    | E2e test |
| --- | ---------------------------------------------------------------------------------- | ------------------------ | -------- |
| 1   | Sell the next short call                                                           | 2, 3, 4, 6, 7, 9, 13, 14 | 1        |
| 2   | The sheet shows the LEAPS as coverage context and the previous cycle's outcome     | 8, 10, 12, 13, 14        | 2        |
| 3   | The preview shows the cash and the new guardrails before confirming                | 3, 10, 13                | 3        |
| 4   | Warn when the strike is below the effective share cost                             | 10, 13                   | 4 (Q1)   |
| 5   | Reject a short call that breaks the PMCC shape (4 rows)                            | 1, 2, 6, 7, 11, 13       | 5 × 4    |
| 6   | Reject a bypassed short call that would outlast the LEAPS without a partial record | 1, 2, 5, 6, 7, 9         | 6        |
| 7   | Reject invalid entry (6 rows)                                                      | 1, 2, 4, 11, 13          | 7 × 6    |
| 8   | Partial coverage is allowed and stated                                             | 2, 3, 6, 10, 13          | 8 (Q7)   |
| 9   | Reject when a short call is already open                                           | 2, 6, 7, 9               | 9        |
| 10  | Continue when market data cannot supply the picker                                 | 12, 13                   | 10       |
| 11  | A failed save leaves the position LEAPS-only                                       | 6, 13                    | 11       |
| 12  | The wheel is unchanged                                                             | 9                        | 12       |

US-102's deferred subsequent-short scenarios are closed by tests 1, 5 (expiration rows) and 6,
all through the real form, service and IPC.
