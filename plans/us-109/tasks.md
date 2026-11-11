# US-109 — Display PMCC-specific leg timeline on position detail — Tasks

Plan: `plans/us-109/plan.md` (area numbers below match it). Story: Linear
[OPT-17](https://linear.app/optionswheel/issue/OPT-17). Read `research.md`, `data-model.md` and
`contracts/` before starting an area.

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Every expected value in a test is a literal from `plan.md` or `data-model.md` § 5, never the
  output of the function under test
- `better-sqlite3` ABI: run `pnpm rebuild:node` before Vitest work and `pnpm rebuild:electron`
  before Layer 6. Do not run a Vitest agent and an e2e agent at the same time

Shared files to watch when areas run in parallel:

| File                                                      | Areas                                             |
| --------------------------------------------------------- | ------------------------------------------------- |
| `src/main/schemas.ts`, `src/main/index.ts`                | 4 and 5 (different layers; 5 lands first)         |
| `src/main/core/pmcc-timeline.ts`, `pmcc-timeline.test.ts` | 1 then 2 (sequential by design)                   |
| `PositionCockpit.spec.tsx`                                | 4 (adds `pmccTimeline: null` to fixtures) then 10 |

---

## Layer 1 — Foundation (no dependencies)

> These areas can be started immediately and run in parallel.

### Area 1 — Core engine: ordering, tracks, cycles and replayed basis

- [ ] **[Red]** Write failing tests — `src/main/core/pmcc-timeline.test.ts`
  - Create `src/main/core/test-fixtures/pmcc-timeline-events.ts`: the XYZ Background as literal events (`data-model.md` § 5) plus variant builders. Build engine results in `beforeAll`, never in a `describe` body
  - Test cases (full list in `plan.md` Area 1 Red):
    - 9 cycles; cycle 2 has `rollCount` 1 and rows `OPEN`, `ROLL` #1, `END`; the roll creates no cycle
    - cycle nets: c1 `2.0000`/`200.0000`, c2 `1.2000`/`120.0000`, c5 `1.6500`/`165.0000`, c9 `1.9500` with `status: 'OPEN'`
    - roll net direction: debit `0.6000`/`60.0000`, a credit case, an `even` case
    - header facts: c1 DTE 32 / held 32; c2 DTE 28 / held 56 / current strike `112.0000`; c5 held 18, `CLOSED`; c9 `daysSoFar` 21, `dteRemaining` 7
    - replayed basis: purchase `25.0000`, LEAPS roll `8.5000`, footers `23.0000`, `21.8000`, `20.1000`, `18.5500`, `16.9000`, `15.1500`, `13.4000`, `8.5000`, `6.5500`
    - same-day ordering (2027-05-07): c6 `15.1500`, c7 `13.4000`, in either input order
    - LEAPS track: purchase `dteAtFill` 368; roll #1 credit `2.5000`/`250.0000`, `{ unbroken: true, extensionDays: 126 }`; `costPerShare` `22.5000`
    - broken LEAPS roll: `{ unbroken: false, gapDays: 2, extensionDays: 126 }`, with the day-before / same-day / day-after boundary
    - assignment keeps net `1.9500`, `END` price `null`, basis `6.5500`
    - `LEAPS_CLOSE` row has no `basisAfter` and sorts after a same-day `SHORT_END`
    - `UNKNOWN` inside cycle 9 changes no figure; `UNKNOWN` in a gap lands on the LEAPS track
    - fees: purchase basis `25.0100`, c1 net `1.9900`/`199.0000`, footer `23.0200`; one 5th-decimal `ROUND_HALF_UP` literal
    - 3 contracts: c1 `2.0000`/`600.0000`, every `basisAfter` unchanged
  - Property cases: none in this task — the properties need the summary and are written in Area 2 Red
  - Run `pnpm test src/main/core/pmcc-timeline.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/core/pmcc-timeline.ts` _(depends on: Area 1 Red ✓)_
  - Types per `data-model.md` § Type Design: `PmccTimelineEvent` (union on `kind`), `PmccShortOutcome`, `PmccCycle` (common shape ∩ union on `status`), `PmccLeapsRow`, `PmccCycleRow`, roll `coverage` (union on `unbroken`), `PmccNet`, `PmccLeapsTrack`, `PmccTimeline`, `PmccTimelineInput`
  - `buildPmccTimeline(input: PmccTimelineInput): PmccTimeline`: sort by date → rank → `seq` (research ADR "Timeline order"); one `reduce` carrying the contribution prefix; `calculatePmccLedger({ leapsContracts, longStrike: null, contributions })` for `basisAfter`; `SHORT_OPEN` starts a cycle, `SHORT_ROLL` / `SHORT_END` attach to the open one, `UNKNOWN` attaches to the cycle open on its date else the LEAPS track
  - Nets in dollars from contributions, per share ÷ `100 × leapsContracts`; days via `differenceInCalendarDays(parseISO(b), parseISO(a))`; known rows carry `fees`
  - No logging, no I/O
  - Run `pnpm test src/main/core/pmcc-timeline.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` — `src/main/core/pmcc-timeline.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: named per-event steps (`applyLeapsEvent`, `applyShortEvent`); compare the net-direction helper with `netDirection` in `src/renderer/src/lib/pmcc-roll.ts` and move one copy to `src/shared/` if identical
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 5 — Test-only seed channel

- [ ] **[Red]** Write failing tests — `src/main/ipc/test-pmcc-seed.test.ts`
  - Test cases:
    - registers exactly one channel, `_test:pmcc-seed-position`
    - two legs → `{ ok: true, positionId }`; `getPosition` returns strategy `PMCC`, phase `PMCC_OPEN`, status `ACTIVE`, both legs in the given order
    - `closedDate: '2027-08-20'` → status `CLOSED` and that `closedDate`
    - a LEAPS fill date after today and a short expiring after the LEAPS are both accepted
    - empty `legs` → `ok: false` with a validation error naming `legs` (assert `code` and `field`)
  - Run `pnpm test src/main/ipc/test-pmcc-seed.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/services/test-pmcc-seed.ts`, `src/main/ipc/test-pmcc-seed.ts` _(depends on: Area 5 Red ✓)_
  - `TestPmccSeedPositionPayloadSchema` in `src/main/schemas.ts` (`z.infer` → `TestPmccSeedPositionPayload`), reusing `TestLegRowSchema`, per `contracts/test-pmcc-seed-position.md`
  - `seedPmccPosition(db, payload, now)`: one transaction; position insert (`opened_date` = earliest leg `fillDate`) then `insertLegRow` per leg with `createdAt` = `now` + index ms; no snapshot
  - Thin handler through `handleIpcCall`; register in `src/main/index.ts` beside `registerTestPmccLedgerIpc`, only when `NODE_ENV === 'test'`; expose `testPmccSeedPosition` in `src/preload/index.ts`
  - Run `pnpm test src/main/ipc/test-pmcc-seed.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: share `toLegRecord` with `src/main/ipc/test-pmcc-ledger.ts` instead of copying it
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 7 — `CollapsedDrawer` meta label

- [ ] **[Red]** Write failing tests — `src/renderer/src/components/position-cockpit/CollapsedDrawer.spec.tsx`
  - Test cases:
    - `meta="9 cycles · 44d uncovered"` shows that text and `9 fields` is absent (positive control: the title renders)
    - without `meta`, `fieldCount={6}` still shows `6 fields`
  - Run `pnpm test src/renderer/src/components/position-cockpit/CollapsedDrawer.spec.tsx` — the new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/components/position-cockpit/CollapsedDrawer.tsx` _(depends on: Area 7 Red ✓)_
  - Optional `meta?: string`; render `meta ?? \`${fieldCount} fields\``; `fieldCount`optional when`meta`is given (the mockup's`TimelineDrawer`)
  - Run the spec — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Engine summary (depends on Area 1)

> Same file as Area 1, so it starts after Area 1's Refactor.

### Area 2 — Core engine: gaps, coverage, flags and summary

**Requires:** Area 1 Refactor ✓

- [ ] **[Red]** Write failing tests — `src/main/core/pmcc-timeline.test.ts`, `src/main/core/pmcc-timeline.property.test.ts` _(depends on: Area 1 Refactor ✓)_
  - Test cases (full list in `plan.md` Area 2 Red):
    - Background gaps 7, 17, 3, 3, 3, 4, 7; none between cycles 6 and 7; `uncoveredDays` 44, `totalDays` 333, `coveredDays` 289
    - gap boundary: next cycle sold the day before / same day / day after → none, none, 1 day
    - leading gap present when the first short was sold after the LEAPS, absent when same day
    - trailing gap: assigned 2027-08-20, valuation 2027-08-24, open position → 4 days; closed 2027-08-20, valuation 2027-09-02 → none, `totalDays` 340, `coveredDays` 296
    - no cycles: one 73-day gap, `coveredDays` 0, `averagePerShare`, `openCreditPerShare`, `leapsRollNetPerShare` all `null`
    - flag: `{ daysPastLeaps: 29, leapsExpiration: '2027-09-17' }`; same day and day before → `null`; day after → 1
    - Background summary: counts 9 / 8 / 1; realized `14.0000`/`1400.0000`; average `1.7500`/`175.0000`; open `1.9500`; LEAPS roll net `2.5000`; `shortCreditsPerShare` `15.9500`; `leapsCostPerShare` `22.5000`; `basisPerShare` `6.5500`
    - assigned variant: 9 closed, 0 open, realized `15.9500`
    - fee variant: realized `13.9900`, credits `15.9400`, LEAPS cost `22.5100`, basis `6.5700`
  - Property cases — `src/main/core/pmcc-timeline.property.test.ts`, generator `pmccTimelineEvents` added to `src/main/core/test-fixtures/arbitraries.ts` (valid histories by construction, no `fc.pre`):
    - **Oracle:** realized + open (dollars) equals `shortCreditsTotal`, and `summary.basisPerShare` equals `basisPerShare`, from `calculatePmccLedger` over all contributions
    - **Invariant:** `coveredDays + uncoveredDays === totalDays`, `uncoveredDays === Σ gap.days`, both ≥ 0
    - **Order independence:** any permutation of `events` gives a deeply equal timeline
    - **Scale invariance:** contracts and fees × `k` leave per-share figures and `basisAfter` unchanged and multiply totals by `k`
    - **Guard:** `cycles.length` equals the number of `SHORT_OPEN` events
  - Run `pnpm test src/main/core/pmcc-timeline` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/core/pmcc-timeline.ts` _(depends on: Area 2 Red ✓)_
  - `PmccGap`, `PmccTimelineSummary` and the cycle `flag` per `data-model.md` § 2; gap rules from its table; `windowEnd = closedDate ?? valuationDate`
  - Summary sums in dollars and divides once; ledger fields from one `calculatePmccLedger` call over every contribution
  - Run `pnpm test src/main/core/pmcc-timeline` — all tests must pass
- [ ] **[Refactor]** `/refactor` — `src/main/core/pmcc-timeline.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Stress the properties: `numRuns: 500` across several seeds with `endOnFailure: true`
  - Run `pnpm test:mutation --mutate src/main/core/pmcc-timeline.ts`; kill reproducible survivors with tests, record equivalent mutants with their reason
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Service and display helpers (depend on Area 2)

> These areas can run in parallel with each other **after** Area 2 Green.

### Area 3 — Service: legs to timeline events

**Requires:** Area 2 Green ✓

- [ ] **[Red]** Write failing tests — `src/main/services/pmcc-timeline.test.ts` _(depends on: Area 2 Green ✓)_
  - Add the legs these cases need to `src/main/services/test-fixtures/pmcc-legs.ts`
  - Test cases:
    - `LEAPS_OPEN` + `SHORT_CALL_OPEN` → one LEAPS row, one open cycle whose opening price is the leg's `premiumPerContract`
    - roll chain with a `BUY` `ROLL_FROM` → a roll row in the cycle; with a `SELL` `ROLL_FROM` → `LEAPS roll #1`, `closedOn` / `openedOn` from the two legs' fill dates
    - `SHORT_CALL_EXPIRED` / `SHORT_CALL_CLOSE` / `SHORT_CALL_ASSIGNED` → `EXPIRED` / `CLOSED` / `ASSIGNED`; only `CLOSED` carries a price
    - a `CC_CLOSE` leg and an unpaired `ROLL_TO` each become an `UNKNOWN` row with the raw role, and `summary.basisPerShare` equals `pmccLedgerFromLegs(legs).basisPerShare`
    - fees on both legs of a short roll are summed once into that cycle's net
    - no LEAPS leg → `null`
  - Run `pnpm test src/main/services/pmcc-timeline.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/services/pmcc-timeline.ts` _(depends on: Area 3 Red ✓)_
  - Export `orderedLedgerEvents`, `eventContribution` and `LedgerEvent` from `src/main/services/pmcc-ledger.ts`
  - `pmccTimelineFromLegs(legs: LegRecord[], opts: { valuationDate: string; closedDate: string | null }): PmccTimeline | null`: `groupRollChains`, map each ledger event to a `PmccTimelineEvent` (`seq` = index, `contribution` from `eventContribution`), add `UNKNOWN` for non-PMCC roles and unpaired roll legs, call `buildPmccTimeline`
  - DEBUG log `pmcc_timeline_events` (kinds and dates); no INFO
  - Run `pnpm test src/main/services/pmcc-timeline.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check `pmcc_ledger_unknown_leg_role` is not logged twice for one request
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 6 — Renderer display helpers

**Requires:** Area 2 Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/lib/pmcc-timeline-display.test.ts` _(depends on: Area 2 Green ✓)_
  - Inputs are literal `PmccTimeline` slices; outputs are the AC's literal strings (full list in `plan.md` Area 6 Red):
    - `timelineDrawerMeta` → `9 cycles · 44d uncovered`; singular `1 cycle · 0d uncovered`
    - `leapsTrackHeader` → `open $85.00 call · 2028-01-21 · LEAPS cost to date $22.50 / share`; `closed …` when closed
    - `cyclesHeader` → `9 cycles · 8 closed · 1 open`; `9 cycles · 9 closed`
    - `cycleHeader` → `$112.00 call · sold 2026-10-23 at 28 DTE · 56 days held`; open → `… · 21 days so far`
    - `signedPerShareAndTotal` → `+$1.20 / share (+$120.00)`, `+$14.00 / share (+$1,400.00)`, a negative with `−` (U+2212)
    - `netLabel` → `Net debit $0.60 ($60.00)`, `Net credit $2.50 ($250.00)`
    - `leapsCoverageCell` → `opens coverage · 368 DTE at fill`, `unbroken · +126 days`, `2 day gap · +126 days`
    - `gapRow` → `Uncovered · 7 days · 2026-10-16 to 2026-10-23`; `1 day` singular
    - `coverageFlag` → `This short expires 29 days after the open LEAPS (2027-09-17). It was uncovered for that stretch.`
    - `summaryStats` → the six Background values; no cycles → Average `—`, Coverage `0 of 73 days · 73 uncovered`
    - `reconciliationLine` → `Realized $14.00 + open $1.95 = $15.95 short-call credits to date. LEAPS cost to date $22.50 − $15.95 = $6.55 cost basis per share.`
    - rounding: `1.2350` → `$1.24`
  - Run `pnpm test src/renderer/src/lib/pmcc-timeline-display.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/lib/pmcc-timeline-display.ts` _(depends on: Area 6 Red ✓)_
  - The functions above, taking `Pick`-derived slices of `PmccTimeline`; reuse `signedMoneyGrouped` from `src/renderer/src/lib/pmcc-card-tier2.ts`; formatting only, no totals computed
  - Run the test file — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider moving `signedMoneyGrouped` to a neutral module now that two features use it
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — IPC wiring and components (depend on Layer 3)

> These areas can run in parallel with each other after their dependencies are complete.

### Area 4 — `positions:get` returns the timeline at the Eastern valuation date

**Requires:** Area 3 Green ✓ (and Area 5 Refactor ✓, which also edits `schemas.ts` and `index.ts`)

- [ ] **[Red]** Write failing tests — `src/main/services/get-position.test.ts`, `src/main/ipc/positions.test.ts` _(depends on: Area 3 Green ✓)_
  - Test cases:
    - `get-position.test.ts`: a PMCC returns `pmccTimeline` with the `valuationDate` passed in and `summary.basisPerShare` equal to `pmccLedger.basisPerShare`; a wheel returns `pmccTimeline: null`; a `CLOSED` PMCC's timeline carries its literal `closedDate`
    - `positions.test.ts`: `getCurrentDate` returning `2027-08-14T02:30:00Z` → `pmccTimeline.valuationDate` `2027-08-13`; `2027-08-14T05:00:00Z` → `2027-08-14`
  - Run both files — all new tests must fail
- [ ] **[Green]** Implement — `src/main/services/get-position.ts`, `src/main/ipc/positions.ts` _(depends on: Area 4 Red ✓)_
  - `pmccTimeline: PmccTimeline | null` on `GetPositionResult` in `src/main/schemas.ts` (`contracts/positions-get.md`)
  - `getPosition(db, positionId, opts?: { valuationDate?: string })`, default `etDateOf(new Date())` so existing callers are untouched
  - `registerPositionsHandlers(db, { ivrOnDemand, getCurrentDate })`; the `positions:get` handler passes `etDateOf(now)`; `src/main/index.ts` passes `fakeClock?.now`
  - Add `pmccTimeline: null` to renderer fixtures that build a `GetPositionResult` (`PositionCockpit.spec.tsx`, `PositionDetailPage.test.tsx`, any others `pnpm typecheck` reports)
  - Run both files — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider one `pmccFields(...)` helper in `get-position.ts` replacing the four `isPmcc ? … : null` lines
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 8 — `PmccTimelineSummary`

**Requires:** Area 6 Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/components/position-cockpit/PmccTimelineSummary.spec.tsx` _(depends on: Area 6 Green ✓)_
  - Test cases (query by text and role):
    - the six stat labels (`Cycles`, `Realized net credits`, `Average per closed cycle`, `Open cycle credit`, `LEAPS roll net`, `Coverage`) with the Background values
    - the reconciliation sentence and the caption `US-109 · reconciles to the Cost basis drawer above`
    - no cycles: Average `—`, Open cycle credit `—`, LEAPS roll net `no roll yet`
    - no `%` or `annualized` text (positive control: the Cycles stat is present)
  - Run the spec — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/components/position-cockpit/PmccTimelineSummary.tsx` _(depends on: Area 8 Red ✓)_
  - The mockup's `TimelineSummary`: owner caption, `StatGrid minWidth={150}` of six items (realized `text-wb-green`, open credit `text-wb-gold`, empty values `text-wb-text-muted`), reconciliation line in `font-wb-mono text-wb-text-secondary` with the basis in `text-wb-sky`
  - Run the spec — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract a shared drawer caption with `PmccCostBasis` only if the markup is identical
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 9 — `PmccLegTimeline`

**Requires:** Area 6 Green ✓

- [ ] **[Red]** Write failing tests — `PmccLeapsTrack.spec.tsx`, `PmccCycleGroup.spec.tsx`, `PmccCoverageStrip.spec.tsx`, `PmccLegTimeline.spec.tsx` in `src/renderer/src/components/position-cockpit/` _(depends on: Area 6 Green ✓)_
  - Test cases (full list in `plan.md` Area 9 Red):
    - `PmccLeapsTrack`: `LEAPS track` header copy; `Buy LEAPS` row (`$80.00 call · 2027-09-17`, `opens coverage · 368 DTE at fill`, `$25.00`); `LEAPS roll #1` row (`$80.00 2027-09-17 → $85.00 2028-01-21`, `Net credit $2.50 ($250.00)`, `unbroken · +126 days`, `$8.50`); a `CLOSE` row reads `Sold to close` with `—`
    - `PmccCycleGroup`: cycle 2 (header, `Expired worthless`, `1 roll`, `+$1.20 / share (+$120.00)`, exactly three rows, footer `$21.80 / share` `from the US-103 ledger`); cycle 5 (`Closed early`, `−$0.55`, `−$55.00`); cycle 9 open (`Open`, `Net credit, open`, `7 DTE remaining · credit collected, not realized`, no `days held`); assigned (`Assigned` in `text-wb-red`, `— (assigned)`, `settlement recorded by US-111`); unknown row (raw role and date, net unchanged); flag sentence plus `US-102`, absent when unflagged; fees row `+$200.00 · fees $1.00`, no `fees` text at zero
    - `PmccCoverageStrip`: `covered 289 of 333 days · 44 uncovered`; nine segments named `Cycle N`; one roll tick; `today 2027-08-13`; empty copy when there are no cycles
    - `PmccLegTimeline`: LEAPS track precedes `Short-call cycles`; gap rows of 7 and 17 days, none between cycles 6 and 7; empty state copy; closed banner `Position closed 2027-08-20 · the timeline is complete` with the muted class; no `Role` / `Action` column headers
  - Run the four specs — all new tests must fail
- [ ] **[Green]** Implement — `PmccCoverageStrip.tsx`, `PmccLeapsTrack.tsx`, `PmccCycleGroup.tsx`, `PmccLegTimeline.tsx` _(depends on: Area 9 Red ✓)_
  - From the mockup's `Strip`, `LeapsTrack`, `CycleGroup`, `GapRow`, `Timeline`: two separate panels (sky-tinted LEAPS track, violet-tinted cycles) under the coverage strip; dashed muted gap rows; optional closed banner
  - Tailwind and `wb-*` tokens only (`wb-sky`, `wb-violet`, token opacity classes for the mockup's `rgba()` tints); inline `style` only for the strip's `left` / `width` percentages; use `Badge` and `TablePrimitives`
  - Run the four specs — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check no formatting logic sits in a component that belongs in `pmcc-timeline-display.ts`; do not branch inside `LegHistoryTable`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Cockpit wiring (depends on Layers 1 and 4)

### Area 10 — Cockpit wiring

**Requires:** Area 4 Green ✓, Area 7 Green ✓, Area 8 Green ✓, Area 9 Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx` _(depends on: Areas 4, 7, 8, 9 Green ✓)_
  - Test cases:
    - PMCC with a timeline: drawers in the order `Leg reference`, `Cost basis`, `Timeline summary`, `Leg timeline`; summary `aria-expanded="true"`; timeline `aria-expanded="false"` showing `9 cycles · 44d uncovered`
    - clicking `Leg timeline` reveals `LEAPS track`; clicking again hides it
    - PMCC with `pmccTimeline: null`: neither drawer renders (positive control: `Cost basis` does)
    - wheel in `CC_OPEN`: `Cost basis & history` with the `Running Basis / Share` header; no `Timeline summary`, `Leg timeline`, `LEAPS track` or `Uncovered`
  - Run the spec — the new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` _(depends on: Area 10 Red ✓)_
  - In the PMCC branch after `PmccCostBasis`: `<CollapsedDrawer title="Timeline summary" fieldCount={6} defaultOpen>` wrapping `PmccTimelineSummary`, then `<CollapsedDrawer title="Leg timeline" meta={timelineDrawerMeta(timeline)}>` wrapping `PmccLegTimeline`, both only when `pmccTimeline` is non-null; wheel branch untouched
  - Run the spec — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 10 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - If `PmccLegReference` and `PmccCostBasis` wrap themselves in a drawer, make the two new components match
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### Area 11 — E2E Tests

- [ ] **[Red]** Write failing e2e tests — `e2e/pmcc-leg-timeline.spec.ts`, `e2e/pmcc-timeline-helpers.ts` _(depends on: all Green tasks ✓)_
  - `pnpm rebuild:electron` first
  - Helpers: launch with `WHEELBASE_FAKE_NOW=2027-08-13T16:00:00Z` (as `e2e/ivr-helpers.ts` does); `seedXyz(page, variant)` over `window.api.testPmccSeedPosition` with the Background legs as literals and small variant patches; readers for the two drawers
  - One `it()` per acceptance scenario — names mirror the AC; assertions are the literals in `plan.md` Area 11
  - AC coverage:
    - AC-1: The section separates the LEAPS track from the short-call cycles → `it('The section separates the LEAPS track from the short-call cycles')`
    - AC-2: The LEAPS roll reads as unbroken coverage, not two disconnected rows → `it('The LEAPS roll reads as unbroken coverage, not two disconnected rows')` (plus a broken-roll fixture that must not read `unbroken`)
    - AC-3: Rolls stay inside their cycle and reduce that cycle's net → `it('Rolls stay inside their cycle and reduce that cycle\'s net')` (plus an unrolled fixture that reads `+$1.80`)
    - AC-4: A cycle that simply expired reads its opening credit as its net → `it('A cycle that simply expired reads its opening credit as its net')`
    - AC-5: A cycle bought back early nets the buyback against the credit → `it('A cycle bought back early nets the buyback against the credit')`
    - AC-6: The open cycle is labelled open and never as realized profit → `it('The open cycle is labelled open and never as realized profit')`
    - AC-7: Uncovered stretches between cycles are stated as a neutral fact → `it('Uncovered stretches between cycles are stated as a neutral fact')` (plus a back-to-back fixture with no row)
    - AC-8: Running cost basis appears at each group boundary, sourced from US-103 → `it('Running cost basis appears at each group boundary, sourced from US-103')`
    - AC-9: The timeline summary totals the cycles and reconciles to the Cost basis drawer → `it('The timeline summary totals the cycles and reconciles to the Cost basis drawer')`
    - AC-10: No per-cycle percentage or annualized return is shown → `it('No per-cycle percentage or annualized return is shown')`
    - AC-11: A cycle ended by assignment shows the outcome without claiming the settlement → `it('A cycle ended by assignment shows the outcome without claiming the settlement')` (relaunch at 2027-08-24)
    - AC-12: A LEAPS with no short call ever sold renders an empty cycles list → `it('A LEAPS with no short call ever sold renders an empty cycles list')`
    - AC-13: A short call that outlasts the LEAPS is flagged on its cycle → `it('A short call that outlasts the LEAPS is flagged on its cycle')`
    - AC-14: Per-share figures hold and totals scale with contracts → `it('Per-share figures hold and totals scale with contracts')`
    - AC-15: A leg role this story does not know renders neutrally → `it('A leg role this story does not know renders neutrally')`
    - AC-16: A closed PMCC shows a complete, muted timeline → `it('A closed PMCC shows a complete, muted timeline')` (relaunch at 2027-09-02)
    - AC-17: A classic wheel's leg history is unchanged → `it('A classic wheel\'s leg history is unchanged')`
    - AC-18: Fees reduce the cycle net and the timeline still reconciles → `it('Fees reduce the cycle net and the timeline still reconciles')`
  - Run `pnpm test:e2e e2e/pmcc-leg-timeline.spec.ts` — every new test must fail for the right reason. Since Layers 1–5 are complete, a test that already passes must be shown falsifiable: break its fixture or expected literal once and confirm it fails
- [ ] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - A failure means an earlier area is incomplete; fix it there, not in the spec
  - Run `pnpm test:e2e` — all tests must pass, including the existing PMCC and wheel specs
- [ ] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep fixture variants as small patches over one Background literal

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for right reason)
- [ ] Core-engine areas have property tests, or a stated "no property" reason (Area 1 defers to Area 2's five properties)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] No reproducible, non-equivalent surviving mutant in `src/main/core/pmcc-timeline.ts`
- [ ] E2E tests cover every AC (18 of 18)
- [ ] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
- [ ] `/update-spec us-109` run before the plan directory is removed
