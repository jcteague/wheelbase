# Green Phase Results: US-109 — PMCC leg timeline

## Area 1 — Core engine: ordering, tracks, cycles and replayed basis

- **Plan**: `plans/us-109/plan.md` § 1 · **Red results**: `plans/us-109/red-phase-results.md`

### Files touched (production)

- `src/main/core/pmcc-timeline.ts` — new: the timeline types and `buildPmccTimeline`
- `src/main/core/costbasis.ts` — `contributionDollars` exported (was private) so cycle and roll
  nets use the ledger's own dollar formula

### E2E coverage added or modified

None.

### Public interface

```typescript
export function buildPmccTimeline(input: PmccTimelineInput): PmccTimeline
```

### Approach

Sort by date → `EVENT_RANK` → `seq`; one `reduce` (`applyEvent`) carrying the contribution
prefix, the LEAPS rows and cycle drafts; `calculatePmccLedger({ leapsContracts, longStrike:
null, contributions: prefix })` gives each `basisAfter`. Drafts become `PmccCycle`s at the end
(nets from the cycle's own contributions, status from its end or the valuation date). One
divisor throughout: `100 × leapsContracts`, where `leapsContracts` is the last LEAPS holding's.

### Deviations from the plan

- `gaps`, `summary` and the cycle `flag` are left out (Area 2 adds them test-first).
- Added 4 tests after the mutation sweep (second LEAPS roll numbering and `current`, row totals
  at 3 contracts, unknown leg before the first short).

### Mutation sweep — `src/main/core/pmcc-timeline.ts`

100% (164 killed). First run: 7 survivors. Three were the redundant `first === undefined ||
held === undefined` guard (both from one array) — the guard now checks `first` once. Three were
killed by the tests above. One (`EMPTY_FOLD.contributions` seeded with a string) is equivalent:
`calculatePmccLedger`'s side filter drops a non-contribution entry — disabled in source with
the reason.

### Quality checks

- `pnpm test src/main/core/pmcc-timeline.test.ts` — 46 passed
- `eslint` on the four touched files — clean; `tsc -p tsconfig.node.json` — clean

### Known limitations / tech debt (refactor input)

- `applyEvent` is one ~150-line switch; split into `applyLeapsEvent` / `applyShortEvent`.
- File is 420 lines, half of it types.
- `netDirection` duplicates `src/renderer/src/lib/pmcc-roll.ts`'s.
- A `SHORT_ROLL` / `SHORT_END` with no open cycle is attached to the last (ended) cycle by
  `withOpenCycle`; valid histories never produce one.

## Area 2 — Core engine: gaps, coverage, flags and summary

- **Red results**: `plans/us-109/red-phase-results.md` § Area 2
- **Production file**: `src/main/core/pmcc-timeline.ts`

### Public interfaces

```typescript
export type PmccCycleFlag = { daysPastLeaps: number; leapsExpiration: string }
// PmccCycle (via PmccCycleCommon): flag: PmccCycleFlag | null
export type PmccGap = {
  afterCycle: number | null
  beforeCycle: number | null
  from: string
  to: string
  days: number
}
export type PmccTimelineSummary = {
  cycleCount
  closedCount
  openCount
  realizedPerShare
  realizedTotal
  averagePerShare: string | null
  averageTotal: string | null
  openCreditPerShare: string | null
  leapsRollNetPerShare: string | null
  totalDays
  uncoveredDays
  coveredDays
  shortCreditsPerShare
  leapsCostPerShare
  basisPerShare
}
// PmccTimeline: + gaps: PmccGap[], summary: PmccTimelineSummary
```

### Approach

- **Gaps** (`coverageGaps`): pairs each "coverage ended" point — the LEAPS purchase, then each
  cycle's `endedOn` (none while it is open) — with the next "coverage started" point — each
  cycle's `openedOn`, then `windowEnd`. A pair whose days are > 0 is a gap. That one rule gives
  the leading, between, trailing and whole-window rows of the data-model table, and makes all
  four boundaries the same `> 0` comparison.
- **Flag** (`outlastFlag`): days from the LEAPS held now to the cycle's current expiration; a
  flag when > 0.
- **Summary** (`timelineSummary`): realized and open sums are the cycles' `netTotal` dollars (exact
  4-dp sums of contributions), each divided once by the LEAPS shares; the average divides
  realized dollars by `closed × shares`; the LEAPS roll net is the negated sum of the
  `LEAPS_ROLL` contributions. The ledger fields come from one `calculatePmccLedger` call over every
  contribution, the same call that already gave `leapsTrack.costPerShare`.
