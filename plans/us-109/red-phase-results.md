# Red Phase Results: US-109 — PMCC leg timeline

## Area 1 — Core engine: ordering, tracks, cycles and replayed basis

- **Plan**: `plans/us-109/plan.md` § 1; types per `plans/us-109/data-model.md` § Type Design
- **Test file**: `src/main/core/pmcc-timeline.test.ts` (42 tests)
- **Fixture**: `src/main/core/test-fixtures/pmcc-timeline-events.ts` — `xyzBackground(options)`
  (the Background as literal events; options `contracts`, `leapsFees`, `cycle1Fees`,
  `leapsRollOpenedOn`, `cycle9AssignedOn`, `valuationDate`, `closedDate`), `withEvents`,
  `unknownEvent`, `leapsCloseEvent`, `shortRollInput`, `lossCycleInput`
- **Stub**: `src/main/core/pmcc-timeline.ts` — every type, `buildPmccTimeline` throws
  `not implemented`

### Interface under test

```typescript
export function buildPmccTimeline(input: PmccTimelineInput): PmccTimeline
```

### Design decisions

- The Background records cycle 7's open (seq 13) before cycle 6's expiration (seq 14), both on
  2027-05-07, so only the event rank (not `seq`) can give `15.1500` then `13.4000`. The LEAPS
  close test gives the close a lower `seq` than the same-day assignment for the same reason.
- Rounding case deviates from the plan's example: a `0.05` fee gives `0.0005` per share, which
  has no fifth decimal. The test uses a `0.0150` fee on cycle 1 (`199.985` dollars →
  `1.99985` / share → `1.9999` half-up; half-even would give `1.9998`).
- Row `total`s are unsigned gross fill dollars (price × 100 × contracts, fees shown separately);
  the renderer signs them by row kind. Cycle `netPerShare` / `netTotal` are signed.
- Extra cases beyond the plan list: the window fields (`start`, `windowEnd`, …), a cycle with a
  negative net, a roll's fees inside its net, `seq` as the last tie-break, an unknown leg on the
  day a cycle opens, and a history with no `LEAPS_OPEN` (throws).
- No property tests in this area: they need the summary (Area 2).

### Execution

```
pnpm test src/main/core/pmcc-timeline.test.ts
Tests  17 failed | 25 skipped (42)
```

Every failure is the stub's `not implemented` (thrown directly, or from a `beforeAll`, which
skips that block's tests); the one `toThrow` test fails on the wrong message. No import, type or
fixture errors; `tsc -p tsconfig.node.json` is clean.

## Area 2 — Core engine: gaps, coverage, flags and summary

- **Plan**: `plans/us-109/plan.md` § 2; types per `plans/us-109/data-model.md` § 2
- **Test files**:
  - `src/main/core/pmcc-timeline.test.ts` — 31 new example tests (77 in the file)
  - `src/main/core/pmcc-timeline.property.test.ts` — new, 5 properties
- **Fixtures**:
  - `src/main/core/test-fixtures/pmcc-timeline-events.ts` — adds `withEventDate(input, seq, date)`,
    `leapsOnlyInput(valuationDate?)`, `outlastingShortInput(shortExpiration)`, and a
    `{ buyPrice, cashPerShare }` option on `secondLeapsRollEvent` (debit roll)
  - `src/main/core/test-fixtures/arbitraries.ts` — adds `pmccTimelineEvents:
fc.Arbitrary<PmccTimelineInput>`
- **Stub**: `pmcc-timeline.ts` gained `PmccGap`, `PmccTimelineSummary`, `PmccCycleFlag`, `flag` on
  every cycle and `gaps` / `summary` on `PmccTimeline`; the engine returns `gaps: []`, a
  zero/null summary and `flag: null` (Area 1 behaviour is live, so the stub cannot throw).

### Interface under test

```typescript
export type PmccCycleFlag = { daysPastLeaps: number; leapsExpiration: string }
export type PmccGap = { afterCycle: number | null; beforeCycle: number | null; from: string; to: string; days: number }
export type PmccTimelineSummary = { cycleCount; closedCount; openCount; realizedPerShare; realizedTotal;
  averagePerShare | null; averageTotal | null; openCreditPerShare | null; leapsRollNetPerShare | null;
  totalDays; uncoveredDays; coveredDays; shortCreditsPerShare; leapsCostPerShare; basisPerShare }
// PmccCycle gains `flag: PmccCycleFlag | null`; PmccTimeline gains `gaps` and `summary`.
```

### Example cases

- Background gaps (exact list of 7, none between cycles 6 and 7), 333 / 44 / 289 days.
- Between-cycle boundary (cycle 2 sold 2026-10-15 / -16 / -17): none / none / 1 day.
- Leading boundary (cycle 1 sold 2026-09-13 / -14 / -15): none / none / 1 day.
- Trailing boundary (cycle 9 assigned 2027-08-20, valuation -20 / -21 / -24): none / 1 / 4 days.
- Closed 2027-08-20, valuation 2027-09-02: no trailing gap, 340 / 44 / 296.
- `lossCycleInput`: a 39-day leading and a 7-day trailing gap; realized and average signed
  negative.
- LEAPS only: one 73-day whole-window gap and the full `summary` literal; the same-day window has
  no gap.
