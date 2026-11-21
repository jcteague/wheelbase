---
story: us-109
kind: feature
parent: null
topics: [pmcc, cost-basis, ipc-handlers]
status: planned
---

# Implementation Plan: US-109 — Display PMCC-specific leg timeline on position detail

## Summary

A PMCC detail page gains two drawers below `Cost basis`: `Timeline summary` (open) and
`Leg timeline` (collapsed), showing the LEAPS as one track and each short call as a cycle with
its rolls inside it. A new pure engine folds the legs into that shape and replays the US-103
ledger for the running basis; `positions:get` returns the result and the renderer formats it.
Done means all 18 acceptance scenarios pass as e2e tests and a wheel's leg history is unchanged.

## Supporting Documents

Read these before starting implementation:

- **User Story & Acceptance Criteria:** Linear [OPT-17](https://linear.app/optionswheel/issue/OPT-17) (`US-109`). Linear is the source; there is no story file.
- **Mockup:** `mockups/epic-09-pmcc-position-detail.mdx` — `TimelineSummary`, `Timeline`, `Strip`, `LeapsTrack`, `CycleGroup`, `GapRow`, `TimelineDrawer`; presets `healthy`, `leaps-only`, `roll-window`, `closed`, `wheel`.
- **Research & Design Decisions:** `plans/us-109/research.md`
- **Data Model & Type Design:** `plans/us-109/data-model.md`
- **API Contracts:** `plans/us-109/contracts/positions-get.md`, `plans/us-109/contracts/test-pmcc-seed-position.md`
- **Quickstart & Verification:** `plans/us-109/quickstart.md`

Two decisions differ from the story's original Technical Notes (both recorded in
`research.md` and now reflected in Linear): the running basis is replayed through the US-103
ledger rather than read from snapshots, and the fold is a main-process core engine rather than
a renderer module.

## Prerequisites

Already on `main`:

- US-101 PMCC positions and `PmccLegReference`; US-103 `calculatePmccLedger`, `pmcc-ledger.ts`
  and `PmccCostBasis`; US-104 / US-105 roll recording with `rollChainId`.
- `groupRollChains` (`src/main/services/roll-chains.ts`), `etDateOf`
  (`src/main/core/trading-calendar.ts`), `createFakeClock`
  (`src/main/integrations/fake-clock.ts`), `CollapsedDrawer`, `StatGrid`, `Badge`,
  `TablePrimitives`, and the `wb-sky` / `wb-violet` tokens.

No migration.

## Implementation Areas

### 1. Core engine — ordering, tracks, cycles and replayed basis

**Files to create or modify:**

- `src/main/core/pmcc-timeline.ts` — new engine
- `src/main/core/pmcc-timeline.test.ts` — new
- `src/main/core/test-fixtures/pmcc-timeline-events.ts` — the XYZ Background as literal events (`data-model.md` § 5), plus builders for the variants

**Red — tests to write** (`pmcc-timeline.test.ts`, fixture built in `beforeAll`, every expected
value a literal):

- XYZ Background yields 9 cycles; cycle 2 has `rollCount` 1 and three rows (`OPEN`, `ROLL` number 1, `END`); no cycle is created by the roll.
- Cycle nets: cycle 1 `2.0000` / `200.0000`; cycle 2 `1.2000` / `120.0000`; cycle 5 (bought back at 0.55) `1.6500` / `165.0000`; cycle 9 `1.9500` with `status: 'OPEN'`.
- Cycle 2 roll row net is `{ direction: 'debit', perShare: '0.6000', total: '60.0000' }`; a roll with a positive net is `'credit'`; equal prices give `'even'`.
- Cycle header facts: cycle 1 `dteAtOpen` 32, `daysHeld` 32; cycle 2 `dteAtOpen` 28, `daysHeld` 56, `current.strike` `112.0000`; cycle 5 `daysHeld` 18, outcome `CLOSED`; cycle 9 `daysSoFar` 21, `dteRemaining` 7.
- Replayed basis: LEAPS purchase row `25.0000`; LEAPS roll row `8.5000`; cycle footers `23.0000`, `21.8000`, `20.1000`, `18.5500`, `16.9000`, `15.1500`, `13.4000`, `8.5000`, `6.5500`.
- Same-day ordering: cycle 6's `END` and cycle 7's `OPEN` both on 2027-05-07 give cycle 6 `15.1500` and cycle 7 `13.4000`, with the input events in either array order.
- LEAPS track: two rows; purchase `dteAtFill` 368; roll `number` 1, `net` credit `2.5000` / `250.0000`, `coverage` `{ unbroken: true, extensionDays: 126 }`; `current` is `$85` · 2028-01-21; `costPerShare` `22.5000`.
- LEAPS roll whose replacement opened two days after the old one closed: `coverage` `{ unbroken: false, gapDays: 2, extensionDays: 126 }`. One day before / same day / one day after `closedOn` cover the boundary.
- Assignment: cycle 9 ended by `SHORT_END` `ASSIGNED` keeps net `1.9500`, `END` row has `pricePerShare: null`, basis unchanged at `6.5500`.
- `LEAPS_CLOSE` adds a `CLOSE` row with no `basisAfter` and sorts after a same-day `SHORT_END`.
- `UNKNOWN` dated 2027-08-04 lands as a row inside cycle 9, and cycle 9's net and every summary figure equal the Background's; an `UNKNOWN` dated in a gap lands on the LEAPS track.
- Fees: `$1.00` on the LEAPS purchase and on cycle 1's sell gives purchase basis `25.0100`, cycle 1 net `1.9900` / `199.0000`, cycle 1 footer `23.0200`; a 5th-decimal case (fee `0.05` on 1 contract → `0.0005` per share) asserts the `ROUND_HALF_UP` literal.
- Three contracts at the same per-share fills: cycle 1 `2.0000` / `600.0000`; every `basisAfter` equals the 1-contract value.
- Properties: none in this area — they need the summary and are stated in Area 2.

