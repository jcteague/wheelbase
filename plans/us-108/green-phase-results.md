# Green Phase Results: US-108 PMCC position card

## Area 4 — `pmccNextDecisionDte` and the legs-array sort key

- **Red results**: `plans/us-108/red-phase-results.md` § Area 4
- **Modified**: `/Users/johnteague/my-stuff/wb-108/src/main/core/position-order.ts` — `PmccOrderLeg`,
  `PositionOrderInput.pmcc: { legs } | null`, exported `pmccNextDecisionDte`, `orderDte` uses it.
- **Approach**: filter the SHORT legs; `Math.min` over their dtes, or over every leg when none is
  short (every remaining leg is then a LONG).
- **Tests**: `pnpm test src/main/core/position-order` — 14 passed (14).
- **Mutation sweep**: skipped here by orchestrator instruction (runs centrally at the end).
- **Typecheck**: errors confined to the expected consumers — `src/main/services/list-positions.ts`
  (170,38), (173,3) and `src/renderer/src/lib/position-list-items.ts:85` (masked by `&&` in
  `pnpm typecheck`); all fixed by Area 6 Green.
- **Deviation**: an extra example (LEAPS 10 + short 14 → 14) beyond the plan, to fail a
  "min over every leg" implementation without relying on the property alone.

### Area 4 — Refactor

- Header comment updated to "next decision: nearest short call, else LEAPS"; code-simplifier pass
  made no changes. Stryker step skipped (runs centrally at the end).
- Gate: `pnpm test src/main/core/position-order` 14/14; `pnpm lint` clean; typecheck errors only in
  `list-positions.ts` (170,38)(173,3) and `position-list-items.ts:85` (x3).
- Runtime: `list-positions.test.ts` (2 PMCC tests) and `position-list-items.test.ts` (1 PMCC test)
  fail with `Cannot read properties of undefined (reading 'filter')` until Area 6 supplies `legs`.

## Area 5 — `core/pmcc-card.ts`: cues and the signal registry