- Flag: short expiring 29 days after / the day after / the same day / the day before the LEAPS;
  no flag anywhere on the Background.
- Summary: Background (full literal), assigned (9 closed, `15.9500`, average `1.7722` /
  `177.2222`), fees, 3 contracts, a second LEAPS roll as a credit (`4.5000`) and a debit
  (`-0.5000`), an unknown leg changing nothing.
- Which cycle a short end belongs to: cycle 2 sold the day before cycle 1 expired must still end
  cycle 1 (the gap boundary depends on it); an end whose contract no cycle holds attaches to the
  latest cycle.

### Properties (`pmccTimelineEvents`)

The arbitrary builds a valid history by construction (no `fc.pre`): a LEAPS bought on an
`isoDay`, 0–2 LEAPS rolls (each 0–3 days between selling the old and buying the new), 0–5
sequential cycles (0–30 days apart, 0–2 rolls each, an outcome, the last possibly open), fees on
every leg, an optional close date when no cycle is open, and a valuation date on or after the
window's end. Dates are day offsets from `isoDay` via `date-fns` rather than `orderedDays`:
`orderedDays` allows ties, and a cycle's open, rolls and end on one day hit the ADR rank order
(`SHORT_END` < `SHORT_ROLL` < `SHORT_OPEN`), which misfiles them — see "Notes".

- **Oracle** — realized + Σ open `netTotal` equals `calculatePmccLedger(...).shortCreditsTotal`
  over the generator's own contributions (exact `Decimal`), and the summary's three ledger
  fields equal the ledger's.
- **Invariant** — `totalDays` is `differenceInCalendarDays(windowEnd, start)`; covered +
  uncovered = total; uncovered = Σ gap days; both ≥ 0.
- **Order independence** — a shuffled `events` array gives a deeply equal timeline.
- **Scale invariance** — × k on every contract and fee: per-share figures, roll directions and
  every `basisAfter` unchanged; every exact dollar total × k. `averageTotal` is excluded:
  realized ÷ closed count rounds before it scales.
- **Guard** — `cycles.length` equals the number of `SHORT_OPEN` events.

### Execution

```
pnpm test src/main/core/pmcc-timeline
Tests  29 failed | 53 passed (82)
```

Every failure is an assertion against the stub (empty `gaps`, zero summary, `null` flag), or
cycle 1 left `OPEN` when cycle 2 was sold first. No import, type or fixture errors;
`tsc -p tsconfig.node.json` is clean.

Passing against the stub, by design:

- the two "no flag" boundary cases and "no flag on the Background" — `null` is the stub
  default; they fail a `>=` comparison in Green;
- the unmatched short end attaching to the latest cycle — Area 1 already does this; it pins the
  fallback the Green change must keep;
- order independence, scale invariance and guard — they hold for the Area 1 fields already and
  must keep holding once gaps and the summary are real.

---

## Area 3 — Service: legs to timeline events

### Files

- `/Users/johnteague/my-stuff/wb-109/src/main/services/pmcc-timeline.test.ts` — new, 16 tests
- `/Users/johnteague/my-stuff/wb-109/src/main/services/test-fixtures/pmcc-legs.ts` — adds
  `CLOSE_1`, `ASSIGNED_1`, `SHORT_ROLL_FEES`, `LEAPS_ROLL_SPLIT`, `UNKNOWN_ROLE`,
  `UNPAIRED_ROLL_TO`; `SHORT_ROLL` now built by a `shortRollLegs(chainId, overrides)` helper
  (same legs as before)
- `/Users/johnteague/my-stuff/wb-109/src/main/services/pmcc-timeline.ts` — typed stub

### Interface under test

```typescript
// src/main/services/pmcc-timeline.ts
export type PmccTimelineOptions = { valuationDate: string; closedDate: string | null }
export function pmccTimelineFromLegs(
  legs: LegRecord[],
  opts: PmccTimelineOptions
): PmccTimeline | null
```

### Cases

- `LEAPS_OPEN` + `SHORT_CALL_OPEN` → the literal `PURCHASE` row (`25.0000`, 368 DTE, basis
  `25.0000`) and one `OPEN` cycle whose opening is `110.0000` · 2026-10-16 @ `2.0000`.
- BUY-`ROLL_FROM` chain → `ROLL` row #1 in cycle 2 (debit `0.6000` / `60.0000`), nothing added
  to the LEAPS track.