**Green — implementation:**

- Types from `data-model.md` § Type Design: `PmccTimelineEvent` (discriminated union on `kind`), `PmccShortOutcome`, `PmccCycle` (common shape ∩ union on `status`), `PmccLeapsRow` and `PmccCycleRow` (unions on `kind`), roll `coverage` (union on `unbroken`), `PmccNet`, `PmccLeapsTrack`, `PmccTimeline`.
- `buildPmccTimeline(input: PmccTimelineInput): PmccTimeline | null` in `src/main/core/pmcc-timeline.ts` (null with no `LEAPS_OPEN` or `LEAPS_ROLL`; the engine is the one owner of that check):
  - sort by date, then rank, then `seq` (research ADR "Timeline order"); a `LEAPS_ROLL` carries no `date` and is dated by the earlier of its `closedOn` / `openedOn` (`timelineEventDate`);
  - one pass with `reduce` carrying the contribution prefix; `calculatePmccLedger({ leapsContracts, longStrike: null, contributions: prefix })` gives `basisAfter` at each event;
  - `SHORT_OPEN` starts a cycle; `SHORT_ROLL` and `SHORT_END` attach to the open cycle holding the contract (attribution rules in `data-model.md` § 2); `UNKNOWN` attaches to the latest cycle open on its date (no end folded, short not yet expired), else the LEAPS track;
  - nets in dollars from contributions, per share ÷ the shares of the LEAPS held now (`sharesFromContracts` from `costbasis.ts`); day counts with `differenceInCalendarDays(parseISO(b), parseISO(a))`. The contract count is not an output (no `leapsContracts` on `PmccTimeline`).
- Every row built from a known event carries that event's `fees` (4-dp dollars) so the renderer can show them.
- No logging, no I/O (core rule).

**Refactor — cleanup to consider:**

- Name the per-event steps (`applyLeapsEvent`, `applyShortEvent`) rather than one long reducer.
- Check the net-direction helper against `netDirection` in `src/renderer/src/lib/pmcc-roll.ts`; if identical, move one copy to `src/shared/`.

**Acceptance criteria covered:**

- Rolls stay inside their cycle; a cycle that simply expired; a cycle bought back early; the open cycle; the LEAPS roll reads as unbroken coverage; running cost basis at each group boundary; assignment; per-share figures hold and totals scale; unknown role; fees (engine half of each).

### 2. Core engine — gaps, coverage, flags and summary

**Files to create or modify:**

- `src/main/core/pmcc-timeline.ts` — add gaps, flag and summary
- `src/main/core/pmcc-timeline.test.ts` — add cases
- `src/main/core/pmcc-timeline.property.test.ts` — new
- `src/main/core/test-fixtures/arbitraries.ts` — add `pmccTimelineEvents`

**Red — tests to write:**

- `pmcc-timeline.test.ts`:
  - Background gaps are 7 (2026-10-16 → 2026-10-23), 17, 3, 3, 3, 4, 7 days; no gap between cycles 6 and 7 (same day); `uncoveredDays` 44, `totalDays` 333, `coveredDays` 289.
  - Gap boundary: next cycle sold the day before / the same day / the day after the previous ended → no gap, no gap, a 1-day gap.
  - Leading gap (`kind: 'LEADING'`, `beforeCycle` 1) when the first short was sold after the LEAPS; none when sold the same day.
  - Trailing gap (`kind: 'TRAILING'`): when no cycle covers at the window end — not merely when the last cycle sold has ended. Last cycle assigned 2027-08-20, valuation 2027-08-24, position open → 4 days. Position closed 2027-08-20, valuation 2027-09-02 → no trailing gap, `totalDays` 340, `coveredDays` 296.
  - Window end: a short sold the day before / on / after the window end (LEAPS 2027-06-01, valued 2027-06-05) → a leading gap to the sale or to the window end, never past it; sold after it → `uncoveredDays` 4, `coveredDays` 0, `daysSoFar` 0 and `dteRemaining` = `dteAtOpen`. A short bought back after the window end covers only up to it.
  - Overlapping cycles (cycle 1 open to 2027-03-19, cycle 2 sold 2027-01-10, expired 2027-01-29, valued 2027-02-10) → no trailing gap; 37 of 149 days covered. A `BETWEEN` gap's neighbours are the cycle that covered furthest before it and the cycle sold at its end.
  - No cycles (LEAPS bought 2027-06-01, valuation 2027-08-13): one `WHOLE_WINDOW` gap of 73 days, `coveredDays` 0, `average` `null`, `open` `null`, `leapsRollNetPerShare` `null`.
  - Flag: LEAPS expiring 2027-09-17, open short expiring 2027-10-16 → `{ daysPastLeaps: 29, leapsExpiration: '2027-09-17' }`; short expiring the same day or the day before → `null`; the day after → `daysPastLeaps` 1. An ended cycle is flagged only when `endedOn` is after the LEAPS expiration: bought back the day before / on / after → `null`, `null`, `daysPastLeaps` 1.
  - Summary on the Background: `cycleCount` 9, `closedCount` 8, `open` `{ count: 1, creditPerShare: '1.9500' }`, `realizedPerShare` `14.0000` / `1400.0000`, `average` `{ perShare: '1.7500', total: '175.0000' }`, `leapsRollNetPerShare` `2.5000`, `shortCreditsPerShare` `15.9500`, `leapsCostPerShare` `22.5000`, `basisPerShare` `6.5500`.
  - Assigned variant: `closedCount` 9, `open` `null`, `realizedPerShare` `15.9500`.
  - Fee variant: `realizedPerShare` `13.9900`, `shortCreditsPerShare` `15.9400`, `leapsCostPerShare` `22.5100`, `basisPerShare` `6.5700`.