- **Files**: `src/main/core/pmcc-card.ts` (new), `src/main/core/test-fixtures/arbitraries.ts` (`pmccSignalShort`, `pmccSignalInput`)
- **Result**: `pnpm vitest run src/main/core/pmcc-card` → 86 passed (80 examples + 6 properties). Area 5 files typecheck and lint clean.
- **Property stress**: `numRuns 500`, `endOnFailure`, seeds 1, 42, 1337, 20261102, 987654 — all 6 properties pass at every seed (scratch config deleted).
- **Implementation**: an ordered `PMCC_SIGNALS` registry of eight pure entries discriminated on `tier`; each predicate / reason / tooltip is a named helper taking a `Pick<PmccSignalInput, …>` slice. Thresholds and the EXPIRING / MANAGEMENT_WINDOW / ▲ tooltip / ⚑ copy come from `./alerts`; `isWideSpread` from `src/shared/option-spread`. `evaluatePmccSignals` filters fired entries by tier, maps actions (stable sort by rank) and tags (registry order).
- **Mutation sweep**: skipped here by instruction — runs centrally at Gate E. Expected equivalent: removing the `.sort` (registry order already equals rank order), and the `leg === null` guard in `toAction` (every action's `test` implies a non-null leg).
- **Deviation**: `PmccAction` carries `tooltip` (see red-phase-results § Area 5).

## Area 6 — List shape: legs array, ledger figures, earnings, management window

- **Red results**: `plans/us-108/red-phase-results.md` § Area 6
- **Modified**:
  - `src/main/schemas.ts` — `PmccLegSummary` (+ `legId`, `side`, `fillPerShare`), `PmccListSummary`
    (legs + cycles + entryDebitPerShare + openedAt + managementWindowDte & six ledger keys),
    `PositionListItemBase.nextEarnings`, per `contracts/positions-list.md`.
  - `src/main/services/pmcc-opening-legs.ts` — private `entryOpeningDebit`; `pmccInitialNetDebit` and
    new `pmccEntryDebitPerShare` both project it.
  - `src/main/services/earnings-dates.ts` — `readStoredNextEarnings` over the existing `readRows`
    (degrade + `earnings_date_read_failed` WARN) and `answersNextPrint`.
  - `src/main/services/list-positions.ts` — `LIST_QUERY` selects `p.opened_date`,
    `p.management_window_dte_override`; one `now` per call; `toLegSummary(leg, side, now)`;
    `readPmccSummaries` builds legs / cycles / entry debit / openedAt / management window
    (`getAlertDefaults` read once, skipped with no PMCC rows) + DEBUG `pmcc_list_legs_selected`;
    one `readStoredNextEarnings` + DEBUG `list_positions_earnings_joined` feeds `toListItemBase`.
  - `src/renderer/src/lib/position-list-items.ts` — `toPmccListItem(res, now?, managementWindowDte?)`
    builds legs, `cycles 1`, ledger via `calculatePmccLedger` over the opening pair (fees booked the
    way `pmccLedgerFromLegs` books them), `nextEarnings: null` on both builders.
  - `src/renderer/src/components/position-card/PmccCard.tsx` — destructure adapted to `legs`.
  - Fixtures forced by typecheck (`nextEarnings: null` / legs shape only): `test-fixtures/wheel-cards.ts`,
    `PmccCard.test.tsx`, `lib/expiration-calendar.test.ts`, `pages/CalendarPage.test.tsx`,
    `pages/PositionsListPage.test.tsx`.
- **Not needed**: `position-order*.test.ts` were already on the legs shape (Area 4).
- **Tests**: Area 6 command 205 passed (incl. position-card); full `pnpm test` 299 files / 5035 passed;
  `pnpm lint` clean; `pnpm typecheck` (node + web) clean.
- **Mutation sweep**: n/a — no `src/main/core/` change.
- **Deviation**: the Background fixture's entry short is $1.80 (see red results) so the entry debit
  matches the AC's $23.20.

### Area 6 — Refactor

- **Split** `list-positions.ts` (236 → 156 lines, past the ~200 gate): the PMCC arm moved to new
  `src/main/services/list-positions-pmcc.ts` — `toLegSummary(leg, side, now)` (the single
  `LegRecord` → `PmccLegSummary` mapper), `countCycles`, `openLegSummaries`, `toPmccSummary({ row,
legs, defaultWindowDte, now })`, exported `readPmccSummaries(db, rows: PmccSummaryRow[], now)`.
  `listPositions` passes the PMCC rows only.
- **code-simplifier**: `openLegSummaries` checks the LEAPS and the optional short directly instead of
  filter-and-compare; the renderer hand-copy comment now points at `list-positions-pmcc.ts`.
- **Kept**: six ledger keys listed explicitly (a spread would leak `effectiveShareCost`); the
  `next_earnings !== null` guard (`answersNextPrint(null)` is true); `PmccCard`'s `legs.find(…)!`
  for the LEAPS (Area 9 rewrites the card; the contract keeps `legs: PmccLegSummary[]`).
- **Gate**: `pnpm test` 299 files / 5038 passed; `pnpm lint` clean; `typecheck:node` clean;
  `typecheck:web` errors only in Area 7's in-flight Red files (`CardShell.test.tsx:153`,
  `card-actions.test.ts:329–353`), none in Area 6 files.

## Area 7 — Widen the card-action lanes for ✕ and ◆; `CardShell.onClick`

- **Red results**: `plans/us-108/red-phase-results.md` § Area 7
- **Modified**:
  - `src/renderer/src/lib/card-actions.ts` — `LANE_BELOW_BREAKEVEN = 0`, `LANE_ROLL_WINDOW = 3`;
    `LaneRank` is the union of all six `LANE_*` constants; `CardAction.glyph` is
    `'✕' | '▲' | '◆' | '◷'`; `StatusWord` gains `'BELOW BREAKEVEN' | 'ASSIGNMENT RISK' | 'ROLL WINDOW'`.
    `WHEEL_LANES`, `rankWheelActions`, `actionsByPosition` unchanged.
  - `src/renderer/src/components/position-card/CardShell.tsx` — optional
    `onClick?: (event: React.MouseEvent) => void`, wired as `onClick ?? (() => { window.location.hash = href })`.
