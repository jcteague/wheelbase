# Refactor Phase Results: US-109 — PMCC leg timeline

## Area 1 — Core engine: ordering, tracks, cycles and replayed basis

### Automated simplification

- code-simplifier run: passed (46/46, lint and tsc clean), kept
- Files: `src/main/core/pmcc-timeline.ts`, `pmcc-timeline.test.ts`,
  `test-fixtures/pmcc-timeline-events.ts`
- Changes: `net([c])` renamed to `rollNet(c)`; roll numbers computed once per case; the
  fixture's 7 zero-cash `SHORT_END` contributions became `noCashEnd(contracts)` (they were
  using `NO_FEES` as the cash value); one `xyzLeapsOpen` helper replaced three copies of the LEAPS
  purchase literal; the test's `basisAfter` collector uses `flatMap` instead of a
  `&&` that produced `false`.

### Manual refactorings

1. **Extract function: named per-event steps** (`src/main/core/pmcc-timeline.ts`). The single
   ~150-line `applyEvent` switch became `applyEvent` (prefix and `Step`), `applyLeapsEvent`
   (`leapsRow`, `rollCoverage`), `applyShortEvent` (`startCycle`, `rollCycle`, `endCycle`) and
   `applyUnknownEvent`.
2. **Remove state: `Fold.leapsRolls`**. The LEAPS roll number is now derived from the ROLL rows
   already on the track.
3. **Remove duplication: `netDirection` → `src/shared/net-direction.ts`**. The engine's copy and
   `src/renderer/src/lib/pmcc-roll.ts`'s behaved the same (`Decimal` → `'debit' | 'credit' |