- `pmcc-timeline.property.test.ts` (generator `pmccTimelineEvents` builds a valid history — one LEAPS, optional LEAPS rolls, cycles in order of sale that may overlap (one sold before the previous ended), with optional rolls and an outcome, fees, and a valuation date that may fall before the last events — so no `fc.pre`):
  - **Oracle:** `realizedTotal + open total` equals `shortCreditsTotal`, and `summary.basisPerShare` equals `basisPerShare`, from `calculatePmccLedger` over all contributions (dollars, exact `Decimal` equality).
  - **Coverage oracle:** counting the window's days one by one, against a replay of the generated events, the days some short call covers equal `coveredDays`, the rest `uncoveredDays`, `totalDays` their sum, and the gaps' days are exactly the uncovered ones (so `Σ gap.days` matches).
  - **Invariant:** an open cycle's `dteRemaining` and `daysSoFar` are measured at the later of the window end and its sale.
  - **Order independence:** any permutation of the input `events` array gives a deeply equal timeline.
  - **Scale invariance:** multiplying every `contracts` and every fee by `k` leaves every per-share figure and `basisAfter` unchanged and multiplies every total by `k`.
  - **Guard:** `cycles.length` equals the number of `SHORT_OPEN` events, whatever the number of rolls.

**Green — implementation:**

- `PmccGap` (union on `kind`: `LEADING` / `BETWEEN` / `TRAILING` / `WHOLE_WINDOW`), `PmccTimelineSummary` (with `average` and `open`, each a pair or `null`) and the cycle `flag` per `data-model.md` § 2.
- Gaps are the complement, inside `[start, windowEnd]`, of the union of the cycles' coverage, each clamped to the window (table in `data-model.md` § 2); `windowEnd = closedDate ?? valuationDate` (research ADR "coverage window").
- Summary sums in dollars, divides once; ledger fields from one `calculatePmccLedger` call over every contribution.
- `pmccTimelineEvents` arbitrary in `arbitraries.ts`, built from `positiveMoney`, `contracts` and `orderedDays`.

**Refactor — cleanup to consider:**

- Stress the properties at `numRuns: 500` over several seeds with `endOnFailure: true` before trusting them.
- Run `pnpm test:mutation --mutate src/main/core/pmcc-timeline.ts`; kill survivors with boundary tests.

**Acceptance criteria covered:**

- Uncovered stretches; the timeline summary; a LEAPS with no short call; a short call that outlasts the LEAPS; a closed PMCC; fees (engine half of each).

### 3. Service — legs to timeline events

**Files to create or modify:**

- `src/main/services/pmcc-ledger.ts` — export `orderedLedgerEvents`, `eventContribution` and the `LedgerEvent` type
- `src/main/services/pmcc-timeline.ts` — new
- `src/main/services/pmcc-timeline.test.ts` — new
- `src/main/services/test-fixtures/pmcc-legs.ts` — add the legs the cases below need

**Red — tests to write** (`pmcc-timeline.test.ts`):

- A `LEAPS_OPEN` + `SHORT_CALL_OPEN` pair returns a timeline with one LEAPS row and one open cycle whose opening price is the leg's `premiumPerContract`.
- A roll chain whose `ROLL_FROM` is a `BUY` becomes a row in the cycle; one whose `ROLL_FROM` is a `SELL` becomes `LEAPS roll #1` on the LEAPS track, with `closedOn` / `openedOn` from the two legs' fill dates.
- `SHORT_CALL_EXPIRED`, `SHORT_CALL_CLOSE`, `SHORT_CALL_ASSIGNED` map to outcomes `EXPIRED`, `CLOSED`, `ASSIGNED`; only `CLOSED` carries a price.
- A leg with a wheel role (`CC_CLOSE`) and a `ROLL_TO` with no partner each appear as an `UNKNOWN` row with the raw role, and the summary's `basisPerShare` equals `pmccLedgerFromLegs(legs).basisPerShare`.
- Fees on a short roll's two legs are summed once into that roll's cycle net.
- No LEAPS leg → `null`.

**Green — implementation:**

- `pmccTimelineFromLegs(legs: LegRecord[], opts: { valuationDate: string; closedDate: string | null }): PmccTimeline | null` in `src/main/services/pmcc-timeline.ts`: group chains with `groupRollChains`, map each `orderedLedgerEvents` entry to a `PmccTimelineEvent` (`seq` = its index, `contribution` from `eventContribution`; a LEAPS roll gets only its two fill dates), add `UNKNOWN` events for non-PMCC roles and unpaired roll legs, and return `buildPmccTimeline`'s result — the engine's `null` for no LEAPS, with no check of its own.
- DEBUG log `pmcc_timeline_events` with the event kinds and dates; no INFO (nothing is created).