- SELL-`ROLL_FROM` chain whose legs filled two days apart → LEAPS `ROLL` #1, credit `2.5000` /
  `250.0000`, `coverage { unbroken: false, gapDays: 2, extensionDays: 126 }` (proves `closedOn` /
  `openedOn` come from the two legs, not the chain's single date), basis `20.5000`.
- `SHORT_CALL_EXPIRED` / `_CLOSE` / `_ASSIGNED` → `EXPIRED` / `CLOSED` / `ASSIGNED`; only
  `CLOSED` has `pricePerShare` `0.5500` and `total` `55.0000`.
- `CC_CLOSE` leg inside cycle 1 → `UNKNOWN` row in the cycle; unpaired `ROLL_TO` after cycle 1
  ended → `UNKNOWN` row on the LEAPS track; a `ROLL_FROM` with a null chain id → `UNKNOWN`.
  Cycle net stays `2.0000`, basis `23.0000` and equal to `pmccLedgerFromLegs(legs)`. The
  unknown legs carry non-zero premiums so counting them would move both figures.
- Short roll with `$0.65` on each leg → cycle 2 net `1.1870` / `118.7000`, roll row debit
  `0.6130` / `61.3000`, fees `1.3000` (a double count would give `117.4000`).
- Added beyond the plan — strike/price normalisation: opening legs stored as `'80'`, `'110'`,
  `'25'`, `'2'` (the `_test:pmcc-seed-position` seam accepts any `z.string()`), with cycle 2
  sold before cycle 1's `'110.0000'` expiry. Without normalising, the engine's string-equality
  pairing falls back to cycle 2; the test asserts cycle 1 `ENDED`, cycle 2 `OPEN`, and 4-dp
  strings on every contract.
- No LEAPS leg (only a short; no legs) → `null`.
- DEBUG `pmcc_timeline_events` with `events: [{ kind, date }]`; no INFO.
- Added beyond the plan (plan lists it as a Refactor check) — calling `pmccLedgerFromLegs` and
  `pmccTimelineFromLegs` on the same legs, as `getPosition` will, warns
  `pmcc_ledger_unknown_leg_role` exactly once.

No property file: the service is a mapping with no algebraic shape of its own; the engine's
properties (Area 2) cover the fold, and the ledger-agreement case is the oracle here.

### Execution

```
pnpm test src/main/services/pmcc-timeline.test.ts
Tests  16 failed (16)
```

Every failure is `Error: not implemented` from the stub. `tsc -p tsconfig.node.json` clean;
the other fixture users (`pmcc-ledger.test.ts`, `roll-pmcc-*.test.ts`) still pass (112).

## Area 6 — Renderer display helpers

### Test file

- `/Users/johnteague/my-stuff/wb-109/src/renderer/src/lib/pmcc-timeline-display.test.ts` — 75 cases
  over literal `PmccTimeline` slices of the XYZ Background, the LEAPS-only, assigned, fees and
  3-contract variants.

### Interfaces under test (`src/renderer/src/lib/pmcc-timeline-display.ts`, typed stub)

Section copy: `timelineDrawerMeta`, `leapsTrackHeader`, `cyclesHeader`, `cycleHeader`,
`signedPerShareAndTotal`, `netLabel`, `leapsCoverageCell`, `gapRow`, `coverageFlag`,
`summaryStats` (→ `SummaryStat[]`, `{ label, value, tone }`), `reconciliationLine`
(→ `{ lead, basis, tail }`), `coverageStripLine`, `closedBanner`.

Row copy (for `PmccLeapsTrack` / `PmccCycleGroup`, plan §9): `contractLabel`,
`rollContractLabel`, `leapsRollPrices`, `shortRollPrices`, `feesSuffix`, `rowAmounts`
(→ `{ price, total }`), `outcomeLabel`, `leapsEventLabel`, `cycleEventLabel`, `rollMarker`,
`cycleNetLabel`, `openCycleRow`, `leapsBasisCell`, `basisFooter`.

Each takes a `Pick`-derived slice of the engine types, imported type-only from
`src/main/core/pmcc-timeline` (as `pmcc-card-legs.ts` imports from `main/core`).

### Design decisions

- Every expected value is the OPT-17 literal (minus U+2212); none is computed in the test.
- Rounding: `1.2350` → `$1.24` and `1235.0050` → `$1,235.01` (half up), `-1.2350` → `−$1.24`
  (away from zero).
- Singular/plural at 1 for every day / cycle / roll count the copy pluralises (`1 cycle`,
  `1 day held`, `1 day so far`, `+1 day`, `1 day` gap, `1 roll`); `N day gap` is adjectival
  and never pluralises.
- `summaryStats` returns a `tone` so the component colours without keying on labels:
  `credit` (realized, LEAPS roll net), `open` (open credit), `muted` (`—`, `no roll yet`),
  `default` otherwise. The empty case asserts the whole array so a non-muted `—` fails.
- `reconciliationLine` is split `{ lead, basis, tail }` because plan §8 colours the basis
  `text-wb-sky`; the Background case asserts all three literals, the fees case the joined
  sentence.
- A row's `total` from the engine is unsigned; `rowAmounts` signs by kind (OPEN / LEAPS
  CLOSE `+`, PURCHASE / CLOSED buyback `−`) and appends `feesSuffix` only when fees are
  non-zero. EXPIRED → `expired worthless` / `—`; ASSIGNED → `— (assigned)` /
  `settlement recorded by US-111`.
- No property file: renderer string formatting with no algebraic shape; examples pin each
  literal.

### Execution

```
pnpm test src/renderer/src/lib/pmcc-timeline-display.test.ts
Tests  75 failed (75)
```

Every failure is `Error: not implemented` from the typed stub. `pnpm typecheck` is clean.

## Area 8 — `PmccTimelineSummary`

### Test files

- `/Users/johnteague/my-stuff/wb-109/src/renderer/src/components/position-cockpit/PmccTimelineSummary.spec.tsx`
  — 19 cases over two literal summaries kept in the spec (the XYZ Background and the LEAPS-only
  `$95 · 2028-06-16` variant). The component reads only `timeline.summary`, so no shared
  timeline fixture file was needed.