'even'`). One copy now lives in `src/shared/`, with a 3-case boundary test
   (`-0.0001` / `0` / `0.0001`). `PmccRollRecordedBanner.tsx` and `RollPmccLeapsNetPreview.tsx`
   import it from there. `NetDirection` is no longer exported from `pmcc-timeline.ts`.

### Checks

- Mutation, `src/main/core/pmcc-timeline.ts`: 100% (181 killed, 1 equivalent disabled in source)
- `pnpm test`: 307 files pass. 9 first-case timeouts in `src/main/ipc/*.test.ts` and
  `src/main/index.test.ts` came from the known load flake (the mutation run and two other agents
  were running at the same time); all 8 of those files pass when rerun on their own (154 tests).
- `pnpm lint`: pass. `pnpm typecheck`: pass.
- `prettier`: run on the touched files only (`pnpm format` would rewrite other agents' in-flight
  files).

### Remaining tech debt

- `pmcc-timeline.ts` is about 450 lines, roughly 140 of them types. `data-model.md` puts the types
  in this file, and core engines this size are normal in this repo (`costbasis.ts`, `pmcc-card.ts`).
  Area 2 will add gaps and a summary, so splitting the types or the gap/summary logic into a
  sibling module is worth deciding then.
- The `END` row keeps `pricePerShare` / `total` as `string | null`, independent of `outcome`, to
  match the event shape in `data-model.md`. A union on `outcome` would make a priced
  `EXPIRED` row impossible to represent, but the `SHORT_END` event would need the same union.
- A `SHORT_ROLL` / `SHORT_END` with no open cycle updates the last ended cycle. Valid histories
  never produce one.

## Area 2 — Core engine: gaps, coverage, flags and summary

### Automated simplification

- code-simplifier run: passed (82 timeline tests, eslint and typecheck green afterwards; nothing
  reverted).
- `pmcc-timeline.ts`: `holderIndex` computes the held contract's key once; `buildPmccTimeline`
  names its `cycleContext` instead of building it inside the map.
- `pmcc-timeline.test.ts`: `gapsAfter` doc corrected (returns an array, `null` = leading gap);
  the outlasting-short table binds the cycle once.
- `pmcc-timeline.property.test.ts`: the duplicated LEAPS-row / cycle-row total flattening is one
  `rowTotals` helper.
- `arbitraries.ts`: roll `from` fills spread the held `Fill` instead of copying its keys.

### Manual refactorings

1. **Split module — types → `src/main/core/pmcc-timeline-types.ts`** (172 lines). Every
   exported type; `pmcc-timeline.ts` re-exports them with `export type * from
'./pmcc-timeline-types'`, so every consumer keeps importing from `./pmcc-timeline`.
   `PmccCycleCommon` is now exported from the types module (the fold's `CycleDraft` derives from
   it).
2. **Split module — gaps and summary → `src/main/core/pmcc-timeline-summary.ts`** (79 lines).
   `coverageGaps` and `timelineSummary` work on finished `PmccCycle`s only, so they no longer
   sit beside the fold's private `Fold` / `CycleDraft` / `Step` state. `timelineSummary` now takes
   `shares` and a precomputed `leapsRollNet: Decimal | null` instead of the fold's `Ledger` and
   the raw roll contributions, so the module needs nothing private from the fold.
3. **Shared helper — `daysBetween` → `src/main/core/dte.ts`**. Both timeline modules need it;
   `dte.ts` is the core's calendar-day module.

`pmcc-timeline.ts` is now 382 lines (fold + `buildPmccTimeline`), down from ~610.

### Property stress

All 5 properties at `numRuns: 500`, `endOnFailure: true`, seeds 1, 42, 20261111, 987654, 31337
and 7: all pass. The setup and config lived in the session scratchpad; nothing was added to the
repo.

### Checks

- Mutation, `pmcc-timeline.ts`, `pmcc-timeline-summary.ts`, `dte.ts`: **100%** (279 killed: 214 +
  60 + 5; no survivors, no timeouts). The only disabled mutant is Area 1's `EMPTY_FOLD`
  `ArrayDeclaration`. The Green run's one "survivor" was a runner glitch: hand-applied it fails
  48 tests, and Stryker kills it with `--force`.
- `pnpm test`: 309 files, 5333 tests pass. `pnpm lint`: pass. `pnpm typecheck`: pass.
  `pnpm format`: no changes.

### Remaining tech debt

- **Same-day short events vs the ADR rank** (see green § Area 2): a short sold and rolled, or
  sold and closed, on one day is misfiled. With no earlier cycle the roll row is dropped while
  its cash stays in the ledger, so the reconciliation breaks (`1.8000` open vs `1.2000`
  credits). Needs a decision on the ADR order; not changed here.
- `SHARES_PER_CONTRACT = 100` is still declared in `pmcc-timeline.ts`, `costbasis.ts` and
  `screener.ts`; `costbasis.ts`'s `sharesFromContracts` could be exported and shared.
- The summary's `averagePerShare` / `averageTotal` are independently nullable. One
  `{ perShare, total } | null` would make "one null, one not" unrepresentable, but the
  data-model and the Area 6 helpers name the flat fields.

---

## Area 3 — Service: legs to timeline events

### Automated simplification

- code-simplifier run: passed (tests, eslint, tsc green; diffed against a pre-run backup)
- Files: `src/main/services/{pmcc-timeline.ts,pmcc-timeline.test.ts,pmcc-ledger.ts,roll-chains.ts,test-fixtures/pmcc-legs.ts}`
- Edits: `leapsRollLegs(chainId, rollToFillDate)` builds `LEAPS_ROLL` and `LEAPS_ROLL_SPLIT`
  (identical legs); the null-case `it.each` passes arrays, not thunks.

### Manual refactorings

1. **Remove duplication — one roll-role predicate.** `pmcc-ledger.ts` `isRollRole`,
   `roll-chains.ts` `isRollLeg` and the new service each spelled out
   `legRole === 'ROLL_FROM' || legRole === 'ROLL_TO'`. Now `roll-chains.ts` exports
   `isRollRole`. Its own `isRollLeg` and the other two files use it.
2. **Remove a dead branch and a redundant check.** Green read contributions through
   `eventContribution(event).at(0)`. Because that call returns an array, the chain path had an
   unreachable `UNKNOWN` fallback, and the leg path tested both `contribution === undefined`
   and `!isPmccLegRole`. Now `pmcc-ledger.ts` exports the per-kind builders it already had:
   `legContribution`, `chainContribution`, and the type guard
   `isKnownPmccLeg(leg): leg is LegWithRole<PmccLegRole>`. The service calls them directly:
   `chainEvent(chain, seq)` and `legEvent(leg, seq)`, with the switch exhaustive over the six
   PMCC roles. `eventContribution` is private again, because nothing outside the ledger needs
   it.
3. **The unknown-role warning is logged once.** This was done in Green and is pinned by the
   test "warns pmcc_ledger_unknown_leg_role once when a request builds both the ledger and the
   timeline". The warning lives only in `contributionsFrom` → `warnUnknownLegRole`. The
   timeline path never logs it.

### Results

- `pnpm test`: 304 files passed. 8 failed only on first-case 5000 ms timeouts in
  `index.test.ts` and `ipc/{alerts,assignments,broker,ivr,market-data,positions,settings}`;
  rerun alone, all 8 passed (known load flake).
- `pnpm lint`: exit 0. `pnpm typecheck`: exit 0. `prettier --check` on the five files: clean.

### Files touched (production)

- `src/main/services/pmcc-timeline.ts`
- `src/main/services/pmcc-ledger.ts`
- `src/main/services/roll-chains.ts`

### E2E coverage

None.

### Remaining tech debt

- Unpaired roll legs take `seq` after every ledger event, in `legs` order rather than
  fill-then-created order. This affects only how two same-day `UNKNOWN` rows sort.

## Area 6 — Renderer display helpers

### Automated simplification

- code-simplifier run: passed (tests green after). Files: `pmcc-timeline-display.ts`,
  `pmcc-timeline-rows.ts`, `money-format.ts` and the two test files. One change: the
  coverage-days helper takes the summary slice directly (`CoverageSummary`) instead of a
  `{ summary }` wrapper type. Nothing else changed.

### Manual refactorings

1. **Move `signedMoneyGrouped` to a neutral module.** It was in `pmcc-card-tier2.ts` (US-108),
   and the US-109 timeline now uses it as well. It now lives in `src/renderer/src/lib/money-format.ts`. `pmcc-card-tier2.ts`,
   `pmcc-card-display.ts` and `pmcc-timeline-display.ts` import it from there. Its test moved
   from `pmcc-card-tier2.test.ts` (deleted, it tested nothing else) to `money-format.test.ts`.
2. **Split the 317-line module (file-size gate).** Section copy stays in
   `pmcc-timeline-display.ts` (headers, gap row, flag, strip line, banner, cycle net label, roll
   marker, footer, summary, reconciliation). Row cell copy moves to the new
   `pmcc-timeline-rows.ts` (contract/roll labels, roll prices, net label, fees suffix,
   `rowAmounts`, outcome/event badges, LEAPS coverage and basis cells, open-cycle row). The tests
   split the same way (`pmcc-timeline-display.test.ts` 37, `pmcc-timeline-rows.test.ts` 38). No
   case was dropped.
3. **Extract `fmtCount` into `format.ts`.** Both modules use the singular/plural count, so it
   is now a general formatter with its own boundary test (0 / 1 / 2).
4. **`terminalAmounts`.** The `END` branch of `rowAmounts` is now its own exhaustive
   `switch` on the outcome.

### Test execution

```
pnpm test                       Tests 9 failed | 5444 passed (5453)
  9 failures: first cases of src/main/index.test.ts and src/main/ipc/*.test.ts (load flake)
pnpm test src/main/index.test.ts src/main/ipc/   Tests 215 passed (215)
```

### Quality checks

- `pnpm lint` clean; `pnpm typecheck` clean.

### Files touched (production)

- `src/renderer/src/lib/pmcc-timeline-display.ts`, `src/renderer/src/lib/pmcc-timeline-rows.ts` (new)
- `src/renderer/src/lib/money-format.ts` (new), `src/renderer/src/lib/format.ts`
- `src/renderer/src/lib/pmcc-card-tier2.ts`, `src/renderer/src/lib/pmcc-card-display.ts` (imports only)

E2E coverage: none.

### Remaining tech debt

- `verdict.ts` and `pmcc-card-tier2.ts` still pluralise inline (`day${n === 1 ? '' : 's'}`).
  They could use `fmtCount`, but they are outside this area and were left alone.
- `fmtMoneyGrouped` renders a negative with ASCII `-`. A negative basis in the reconciliation
  sentence would read `-$1.00`, not U+2212. No acceptance criterion reaches this case.
- `summaryStats` tones the LEAPS roll net `credit` whatever its sign, because the mockup always
  shows it green. A net debit LEAPS roll would therefore read green.

## Area 8 — `PmccTimelineSummary`

### Automated simplification

- code-simplifier run: passed (no regressions; 60 area tests green afterwards)
- Files processed: `PmccTimelineSummary.tsx`, `PmccTimelineSummary.spec.tsx`, the LEAPS roll net
  tone line in `pmcc-timeline-display.ts` and its new test block
- Changed only the spec: `statValue` narrows to `HTMLElement` via `instanceof` (removes an
  `as HTMLElement` cast) and one prettier line join. The component and display code were left
  as they were.

### Manual refactorings

#### 1. Extract component — `DrawerCaption`

**Files**: `src/renderer/src/components/position-cockpit/DrawerCaption.tsx` (new),
`PmccCostBasis.tsx`, `PmccTimelineSummary.tsx`
**Before**: both drawers repeated `<div className="px-5 pt-3"><Caption>…</Caption></div>`
byte for byte.
**After**: `<DrawerCaption>US-103 · cash ledger, never a quote</DrawerCaption>` and
`<DrawerCaption>US-109 · reconciles to the Cost basis drawer above</DrawerCaption>`.
**Reason**: the plan's condition (identical markup) holds; the Leg timeline drawer (Area 9)
carries its own owner caption (`US-109 · a roll stays inside its cycle` in the mockup) and can
use it too. Covered by the existing caption tests in both specs.

#### Considered, not changed

- Tone classes: `RollPmccLeapsNetPreview` keys a `Record<NetDirection, string>` and
  `PmccCoverageRuler` its own ruler tones; different tone vocabularies, so no shared map.
- Types: the props take `Pick<PmccTimeline, 'summary'>`; `summaryStats` and
  `reconciliationLine` already take `{ summary }` slices, so passing `timeline` through needs no
  cast. No type change buys anything here.

### Quality checks

- Area 8 specs + `PmccCostBasis.spec.tsx`: green.
- `pnpm test`: 5482 passed, 7 failed — all in `src/renderer/src/lib/pmcc-timeline-rows.test.ts`
  (concurrent Area 9 Red work).
- `pnpm lint`: errors/warnings only in Area 9's in-progress files (`PmccCoverageStrip`,
  `PmccCycleGroup`, `PmccLeapsTrack`, `PmccLegTimeline(.fixture)`, `pmcc-coverage-strip.ts`,
  `pmcc-timeline-rows(.test).ts`); `eslint` on this area's six files is clean.
- `pnpm typecheck`: clean.
- Formatted with `npx prettier --write` on this area's files only.

### Files touched (production)

- `src/renderer/src/components/position-cockpit/DrawerCaption.tsx`
- `src/renderer/src/components/position-cockpit/PmccCostBasis.tsx`
- `src/renderer/src/components/position-cockpit/PmccTimelineSummary.tsx`

### E2E coverage added or modified

None.

### Remaining tech debt

- [ ] `summaryStats` tones Realized net credits `credit` (green) even when the sum is zero or
      negative — the same class of issue fixed here for the LEAPS roll net.

## Area 4 — `positions:get` returns the timeline at the Eastern valuation date

### Automated simplification

- code-simplifier run: passed (113 scoped tests green, typecheck clean after it).
- Files processed: `get-position.ts` (+ test), `ipc/positions.ts` (+ test), `index.test.ts`.
- Changes it made: one local `HandlerDeps` type in `positions.test.ts` replacing two inline copies of
  the deps type; `etDateOf` import moved among the value imports in `ipc/positions.ts`.

### Manual refactorings

1. **Extract function — `pmccFields({ position, legs, valuationDate })`** (`src/main/services/get-position.ts`).
   Before: four `isPmcc ? … : null` lines. After: one helper returning
   `PmccFields = Pick<GetPositionResult, 'initialNetDebit' | 'pmccLedger' | 'pmccOpenLegs' | 'pmccTimeline'>`
   (derived, not hand-copied), `NO_PMCC_FIELDS` for a wheel, spread into the result. Object
   parameter per the 3+-parameter rule.
2. **Remove test duplication** (`src/main/services/get-position.test.ts`). The file's private
   `recordLegEvent` + `PmccTrigger` duplicated `recordPmccLegEvent` in
   `services/test-fixtures/pmcc-legs.ts`; the US-103/104 cases now use the shared helper.

### Quality checks

- `get-position.test.ts` / `positions.test.ts` / `index.test.ts`: 113 passed.
- `pnpm test`: 5500 passed, 62 failed — all in `PmccCoverageStrip`, `PmccCycleGroup`,
  `PmccLeapsTrack`, `PmccLegTimeline` specs (another agent's in-flight Area 9).
- `pnpm typecheck`: clean.
- `pnpm lint`: 2 errors / 4 warnings, all in Area 9 in-flight files; none in Area 4 files.
- Prettier run on the Area 4 files only.

### Files touched (production)

- `src/main/services/get-position.ts`
- `src/main/ipc/positions.ts`

### E2E coverage added or modified

None.

### Remaining tech debt

- [ ] `positions:get` bypasses `handleIpcCall` (pre-existing): a throw in `getPosition` rejects the
      invoke instead of returning `{ ok: false }`. Left alone — changing it changes behaviour.
- [ ] `get-position.ts` is ~250 lines (226 before this area); splitting the row SQL/mappers out
      would be a refactor of pre-existing code.
- [ ] Five service tests each define their own PMCC position seed (`evaluate-alerts-pmcc`,
      `pmcc-ledger`, `list-positions`, `get-position`, plus `test-pmcc-seed.ts`); a shared
      `insertPmccPosition` fixture could replace them.
- [ ] Older `getDetail(db, id)` callers in `get-position.test.ts` take the real-clock default
      valuation date; harmless (they assert nothing on `pmccTimeline`).

## Area 9 — `PmccLegTimeline`

### Automated simplification

- code-simplifier run: passed (269 scoped tests green after it; no revert needed).
- Changes: `pmcc-timeline-tones.ts` — `EXPIRED` / `CLOSED` share one `SETTLED_TONE`;
  `signedNetTone` became a `function` declaration. `PmccCycleGroup.tsx` — `OutcomeBadge` props
  on one line. `pmcc-timeline-rows.ts` — `cycleOutcome`'s parameter written as
  `{ status: 'OPEN' } | { status: 'ENDED'; outcome: PmccShortOutcome }`.
- Left unchanged: `PmccCoverageStrip.tsx`, `PmccLeapsTrack.tsx`, `PmccLegTimeline.tsx`,
  `pmcc-coverage-strip.ts`.

### Manual refactorings

1. **Derive a hand-duplicated type** — `CycleOutcome = PmccShortOutcome | 'OPEN'` in
   `pmcc-timeline-rows.ts`. Before, the union was written out in `OUTCOME_LABEL`,
   `outcomeLabel`, `cycleOutcome` and `OUTCOME_TONE`, and `PmccCycleGroup` used
   `ReturnType<typeof cycleOutcome>`. Now all of them use the one named type.
2. **Test code** — `PmccCycleGroup.spec.tsx`: the assigned-cycle test that re-asserted the
   `+$1.95` net (already covered by the open and unknown-row tests) now asserts something new:
   an ended cycle is labelled `Net credit`, not `Net credit, open`. Fixed the typo in the
   `PmccLegTimeline.spec.tsx` test name ("bannners").

### Checks

- No formatting logic sits in a component. Every interpolated string comes from
  `pmcc-timeline-display.ts`, `pmcc-timeline-rows.ts` or `pmcc-coverage-strip.ts`. The only
  literals are static copy: panel titles, `from the US-103 ledger`, the gap note, the empty
  state, the US-102 note and `closes coverage`.
- `LegHistoryTable`'s roll block was compared and not reused, and nothing in it was changed.
  It is an 8-column header row with a per-contract net and running basis per leg. The cycle
  roll row is a 5-column leg row whose net comes from `rollNetCell`. They share no markup that
  is worth a primitive.
- Inline `style` is used only for the strip's `left` / `width`.

### Execution

```
pnpm test       Test Files 318 passed   Tests 5563 passed
pnpm lint       exit 0
pnpm typecheck  exit 0
```

### Remaining tech debt

- `TableCell` requires `children`, so unknown-role rows pass `{''}` to their spanning empty
  cell. Making `children` optional would be a shared-primitive change and is not needed now.
- `Badge` always tints inline from a hex, so an outcome badge carries both a hex and a
  `text-wb-*` class. A token-based `Badge` tone would remove the duplication across the app.
- The other existing `Badge color="var(--wb-…)"` call sites (e.g. `AssignmentSheet`) produce an
  invalid tint (`var(--wb-sky)18`). They are unrelated and were left alone.

## Area 10 — Cockpit wiring (+ realized-credits tone fix)

### Automated simplification

- code-simplifier run: passed (16 files / 264 tests in scope, lint clean); kept.
- Files processed: `PositionCockpit.tsx` + spec, `PmccTimelineSummary.tsx` + spec,
  `PmccLegTimeline.tsx` + spec, `pmcc-timeline-display.ts` + test.
- Its changes: `summaryStats`' duplicated `new Decimal(x).gt(0) ? 'credit' : 'default'` became
  one `creditTone(net)` helper used by both `Realized net credits` and `LEAPS roll net`;
  `PmccTimelineSummary.spec`'s `reconciliation()` takes the sentence, replacing an inline
  copy of the same matcher in the no-short-call test.

### Manual refactorings

#### 1. Move each drawer into its component — `PmccTimelineSummary`, `PmccLegTimeline`

**Before**: `PmccCostBasis` owned its `CollapsedDrawer` while the cockpit wrapped the two new
components itself, so the PMCC branch mixed both styles. (`PmccLegReference` has no drawer: it
renders cards, so the plan's "if both wrap themselves" premise held only for `PmccCostBasis`.)
**After**: `PmccTimelineSummary` renders `<CollapsedDrawer title="Timeline summary" fieldCount={6} defaultOpen>`
and `PmccLegTimeline` renders `<CollapsedDrawer title="Leg timeline" meta={timelineDrawerMeta(timeline)}>`.
The cockpit branch reads as four flat siblings, and `fieldCount={6}` now sits next to the six stats.
**Specs**: `PmccLegTimeline.spec` renders through a `renderOpen()` helper that clicks the drawer
open, so every body assertion still reads rendered content (absence assertions keep their positive
controls inside the open drawer). `PmccTimelineSummary.spec` needs no change — the drawer is open
by default. Drawer state (open/closed, `6 fields`, `9 cycles · 44d uncovered`, toggle) stays tested
once, in `PositionCockpit.spec`.

#### 2. Consolidate summary literals onto the fixture — `PmccTimelineSummary.spec.tsx`

**Before**: `BACKGROUND` and `LEAPS_ONLY` re-typed the same 15-field summaries already in
`PmccLegTimeline.fixture.ts`.
**After**: `const BACKGROUND = XYZ_TIMELINE.summary`, `const LEAPS_ONLY = LEAPS_ONLY_TIMELINE.summary`.

### Test execution

```
pnpm test        Test Files 318 passed (318) · Tests 5573 passed (5573)
pnpm lint        exit 0
pnpm typecheck   exit 0
pnpm format      exit 0 (repo-wide)
```

### Files touched (production)

- `src/renderer/src/components/position-cockpit/PositionCockpit.tsx`
- `src/renderer/src/components/position-cockpit/PmccTimelineSummary.tsx`
- `src/renderer/src/components/position-cockpit/PmccLegTimeline.tsx`
- `src/renderer/src/lib/pmcc-timeline-display.ts`

### E2E coverage added or modified

None.

### Remaining tech debt

- `pmcc-timeline-display.test.ts` still carries its own `BACKGROUND_SUMMARY` / `LEAPS_ONLY_SUMMARY`
  literals equal to the fixture's summaries. Left alone: importing a `components/` fixture into a
  `lib/` test inverts the directory dependency; moving the fixture to `src/renderer/src/test-fixtures/`
  would let both share it.
- The plan's `Leg reference` drawer (consolidated mockup) does not exist in the PMCC branch;
  it belongs to US-118's cockpit.

## Area 11 — E2E tests

### Automated simplification

- `code-simplifier:code-simplifier` run over `e2e/pmcc-timeline-helpers.ts` and
  `e2e/pmcc-leg-timeline.spec.ts`. **Kept** (the spec is 18/18 after the change, with no assertion,
  literal, positive control or variant patch altered):
  - Exports only the helpers file used (`FAKE_NOW`, `SeedLeg`, `Variant`, `seedPmcc`,
    `LeapsTrackView`, `CycleView`) made module-private.
  - `leg` / `sell` / `expire` became `function` declarations.
  - `launchXyzTimeline(variant, fakeNow)` replaces the `launchTimeline()` + `showXyzTimeline()`
    pair that 13 tests repeated, including the three dispose-and-relaunch second fixtures.
  - `readXyzCycles(page)` replaces four inline nine-cycle reads. The cost-basis test now reads
    the cycles once instead of twice.
  - `textOf(locator)` (trimmed `textContent`) replaces the spec's local `text()` helper and three
    inline repeats in the helpers. Its callers use `toContain` / `not.toContain` only; exact
    `toBe` checks still read raw `textContent()`.

### Manual review

- Fixture variants are still small patches over the one `BACKGROUND` literal (`VARIANTS`); the
  two non-XYZ payloads (`LEAPS_ONLY`, `OUTLASTING_SHORT`) are separate positions, not variants.
- Every remaining export of `pmcc-timeline-helpers.ts` is used by the spec; no dead helpers.
- No red-phase scaffolding left. The falsification breaks were applied to a copy of the spec and
  restored from a byte-identical backup.

### Results

```
pnpm test:e2e e2e/pmcc-leg-timeline.spec.ts   Tests 18 passed (18)
npx eslint / prettier --check (both e2e files)  clean
pnpm typecheck                                  clean
pnpm test (Vitest, Node ABI)                    Test Files 318 passed, Tests 5574 passed
```

### Files touched (production)

- `src/main/index.ts` — the alert-evaluation job passes `now: fakeClock?.now()` (the Area 11 Green
  section has the details).

### E2E coverage added or modified

- `e2e/pmcc-leg-timeline.spec.ts` — 18 scenarios (OPT-17 AC 1–18), new.
- `e2e/pmcc-timeline-helpers.ts` — new.

### Remaining tech debt

- [ ] `summaryStat` does the same job as `cell` in `e2e/pmcc-ledger-helpers.ts`, pointed at a
      different drawer; `precedes` repeats inline document-order checks in `e2e/pmcc-cost-basis.spec.ts`
      and `e2e/open-pmcc-position.spec.ts`. Sharing them means editing specs outside this story.

## Addendum (2026-11-12) — A short call past its expiration with no recorded outcome

### Automated simplification

- `code-simplifier:code-simplifier` over the scenario's hunks: one change — `toCycle`'s signature
  wrapped as Prettier wants. It tried `cycleStatus(draft, windowEnd)` and reverted it (the
  destructured `end` would be unused and `@typescript-eslint/no-unused-vars` has
  `ignoreRestSiblings` off). Tests, typecheck and lint stayed green; nothing reverted.

### Manual review

- `coverageEnd` (engine) and `cycleSegmentEnd` (renderer) map status to an end date the same
  way, except `OPEN` (none vs the window end). Left separate: the renderer imports only types
  from `src/main/core/`.
- The status is a third union member rather than a flag on `OPEN`, so every `switch` on it is
  exhaustive and "open with negative DTE" does not type-check (`expectTypeOf` tests).

### Results

- `pnpm test`: 318 files, 5652 tests passed; `pnpm lint`, `pnpm typecheck`, `pnpm format`: clean.
- No core logic changed in the refactor (formatting only), so the mutation sweep stands.

## Mutation sweep (2026-11-12) — `pmcc-timeline.ts`, `pmcc-timeline-summary.ts`

Run with `--force` at `concurrency: 2`. The earlier sweep at the default concurrency (10 workers
on 11 cores) reported 58 timeouts on `pmcc-timeline-summary.ts`; every one was CPU starvation
(at concurrency 2 the same mutants were 90 killed, 0 timeouts).

### Killed with new tests (`pmcc-timeline.test.ts`)

- `heldContracts` dropping the contract a cycle rolled to (`pmcc-timeline.ts:152`, three
  mutants) — "takes a stray end of the contract an ended cycle rolled to as unattributed, not the
  open cycle".
- `applyUnknownEvent` letting an ended cycle take an unknown leg (`pmcc-timeline.ts:369`,
  `cycle.end === null` → `true`) — "lands an unknown leg dated after a buyback, before that short
  expired, on the LEAPS track".

Both fail against a hand-applied mutant and pass on the real code.

### Removed rather than tested

- `withinWindow`'s clamp to `start` (three survivors). No cycle date precedes the first LEAPS
  fill — `long_after_short` on open, `close_date_before_open` on a short roll — so the clamp
  guarded an impossible input. It is now `notPastWindow`, capping at the window end only.

### Equivalent

- `pmcc-timeline.ts:47` `<` → `<=` in `timelineEventDate`: on equal dates both branches return
  the same day.
- `pmcc-timeline.ts:152` `[]` → `["Stryker was here"]`: a string never matches a contract key,
  so `heldContracts(…).some(isKey)` is unchanged.
- `pmcc-timeline-summary.ts:16` (two mutants) removing or blanking `case 'OPEN': return null`:
  the function returns `undefined` instead, and its only caller reads `coverageEnd(cycle) ??
windowEnd`.
- `pmcc-timeline-summary.ts` `notPastWindow` `<` → `<=`: on `day === windowEnd` both branches
  return the same day.