- **Which cycle a short roll or end belongs to** (`holderIndex`): the latest cycle whose
  `current` contract is the event's (`from` for a roll, `contract` for an end), falling back to
  the latest cycle. Before, it was always the latest cycle, so a cycle sold the day before the
  previous one expired took that expiration (cycle 1 stayed open forever). The plan's
  "next cycle sold the day before" gap boundary depends on it. The fallback keeps Area 1's
  behaviour for an event no cycle holds, so its leg is never dropped.
- `toCycle` now takes a `CycleContext` object (`ledger`, `valuationDate`, `leapsExpiration`)
  rather than a fourth positional argument.

### Deviations from the plan

- `holderIndex` (above) is a behaviour change to Area 1's fold, needed by an Area 2 test.
- The `pmccTimelineEvents` arbitrary builds dates from `isoDay` plus whole-day offsets, not
  `orderedDays`: `orderedDays` allows ties, and a cycle's open, roll and end on one day are
  misordered by the ADR rank (see "Known limitations").
- A whole-window gap is emitted only when the window has at least one day (`start` <
  `windowEnd`), like every other gap; a LEAPS valued the day it was bought has no gap.

### Mutation sweep — `src/main/core/pmcc-timeline.ts`

100% (272 killed). The first run reported one survivor: `cycles.map(() => undefined)` in
`coverageGaps`. It cannot survive (destructuring `undefined` throws), and hand-applying it fails
48 tests; re-run alone with `--force`, Stryker kills it. It was the known runner glitch, not a
missing test.

### Quality checks

- `pnpm test src/main/core` — 33 files, 1269 tests pass
- `eslint` on the touched files — clean; `pnpm typecheck` — clean

### Known limitations / tech debt (refactor input)

- `pmcc-timeline.ts` is ~560 lines (about 190 of them types). Split the types or the
  gaps/summary step into a sibling module.
- **Same-day short events are misordered by the ADR rank** (`SHORT_END` 1 < `SHORT_ROLL` 2 <
  `SHORT_OPEN` 3). A short sold and rolled on the same day: the roll is folded before the open,
  no cycle holds it, and with no cycle yet the row is lost — while the ledger still counts its
  cash, so `openCreditPerShare` reads `1.8000` against `shortCreditsPerShare` `1.2000`
  (`shortRollInput` with the roll moved to 2026-10-23). An open and an end on the same day
  (sold and bought back intraday) misfile the end the same way. Not changed: the ADR order is
  the story's same-day rule between _different_ cycles; reported for a decision.
- An unmatched `SHORT_ROLL` / `SHORT_END` still attaches to the latest cycle even if it has
  ended (oddity (a)); with no cycle at all its row is dropped (its cash is still in the ledger).
- With overlapping cycles, the trailing gap and `UNKNOWN` placement look only at the latest
  cycle; a nested cycle that ends before an earlier one would over-count the trailing gap.

## Area 6 — Renderer display helpers

### Files touched (production)

- `src/renderer/src/lib/pmcc-timeline-display.ts` — new: every string the Timeline summary and
  Leg timeline drawers render, formatted from `PmccTimeline` slices (type-only import from
  `src/main/core/pmcc-timeline`).

E2E coverage: none.

### Public interfaces

Section copy: `timelineDrawerMeta`, `leapsTrackHeader`, `cyclesHeader`, `cycleHeader`,
`signedPerShareAndTotal`, `netLabel`, `leapsCoverageCell`, `gapRow`, `coverageFlag`,
`summaryStats` (`SummaryStat[]` = `{ label, value, tone: 'default' | 'credit' | 'open' |
'muted' }`), `reconciliationLine` (`{ lead, basis, tail }`), `coverageStripLine`,
`closedBanner`. Row copy: `contractLabel`, `rollContractLabel`, `leapsRollPrices`,
`shortRollPrices`, `feesSuffix`, `rowAmounts` (`{ price, total }`), `outcomeLabel`,
`leapsEventLabel`, `cycleEventLabel`, `rollMarker`, `cycleNetLabel`, `openCycleRow`,
`leapsBasisCell`, `basisFooter`.

### Approach

Unsigned money through `fmtMoneyGrouped` (Decimal, `ROUND_HALF_UP`); signed money through
`signedMoneyGrouped` from `pmcc-card-tier2.ts` (reused, not forked). A row's unsigned engine
`total` is signed by its kind; fees ride on the total cell only when non-zero. No figure is
computed — the one fallback is the reconciliation's `open $0.00` when `openCreditPerShare` is
null.