- `/Users/johnteague/my-stuff/wb-109/src/renderer/src/lib/pmcc-timeline-display.test.ts` — 4 new
  `summaryStats` cases for the LEAPS roll net tone: `-0.6000` and `-0.0001` (a debit that
  rounds to `−$0.00`) and `0.0000` read `default`; `0.0001` reads `credit`.

### Interface under test (typed stub)

```typescript
// src/renderer/src/components/position-cockpit/PmccTimelineSummary.tsx
export type PmccTimelineSummaryProps = { timeline: Pick<PmccTimeline, 'summary'> }
export function PmccTimelineSummary(props: PmccTimelineSummaryProps): React.JSX.Element
```

### Coverage

- Caption `US-109 · reconciles to the Cost basis drawer above`.
- The six stat values for the Background, each asserted as the exact text beside its label,
  and the six labels in AC order.
- The reconciliation sentence (exact joined text on one `div` with `font-wb-mono
text-wb-text-secondary`), and the basis `$6.55` in `text-wb-sky`.
- Tones: realized `text-wb-green`, open credit `text-wb-gold`; Cycles and Coverage carry none of
  the three tone classes; a net-debit LEAPS roll is not green.
- No cycles: Average and Open cycle credit `—`, LEAPS roll net `no roll yet`, each in
  `text-wb-text-muted`; the reconciliation reads `open $0.00`.
- No `%` / `annualized` anywhere, with the Cycles value asserted in the same test as the
  positive control.

### Design decisions

- Zero LEAPS roll net is not a credit: only a strictly positive net reads green. Zero still
  reads `+$0.00` (the existing `signedMoneyGrouped` sign).
- No property file: presentational component and a string tone rule; boundary examples at
  −0.0001 / 0 / +0.0001 pin the threshold.

### Execution

```
npx vitest run …/PmccTimelineSummary.spec.tsx src/renderer/src/lib/pmcc-timeline-display.test.ts
Tests  22 failed | 38 passed (60)
```

19 spec failures are `Error: not implemented` from the stub; 3 display failures are the
`credit` tone on a negative / zero LEAPS roll net (the `0.0001 → credit` case passes against
the current code by design — it is the positive side of the boundary). Renderer typecheck is
clean for these files.

## Area 4 — `positions:get` returns the timeline at the Eastern valuation date

### Test files modified

- `src/main/services/get-position.test.ts` — new `describe('getPosition — PMCC timeline (US-109)')`
  (3 tests) plus a local `seedPmcc(db, pick)` helper; `getDetail` gains an optional `opts`.
- `src/main/ipc/positions.test.ts` — new nested `describe('positions:get valuation date (US-109)')`
  (3 tests); `registerAndGetChannelHandler`'s `deps` accepts `getCurrentDate`. The existing
  `positions:get returns ok:true…` test drops its `toHaveBeenCalledWith(db, 'p1')` line — the call
  now carries a third argument, and the new tests assert the full call.

### Interfaces under test (typed stubs added)

```typescript
// src/main/schemas.ts
interface GetPositionResult {
  /* … */ pmccTimeline: PmccTimeline | null
} // from core/pmcc-timeline

// src/main/services/get-position.ts — stub returns pmccTimeline: null, ignores opts
export function getPosition(
  db: Database.Database,
  positionId: string,
  opts?: { valuationDate?: string }
): GetPositionResult | null

// src/main/ipc/positions.ts — stub accepts but ignores getCurrentDate
export function registerPositionsHandlers(
  db: Database.Database,
  deps?: { ivrOnDemand?: IvrOnDemand; getCurrentDate?: () => Date }
): void
```

### Cases

- PMCC seeded on the fixed calendar (OPEN, EXPIRE_1, SHORT_2, SHORT_ROLL, LEAPS_ROLL) at
  `valuationDate: '2026-12-15'` → `pmccTimeline.valuationDate` `2026-12-15`,
  `summary.basisPerShare` `19.3000` and equal to `pmccLedger.basisPerShare`.
- PMCC set `CLOSED` with `closed_date = '2026-10-20'` → `pmccTimeline.closedDate` `2026-10-20`.
- Wheel → `pmccTimeline` `null` (positive control: `strategyType` `WHEEL`).
- `getCurrentDate` → `2027-08-14T02:30:00Z`: `getPosition(db, 'p1', { valuationDate: '2027-08-13' })`.
- `getCurrentDate` → `2027-08-14T05:00:00Z`: `{ valuationDate: '2027-08-14' }`.
- No `getCurrentDate`, wall clock pinned to `2030-01-01T17:00:00Z`: `{ valuationDate: '2030-01-01' }`.
  The two `getCurrentDate` cases run with the wall clock pinned to that same 2030 instant, so a
  handler that ignored `getCurrentDate` fails them.

### Design decisions

- PMCC legs are inserted directly (`insertPosition` + `insertLegs`) on `FIXED_DAY` rather than via
  `createPmccPosition`, whose opening validation rejects a short already expired against the real
  clock — fixture dates stay literal.
- The IPC tests assert the arguments the handler passes to the mocked `getPosition` service (the
  module boundary): with the service mocked, the valuation date it is handed is the handler's only
  observable output. Echoing it back through a fake `pmccTimeline` would assert the same thing less
  directly.
- No property test: no new pure engine logic (`etDateOf` already has its own tests).

### Execution

```
npx vitest run src/main/services/get-position.test.ts src/main/ipc/positions.test.ts
Tests  5 failed | 84 passed (89)
```

