## Area 3 — `computePmccUnrealizedPnl` (`src/main/core/costbasis.ts`)

- code-simplifier agent: passed — reviewed all four files, made no changes.
- **Shared guards (task item "share the mid/contracts validation")**: extracted `toFiniteDecimal`,
  `parseMid(value, name)` and `assertPositiveContracts(contracts, name = 'contracts')` in
  `costbasis.ts`; `computeUnrealizedPnl`, `calculatePmccLedger` (`leapsContracts`) and the new
  `legMarkDollars` all use them. Messages unchanged. One observable change: a non-numeric
  `currentMid` (`'abc'`) now throws `currentMid must be >= 0` instead of a raw `DecimalError`
  (pinned by a new test; both callers pre-validate, so neither depends on the error type).
- Mutation sweep (`pnpm test:mutation --mutate src/main/core/costbasis.ts`) **not run here** — it runs
  centrally at the end, as the orchestrator instructed.
- Gates: `pnpm test` 4928 passed / 3 failed (all PMCC-sort cases in `list-positions.test.ts` and
  `position-list-items.test.ts`, which Area 4's legs shape affects); `pnpm lint` clean; `pnpm typecheck`
  errors only in `src/main/services/list-positions.ts` (Area 4, expected).
- Remaining tech debt: `toFiniteDecimal` duplicates `candidate-chain.ts`'s private `toFiniteDecimal`,
  and `alerts.ts` `isNumeric` uses the same parse. A shared `src/shared` helper would fold all three
  into one, but those files belong to other areas.

## Area 5 — `core/pmcc-card.ts`: cues and the signal registry

### Automated simplification

- code-simplifier run: passed (86/86 after). `pmcc-card.ts` only: top-level helpers converted to `function` declarations with return types (matches `alerts.ts`); `earningsBeforeExpiry` / `earningsTooltip` read the nearest short through `nearestShort` like the other short-leg helpers; dropped the `ActionDefinition` / `AwarenessDefinition` aliases that restated the two variant interfaces. Test files unchanged.

### Manual refactorings

1. **Reuse `formatStrike`** — `src/main/core/alerts.ts` exports `formatStrike` (one-word edit, nothing else in alerts.ts changed); `pmcc-card.ts` drops its private `money` `$x.xx` formatter and uses it. Because `formatStrike` takes `string | null`, a `risk.strike!` non-null assertion went away too.

### Quality checks

- `pnpm test` → 299 files, 5035 tests passed
- `pnpm lint` → exit 0
- `pnpm typecheck` → exit 0
- Mutation (`pnpm test:mutation --mutate src/main/core/pmcc-card.ts`) **not run here**: it runs centrally at Gate E. Expected equivalents: removing the `.sort` in `evaluatePmccSignals` (registry order already equals rank order), and the `leg === null` guard in `toAction` (every action's `test` implies a non-null leg).

### Files touched (production)

- `src/main/core/pmcc-card.ts`
- `src/main/core/alerts.ts` (`export` on `formatStrike`)
- `src/main/core/test-fixtures/arbitraries.ts` (`pmccSignalShort`, `pmccSignalInput`)

### E2E coverage added or modified

None.

### Remaining tech debt

- `pmcc-card.ts` is ~440 lines, over the ~200/300-line gate. It stays one module because the plan and data-model name it as the import surface Areas 7–9 build on (`alerts.ts` is the precedent at 400+ lines). If it needs splitting later, the four cue functions are the natural cut.
- `src/main/core/screener.ts:176` has its own `$x.xx` formatter that duplicates `formatStrike` (it existed before this work and is outside this area).
- The LEAPS wide-spread tooltip works out spread ÷ mid itself; `src/shared/option-spread.ts` computes the same ratio inside `isWideSpread` and doesn't export it.

## Area 7 — Widen the card-action lanes for ✕ and ◆; `CardShell.onClick`

### Automated simplification

- code-simplifier run: passed. Files processed: `lib/card-actions.ts` + test,
  `position-card/CardShell.tsx` + test. One change: the five-line inline default click handler in
  `CardShell.tsx` became a named `navigateToHref()`, so the prop reads `onClick={onClick ?? navigateToHref}`.
  The other three files were left unchanged.

### Manual review (no further changes)

- **Types** (`/typescript-advanced-types` review against data-model § Type Design): `LaneRank` is
  already derived from the six `LANE_*` constants. `StatusWord` and `CardAction.glyph` repeat
  literals from `PmccStatusWord` / `PmccActionGlyph`. Deriving them from the engine would qualify
  as "derives a hand-duplicated type", but the data model picks widened literal unions guarded by
  `expectTypeOf` pins. Deriving would also make those pins tautological, and it would tie the
  wheel card's types to the PMCC engine. Kept as is. No casts and no illegal state the pins don't
  already guard.
- **Fixtures**: did not add `ROLL_WINDOW` / `BELOW_BREAKEVEN` to `test-fixtures/card-actions.ts`.
  No test uses them yet, so they would be dead code. Area 9 should add them when a `PmccCard` test needs them.
- **Tests**: no red-phase scaffolding, no duplicate cases. The `CALL BREACHED`-before-`EXPIRING`
  regression is the existing `sorts actions by rank ascending` case.

### Quality checks

- `pnpm test` → 299 files / 5039 passed
- `pnpm lint` clean · `pnpm typecheck` exit 0

### Files touched (production)

- `src/renderer/src/lib/card-actions.ts`
- `src/renderer/src/components/position-card/CardShell.tsx`

### E2E coverage added or modified

None.

### Remaining tech debt

- None.

---

## Area 8 — `lib/pmcc-card-display.ts`: the display derivation

### Changes

1. **New `/Users/johnteague/my-stuff/wb-108/src/renderer/src/lib/option-mark.ts`** (the plan's refactor task): `MarkNote`, `OptionMark`, `usableSnapshot(snapshot | undefined): OptionSnapshot | null` (the shared usable-snapshot rule) and `optionMark(snapshot | null): OptionMark` (mid + no-bid / wide-spread note, using the wide-spread tooltip builder, now private). `wheel-card-display.ts` uses both; `WheelCardMark` is now `= OptionMark`; its private `isUsableSnapshot` / `markNote` are deleted, along with the copies in `pmcc-card-legs.ts`. `wheel-card-display.test.ts` and `WheelCard.test.tsx` were not changed and pass.
2. **Leg helpers moved into `pmcc-card-legs.ts`**: `LegQuote`, `leapsDelta` (now returns the raw numeric delta, so the tier-2 floor test no longer needs a `snapshot!.greeks!.delta` chain), `formatDelta`, `sumContracts`. The tier-2 module imports from the legs module, and the display module imports from both.
3. **DTE emphasis is one source**: `dteTooltip(leg)` decides; `dteGold = tooltip !== null`. This replaced a function that returned the two fields from four branches.
4. **The signal input uses `leapsDelta`** instead of reading `greeks?.delta` inline.
5. **code-simplifier** (`code-simplifier:code-simplifier`): `shortTone` replaces a nested ternary; the tooltip is computed once in `openLeg`; plain consts in `coverage`; a rename while destructuring in `deriveCredits`; `livePrice!` removed in `extrinsicCell`. No exported name, type or string changed.

### Considered, left

- No `option-mark.test.ts`. The shared helpers are pinned by both display suites (wheel: no-bid, wide-spread and unusable snapshots; PMCC: wide LEAPS, non-numeric and negative mids), so a third copy would give one regression two failing tests.
- `signedMoneyGrouped` lives in `pmcc-card-tier2.ts`. It is a candidate for `lib/format.ts` (`formatSignedMoney` does not group). That file is outside this area.
- Two `!` assertions remain. One is on the LONG-leg `find`, which the list contract guarantees. The other is on `pmccMaxIfCalled`, which returns null only for a null strike, and a string strike is always passed.
- File sizes: display 250 lines (about 95 of them are type declarations), legs 175, tier2 140, option-mark 37.

### Result

- `pnpm test` → 300 files, 5133 tests passed. `pnpm lint` clean, `pnpm typecheck` clean, `pnpm format` applied.

## Area 9 — `PmccCard.tsx` and its sub-components

### Automated simplification

- `code-simplifier:code-simplifier` dispatched on `PmccCard.tsx`, `PmccLegBlock.tsx`, `OptionMarkText.tsx`, `SignalTags.tsx`, `RecoveryMeter.tsx`, `DetailBar.tsx`, `Tier2Panel.tsx`, `PmccCard.test.tsx`. It changed nothing (each file short and single-purpose; the `display.kind` ternary must stay for narrowing).

### Manual refactorings

- **`OptionMarkText.tsx`** — new shared `OptionMarkText({ mark, testId, unavailableLabel = '— unavailable' })`, extracted from `WheelCard`'s private `MarkText`. Both cards use it; PMCC passes `unavailableLabel="— unavail."`, `testId="leg-mark"`. The `WheelCard.tsx` diff is only the extraction; `WheelCard.test.tsx` is unchanged and green.
- **`PmccLegBlock.tsx`** — `PmccOpenLegBlock` / `PmccDashedLegBlock` (plus `LegTitle`, `LeapsTrailingText`, `ShortTrailingCue`) moved out of `PmccCard.tsx` so it stays under the size gate (260 → 177 lines).
- **Test file** — the falling-stock snapshots, written out twice, are now one named `FALLING_SNAPSHOTS`.
- **Falsifiability spot check** (hand mutants, files restored): dropping `onLinkClick` stopPropagation → 2 failures; `'Escape'` → `'Esc'` → 1; meter always green → 1.

### Quality checks

- `pnpm test`: 300 files / 5156 passed. `pnpm lint`: clean. `pnpm typecheck`: clean. Prettier: clean.

### Remaining tech debt

- `PNL_TONE_CLASS` and `PnlFigure` exist in both `WheelCard.tsx` and `PmccCard.tsx`. The PMCC one only adds the wide-spread ⚠. They could share `position-card/PnlFigure.tsx` with an optional warning, but this area was limited to the `MarkText` extraction in `WheelCard`. `SHORT_TONE_CLASS` in `PmccLegBlock.tsx` repeats the two tones and adds `flat`.

## Area 10 — `PositionsGrid` and `PositionsListPage`

### Automated simplification

- `code-simplifier:code-simplifier` dispatched on `PositionsGrid.tsx`, `PositionsListPage.tsx`, `lib/snapshot-legs.ts` (+ test) and the US-108 cases / mocks in both component tests. One change: `legsForSnapshots`'s inline ternary moved into a private `legsForItem(item)` (PMCC `if` → one CALL per leg; wheel leg by destructuring), so the export is `items.flatMap(legsForItem)`. Scoped tests, lint, typecheck green after it.

### Manual refactorings

- **Extract function: `src/renderer/src/lib/snapshot-legs.ts`** (new) — `export function legsForSnapshots(items: readonly PositionListItem[]): OccLegInput[]`. The page's 18-line `flatMap` memo is now `useMemo(() => legsForSnapshots(activePositions), [activePositions])`. Typed against `OccLegInput` (shared), not the hook's `ActiveLegSummary` alias, so `lib/` does not import from `hooks/`; the explicit return type removes Green's `'CALL' as const`. The page no longer imports `ActiveLegSummary`.
- **`snapshot-legs.test.ts`** (new, 4 cases): PMCC + wheel in item-then-leg order, LEAPS-only PMCC, a wheel with no open leg stays an all-null leg (today's behaviour, which `useOptionSnapshots` drops), empty input. The page test keeps its exact-array + OCC-symbol assertion (the plan requires it), so a mapping regression fails both — accepted as the wiring check.
- No type changes beyond the helper signature; nothing in `data-model.md` § Type Design applies.

### Quality checks

- `pnpm test`: 301 files / 5165 passed. `pnpm lint`: clean. `pnpm typecheck`: clean. Prettier: clean.

### Files touched (production)

- `src/renderer/src/components/PositionsGrid.tsx`
- `src/renderer/src/pages/PositionsListPage.tsx`
- `src/renderer/src/lib/snapshot-legs.ts`

### E2E coverage added or modified

None.

### Remaining tech debt

- `{ ...leg, ticker: item.ticker, instrumentType: 'CALL' }` (a PMCC leg's OCC input) is repeated in `lib/pmcc-card-legs.ts:88` and `test-fixtures/wheel-cards.ts` (`pmccSnapshots`), and is the same mapping `legsForSnapshots` does. A shared `pmccLegOccInput(item, leg)` in `snapshot-legs.ts` could serve all three; those files are outside this area.
- `ActiveLegSummary` (`hooks/useOptionSnapshots.ts`) is only an alias of `OccLegInput`; still used by `PositionDetailPage.tsx` and the hook test.

## E2E — Layer 7

### Automated simplification

- `code-simplifier:code-simplifier` run: passed. Files: `e2e/pmcc-position-card.spec.ts`, `e2e/pmcc-card-helpers.ts`, `e2e/pmcc-card-readers.ts`, `e2e/earnings-fixtures.ts`, `e2e/position-card-helpers.ts` (earnings / snapshotOverrides), `e2e/position-cards.spec.ts` (S21). Changes: stale header comment fixed; `openShort && [...]` / `?? []` → ternary; `expiredShorts` → `expiredCycle`; `childTexts` exported from `position-card-helpers.ts` and reused by `footerCell` / `headerLead` (two inline copies of the same `evaluate`); `snapshotOverrides` doc corrected (applies to every option quote by symbol); `EXPIRING_4` constant for the twice-written EXPIRING line. `it` names, assertions, positive controls and seeding figures unchanged.

### Manual refactorings

1. **Remove duplication — `seedPmcc` opens through `createXyzPmcc`** (`e2e/pmcc-card-helpers.ts`). Before: a hand-built `createPmccPosition` payload (underlying, instrumentType, deliverableShares… for both legs). After: `createXyzPmcc(page, { contracts, long, short })` from `pmcc-ledger-helpers.ts`, overriding strike / expiration / fill / fill date.
2. **Single responsibility — DOM readers split out** into the new `e2e/pmcc-card-readers.ts`. `pmcc-card-helpers.ts` (411 → ~300 lines) keeps launch, seeding and the API ledger read. The spec's pure readers (`leapsBlock`, `shortBlock`, `headerLead`, `highlightedLegs`, `tagFacts`, `stripFacts`) moved with the helper readers. Only `expect`-bearing helpers (`viewBackgroundPmcc`, `waitForMark`, `expectMsftStrip`) stay in the spec.
3. **Remove duplication — `footerCellOf(card, label)`**. The paid-for test repeated the footer's `div.grid-cols-2 > div` selector by position (`.first()`). It now locates the `Cost basis` cell by label, the same way `footerCell` does.
4. **Not folded:** `pmcc-leaps-roll-window-alert.spec.ts`'s private `createXyzPmcc(page, leapsDte)`. It returns `{ positionId, leapsLegId }` for a today-dated $112 @ $2.10 entry; the card seeding needs a 203-day multi-cycle history and only the id. Folding it would add a `getPosition` round trip to recover the leg id. The signatures do not converge, so it stays.

### Results

- `LOG_LEVEL=debug pnpm test:e2e --bail=0` (full, after refactor): **46 files passed; 557 passed, 1 todo** (`csp-assignment.spec.ts` › "assignment cost basis includes roll credits in the waterfall", pre-existing `it.todo`). `pmcc-position-card.spec.ts` 29/29, S21 pass.
- `pnpm rebuild:node`, then `pnpm test` → 301 files / 5165 passed; `pnpm lint` clean; `pnpm typecheck` clean; `pnpm format` run.

### Files touched (production)

None.

### E2E coverage added or modified

- `e2e/pmcc-position-card.spec.ts` — 29 scenarios (new)
- `e2e/position-cards.spec.ts` — S21 rewritten
- `e2e/open-pmcc-position.spec.ts` — 2 tests updated to the PMCC card's tier-2 click and nested DTE span

### Remaining tech debt

- e2e files are outside `pnpm typecheck`; a scratch check shows pre-existing errors in `e2e/alert-helpers.ts`, `e2e/screener-helpers.ts`, `e2e/open-pmcc-position.spec.ts:744` (none in this layer's files).
- `pnpm test:e2e -- <file>` silently runs the whole suite (vitest drops filters after `--`); `quickstart.md` now shows `pnpm test:e2e <file>`.

## Review fixes (cycle 1) — PMCC signal registry and max-if-called

- **B1 — registry entries could run without a match.** `PMCC_SIGNALS` action entries re-found their leg inside `reason`/`tone`/`rank`/`tooltip` with `!`, so calling one directly on an input where it did not fire threw. Each entry is now written as a typed definition (`PmccActionDefinition<M>` / `PmccAwarenessDefinition<M>`) whose `match(input): M | null` runs once; `leg`/`tone`/`rank`/`reason`/`tooltip` take the match. `defineAction` / `defineAwareness` close over `M` and return the erased registry entry (`PmccActionSignal` / `PmccAwarenessSignal`, still discriminated on `tier`), which exposes only `code`, `glyph`, `statusWord`/`name` and `evaluate(input): PmccAction | PmccTag | null`. The δ entry's match carries the parsed `Decimal` from the new `numericDecimal` in `alerts.ts` (`isNumeric` now delegates to it). Registry order is still lane order; no sort.
- **B2 — `pmccMaxIfCalled` widened for the compiler.** `shortStrike` is `string` and the result `string`; the null branch and its test are gone, and the `pmcc-card-tier2.ts` call site lost its `!`.
- Tests: `every entry evaluated on its own returns null on the healthy Background`; a type test pinning `pmccMaxIfCalled`'s `string` input and output; `numericDecimal` parse / null cases.
- Stryker `--mutate src/main/core/pmcc-card.ts`: 100% (220 killed, 0 survived). `numericDecimal`'s `value === null → false` mutant is equivalent (`new Decimal(null)` throws into the catch) and is marked in source.

## Review fixes (cycle 2) — shared alert predicates and a single entry debit

- **F1 — the card registry restated the alert bounds.** `src/main/core/alerts.ts` now states each threshold once, in named pure predicates over narrow inputs, and both registries call them:
  - `isExpirationImminent(dte: number)` — `RULES` EXPIRATION_IMMINENT, `PMCC_SIGNALS` EXPIRING (`expiringShort`)
  - `isInManagementWindow(dte: number, windowDte: number)` — `RULES` MANAGEMENT_WINDOW, `PMCC_SIGNALS` MANAGEMENT_WINDOW (`managementWindowShort`)
  - `isEarningsProximate(daysToEarnings: number, dte: number)` — `RULES` EARNINGS_PROXIMITY, `PMCC_SIGNALS` EARNINGS ⚑ (`earningsBeforeExpiry`)
  - `isInLeapsRollWindow(leapsDte: number)` — `RULES` PMCC_LEAPS_ROLL_WINDOW, `PMCC_SIGNALS` ROLL_WINDOW ◆ (`rollWindowLeaps`), and the LEAPS DTE gold / "Roll window" tooltip in `pmcc-card-legs.ts`
  - `isPmccAssignmentRisk(input: PmccAssignmentRiskInput)` — `RULES` PMCC_ASSIGNMENT_RISK, `PMCC_SIGNALS` ASSIGNMENT_RISK ▲ (`assignmentRiskMatch`)
  - `RULES` keeps only its null narrowing in front of each call; behaviour unchanged (existing alerts tests and properties untouched and green). `EXPIRATION_IMMINENT_MAX_DTE` and `EARNINGS_PROXIMITY_MAX_DAYS` are private again (nothing outside `alerts.ts` reads them now); their rows left the export test, and the new predicate boundary tests pin the same values.
  - Bug fixed with it: `pmcc-card-legs.ts` gilded the LEAPS DTE at `dte <= 60` with no lower bound, so an expired LEAPS (dte −1) read gold with a "Roll window" tooltip while ◆ did not fire. It now calls `isInLeapsRollWindow`.
  - The short-call 7-day gold already uses `isDteUrgent` from `lib/dte.ts` — the predicate behind the wheel card's expiring-soon flag (`wheel-card-display.ts`) — so it was left as is.
- **F2 — the entry debit was two independent nullables.** `PmccListSummary` carries `entryDebit: PmccEntryDebit | null`, with `PmccEntryDebit = { perShare: string; total: string }` in `schemas.ts`. Its only producer is `pmccEntryDebit(legs)` in `pmcc-opening-legs.ts`, one `calculatePmccOpeningDebit` call over the entry pair (`perShare` ← `basisPerShare`, `total` ← `initialNetDebit`). `pmccEntryDebitPerShare`, `pmccInitialNetDebit` and the private `entryOpeningDebit` are gone; `getPosition` reads `pmccEntryDebit(legs)?.total`. `pmcc-card-tier2.ts` checks the one null. No e2e helper read the old fields.
- Tests: boundary tables for each predicate in `alerts.test.ts` (at and either side of 0/5, 5/21 and a 30-day window, 0/10 and earnings vs dte, 0/60, 2% below / ATM / above); the `pmcc-card-display` LEAPS DTE table gained −1 (not gold, no tooltip) and 0 beside the existing 59/60/61; `pmcc-opening-legs.test.ts` asserts the `{ perShare, total }` pair (adds a `23.0001` per-share fee case) and the nulls; list/tier-2 tests and fixtures moved to `entryDebit` with the `'6961.3000'` / `'23.2043'` / `$6,961.30` and `$2,320.00 · $23.20 / share` literals unchanged.
- Stryker `--force --mutate src/main/core/alerts.ts,src/main/core/pmcc-card.ts`: `pmcc-card.ts` 99.44% (178 killed, 1 survived — line 68 `premiumRecoveredFraction`, tests=0, untouched line, runner glitch); `alerts.ts` 95.16% (275 killed, 11 survived, 3 no coverage). Survivors on lines this cycle changed:
  - Equivalent, recorded not disabled: `input.dte !== null` → `true` in EXPIRATION_IMMINENT and MANAGEMENT_WINDOW; `input.daysToEarnings !== null` / `input.dte !== null` → `true` and their `&&` → `||` in EARNINGS_PROXIMITY. Each rule's `missingData` skips a null first, so `test` never sees one; the guards only narrow the type. The same equivalents existed in the pre-cycle code (`input.dte !== null && input.dte >= 0 …`). A line-level disable would also ignore the killed whole-expression mutants on the same line, so they stay recorded here.
  - Not reproducible: `ObjectLiteral {}` on the MANAGEMENT_WINDOW rule object — hand-applied, it fails 110 core tests (file restored, `cmp` clean).
  - The other survivors (PROFIT_TARGET `missingData`, `formatStrike`, `hasComputableProfit` catch) sit on lines this cycle did not touch.
- Gates: `pnpm test` 301 files / 5213 passed; `pnpm lint` clean; `pnpm typecheck` clean; prettier clean on touched files. Coverage (lines / branches): `alerts.ts` 98.93 / 97.53, `pmcc-card.ts` 100 / 100, `pmcc-card-legs.ts` 100 / 97.91, `pmcc-card-tier2.ts` 100 / 96.87, `pmcc-opening-legs.ts` 100 / 100, `list-positions-pmcc.ts` 100 / 95, `get-position.ts` 100 / 96.66, `schemas.ts` 100 / 100.

## Advisory fixes — renderer

- **pnlWide → `ValuedPmccPnl.wide`.** `OpenPmccDisplay.pnlWide` is gone; `wide: boolean` lives on the valued P&L (`pmcc-card-display.ts:46`, set in `derivePnl` `:169`), so an unavailable P&L (a bare string) cannot carry the ⚠. Type test pins it.
- **Detail bar hover.** `CardShell` carries `group/card`; `DetailBar` uses `group-hover/card:bg-wb-bg-elevated group-hover/card:text-wb-text-secondary` (collapsed only). E2E `hovering anywhere on the open card highlights the Detail bar` hovers the P&L figure and compares the bar's computed background against a footer cell's `bg-wb-bg-elevated`, with a resting control before and after.
- **Shared `PnlFigure`.** `position-card/PnlFigure.tsx` replaces the two copies (and both `PNL_TONE_CLASS` maps) in `WheelCard.tsx` / `PmccCard.tsx`; DOM unchanged except the PMCC wide ⚠, now read from `pnl.wide`.
- **U+2212 minus.** `signedPercent` (`−23.6% of basis`, `−0.0%`) and the paid-for basis total (`−$40.00`) in `pmcc-card-display.ts`; the P&L amount comes from `signedMoneyGrouped` (core-side fix). Shared formatters left as is: `fmtMoney`, `formatSignedMoney`, `fmtMoneyGrouped` (`format.ts`), `PriceBlock`'s change line, `wheel-card-display.ts` `signedPercent`.
- **PMCC list phase.** `PmccListItem.phase` is `PmccListPhase = PmccPhase | UnknownPmccPhase` (`src/main/pmcc-phase.ts`, a branded string only `toPmccListPhase` makes). `positions.phase` is free TEXT, so the service reads a PMCC row's phase as `string` and classifies it once (`list-positions.ts:110`); `isKnownPmccPhase` moved there from the renderer. Neutral-card fixtures use `toPmccListPhase('PMCC_ASSIGNED')` — no casts. `toCalendarEntries` filters with an `isActiveWheelLeg` type guard (the `as string` went with it).
- **Tests.** `PmccCard.test.tsx`: 57 → 14 test-ID queries. Kept: `position-card` / `position-card-closed` (the unlabelled card root carrying `data-edge` / `opacity-50`; the id is also the closed/open contract the grid and e2e read) and `recovery-meter` (the fill is a bare div; its tooltip sits on the track). Leg blocks are found by their L / S tag tooltips, the price beside `Open ↗`, the P&L under its eyebrow, the strip by `role="status"`, tags by `role="img"`, tier 2 by a new `role="list"` "Position detail" / `listitem` on `Tier2Panel`. `e2e/pmcc-position-card.spec.ts` `boundingBox()!` → explicit null check. `list-positions.test.ts`: the US-101 / US-103 / US-105 PMCC describes pin the clock to FIXED_DAY's 2026-09-14 with literal dates and DTEs; pre-existing real-clock cases in the first `listPositions` describe (`new Date()` at the DTE, null-leg, roll-DTE and null-DTE-sort cases; `isoDate`-relative `VALID_PAYLOAD`) are left.

## Advisory fixes — core

- **▲ picks the worst short.** `assignmentRiskMatch` (`pmcc-card.ts:303`) filters the shorts inside the 2% window, then takes the first red one (stock at or above its strike) before the nearest gold one. Tests: red $105 short behind a gold $108 one marks `short-105` red in lane 1 citing 1.7% above; two red shorts mark the nearest.
- **✕ marks every short under breakeven.** `PmccAction.legs: readonly [PmccLegRef, ...PmccLegRef[]]` (`NonEmpty<T>`, `:74`) replaces `leg`; no casts — `belowBreakevenMatch` (`:276`) destructures the filtered shorts into the tuple, `shortRefs` (`:266`) maps it. The strip/tooltip cite the lowest strike (`belowBreakevenReason`, `:283`); other actions carry a one-element tuple. Renderer: `ownsAction` (`pmcc-card-legs.ts:148`) marks a leg when any ref names it; new `pmcc-card-legs.test.ts` shows both named shorts own ✕. `PmccLegBlock.tsx` needed no change. Two `.leg` assertions in `pmcc-card-display.test.ts` became `.legs`.
- **Codes split per tier.** `PmccActionCode` / `PmccAwarenessCode` (`:98`, `:105`, private); `PmccSignalCode` is gone. Type test: no code is in both tiers; an empty tuple is not a valid `legs`.
- **One source for the card vocabulary: core.** The `LANE_*` constants and `PmccLaneRank` now live in `pmcc-card.ts:81`; the engine ranks by name. `card-actions.ts` derives `CardTone = PmccTone`, `LaneRank = PmccLaneRank`, `CardAction.glyph: PmccActionGlyph`, `StatusWord = PmccStatusWord | 'CALL BREACHED' | 'STRIKE PROXIMITY'` and imports the four lanes it uses. The `PmccLaneRank ≡ LaneRank` pin went with the copy.
- **`toFiniteDecimal`** (`src/main/core/finite-decimal.ts`) replaces `costbasis.ts`'s and `candidate-chain.ts`'s private copies and `alerts.ts`'s `numericDecimal`. All three had the same non-finite → `null` behaviour; the shared one also takes `null` (only `alerts` passed it). Its tests moved from `alerts.test.ts`.
- **`spreadPercentOfMid`** (`src/shared/option-spread.ts:14`, `null` for a mid ≤ 0) is used by `isWideSpread`, the ⚠ tooltip (the match is now the percent) and the tier-2 LEAPS mark note. `screener.ts` `computeStrikeMetrics` was not changed: it divides by `mark` and has no mid guard, so a shared helper would change its zero-mark behaviour.
- **Minus sign: U+2212.** `signedMoneyGrouped` (`pmcc-card-tier2.ts:31`) prints `−$500.00`, which drives the P&L amount and Max if called; the short's `−94.4% of max` already used it. Test: `pmcc-card-tier2.test.ts`. The shared `fmtMoney` / `fmtMoneyGrouped` were left alone.
- **Tests.** The ASSIGNMENT_RISK property's oracle is now `price ≥ strike × 0.98` (it used to be `percentBelowStrike`). The recovery meter property checks the exact fraction (ticks of 1e-4 %, expected `Number(\`${n}e-6\`)`, clamped) and that the fill only goes up as the percent rises, with no `fc.pre`. There is a precedence table for all 13 pairs of action states that can fire together; ▲ red/gold and EXPIRING/MW cannot, so they are not in it. The properties pass at 500 runs × 5 seeds.
- **Tautology sweep.** Deleted: `exported alert thresholds (US-108)`; the `pmccMaxIfCalled` signature type test; the `PMCC_SIGNALS` registry-order and per-entry-null tests (the pairwise table and the healthy Background cover them); the direct `pmccAssignmentRiskSummary` tests (the PMCC_ASSIGNMENT_RISK rule tests assert the same copy). These became private again: `PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW`, `pmccAssignmentRiskSummary`, `PMCC_SIGNALS`, `LANE_BELOW_BREAKEVEN`, `LANE_ROLL_WINDOW`. Added a boundary case: ▲ does not fire at 105.8399 (just past 2.0% below $108). Boundaries were already covered for the alert rules (107.80 / 107.7999; leapsDte 60 / 61 / 0 / −1) and for ROLL_WINDOW (60 / 61 / 0 / −1). Pre-existing, not touched: the `expiration-calendar` constants test, `CardShell`'s `PHASE_TOKEN.PMCC_OPEN` assertion, and `option-display.test.ts`'s re-export tests.
- **Stryker** `--force --mutate pmcc-card,finite-decimal,alerts,costbasis,candidate-chain`. Scores: `pmcc-card.ts` 95.43% (188 killed / 9 survived), `finite-decimal.ts` 100%, `candidate-chain.ts` 100%, `alerts.ts` 93.68%, `costbasis.ts` 91.16%.
  - `pmcc-card.ts`: eight are equivalent — the `code: ''` StringLiterals on each registry entry. Nothing reads `code` at runtime now that `PMCC_SIGNALS` is private, so it is a type-level discriminator only. The ninth, `leaps.spread === null` (`:368`), recorded `testsCompleted: 0`; applied by hand it fails 10 core tests.
  - `alerts.ts`: `isInManagementWindow` `>` → `>=` (`:152`), the EXPIRATION_IMMINENT `{}` (`:343`) and the PMCC_ASSIGNMENT_RISK `test: () => undefined` (`:416`) do not reproduce by hand (3, 110 and 7 failures; restored and `cmp` clean). The `dte` / `daysToEarnings !== null` survivors (`:348`, `:357`, `:397–398`) are the known equivalents. The rest (`:311`, `:366–367`, `:405`) are on lines this branch did not touch.
  - `costbasis.ts`: every survivor is in the untouched `calculateRollBasis` guards (`:254–276`) or on `Decimal.set` (`:10`).
- Gates: `pnpm test` 305 files / 5241 passed; `pnpm lint` clean; `pnpm typecheck` clean.