### Deviations

- `summaryStats` carries a `tone` rather than a bare `empty` flag so `PmccTimelineSummary`
  colours realized / open / empty values without keying on labels.
- `reconciliationLine` returns three parts, not one string, because plan §8 colours the basis.
- Beyond the plan's list, the row-level helpers plan §9 needs (contract and roll labels,
  signed row amounts with the fee suffix, event and outcome badges, roll marker, open-cycle
  row, basis cells and footer, coverage-strip line, closed banner).

### Test execution

```
pnpm test src/renderer/src/lib/pmcc-timeline-display.test.ts
Tests  75 passed (75)
```

`eslint` on both files clean; `pnpm typecheck` clean.

### Known limitations / tech debt

- The module is ~317 lines, over the ~200-line gate — split section copy from row copy in
  Refactor.
- `signedMoneyGrouped` now has two features using it (US-108 card, US-109 timeline) but lives
  in `pmcc-card-tier2.ts` — move to `money-format.ts` in Refactor.
- `fmtMoneyGrouped` renders a negative with ASCII `-` (`Intl`); a negative basis in the
  reconciliation sentence would read `-$1.00`, not U+2212. Not reachable in any AC.

---

## Area 3 — Service: legs to timeline events

### Files touched (production)

- `src/main/services/pmcc-timeline.ts` — new: `pmccTimelineFromLegs`
- `src/main/services/pmcc-ledger.ts` — exports `LedgerEvent`, `orderedLedgerEvents`,
  `eventContribution`; the `pmcc_ledger_unknown_leg_role` warning moved from
  `isKnownPmccLeg` (called by `eventContribution`) to `warnUnknownLegRole`, called once per
  event by `contributionsFrom`

### Public interfaces

```typescript
// src/main/services/pmcc-timeline.ts
export type PmccTimelineOptions = { valuationDate: string; closedDate: string | null }
export function pmccTimelineFromLegs(
  legs: LegRecord[],
  opts: PmccTimelineOptions
): PmccTimeline | null

// src/main/services/pmcc-ledger.ts (newly exported)
export type LedgerEvent = { leg: LegRecord; chain?: never } | { chain: RollChain; leg?: never }
export function orderedLedgerEvents(legs: LegRecord[], chains: RollChain[]): LedgerEvent[]
export function eventContribution(event: LedgerEvent): PmccContribution[]
```

### Approach

- `groupRollChains` → `orderedLedgerEvents`; each entry maps to one event with `seq` = its
  index and `contribution = eventContribution(event).at(0)`.
- Chain: `isShortCallRoll` → `SHORT_ROLL`, else `LEAPS_ROLL` with `closedOn` = `ROLL_FROM`
  fill date, `openedOn` = `ROLL_TO` fill date, `date` = the chain's (earlier) fill date.
- Leg: `LEAPS_OPEN` / `LEAPS_CLOSE` / `SHORT_CALL_OPEN` → the same-named kind with a `Fill`;
  `SHORT_CALL_EXPIRED` / `_CLOSE` / `_ASSIGNED` → `SHORT_END` `EXPIRED` / `CLOSED` /
  `ASSIGNED`, price only for `CLOSED`; any other role → `UNKNOWN` with the raw role.
- Roll-role legs in no chain (missing partner, or null `rollChainId`) → `UNKNOWN`, `seq`
  continuing after the ledger events.