**Refactor — cleanup to consider:**

- `pmcc-ledger.ts` already logs `pmcc_ledger_unknown_leg_role` per unknown leg; make sure the timeline path does not log it a second time for the same request.

**Acceptance criteria covered:**

- Supports every PMCC scenario; directly: unknown leg role renders neutrally.

### 4. `positions:get` returns the timeline at the Eastern valuation date

**Files to create or modify:**

- `src/main/schemas.ts` — `PositionDetailResult` (`GetPositionResult` + `pmccTimeline`), `GetPositionPayloadSchema`
- `src/main/services/get-position.ts` — `getPositionDetail` computes it; `getPosition` does not
- `src/main/services/get-position.test.ts` — add cases
- `src/main/ipc/positions.ts` — `getCurrentDate` dependency
- `src/main/ipc/positions.test.ts` — add cases
- `src/main/index.ts` — pass `fakeClock?.now`
- renderer test fixtures that build a `PositionDetail` (e.g. `PositionCockpit.spec.tsx`, `PositionDetailPage.test.tsx`) — add `pmccTimeline: null`

**Red — tests to write:**

- `get-position.test.ts`: `getPositionDetail` for a PMCC returns `pmccTimeline` whose `valuationDate` is the date passed in and whose `summary.basisPerShare` equals `pmccLedger.basisPerShare`; a wheel returns `pmccTimeline: null`; a `CLOSED` PMCC passes its `closedDate` through (`timeline.closedDate` is the literal); an unknown id throws `not_found`. The roll context (`loadPmccRollContext`, via `getPosition`) carries no `pmccTimeline` and folds none.
- `positions.test.ts`: with `getCurrentDate` returning `2027-08-14T02:30:00Z` the service is asked for valuation date `2027-08-13` (still the 13th in New York); with `2027-08-14T05:00:00Z` for `2027-08-14`. A throwing service yields an `internal_error` envelope, not a rejected invoke; a non-UUID `positionId` an `invalid_format` error; an unknown id the same `not_found` envelope as before.

**Green — implementation:**

- `PositionDetailResult` = `GetPositionResult` + `pmccTimeline: PmccTimeline | null` in `src/main/schemas.ts`, typed from `src/main/core/pmcc-timeline.ts` (`contracts/positions-get.md`); `GetPositionResult`, which the write services share, has no timeline.
- `getPosition(db, positionId)` — no valuation date, no timeline. `getPositionDetail(db, positionId, { valuationDate })` composes it with `pmccTimelineFromLegs` for a PMCC and throws `ValidationError('__root__', 'not_found', 'Position not found')` for an unknown id.
- `registerPositionsHandlers(db, { ivrOnDemand, getCurrentDate })`; the `positions:get` handler runs in `handleIpcCall`: `GetPositionPayloadSchema.parse(payload)`, then `getPositionDetail(db, positionId, { valuationDate: etDateOf(getCurrentDate()) })`.

**Refactor — cleanup to consider:**

- `get-position.ts` derives three PMCC fields in one `pmccFields(position, legs)` helper; the timeline stays out of it, on the read path only.

**Acceptance criteria covered:**

- Background: "the valuation date is 2027-08-13 in America/New_York".

### 5. Test-only seed channel

**Files to create or modify:**

- `src/main/schemas.ts` — `TestPmccSeedPositionPayloadSchema`
- `src/main/services/test-pmcc-seed.ts`, `src/main/ipc/test-pmcc-seed.ts`, `src/main/ipc/test-pmcc-seed.test.ts` — new
- `src/main/index.ts` — register beside `registerTestPmccLedgerIpc`
- `src/preload/index.ts` — `testPmccSeedPosition`

**Red — tests to write** (`test-pmcc-seed.test.ts`):

- Registers exactly one channel, `_test:pmcc-seed-position`.
- Seeding two legs returns `{ ok: true, positionId }`; `getPosition` then returns a PMCC in phase `PMCC_OPEN`, status `ACTIVE`, with both legs in the given order.
- `closedDate: '2027-08-20'` gives status `CLOSED` and that `closedDate`.
- A LEAPS fill date after today and a short expiring after the LEAPS are both accepted (the reason the seam exists).
- An empty `legs` array returns `ok: false` with a validation error on `legs`.

**Green — implementation:**

- `TestPmccSeedPositionPayloadSchema` (`z.infer` → `TestPmccSeedPositionPayload`), reusing `TestLegRowSchema`, per `contracts/test-pmcc-seed-position.md`.
- `seedPmccPosition(db, payload, now)` in `src/main/services/test-pmcc-seed.ts`: one transaction, position insert then `insertLegRow` per leg with `createdAt` = `now` + index ms.
- Thin handler through `handleIpcCall`, registered only when `NODE_ENV === 'test'`.

**Refactor — cleanup to consider:**

- Share the `toLegRecord` helper with `src/main/ipc/test-pmcc-ledger.ts` rather than copying it; it lives in the test-seam module `src/main/services/test-leg-rows.ts`, not in the production `leg-rows.ts`.

**Acceptance criteria covered:**

- None directly; it makes the e2e fixtures for 12 of the 18 scenarios possible.

### 6. Renderer display helpers