- 3 IPC cases fail: `expected "vi.fn()" to be called with arguments: [ {}, 'p1', …(1) ]` (stub calls
  `getPosition(db, id)`).
- 2 service cases fail: `expected undefined to be '2026-12-15'` / `'2026-10-20'` (stub returns
  `pmccTimeline: null`).
- The wheel `pmccTimeline: null` case passes against the stub by design — `null` is the stub's
  default and the correct answer; it guards the wheel branch through Green and Refactor.
- `pnpm typecheck`: main side clean; the renderer fixtures that build a `GetPositionResult`
  (`PositionCockpit.spec.tsx`, `PositionDetailContent.test.tsx`, `PositionDetailPage.test.tsx` ×2,
  `usePositionDetailSheets.test.ts`) now miss `pmccTimeline` — fixed in Green.

## Area 9 — `PmccLegTimeline`

### Test files

- `src/renderer/src/components/position-cockpit/PmccLeapsTrack.spec.tsx` — 10 tests
- `src/renderer/src/components/position-cockpit/PmccCycleGroup.spec.tsx` — 25 tests
- `src/renderer/src/components/position-cockpit/PmccCoverageStrip.spec.tsx` — 11 tests
- `src/renderer/src/components/position-cockpit/PmccLegTimeline.spec.tsx` — 16 tests
- `src/renderer/src/lib/pmcc-coverage-strip.test.ts` — 11 tests (new helper module)
- `src/renderer/src/lib/pmcc-timeline-rows.test.ts` — +7 tests (`cycleTitle`, `cycleOutcome`, `rollNetCell`)
- Fixture: `src/renderer/src/components/position-cockpit/PmccLegTimeline.fixture.ts` — the
  Background as a literal `PmccTimeline` (`XYZ_TIMELINE`, `xyzCycle(n)`), plus
  `XYZ_CYCLE_9_ASSIGNED`, `XYZ_CLOSED_TIMELINE` (closed 2027-08-20, valued 2027-09-02) and
  `LEAPS_ONLY_TIMELINE` ($95 · 2028-06-16, no cycles). No main-process code is called.

### Interfaces under test

```typescript
// components/position-cockpit/
PmccCoverageStrip({ timeline }: { timeline: Pick<PmccTimeline,'start'|'windowEnd'|'valuationDate'>
  & { leapsTrack: Pick<PmccLeapsTrack,'current'|'rows'>; cycles: PmccCycle[];
      summary: Pick<PmccTimelineSummary,'coveredDays'|'totalDays'|'uncoveredDays'> } })
PmccLeapsTrack({ closedDate, leapsTrack }: Pick<PmccTimeline,'closedDate'> & { leapsTrack: PmccLeapsTrack })
PmccCycleGroup({ cycle }: { cycle: PmccCycle })
PmccLegTimeline({ timeline }: { timeline: PmccTimeline })

// lib/pmcc-coverage-strip.ts
stripRange({ start, leapsTrack: { current } }): StripRange  // { start, end }
stripCaption(range), stripLeapsLabel(current), rollTickLabel(date), todayMarker(date): string
stripPlacement(range, from, to): { left: string; width: string }  // 3-dp %, clamped to the axis

// lib/pmcc-timeline-rows.ts (added)
cycleTitle(number): string                     // `Cycle 2`
cycleOutcome(cycle): PmccShortOutcome | 'OPEN'
rollNetCell({ net, fees }): string             // netLabel + feesSuffix
```

### Accessible structure the specs fix

- Regions: `Coverage` (strip), `LEAPS track`, `Short-call cycles`, `Cycle N` (one per cycle,
  labelled by its `Cycle N` heading).
- Headings: `LEAPS track`, `Short-call cycles`, `Cycle N`.
- Strip: `img` per cycle segment named `Cycle N`; `img` per LEAPS roll tick named
  `LEAPS roll · <date>`.
- LEAPS track column headers: `Event`, `Date`, `Contract`, `Price / share`, `Net`, `Coverage`,
  `Basis after`. Cycle tables have no header row, so a cycle's `row`s are exactly its legs; the
  basis footer is not a row.
- Gap row: the text element reads `Uncovered · N days · from to to`, its parent's text adds
  ` — no short call open against the LEAPS`.

### Design decisions

- Row cells are asserted as the full ordered `cell` text list, so a misplaced or extra cell
  fails, and so the basis is asserted in its own column.
- Colour is behaviour here (credit/debit, ended/open/assigned), so tone classes are asserted:
  `text-wb-green` / `text-wb-gold` on nets, `text-wb-red` on `Assigned`, `text-wb-gold` on
  `Open`, `bg-wb-green/20` / `bg-wb-gold-dim` / `bg-wb-red/30` on strip segments.
- Strip placements are calendar days ÷ 494 computed independently (Python `date`), e.g.
  cycle 9 `63.158%` / `4.251%`; cycle 5 ends at its buyback, not its expiration.
- Every absence assertion has a positive control in the same test (heading, segment, region).
- The closed body's muted class is `opacity-70` (the mockup's), asserted via `closest()`, with
  the banner outside it.
- No property file: renderer components and string helpers with no algebraic shape.

### Execution

```
npx vitest run --project renderer <the six files>
Tests  80 failed | 38 passed (118)
```