- Every strike and price goes through `money4`, so `'110'` and `'110.0000'` pair.
- DEBUG `pmcc_timeline_events` `{ positionId, events: [{ kind, date }] }`; `null` when no
  `LEAPS_OPEN` / `LEAPS_ROLL` event exists (the engine's precondition).

### Deviations from plan

- The unknown-role warning move was planned for Refactor; Red pinned it as a test, so Green
  did it. A one-function move, no behaviour change for `buildPmccContributions` /
  `pmccLedgerFromLegs` (their warn tests still pass).

### Test results

```
pnpm test src/main/services/pmcc-timeline.test.ts src/main/services/pmcc-ledger.test.ts
Tests  70 passed (70)

pnpm test   # full suite
Test Files  8 failed | 303 passed (311)
```

The 8 failures were first-case 5000 ms timeouts in `src/main/index.test.ts` and
`src/main/ipc/{alerts,assignments,broker,ivr,market-data,positions,settings}.test.ts` (known
load flake); rerun alone: 8 passed. `pnpm typecheck` clean. `pnpm lint`: the two
missing-return-type errors in my files fixed; remaining warnings are prettier warnings in
`src/main/core/pmcc-timeline.test.ts` (another agent's file, not touched).

No mutation sweep: no `src/main/core/` file changed.

### Known limitations / for Refactor

- The chain branch has an unreachable `contribution === undefined → UNKNOWN` fallback (a chain
  always contributes); it exists only because `eventContribution` returns an array.
- `legEvent` checks both `contribution === undefined` and `!isPmccLegRole(legRole)`; the two
  are equivalent at runtime, the second narrows `legRole` for the exhaustive switch.

## Same-day ordering fix

Resolves the "same-day short events are misordered" limitation above. ADR amended
(`research.md` § "Timeline order", _Amendment_).

### Rule

`buildPmccTimeline` still sorts by date, ADR rank and `seq`, then `timelineOrder` folds each day's
events in that order. The exception: a `SHORT_ROLL` / `SHORT_END` whose contract is not yet held
waits for the same-day `SHORT_OPEN` or `SHORT_ROLL` that takes it (`to`). "Held" is counted over
the events already ordered: the number of times the contract was taken minus the number of times
it was given up. An end or roll whose contract is already held keeps its rank, and so does one
whose contract nothing that day takes (a stray). That keeps cycle 6's end before cycle 7's open
on 2027-05-07, and closing a short then reselling the same contract that day still ends the old
cycle first. If nothing on the day is ready, which only a same-day loop of rolls (A → B, B → A,
neither held) can cause, the first event in rank/`seq` order folds. The result depends only on
the events. No exported type or signature changed.

### Tests (`pmcc-timeline.test.ts`, describe "same-day events of one short call": 26 new)

Each case runs in four arrangements (array as recorded or reversed × `seq` as recorded or swapped)
unless noted:

- sold and rolled the same day: one cycle, rows OPEN → ROLL, `rollCount` 1, net `1.2000`, and the
  summary open credit `1.2000` = short credits `1.2000` (was `1.8000` against `1.2000`) (4)
- sold and bought back the same day: one ENDED/CLOSED cycle, rows OPEN → END, `daysHeld` 0, net
  and realized `-0.5000`, no open credit (4)
- sold and rolled twice the same day: OPEN, roll from $108, roll from $112; `rollCount` 2, net
  `1.6000` (4)
- rolled and the rolled-to contract bought back the same day: OPEN → ROLL → END, net `-0.8000` (4)
- guard, passed before the fix: the held $108 is bought back and the same contract is sold again
  that day, giving two cycles [OPEN, END], [OPEN] (4)
- guard, passed before the fix: a stray end keeps its rank and files under the cycle open before
  a same-day sale (4)
- a same-day roll loop falls back to rank then `seq`, and a later day's ready buyback still waits
  for its day (2: array order only, since the fallback is `seq` order by design)

The existing cycle 6 / cycle 7 test still passes unchanged.

### Property generator

`pmccTimelineEvents` now draws roll `after` from 0..20 and `endAfter` from 0..40 (both were
1..), so a history can open and roll, roll and roll, or open/roll and end on one day. Before
the fix the oracle failed on it at the default 100 runs, shrinking to a same-day open and end.
After the fix, all five properties pass at `numRuns: 500` with `endOnFailure: true` on seeds 1,
42, 1337, 20261111, 987654, 31415, 271828 and 55555, using a scratch setup that is not in the
repo.

### Mutation (`pmcc-timeline.ts`, `pmcc-timeline-summary.ts`)

The first run left 17 survivors on the new lines. Three groups:

- Equivalent: a null guard before `indexOf`, and pushing `null` into the held list.
- Untested: the stray-rank clause and the loop fallback.
- Redundant: an `other !== event` clause.

The held multiset was replaced by a count over the ordered events, the redundant clause was
dropped (a self-roll now counts as a loop), and the stray and loop tests were added. After that,
every mutant on the changed lines is killed: 99.4% (`--force`: 99.1%), with
`pmcc-timeline-summary.ts` at 100%.

Two to three survivors per run remain. All are on lines this fix did not touch, and the set
changes from run to run: `withCycleAt = () => undefined`, `cycles: []` in `applyShortEvent`, the
`Step` object literal, and `held.kind === ""`. Each throws or empties every cycle. Hand-applying
`cycles: []` fails 87 of 108 tests. This is the known runner glitch (`testsCompleted: 0`), not a
missing test.

### Quality checks

`pnpm test`: 312 files, 5453 tests pass. `pnpm lint` and `pnpm typecheck` are clean. Prettier
was run on the touched files only.

## Area 8 — `PmccTimelineSummary`

### Files touched (production)

- `src/renderer/src/components/position-cockpit/PmccTimelineSummary.tsx` — new; the mockup's
  `TimelineSummary` drawer body
- `src/renderer/src/lib/pmcc-timeline-display.ts` — `summaryStats` tones the LEAPS roll net
  `credit` only when it is strictly positive (`new Decimal(net).gt(0)`); zero and a debit read
  `default`

### E2E coverage added or modified

None.

### Public interface

```typescript
export type PmccTimelineSummaryProps = { timeline: Pick<PmccTimeline, 'summary'> }
export function PmccTimelineSummary({ timeline }: PmccTimelineSummaryProps): React.JSX.Element
```

### Implementation summary

- Owner caption `US-109 · reconciles to the Cost basis drawer above` in the same
  `<div className="px-5 pt-3"><Caption>…</Caption></div>` markup `PmccCostBasis` uses (the
  mockup's `OwnerNote` sits outside its `TimelineSummary`; the plan puts the caption in the
  component, and matching the existing drawer's caption keeps the two drawers consistent).
- `StatGrid minWidth={150}` over `summaryStats(timeline)`; a `TONE_CLASS` record maps the tone to
  `text-wb-green` / `text-wb-gold` / `text-wb-text-muted` (none for `default`) on a wrapping
  span, so the component never keys on a label.
- Reconciliation `div` in `font-wb-mono text-[0.68rem] text-wb-text-secondary`, the basis in a
  `text-wb-sky` span between `lead` and `tail`.
- Tailwind and `wb-*` tokens only; no inline style.

### Deviations from plan

- The plan says "realized in `text-wb-green`"; the tone record also greens a positive LEAPS roll
  net (the mockup does), and — per the review fix — never a zero or negative one.

### Test execution

```
npx vitest run …/PmccTimelineSummary.spec.tsx src/renderer/src/lib/pmcc-timeline-display.test.ts
Tests  60 passed (60)

pnpm test
Tests  5 failed | 5477 passed (5482)
```

The 5 failures are the concurrent Area 5 Red tests (`src/main/services/get-position.test.ts`,
`src/main/ipc/positions.test.ts`). `pnpm lint`: one error in `src/main/services/get-position.ts`
(same in-flight work) and a prettier warning in this area's spec (formatted in Refactor).
`pnpm typecheck`: errors only for the `pmccTimeline` field still missing from other test
fixtures (concurrent work); none in this area's files.

### Known limitations / tech debt

- The caption markup is identical to `PmccCostBasis`'s — a candidate for a shared drawer caption.
- `summaryStats` still tones Realized net credits `credit` even when the sum is zero or negative
  (e.g. every closed cycle a net debit). Same class of issue as the LEAPS roll fix; not in scope.

## Area 4 — `positions:get` returns the timeline at the Eastern valuation date

### Files modified

- `src/main/schemas.ts` — `GetPositionResult.pmccTimeline: PmccTimeline | null`, the type imported
  from `src/main/core/pmcc-timeline` (not a copy).
- `src/main/services/get-position.ts` — `opts.valuationDate` (default `etDateOf(new Date())`);
  `pmccTimeline = isPmcc ? pmccTimelineFromLegs(legs, { valuationDate, closedDate: position.closedDate }) : null`;
  `valuationDate` added to the `get_position_query_start` DEBUG line.
- `src/main/ipc/positions.ts` — `getCurrentDate` dependency (default `() => new Date()`); the
  `positions:get` handler passes `{ valuationDate: etDateOf(getCurrentDate()) }`.
- `src/main/index.ts` — `registerPositionsHandlers(db, { ivrOnDemand, getCurrentDate: fakeClock?.now })`.
- `src/main/index.test.ts` — the IVR-port test asserts `expect.objectContaining({ ivrOnDemand: port })`
  (it pinned the whole deps object, so the new key failed it); the same-clock test now also
  asserts the positions registration gets `fakeIvrNow` (hand-mutated: dropping the wiring fails it).
- Fixtures given `pmccTimeline: null` (field only):
  `src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx`,
  `src/renderer/src/pages/PositionDetailContent.test.tsx`,
  `src/renderer/src/pages/PositionDetailPage.test.tsx` (wheel + PMCC fixtures),
  `src/renderer/src/pages/usePositionDetailSheets.test.ts`.

### Interfaces

```typescript
export function getPosition(
  db: Database.Database,
  positionId: string,
  { valuationDate = etDateOf(new Date()) }: { valuationDate?: string } = {}
): GetPositionResult | null

export function registerPositionsHandlers(
  db: Database.Database,
  {
    ivrOnDemand,
    getCurrentDate = () => new Date()
  }: { ivrOnDemand?: IvrOnDemand; getCurrentDate?: () => Date } = {}
): void
```

### Deviations

- The schema field and the two signatures were stubbed in Red (typed stubs per `/red`), so Green
  only filled in the bodies.
- `src/main/index.test.ts` was not in the plan's file list; the wiring change required it.

### Results

- `get-position.test.ts` + `positions.test.ts`: 89 passed.
- `pnpm typecheck`: clean.
- `pnpm test`: 5482 passed, 18 failed — all 18 in `pmcc-coverage-strip.test.ts` /
  `pmcc-timeline-rows.test.ts`, another agent's Area 9 Red stubs (`not implemented`).
- `pnpm lint`: errors/warnings only in the Area 9 in-flight files (`PmccCoverageStrip`,
  `PmccCycleGroup`, `PmccLeapsTrack`, `PmccLegTimeline(.fixture)`, `pmcc-coverage-strip.ts`,
  `pmcc-timeline-rows(.test).ts`); none in Area 4 files.
- No core file changed — no mutation sweep.

### Known limitations / refactor candidates

- `get-position.ts` now has four `isPmcc ? … : null` lines (plan § Refactor: `pmccFields`).
- `positions:get` still bypasses `handleIpcCall` (pre-existing): an exception in `getPosition`
  rejects the invoke instead of returning an `{ ok: false }` envelope.

## Area 9 — `PmccLegTimeline`

### Files touched (production)

- `src/renderer/src/components/position-cockpit/PmccCoverageStrip.tsx` — new
- `src/renderer/src/components/position-cockpit/PmccLeapsTrack.tsx` — new
- `src/renderer/src/components/position-cockpit/PmccCycleGroup.tsx` — new
- `src/renderer/src/components/position-cockpit/PmccLegTimeline.tsx` — new (drawer body only;
  the `CollapsedDrawer` wrapper is Area 10's)
- `src/renderer/src/components/position-cockpit/pmcc-timeline-tones.ts` — new: `NET_TONE`,
  `signedNetTone`, `OUTCOME_TONE` (badge hex, text class, strip segment classes)
- `src/renderer/src/lib/pmcc-coverage-strip.ts` — new: strip copy and placement
- `src/renderer/src/lib/pmcc-timeline-rows.ts` — `cycleTitle`, `cycleOutcome`, `rollNetCell`
- `src/renderer/src/lib/phase.ts` — `TOKEN_HEX` exported (badge tints for `sky`, `violet`,
  `gold`, `green`, `red`, `text-muted` come from the one palette)
- `src/renderer/src/components/ui/TablePrimitives.tsx` — optional `colSpan` on `TableCell`
  (test added in `TablePrimitives.test.tsx`), for the unknown-role and open-cycle rows

### Accessible structure (for Area 10 and the e2e helpers)

- `PmccLegTimeline`: `DrawerCaption` `US-109 · a roll stays inside its cycle`; when closed, a
  `<p>` banner `Position closed <date> · the timeline is complete` above a body wrapped in
  `opacity-70`; then region `Coverage`, region `LEAPS track`, region `Short-call cycles`.
- Headings: `LEAPS track` (h3), `Short-call cycles` (h3), `Cycle N` (h4). Each cycle is a
  region named `Cycle N`.
- Strip: `img` `Cycle N` per segment, `img` `LEAPS roll · <date>` per roll tick, text
  `covered … uncovered`, `today <date>`, `LEAPS $85.00 call · 2028-01-21`.
- LEAPS track: column headers `Event`, `Date`, `Contract`, `Price / share`, `Net`, `Coverage`,
  `Basis after`. Cycle tables have no header row; the basis footer is a `div`, not a row.
- Gap row: `<p>` whose own text is `Uncovered · N days · from to to` and whose full text adds
  ` — no short call open against the LEAPS`; parent `div` is `border-dashed`, all muted, no role.
- Empty cycles: `No short call has been sold against this LEAPS yet. The LEAPS track above is
the whole history.`

### Key decisions

- `Badge` always paints an inline tint, so outcome badges pass the hex for the tint and the
  `text-wb-*` class for the colour token (`Assigned` → `text-wb-red`).
- Strip segments end at `endedOn`, or at `windowEnd` while open; placements clamp to the axis
  (first LEAPS fill → held LEAPS expiration). The only inline `style` is `left` / `width`.
- `PmccCycleGroup` takes just `{ cycle }`: every row carries its own total, so
  `leapsContracts` is not needed.
- The whole-window gap of a LEAPS-only position is not rendered as a gap row (the empty state
  says it), matching the mockup's `Timeline`.

### Deviations from plan

- The cycles panel header shows `cyclesHeader` only; the mockup's trailing
  ` · a roll stays inside its cycle` is the drawer caption instead (it would otherwise appear
  twice).
- A LEAPS `CLOSE` row's Coverage cell reads `closes coverage` (the mockup's US-120 / US-111
  suffix needs settlement data the timeline does not carry).
- Unknown-role rows show the raw role and date, muted, and leave the remaining cells empty (no
  invented note).

### Execution

```
npx vitest run --project renderer <Area 9 specs + helpers + TablePrimitives>
Test Files  7 passed (7)   Tests  123 passed (123)
pnpm test       Test Files 318 passed   Tests 5563 passed
pnpm lint       exit 0
pnpm typecheck  exit 0
```

## Area 10 — Cockpit wiring (+ realized-credits tone fix)

### Files modified

- `/Users/johnteague/my-stuff/wb-109/src/renderer/src/components/position-cockpit/PositionCockpit.tsx`
  — the PMCC branch destructures `pmccTimeline` and, when it is non-null, renders
  `<CollapsedDrawer title="Timeline summary" fieldCount={6} defaultOpen>` around
  `PmccTimelineSummary`, then `<CollapsedDrawer title="Leg timeline" meta={timelineDrawerMeta(pmccTimeline)}>`
  around `PmccLegTimeline`, after `PmccCostBasis`. The wheel branch is untouched.
- `/Users/johnteague/my-stuff/wb-109/src/renderer/src/lib/pmcc-timeline-display.ts` —
  `summaryStats` tones `Realized net credits` `credit` only when `realizedPerShare > 0`
  (`new Decimal(...).gt(0)`, the rule the LEAPS roll net already used), otherwise `default`.

### Mockup check

`mockups/epic-09-pmcc-position-detail.mdx` stacks `Cost basis` → `Timeline summary`
(`fieldCount={6} defaultOpen`) → `Leg timeline` (`defaultOpen={false}`, meta
`N cycles · Nd uncovered`). Matched. Its `Leg reference` drawer is US-118 scope and not built
here (the current branch renders `PmccLegReference` as cards).

### Mutation sweep

Not applicable — no `src/main/core/` change.

### Known limitations (refactor input)

- `PmccCostBasis` owns its drawer while the two new components do not, so the branch mixes a
  self-wrapping component with two caller-wrapped ones.
- `PmccTimelineSummary.spec.tsx` repeats the Background and LEAPS-only summaries that
  `PmccLegTimeline.fixture.ts` already holds.

### Execution

```
pnpm test        Test Files 318 passed (318) · Tests 5573 passed (5573)
pnpm lint        0 errors (1 prettier warning in the spec, fixed by prettier --write)
pnpm typecheck   exit 0
```

## Area 11 — E2E tests

### Product changes

- **`src/main/index.ts`** — the `alert-evaluation` job passes `now: fakeClock?.now()` to
  `evaluateAlerts`. `evaluateAlerts` already took an optional `now` (default `new Date()`), so
  production is unchanged (`fakeClock` is `undefined` without `WHEELBASE_FAKE_NOW`). Before,
  e2e runs that pinned the clock still evaluated alerts at real time, so test 13's "no queue
  entry" assertion would have started failing on 2027-07-19, when the fixture's LEAPS enters
  the 60-day roll window by the real clock.
  - Unit test, written first: `src/main/index.test.ts` › `alert-evaluation handler evaluates at
the fake clock`. Red: `expected "vi.fn()" to be called with arguments … "now":
2026-07-23T15:30:00.000Z`. Green: `index.test.ts` + `evaluate-alerts.test.ts` 62/62.
  - The e2e confirms it end to end: moving the fake clock to 2027-06-01 before evaluating empties
    the flagged position's queue (Red round 2).
- The coordinator separately gated the `remote-debugging-port` 9222 switch on
  `!isE2eRun` (`WHEELBASE_E2E`). Without it, every e2e launch hung while another Electron app held 9222.

No timeline defect was found. All 18 AC literals matched the rendered copy.

### Results

```
pnpm test:e2e e2e/pmcc-leg-timeline.spec.ts
Tests  18 passed (18)   Duration 30.92s

LOG_LEVEL=debug pnpm test:e2e --bail=0
Test Files  47 passed (47)
Tests  576 passed | 1 todo (577)   Duration 1172.76s
```

The existing PMCC specs (`pmcc-cost-basis`, `pmcc-short-call-roll`, `pmcc-leaps-roll`,
`pmcc-leaps-roll-window-alert`, `pmcc-assignment-risk-alert`, `pmcc-position-card`, …) and the
wheel leg-history specs all pass. `LOG_LEVEL=debug` is set because this worktree has no `.env`
and the PMCC alert specs read DEBUG `alert_rule_skipped` lines.

## Addendum (2026-11-12) — A short call past its expiration with no recorded outcome

### Files touched (production)

- `src/main/core/pmcc-timeline-types.ts` — `PmccCycleStatus` gains
  `{ status: 'UNRECORDED'; expiredOn: string; daysHeld: number }`.
- `src/main/core/pmcc-timeline.ts` — `cycleStatus(draft, windowEnd)`: a terminal event →
  `ENDED`; otherwise `dteRemaining = windowEnd → current.expiration`, `< 0` → `UNRECORDED`
  (`expiredOn` = current expiration, `daysHeld` = `openedOn → expiredOn`), else `OPEN`
  (`daysSoFar` = `max(0, openedOn → windowEnd)`). `CycleContext` carries `windowEnd` instead of
  `valuationDate`, so an open cycle of a closed position is measured to its close date.
- `src/main/core/pmcc-timeline-summary.ts` — `coverageEnd(cycle)` (ended → `endedOn`,
  unrecorded → `expiredOn`, open → none) drives the gaps; `open` = every cycle not `ENDED`.
- `src/renderer/src/lib/pmcc-timeline-rows.ts` — `CycleOutcome` adds `UNRECORDED` →
  `Outcome not recorded`; `unrecordedCycleRow`; `cycleOutcome` returns the status unless ended.
- `src/renderer/src/lib/pmcc-timeline-display.ts` — `cycleHeader` accepts an unrecorded cycle
  (`… · 28 days held`); `cycleNetLabel` is `Net credit` only once ended.
- `src/renderer/src/lib/pmcc-coverage-strip.ts` — `cycleSegmentEnd`.
- `src/renderer/src/components/position-cockpit/pmcc-timeline-tones.ts` — `UNRECORDED` tone:
  badge `TOKEN_HEX['text-muted']`, `text-wb-text-muted`, segment
  `bg-wb-text-muted/20 border-wb-border`.
- `PmccCycleGroup.tsx` — `StatusRow`: the last row of a cycle with no terminal event (DTE row or
  `Expired {date} · outcome not recorded`). `PmccCoverageStrip.tsx` — segment ends at
  `cycleSegmentEnd`.

No mockup exists for this scenario; the copy and tones follow the story's UI note.

### E2E coverage added

- `e2e/pmcc-leg-timeline.spec.ts` — test 19, "A short call past its expiration with no recorded
  outcome stops counting as coverage": launched at `2027-08-24T16:00:00Z` with the plain
  Background, then relaunched at `2027-08-20T16:00:00Z` for the expiration-day clause.
- Falsified once: seeding `VARIANTS.assigned` for the first launch fails with
  `expected 'Assigned' to be 'Outcome not recorded'`; the spec was restored (`diff -q` clean).

### Results

- Engine + property: 151 passed. Property stress at `numRuns: 500`, `endOnFailure: true`, seeds
  1, 42, 1234, 98765, 314159, 271828 (scratch setup outside the repo): 6/6 green each.
- Mutation (`pnpm test:mutation --force --mutate src/main/core/pmcc-timeline.ts,src/main/core/pmcc-timeline-summary.ts`):
  `pmcc-timeline.ts` 100 % (315 killed, 4 timeouts — all in `timelineOrder`, genuine loops,
  3 ignored by pre-existing disables), `pmcc-timeline-summary.ts` 100 % (64 killed). No
  survivors on changed lines. (The report also lists pre-existing `costbasis.ts` survivors at
  lines 254–276 — not touched here.)
- `pnpm test`: 318 files, 5652 tests passed. `pnpm lint`, `pnpm typecheck`: clean.