**Files to create or modify:**

- `src/renderer/src/lib/pmcc-timeline-display.ts`, `pmcc-timeline-display.test.ts` — new

**Red — tests to write** (literal strings from the AC, inputs are literal `PmccTimeline` slices):

- `timelineDrawerMeta` → `9 cycles · 44d uncovered`; `1 cycle · 0d uncovered` for the singular.
- `leapsTrackHeader` → `open $85.00 call · 2028-01-21 · LEAPS cost to date $22.50 / share`; `closed …` when `closedDate` is set.
- `cyclesHeader` → `9 cycles · 8 closed · 1 open`; `9 cycles · 9 closed` with none open.
- `cycleHeader` → `$112.00 call · sold 2026-10-23 at 28 DTE · 56 days held`; open cycle → `… at 28 DTE · 21 days so far`.
- `signedPerShareAndTotal` → `+$1.20 / share (+$120.00)`, `+$14.00 / share (+$1,400.00)`, and a negative net with the `−` (U+2212) sign.
- `netLabel` → `Net debit $0.60 ($60.00)`, `Net credit $2.50 ($250.00)`.
- `leapsCoverageCell` → `opens coverage · 368 DTE at fill`, `unbroken · +126 days`, and `2 day gap · +126 days` for a broken roll.
- `gapRow` → `Uncovered · 7 days · 2026-10-16 to 2026-10-23`; `1 day` singular.
- `coverageFlag` → `This short expires 29 days after the open LEAPS (2027-09-17). It was uncovered for that stretch.`
- `summaryStats` on the Background → Cycles `9 · 8 closed · 1 open`; Realized `+$14.00 / share (+$1,400.00)`; Average `+$1.75 / share (+$175.00)`; Open cycle credit `+$1.95 / share · open`; LEAPS roll net `+$2.50 / share · on the LEAPS track`; Coverage `289 of 333 days · 44 uncovered`. No cycles → Average `—`, Coverage `0 of 73 days · 73 uncovered`.
- `reconciliationLine` → `Realized $14.00 + open $1.95 = $15.95 short-call credits to date. LEAPS cost to date $22.50 − $15.95 = $6.55 cost basis per share.`
- Rounding: a 4-dp input ending in 5 at the third decimal (`1.2350`) formats `$1.24`.

**Green — implementation:**

- The functions above in `src/renderer/src/lib/pmcc-timeline-display.ts`, taking `Pick`-derived slices of `PmccTimeline`. Reuse `signedMoneyGrouped` from `src/renderer/src/lib/pmcc-card-tier2.ts` for signed, thousands-grouped money. Formatting only; no totals are computed here.

**Refactor — cleanup to consider:**

- If `signedMoneyGrouped` is now used by two features, move it to a neutral module (`src/renderer/src/lib/money-format.ts`).

**Acceptance criteria covered:**

- The copy of every PMCC scenario.

### 7. `CollapsedDrawer` meta label

**Files to create or modify:**

- `src/renderer/src/components/position-cockpit/CollapsedDrawer.tsx`, `CollapsedDrawer.spec.tsx`

**Red — tests to write:**

- With `meta="9 cycles · 44d uncovered"` the button shows that text and `9 fields` is absent (positive control: the title renders).
- Without `meta`, `fieldCount={6}` still shows `6 fields`.

**Green — implementation:**

- Optional `meta?: string` on `CollapsedDrawerProps`; render `meta ?? \`${fieldCount} fields\``. This is the mockup's `TimelineDrawer`, which is `CollapsedDrawer`'s markup with that one prop. `fieldCount`becomes optional when`meta` is given.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- "its collapsed header summarises the section as '9 cycles · 44d uncovered'" (component half).

### 8. `PmccTimelineSummary`

**Files to create or modify:**

- `src/renderer/src/components/position-cockpit/PmccTimelineSummary.tsx`, `PmccTimelineSummary.spec.tsx` — new

**Red — tests to write** (query by text and role; literal timeline fixture):

- Renders the six stat labels `Cycles`, `Realized net credits`, `Average per closed cycle`, `Open cycle credit`, `LEAPS roll net`, `Coverage` with the Background values from Area 6.
- Renders the reconciliation sentence and the caption `US-109 · reconciles to the Cost basis drawer above`.
- No cycles: Average reads `—`, Open cycle credit reads `—`, LEAPS roll net reads `no roll yet`.
- No text matching `%` or `annualized` anywhere in the component (positive control: the Cycles stat is present).

**Green — implementation:**

- `PmccTimelineSummary({ timeline })`: the mockup's `TimelineSummary` — an owner caption, a `StatGrid minWidth={150}` of the six items (realized in `text-wb-green`, open credit in `text-wb-gold`, empty values in `text-wb-text-muted`), then the reconciliation line in `font-wb-mono text-wb-text-secondary` with the basis in `text-wb-sky`.

**Refactor — cleanup to consider:**

- `PmccCostBasis` has its own owner caption; extract a shared `DrawerCaption` only if the markup is identical.

**Acceptance criteria covered:**

- The timeline summary totals the cycles and reconciles; no per-cycle percentage (summary half); a LEAPS with no short call (summary half).

### 9. `PmccLegTimeline`

**Files to create or modify:**

- `src/renderer/src/components/position-cockpit/PmccLegTimeline.tsx` — the drawer body
- `src/renderer/src/components/position-cockpit/PmccCoverageStrip.tsx`, `PmccLeapsTrack.tsx`, `PmccCycleGroup.tsx` — new
- matching `.spec.tsx` files