- **Deviation**: `StatusWord` gains `'ASSIGNMENT RISK'` as well as the plan's two words — Area 5's
  `PmccStatusWord` carries it, and `PmccAction` is not assignable to `CardAction` without it.
- **Mockup**: `mockups/us-108-pmcc-position-row-cards.mdx` exists; this area adds no visible UI (types +
  a click handler), so there is nothing to match yet — Area 9 consumes it.
- **Tests**: Area 7 command 53 passed; full `pnpm test` 299 files / 5039 passed; `pnpm lint` and
  `pnpm typecheck` clean.
- **Mutation sweep**: not applicable — no `src/main/core/` change.
- **Known limitations**: none.

---

## Area 8 — `lib/pmcc-card-display.ts`: the display derivation

- **Plan**: `plans/us-108/plan.md` § 8; red results: `plans/us-108/red-phase-results.md` § Area 8
- **Mockup**: `mockups/epic-09-pmcc-dashboard.mdx` (`deriveCard`, `tier2Cells`, `PmccLegLine`, `PmccCard`) read; strings follow the plan / OPT-16 literals where they differ from the mockup.

### Files

- `/Users/johnteague/my-stuff/wb-108/src/renderer/src/lib/pmcc-card-display.ts` — card-level types, `isKnownPmccPhase`, `derivePmccCardDisplay` (closed → neutral → open), coverage / state / basis / credits / net P&L, signal input assembly; re-exports the leg and tier-2 types
- `/Users/johnteague/my-stuff/wb-108/src/renderer/src/lib/pmcc-card-legs.ts` — new (split for the ~200-line rule): leg types, `quoteLeg` (OCC lookup + usable-snapshot gate), `dashedLeg`, `openLeg` (DTE emphasis, mark, short cue, owned actions)
- `/Users/johnteague/my-stuff/wb-108/src/renderer/src/lib/pmcc-card-tier2.ts` — new: `pmccTier2Cells` (seven cells as an ordered list of cell builders), `signedMoneyGrouped`, `leapsDelta`, `sumContracts`, `LegQuote`

### Approach