The 38 passes are the pre-existing `pmcc-timeline-rows` tests. Every new failure is
`Error: not implemented` (helpers) or an element not found because the component stub renders
`null`. `pnpm typecheck` is clean.

## Area 10 — Cockpit wiring (+ realized-credits tone fix)

### Test files modified

- `/Users/johnteague/my-stuff/wb-109/src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx`
  — new `PMCC position › leg timeline drawers` block (5 tests) and a new
  `wheel position never renders the PMCC leg timeline` block (1 test)
- `/Users/johnteague/my-stuff/wb-109/src/renderer/src/lib/pmcc-timeline-display.test.ts`
  — realized net credits tone at `-0.0001`, `0.0000`, `0.0001`; the LEAPS-only expectation
  now reads `tone: 'default'` for `+$0.00`
- `/Users/johnteague/my-stuff/wb-109/src/renderer/src/components/position-cockpit/PmccTimelineSummary.spec.tsx`
  — a `−$0.40 / share (−$40.00)` realized total is not `text-wb-green` (positive control:
  the stat's text reads that value)

### Behaviours

- PMCC with `pmccTimeline: XYZ_TIMELINE`: the leg reference (`Buy LEAPS call`), the `Cost basis`
  button, the `Timeline summary` button and the `Leg timeline` button follow one another in
  document order.
- `Timeline summary` is `aria-expanded="true"`, reads `6 fields`, and its caption is visible.
- `Leg timeline` is `aria-expanded="false"`, its header reads `9 cycles · 44d uncovered`, and the
  `LEAPS track` heading is absent (positive control: the button itself).
- Clicking `Leg timeline` shows the `LEAPS track` heading; clicking again removes it.
- `pmccTimeline: null`: neither button renders; positive control is the `Cost basis` button.
- Wheel `CC_OPEN` (carrying a non-null `pmccTimeline` on purpose, so an implementation keyed only
  on the timeline would fail): the `Running Basis / Share` column header is visible after opening
  `Cost basis & history`; no `Timeline summary` / `Leg timeline` button, no `LEAPS track`
  heading, no `uncovered` text.
- `summaryStats` tones realized net credits `credit` only when `realizedPerShare > 0`.

### Design notes / deviations

- The plan names a `Leg reference` _drawer_. The PMCC branch has no such drawer: `PmccLegReference`
  renders `Buy LEAPS call` / `Sell short call` cards and the initial-net-debit card (the
  consolidated mockup's `Leg reference` drawer belongs to US-118's cockpit). The order test anchors
  the leg reference on its `Buy LEAPS call` header instead.
- Passing by design (guards for behaviour the Green change must not break): the `pmccTimeline:
null` test, the wheel `CC_OPEN` test, and the `0.0001` → `credit` boundary row.

### Execution

```
pnpm vitest run PositionCockpit.spec.tsx PmccTimelineSummary.spec.tsx pmcc-timeline-display.test.ts
Tests  8 failed | 97 passed (105)
```

Failures: four cockpit tests — `Unable to find an accessible element with the role "button" and
name /Timeline summary/` (or `/Leg timeline/`); three `summaryStats` rows/expectations receiving
`tone: 'credit'`; the component test finding `text-wb-green` on the negative realized total. All
are the missing feature, not test bugs.

## Area 11 — E2E tests

### Files

- `/Users/johnteague/my-stuff/wb-109/e2e/pmcc-timeline-helpers.ts` — new. `launchTimeline(fakeNow)`
  (`buildLaunchEnv` + closed market session + `WHEELBASE_FAKE_NOW`, default
  `2027-08-13T16:00:00Z`), `disposeTimeline`; the Background as one keyed `BACKGROUND` literal
  (data-model § 5, cycles 3–7 exactly) and `VARIANTS` as patches over it (`brokenLeapsRoll`,
  `unrolledCycle2`, `backToBack`, `assigned`, `closedAssigned`, `threeContracts`, `unknownRole`,
  `fees`); `LEAPS_ONLY`, `OUTLASTING_SHORT`; seeding over `window.api.testPmccSeedPosition`;
  readers for both drawers (`readLeapsTrack`, `readCycle`, `gapRows`, `summaryStat`,
  `reconciliation`, `region`, `precedes`).
- `/Users/johnteague/my-stuff/wb-109/e2e/pmcc-leg-timeline.spec.ts` — new, 18 `it()`s named
  verbatim from OPT-17; literals from plan.md § 11.
- `src/main/index.ts` / `src/main/index.test.ts` — the alert-evaluation job now runs at
  `fakeClock?.now()` (see the Area 11 Green section); the e2e-only switch that skips the 9222
  remote-debugging port under `WHEELBASE_E2E` was the coordinator's change.

### Design decisions

- **Test 1:** no `Leg reference` drawer exists on a PMCC (it arrives with US-118; the leg
  reference renders as cards), so order is asserted `Cost basis` → `Timeline summary` →
  `Leg timeline`. "No phase badge": the drawer body contains neither `LEAPS + short call open`
  (`PHASE_LABEL.PMCC_OPEN`) nor `PMCC_OPEN`; positive control is the `Event` column header,
  found inside the same drawer that has no `Role`/`Action`/`Strike` header.
- **Test 13:** the alert job used to read the real clock, so any absence assertion would start
  failing once real time reached the fixture's LEAPS roll window (2027-07-19). The job now
  honours `WHEELBASE_FAKE_NOW`; at 2027-08-13 the flagged LEAPS is 35 DTE, so the queue holds
  exactly `['PMCC_LEAPS_ROLL_WINDOW']` for it — proof the position was evaluated, and nothing
  else for the short outlasting the LEAPS.
- **Test 10:** `Premium recovered` (a `%` value in US-103's Cost basis drawer) proves a percentage
  does render on this page, so the `%` absence in the two US-109 drawers is not vacuous.
- **Test 17:** launched without a fake clock; the wheel is taken to `CC_OPEN` with the existing
  helpers and its call closed early. Positive controls: the `Running Basis / Share` column
  header and the `CC Close` leg badge.
- Cycle assertions read one `Cycle N` region (`readCycle`), so another cycle's value cannot
  satisfy them.

### Falsification (feature already built — every test shown to fail once)

Round 1, one break per test, all 18 at once (`--bail=0`): **18 failed**, each at the assertion
the break targeted.

| #   | Break                                                              | Failure                                                                                  |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1   | seed `backToBack`                                                  | `expected '▶Leg timeline9 cycles · 37d uncovered' to contain '9 cycles · 44d uncovered'` |
| 2   | first fixture `brokenLeapsRoll`                                    | `expected '2 day gap · +126 days' to be 'unbroken · +126 days'`                          |
| 3   | first fixture `unrolledCycle2`                                     | `expected null to be '1 roll'`                                                           |
| 4   | cycle 1 sold at 2.10                                               | `expected '+$2.10 / share (+$210.00)' to be '+$2.00 / share (+$200.00)'`                 |
| 5   | cycle 5 bought back at 0.60                                        | `expected '+$1.60 / share (+$160.00)' to be '+$1.65 / share (+$165.00)'`                 |
| 6   | cycle 9 assigned                                                   | header copy no longer `… 21 days so far`                                                 |
| 7   | first fixture `backToBack`                                         | `expected 'Uncovered · 17 days · …' to be 'Uncovered · 7 days · …'`                      |
| 8   | seed `fees`                                                        | `expected '$25.01' to be '$25.00'` (LEAPS purchase basis)                                |
| 9   | seed `threeContracts`                                              | `expected '+$14.00 / share (+$4,200.00)' to be '+$14.00 / share (+$1,400.00)'`           |
| 10  | inject `1.8%` into cycle 1's heading                               | `expected 'US-109 · a roll stays inside its cycl…' not to contain '%'`                   |
| 11  | cycle 9 not assigned                                               | `expected 'Open' to be 'Assigned'`                                                       |
| 12  | LEAPS-only seed plus a short                                       | `expected 1 to be +0` (cycle count)                                                      |
| 13  | short expires 2027-09-10 (before the LEAPS)                        | flag is `null` — the `toContain` on the flag sentence fails                              |
| 14  | 1 contract                                                         | `expected '+$2.00 / share (+$200.00)' to be '+$2.00 / share (+$600.00)'`                 |
| 15  | no `CC_CLOSE` leg                                                  | `expected undefined to deeply equal [ 'CC_CLOSE', '2027-08-04' ]`                        |
| 16  | not closed (`assigned`)                                            | banner `Position closed …` never renders (locator timeout)                               |
| 17  | inject a `Coverage` section with `Uncovered` into the wheel detail | `expected 'AAPLHolding Shares…' not to contain 'Uncovered'`                              |
| 18  | no fees                                                            | `expected '$25.00' to be '$25.01'`                                                       |

Round 2, the halves round 1 did not reach: **4 failed**.

| #                  | Break                                                     | Failure                                                                                                 |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 2 (second fixture) | broken-roll fixture → Background                          | `expected 'unbroken · +126 days' to be '2 day gap · +126 days'`                                         |
| 3 (second fixture) | unrolled fixture → Background                             | `expected '+$1.20 / share (+$120.00)' to be '+$1.80 / share (+$180.00)'`                                |
| 7 (second fixture) | back-to-back fixture → Background                         | `expected 'Uncovered · 7 days · …' to contain 'Uncovered · 17 days · …'`                                |
| 13 (alert half)    | `testIvrSetNow('2027-06-01T16:00:00Z')` before evaluating | `expected [] to deeply equal [ 'PMCC_LEAPS_ROLL_WINDOW' ]` — also proves the job reads the pinned clock |

The spec was restored from a byte-identical backup after each round (`diff -q` clean).

### First run (before falsification)

17 passed, 1 failed: test 17's positive control looked for `CC_CLOSE`, but the wheel table
labels the role `CC Close` (`LEG_ROLE_LABEL`). It was a test bug, not a product defect, and was
corrected.

## Addendum (2026-11-12) — A short call past its expiration with no recorded outcome

New OPT-17 scenario: "A short call past its expiration with no recorded outcome stops counting
as coverage". Red per layer, typed stubs first.

### Interfaces under test

```typescript
// src/main/core/pmcc-timeline-types.ts
export type PmccCycleStatus =
  | { status: 'OPEN'; daysSoFar: number; dteRemaining: number }
  | { status: 'UNRECORDED'; expiredOn: string; daysHeld: number }
  | { status: 'ENDED'; outcome: PmccShortOutcome; endedOn: string; daysHeld: number }

// src/renderer/src/lib/pmcc-timeline-rows.ts
export type CycleOutcome = PmccShortOutcome | 'OPEN' | 'UNRECORDED'
export function unrecordedCycleRow(cycle: { expiredOn: string }): string
export function cycleOutcome(
  cycle: { status: 'OPEN' } | { status: 'UNRECORDED' } | { status: 'ENDED'; outcome }
): CycleOutcome

// src/renderer/src/lib/pmcc-coverage-strip.ts
export function cycleSegmentEnd(cycle: CycleSpan, windowEnd: string): string
```

### Engine (`src/main/core/pmcc-timeline.test.ts`)

New describe "a short call past its expiration with no recorded outcome" (fixture
`xyzBackground({ valuationDate: '2027-08-24' })`, new builder `cycle9ExpiredEvent`):

- states cycle 9 as expired 2027-08-20 with no outcome recorded, held 28 days, with no DTE left
- ends its coverage at the expiration: a 4-day trailing gap to the valuation date (344 / 48 / 296)
- still counts it as open: its credit is not realized until the outcome is recorded _(guard —
  passes before green by design: it pins that UNRECORDED is not realized)_
- reads cycle 9 valued the day before / the day of / the day after its expiration →
  `OPEN` dte 1, `OPEN` dte 0, `UNRECORDED` (only the last is red; the first two are the boundary's
  other sides)
- measures cycle 9 of a position closed before / on / after its expiration to the close date, not
  the later valuation date (2027-09-02) — all red (old code: `daysSoFar` 41, `dteRemaining` −13)
- turns ended and expired, keeping its 28 days and its gap, once the expiration is recorded
  _(guard — passes before green: holderIndex is unchanged)_
- the existing "counts no negative days so far…" table now also asserts `dteRemaining` measured
  to the clamped window end (32/32/31) — red on the day-before row (old: 33)
- type tests `PmccCycleStatus — a short past its expiration is neither open nor ended`: admits
  `UNRECORDED` with `expiredOn`/`daysHeld`; `not.toHaveProperty` `dteRemaining`, `daysSoFar`,
  `outcome`; rejects `UNRECORDED` without `expiredOn` — red under `pnpm typecheck:node` (TS2344 /
  TS2554 before the member existed).

Engine run before green: **7 failed | 138 passed** — every failure an `AssertionError` on status /
gaps / DTE.

### Property (`pmcc-timeline.property.test.ts`, `arbitraries.ts`)

- Generator: `valuedPastExpiry` lets a last cycle left open be valued after its held short's
  expiration; a closed position may now also close with a short still open (its LEAPS close on
  the close date). Distribution over 5 000 draws: last cycle ENDED 41 %, UNRECORDED 27 %, OPEN
  14 %, none 17 %; UNRECORDED and OPEN each occur in both open and closed positions.
- New invariant: every `OPEN` cycle's `dteRemaining` is window end → expiration (date-fns) and
  ≥ 0; every `UNRECORDED` cycle's `expiredOn` is its current expiration and before the window
  end. Red before green — shrunk counterexample: a short expiring 2020-01-02 valued 2020-01-03,
  `expected -1 to be greater than or equal to 0`.
- Oracle: "open" now means not `ENDED` (open + unrecorded), so realized + open + unattributed =
  ledger short credits keeps holding.

### Renderer

- `pmcc-timeline-rows.test.ts`: `UNRECORDED reads Outcome not recorded`; `unrecordedCycleRow` →
  `Expired 2027-08-20 · outcome not recorded`; `cycleOutcome({ status: 'UNRECORDED' })`.
- `pmcc-timeline-display.test.ts`: `cycleHeader` for UNRECORDED → `… · 28 days held` _(passes
  once the type admits it: the ended branch already reads `daysHeld`)_; `cycleNetLabel` UNRECORDED
  → `Net credit, open`.
- `pmcc-coverage-strip.test.ts`: `cycleSegmentEnd` — ended → `endedOn`, open → window end,
  unrecorded → `expiredOn`.
- `PmccCycleGroup.spec.tsx` (`XYZ_CYCLE_9_UNRECORDED`): days held not so far; two `Outcome not
recorded` badges, muted class, none of red/gold/green, tint `#484f58`, no `Open`; net label
  `Net credit, open`; final row `['Outcome not recorded', '—', 'Expired 2027-08-20 · outcome not
recorded']` and no `DTE remaining`.
- `PmccCoverageStrip.spec.tsx` (`XYZ_UNRECORDED_TIMELINE`): segment 9 `left` 63.158 %, `width`
  5.668 % (28 / 494 days — ends at the expiration, not the 2027-08-24 valuation date, which would
  be 6.478 %); neutral `bg-wb-text-muted/20`, no gold/green/red.
- `PmccLegTimeline.spec.tsx`: trailing `Uncovered · 4 days · 2027-08-20 to 2027-08-24 — no short
call open against the LEAPS` after cycle 9.

Renderer run before green: **14 failed | 457 passed** — `not implemented` stubs, the stub label,
`cycleOutcome` returning `undefined`, and the components crashing on the missing tone
(`OUTCOME_TONE[undefined]`).

### E2E

Test 19 in `e2e/pmcc-leg-timeline.spec.ts`, named verbatim from the scenario (see
green-phase-results for the falsification run).