**Red — tests to write:**

- `PmccLeapsTrack.spec.tsx`: header `LEAPS track` with the track header copy; two rows — `Buy LEAPS` with `$80.00 call · 2027-09-17`, `opens coverage · 368 DTE at fill`, basis `$25.00`; `LEAPS roll #1` with `$80.00 2027-09-17 → $85.00 2028-01-21`, `Net credit $2.50 ($250.00)`, `unbroken · +126 days`, basis `$8.50`. A `CLOSE` row reads `Sold to close` with `—` for basis.
- `PmccCycleGroup.spec.tsx`:
  - cycle 2: header copy, `Expired worthless` badge, `1 roll` marker, `Net credit` `+$1.20 / share (+$120.00)`, exactly three body rows (`Sell to open`, `Roll #1` with `Net debit $0.60 ($60.00)`, the expiration), footer `PMCC cost basis after cycle 2` `$21.80 / share` `from the US-103 ledger`;
  - cycle 5: `Closed early`, buyback row `−$0.55` and `−$55.00`;
  - cycle 9 open: `Open` badge, label `Net credit, open`, row `7 DTE remaining · credit collected, not realized`, no `days held`;
  - assigned: `Assigned` badge with `text-wb-red`, terminal row `— (assigned)` and `settlement recorded by US-111`;
  - unknown row: the raw role and its date in the muted style, and the cycle net unchanged;
  - flag: the coverage-flag sentence plus `US-102`; absent on an unflagged cycle (positive control: the header renders);
  - fees: sell-to-open row reads `+$200.00 · fees $1.00`; no `fees` text when fees are zero.
- `PmccCoverageStrip.spec.tsx`: `covered 289 of 333 days · 44 uncovered`; one segment per cycle (9), each with an accessible name `Cycle N`; one roll tick; `today 2027-08-13`. No cycles → `no short call has been sold against this LEAPS`.
- `PmccLegTimeline.spec.tsx`: LEAPS track precedes a `Short-call cycles` panel; gap row `Uncovered · 7 days · 2026-10-16 to 2026-10-23` with `no short call open against the LEAPS` between cycles 1 and 2 and a 17-day row between 2 and 3; none between 6 and 7; empty state `No short call has been sold against this LEAPS yet`; closed position shows `Position closed 2027-08-20 · the timeline is complete` and the body has the muted class; no `columnheader` named `Role` or `Action`.