- Every leg is quoted once (`quoteLeg`); a missing, unusable or unbuildable-symbol snapshot is `null`, so nothing downstream can throw.
- Throwing core helpers are guarded before the call (CLAUDE.md failure-isolation rule): `computePmccUnrealizedPnl` only when every leg has a usable mid and an integer contract count ≥ 1 and `basisTotal` is numeric; `computeUnrealizedPnl` only with a positive numeric fill and a valid count.
- Signals: `evaluatePmccSignals` with the shorts sorted by DTE (display order stays the service's), `quote.price`, `managementWindowDte`, `computeDte(item.nextEarnings, now)`; each action is filtered onto the leg it names.
- Percents via `fmtPct1` (`8.0%`, `50.0%`); money via `fmtMoney` (per share) / `fmtMoneyGrouped` (totals) / `signedMoneyGrouped` (signed totals — `formatSignedMoney` does not group, and AC needs `+$3,285.00`).
- `isKnownPmccPhase` reads a `Record<PmccPhase, true>`, so a new `PmccPhase` member is a compile error until it is listed.

### Deviations

- Same as red: `ShortTrailing` carries `percentOfMax` **and** `target | null` (AC 4); leg `mark` is the wheel mark shape; `now` injectable; short extrinsic unclamped, `no quote this poll` when it cannot be computed.
- `isUsableSnapshot` and `markNote` are **duplicated** from `wheel-card-display.ts` in `pmcc-card-legs.ts` — the refactor task extracts them to `option-mark.ts`.

### Known limitations (for refactor)

- The duplication above.
- `pmcc-card-display.ts` is 254 lines, ~95 of them type declarations.

### Result

- `pnpm vitest run src/renderer/src/lib/pmcc-card-display` → 94 passed.
- `pnpm test` → 300 files, 5133 tests passed. `pnpm lint` clean, `pnpm typecheck` clean.
- No `src/main/core/` change, so no mutation sweep.

## Area 9 — `PmccCard.tsx` and its sub-components

### Files

- `src/renderer/src/components/position-card/PmccCard.tsx` — rewritten: `derivePmccCardDisplay` → `CardShell` (edge = `signals.actions[0]?.tone`, `onClick` toggles tier 2 on an open card only; closed / neutral keep the shell's navigation) → `ActionStrip` → `CardHeader` (PMCC `Badge`, `SignalTags`, `PriceBlock`, `onLinkClick` = `stopPropagation`) → position line (Net P&L figure with the wide-spread ⚠, state + coverage) → one `LegBlock` per leg (open: DTE gold + tooltip, mark, LEAPS `Δ · debit` / short `% of max` + TARGET; closed / neutral: dashed) → `CardFooter` (Cost basis sky or gold when paid for; Credits collected green with `RecoveryMeter`) → `DetailBar` + `Tier2Panel`. Tier-2 state in `useState`; the `Escape` keydown listener is attached on `window` only while tier 2 is open.
- New: `SignalTags.tsx`, `RecoveryMeter.tsx`, `DetailBar.tsx` (a native `<button aria-expanded>`, no handler of its own — its click bubbles to the card's toggle), `Tier2Panel.tsx`.
- `CardHeader.tsx` — optional `onLinkClick` on both links. `CardFooterCell.tsx` — `sub` widened to `ReactNode` (so `LEAPS paid for` can be gold inside the muted sub line) and optional `extra` under it (the meter). `LegBlock.tsx` — marks title each action by `action.tooltip ?? formatActionLine(action)`. `lib/card-actions.ts` — `CardAction.tooltip?: string`.

### Deviations

- Leg-mark title = the registry `tooltip` (see red-phase-results Area 9); wheel actions carry none, so wheel cards are unchanged.
- The ⚠ on the Net P&L carries the mockup's `Wide spread — the LEAPS spread makes this P&L unreliable` (not in the display; `pnlWide` only).
- The recovery meter's title is `Recovery meter — <credits.sub>; gold at 100%`, built from the display's sub line rather than the mockup's raw percent.
- Neutral cards pass `closed` to `PriceBlock` (dashed price, no "unavailable" note or change line).

### Result

- `pnpm test src/renderer/src/components/position-card` → 9 files, 123 passed (`WheelCard.test.tsx` untouched).
- `pnpm test` 300 files / 5156 passed; `pnpm lint` clean; `pnpm typecheck` clean.

## Area 10 — `PositionsGrid` and `PositionsListPage`

### Files

- `src/renderer/src/components/PositionsGrid.tsx` — `PmccCard` gets `snapshots={isClosed ? undefined : snapshots}` (the whole map; the card looks up each leg's OCC symbol) and `profitTargetDefault`.
- `src/renderer/src/pages/PositionsListPage.tsx` — the `useOptionSnapshots` legs memo `flatMap`s: a PMCC contributes one `{ ticker, expiration, strike, instrumentType: 'CALL' }` per `pmcc.legs` entry (LEAPS then shorts), a wheel its single leg as before. `ctxById` (wheel-only) unchanged.

No mockup check needed beyond Area 9 — no visible change; `useOptionSnapshots` untouched.

### Deviations

- The closed grid still passes `profitTargetDefault` to the PMCC card (as to the wheel card); a closed PMCC display ignores it. Only `snapshots` is withheld.
- `instrumentType: 'CALL' as const` in the memo (flatMap's inferred element type would widen to `string`); Refactor moves it into a typed helper.

### Result

- `pnpm test src/renderer/src/pages/PositionsListPage src/renderer/src/components/PositionsGrid` → 68 passed.
- `pnpm test` 300 files / 5161 passed; `pnpm lint` clean; `pnpm typecheck` clean.

## E2E — `e2e/pmcc-position-card.spec.ts` (Layer 7)

- **Red results**: `plans/us-108/red-phase-results.md` § E2E
- **Product code changes**: none. All 29 US-108 cases passed against Areas 1–10 unchanged.
- **Other e2e specs changed** (two pre-US-108 tests in `/Users/johnteague/my-stuff/wb-108/e2e/open-pmcc-position.spec.ts` relied on the placeholder card, so they were updated to OPT-16's behaviour; neither assertion was weakened):
  - "its detail page shows both legs…" clicked the PMCC card body to navigate. OPT-16 replaces whole-card navigation on the PMCC card with a tier-2 toggle, so the test now clicks the ticker link (`position-ticker`), which is the AC's navigation affordance.
  - "its row in the positions list … labels each leg's expiration separately" read DTEs with `span:has-text(/^\d+d$/)`. The PMCC leg block nests its DTE span inside LegBlock's cell span, so each DTE matched twice (`['368d','368d','32d','32d']`). It now reads each leg block's third cell, and still asserts `['368d', '32d']`.
- `e2e/position-cards.spec.ts` S21 (rewritten in Red) passes.

### Result

- `LOG_LEVEL=debug pnpm test:e2e --bail=0` (full run, before the `open-pmcc-position` fixes): 46 files, 555 passed, 2 failed (the two above), 1 todo.
- After the fixes: `LOG_LEVEL=debug pnpm test:e2e e2e/open-pmcc-position.spec.ts e2e/pmcc-position-card.spec.ts e2e/position-cards.spec.ts --bail=0` → 3 files, 91 passed.

## Review fixes (cycle 1)

Test-first fixes for four code-review findings. The concurrent agent owned `core/pmcc-card.ts`, `core/alerts.ts` and the `pmccMaxIfCalled` `!` in `pmcc-card-tier2.ts`; none of those were touched here.

- **T1 + B3 — PMCC legs tuple.** `PmccListSummary.legs` is now `[PmccLongLegSummary, ...PmccShortLegSummary[]]` (`PmccLongLegSummary = PmccLegSummary & { side: 'LONG' }`, and the same for SHORT), so an empty or short-first list cannot be written. `toLegSummary` is generic over the side, and `openLegSummaries` returns the tuple without a `!`. `deriveOpen` destructures `[leapsLeg, ...shortLegs]`, which drops `quotes.find(...'LONG')!`. `position-order.ts` has `PmccOrderLegs = readonly [PmccOrderLeg, ...PmccOrderLeg[]]`, so `pmccNextDecisionDte([])` is a type error. The property generator maps its shuffle into the tuple. Type tests (`expectTypeOf`) are in `list-positions.test.ts` and `position-order.test.ts`. Fixtures are retyped in `wheel-cards.ts`, and the `withLegs` helpers in the tests take the tuple.
- **B4 — Entry net debit total.** `PmccListSummary.entryDebitTotal` comes from `pmccInitialNetDebit(legs)`, the same entry-pair computation as `entryDebitPerShare`. The tier-2 cell shows that total and no longer computes per-share × 100 × current LEAPS contracts. Red tests: a service test (3 contracts, $25.00 / $1.80, $0.65 fees each → `'6961.3000'`, per share `'23.2043'`) and a tier-2 test (`$6,961.30`). The missing-fill case asserts both fields are null.
- **T2 + B5 — the create-PMCC response carries the list's own row.** `list-positions.ts` splits out `toListItems` and adds `readPositionListItem(db, id)`, which is `LIST_QUERY … WHERE p.id = ?` run through the same mapping (summary, management window, earnings, incomplete-summary WARN). `createPmccPosition` returns `listItem: PmccListItem | null` built from it after commit. `useCreatePmccPosition` inserts `res.listItem`. Deleted: `toPmccListItem`, `legSummary`, `openingLedger` and their tests from `lib/position-list-items(.test).ts`. Red tests: a service test (window 30 from `saveAlertDefaults`, earnings `2026-11-18` from the store, short at 25 DTE) plus `listPositions(db)` equal to `[listItem]`. The hook test was rewritten to use a real `QueryClient` with `window.api` mocked: the item is inserted in list order without being invalidated, and a null item leaves the cache alone.
- **AC literal — awareness tag tooltips.** `SignalTags` sets `title={tag.tooltip}`, so the tooltip text matches OPT-16 exactly (`aria-label` still carries the name). The unit and e2e literals are updated.

### Result

- `pnpm test` → 301 files / 5178 passed; `pnpm lint` clean; `pnpm typecheck` clean.
- `LOG_LEVEL=debug pnpm test:e2e e2e/pmcc-position-card.spec.ts e2e/position-cards.spec.ts e2e/open-pmcc-position.spec.ts` → 3 files, 91 passed. Ran `pnpm rebuild:node` afterwards.