**Green — implementation** (from the mockup's `Timeline`, `Strip`, `LeapsTrack`, `CycleGroup`, `GapRow`):

- `PmccCoverageStrip`: caption `Coverage · {start} to {LEAPS expiration}`, the right-aligned covered/uncovered line, a full-width LEAPS bar with a gold tick per roll, a row of cycle segments (green ended, gold open, red assigned), and the `today` marker. `left` / `width` percentages are the one permitted inline `style`.
- `PmccLeapsTrack`: its own rounded panel with a sky-tinted header band (`L` badge, `LEAPS track`, header copy) and a table with columns Event, Date, Contract, Price / share, Net, Coverage, Basis after.
- `PmccCycleGroup`: header (`S` badge, `Cycle N`, header copy, outcome badge, roll marker; right-aligned net), optional red flag band, rows (sell to open; indented tinted `Roll #N`; neutral unknown rows; terminal or open row), sky-tinted footer.
- `PmccLegTimeline`: optional closed banner, strip, then the two panels with a gap between them; the cycles panel has a violet-tinted header band, the empty state, and a dashed muted gap row before each cycle that has one and after the last when trailing.
- Tailwind and `wb-*` tokens only: `wb-sky` for the mockup's `#79c0ff`, `wb-violet` for `#d2a8ff`; the mockup's `rgba()` tints become token opacity classes (`bg-wb-sky/5`, `border-wb-violet/30`). Use `Badge` and `TablePrimitives`.

**Refactor — cleanup to consider:**

- Run the code-simplifier over the four components; check `PmccCycleGroup` is not carrying formatting that belongs in `pmcc-timeline-display.ts`.
- Compare row/cell markup with `LegHistoryTable`'s roll block for a shared primitive; do not branch inside `LegHistoryTable`.

**Acceptance criteria covered:**

- Section separates the two tracks; LEAPS roll reads as unbroken coverage; rolls stay inside their cycle; expired / bought back / open / assigned cycles; uncovered stretches; running basis captions; short outlasts LEAPS; unknown role; closed PMCC; fees; no per-leg P&L (component half of each).

### 10. Cockpit wiring

**Files to create or modify:**

- `src/renderer/src/components/position-cockpit/PositionCockpit.tsx`, `PositionCockpit.spec.tsx`

**Red — tests to write:**

- PMCC with a timeline: drawers appear in the order `Leg reference`, `Cost basis`, `Timeline summary`, `Leg timeline`; `Timeline summary` has `aria-expanded="true"`, `Leg timeline` has `aria-expanded="false"` and shows `9 cycles · 44d uncovered`.
- Clicking `Leg timeline` reveals `LEAPS track`; clicking again hides it.
- PMCC with `pmccTimeline: null`: neither drawer renders (positive control: `Cost basis` does).
- Wheel in `CC_OPEN`: `Cost basis & history` renders with the `Running Basis / Share` column header; no `Timeline summary`, `Leg timeline`, `LEAPS track` or `Uncovered` text.

**Green — implementation:**

- In the PMCC branch of `PositionCockpit`, after `PmccCostBasis`: `<CollapsedDrawer title="Timeline summary" fieldCount={6} defaultOpen>` wrapping `PmccTimelineSummary`, then `<CollapsedDrawer title="Leg timeline" meta={timelineDrawerMeta(timeline)}>` wrapping `PmccLegTimeline`, both only when `pmccTimeline` is non-null. The wheel branch is untouched.

**Refactor — cleanup to consider:**

- If `PmccLegReference` and `PmccCostBasis` each wrap themselves in a drawer, make the two new components do the same so the branch reads as four siblings.

**Acceptance criteria covered:**

- Drawer placement and default open/closed state; a classic wheel's leg history is unchanged.

### 11. E2e Tests

**Files to create or modify:**

- `e2e/pmcc-leg-timeline.spec.ts` — new
- `e2e/pmcc-timeline-helpers.ts` — new: launch with `WHEELBASE_FAKE_NOW` (as `e2e/ivr-helpers.ts` does), `seedXyz(page, variant)` over `window.api.testPmccSeedPosition`, the Background legs as literals, and readers for the two drawers

Every PMCC test seeds through `_test:pmcc-seed-position`, opens the detail page and, where it
reads the timeline, expands `Leg timeline` first. Each assertion is a literal a fallback cannot
produce.

**Red — tests to write** (one per acceptance scenario, names mirror the AC):

1. **The section separates the LEAPS track from the short-call cycles** — `Leg timeline` is below `Timeline summary` and collapsed; its header reads `9 cycles · 44d uncovered`; expanding and collapsing works; track header `open $85.00 call · 2028-01-21 · LEAPS cost to date $22.50 / share`; cycles header `9 cycles · 8 closed · 1 open`; no phase badge and no `Role`/`Action`/`Strike` column headers (positive control: `LEAPS track` is visible).
2. **The LEAPS roll reads as unbroken coverage, not two disconnected rows** — exactly two LEAPS rows; purchase `$80.00 call · 2027-09-17`, `opens coverage · 368 DTE at fill`; roll `$80.00 2027-09-17 → $85.00 2028-01-21`, `Net credit $2.50 ($250.00)`, `unbroken · +126 days`. A second fixture whose replacement was bought two days later must _not_ read `unbroken`.
3. **Rolls stay inside their cycle and reduce that cycle's net** — cycle 2 header, `Expired worthless`, `1 roll`; net `+$1.20 / share (+$120.00)` and `+$1.80` absent from the header; three rows with `Roll #1` `Net debit $0.60 ($60.00)`; still 9 cycles. A second fixture with cycle 2 unrolled reads `+$1.80`, proving the net is derived.
4. **A cycle that simply expired reads its opening credit as its net** — cycle 1 header `$110.00 call · sold 2026-09-14 at 32 DTE · 32 days held`, `Expired worthless`, `+$2.00 / share (+$200.00)`.
5. **A cycle bought back early nets the buyback against the credit** — cycle 5 `sold 2027-03-15 at 32 DTE · 18 days held`, `Closed early`, `+$1.65 / share (+$165.00)`, buyback row `−$0.55` and `−$55.00`.
6. **The open cycle is labelled open and never as realized profit** — cycle 9 `21 days so far`, `Open`, `Net credit, open` `+$1.95 / share (+$195.00)`, `7 DTE remaining · credit collected, not realized`; no `days held` in that cycle.
7. **Uncovered stretches between cycles are stated as a neutral fact** — `Uncovered · 7 days · 2026-10-16 to 2026-10-23 — no short call open against the LEAPS` between cycles 1 and 2; 17 days between 2 and 3; the row has no warning role or red/gold class. A back-to-back fixture (cycle 2 sold 2026-10-16) shows no row there.
8. **Running cost basis appears at each group boundary, sourced from US-103** — LEAPS purchase `$25.00`, LEAPS roll `$8.50`; cycle footers `$23.00`, `$21.80`, `$20.10`, `$18.55`, `$16.90`, `$15.15`, `$13.40`, `$8.50`, `$6.55`; each footer captioned `from the US-103 ledger`; the sell-to-open, roll and terminal rows have no basis cell; the last footer equals the `Cost basis` drawer's `Cost basis / share`.
9. **The timeline summary totals the cycles and reconciles to the Cost basis drawer** — `Timeline summary` is between `Cost basis` and `Leg timeline`, open; the six stat values and the reconciliation sentence from Area 6.
10. **No per-cycle percentage or annualized return is shown** — within the two US-109 drawers there is no `%`, `annualized` or `of max profit` (positive control: nine cycle headers found); `Premium recovered` is found in the `Cost basis` drawer.
11. **A cycle ended by assignment shows the outcome without claiming the settlement** — relaunch at 2027-08-24 with cycle 9 assigned 2027-08-20: `Assigned` in the loss colour; net `+$1.95 / share (+$195.00)`; terminal row `— (assigned)` and `settlement recorded by US-111`; Cycles `9 · 9 closed`; Realized `+$15.95 / share`.
12. **A LEAPS with no short call ever sold renders an empty cycles list** — LEAPS-only seed ($95 · 2028-06-16 bought 2027-06-01 at $19.80): one LEAPS row; `No short call has been sold against this LEAPS yet`; Coverage `0 of 73 days · 73 uncovered`; Average `—`.
13. **A short call that outlasts the LEAPS is flagged on its cycle** — imported seed ($90 LEAPS · 2027-09-17; $120 short sold 2027-07-06 · 2027-10-16): the flag sentence with `29 days` and `(2027-09-17)`, and `US-102`; the alerts queue has no entry for it. The Background fixture shows no flag.
14. **Per-share figures hold and totals scale with contracts** — 3-contract seed: cycle 1 `+$2.00 / share (+$600.00)`; Realized `+$14.00 / share (+$4,200.00)`; the nine footers equal test 8's.
15. **A leg role this story does not know renders neutrally** — a `CC_CLOSE` leg dated 2027-08-04: a row inside cycle 9 with `CC_CLOSE` and `2027-08-04`; cycle 9 still `+$1.95 / share (+$195.00)`; still 9 cycles and Realized `+$14.00 / share`.
16. **A closed PMCC shows a complete, muted timeline** — relaunch at 2027-09-02, seed closed 2027-08-20 with cycle 9 assigned: banner `Position closed 2027-08-20 · the timeline is complete`; nine terminal outcome badges and no `Open`; Cycles `9 · 9 closed`; Coverage `296 of 340 days · 44 uncovered`.
17. **A classic wheel's leg history is unchanged** — wheel taken to `CC_OPEN` then closed call (existing helpers, no fake clock needed): the flat table with `Running Basis / Share` is present; `LEAPS track`, `Short-call cycles`, `Coverage` strip and `Uncovered` are absent.
18. **Fees reduce the cycle net and the timeline still reconciles** — `$1.00` fee on the LEAPS purchase and on cycle 1's sell: purchase basis `$25.01`; sell-to-open row `+$200.00 · fees $1.00`; cycle 1 `+$1.99 / share (+$199.00)`, footer `$23.02`; Realized `+$13.99 / share (+$1,399.00)`; reconciliation `Realized $13.99 + open $1.95 = $15.94 short-call credits to date. LEAPS cost to date $22.51 − $15.94 = $6.57 cost basis per share.`; `$6.57` matches the `Cost basis` drawer.
19. **A short call past its expiration with no recorded outcome stops counting as coverage** — relaunch at 2027-08-24 with the plain Background (cycle 9 has no terminal leg): cycle 9 header `$118.00 call · sold 2027-07-23 at 28 DTE · 28 days held`, outcome `Outcome not recorded` in the muted tone (no red, gold or green class), and none of `Open`, `Expired worthless`, `Assigned`, `Closed early`; net label `Net credit, open`, net `+$1.95 / share (+$195.00)`; last row `Expired 2027-08-20 · outcome not recorded` and no `DTE remaining`; a trailing row after cycle 9 `Uncovered · 4 days · 2027-08-20 to 2027-08-24 — no short call open against the LEAPS`; Cycles `9 · 8 closed · 1 open`, Open cycle credit `+$1.95 / share · open`, Coverage `296 of 344 days · 48 uncovered`. A second launch at 2027-08-20: `Open`, `0 DTE remaining · credit collected, not realized`, no trailing gap row (7 gap rows), Coverage `296 of 340 days · 44 uncovered`.

**Green — implementation:**

- Nothing new should be needed; a failing e2e test means an earlier area is incomplete. Fix it there.

**Refactor — cleanup to consider:**

- Keep fixture variants as small patches over one Background literal, as the mockup's `PRESETS` do.

**Acceptance criteria covered:**

- All 19 scenarios in OPT-17, one test each (AC audit below).

## AC Audit

| #   | Acceptance scenario (OPT-17)                                                                            | E2e test |
| --- | ------------------------------------------------------------------------------------------------------- | -------- |
| 1   | The section separates the LEAPS track from the short-call cycles                                        | 1        |
| 2   | The LEAPS roll reads as unbroken coverage, not two disconnected rows                                    | 2        |
| 3   | Rolls stay inside their cycle and reduce that cycle's net                                               | 3        |
| 4   | A cycle that simply expired reads its opening credit as its net                                         | 4        |
| 5   | A cycle bought back early nets the buyback against the credit                                           | 5        |
| 6   | The open cycle is labelled open and never as realized profit                                            | 6        |
| 7   | Uncovered stretches between cycles are stated as a neutral fact                                         | 7        |
| 8   | Running cost basis appears at each group boundary, sourced from US-103                                  | 8        |
| 9   | The timeline summary totals the cycles and reconciles to the Cost basis drawer                          | 9        |
| 10  | No per-cycle percentage or annualized return is shown                                                   | 10       |
| 11  | A cycle ended by assignment shows the outcome without claiming the settlement                           | 11       |
| 12  | A LEAPS with no short call ever sold renders an empty cycles list                                       | 12       |
| 13  | A short call that outlasts the LEAPS is flagged on its cycle                                            | 13       |
| 14  | Per-share figures hold and totals scale with contracts                                                  | 14       |
| 15  | A leg role this story does not know renders neutrally                                                   | 15       |
| 16  | A closed PMCC shows a complete, muted timeline                                                          | 16       |
| 17  | A classic wheel's leg history is unchanged                                                              | 17       |
| 18  | Fees reduce the cycle net and the timeline still reconciles (added 2026-11-11)                          | 18       |
| 19  | A short call past its expiration with no recorded outcome stops counting as coverage (added 2026-11-12) | 19       |
