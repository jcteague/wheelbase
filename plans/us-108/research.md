# US-108 — Research: PMCC position card on the dashboard

Story: Linear [OPT-16 / US-108](https://linear.app/optionswheel/issue/OPT-16) (authoritative).
Mockup: `mockups/epic-09-pmcc-dashboard.mdx` (consolidated Epic 09 dashboard; `PmccCard`,
`PmccLegLine`, `GLYPHS`, `PMCC_ACTION`, `pmccActions`, `deriveCard` and `tier2Cells` are the design
reference). `mockups/us-108-pmcc-position-row-cards.mdx` is design history only.

Refreshed 2026-11-01 against `main` @ db7715a (US-18 squash-merged 2026-10-28, US-107 merged
2026-10-28). The 2026-10-24 version of this file planned against a table dashboard; every "today"
claim below was re-verified against `src/` on the wb-108 worktree.

## 1. Starting point (verified against `src/` on 2026-11-01, `main` @ db7715a)

| Concern           | Today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard         | **One card grid** (US-18). `PositionsGrid` (`components/PositionsGrid.tsx`) branches on `item.strategyType`: `WheelCard` for a wheel, `PmccCard` for a PMCC. No table remains.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Card primitives   | `components/position-card/`: `CardShell` (accent / `edge` / `closed` / required `href`, navigates on any click, `data-edge`), `CardHeader` (ticker link + `Open ↗` link + `price` slot + children for badges), `PriceBlock`, `ActionStrip` (takes `CardAction[]`, worst first, `+N` chip, `data-tone`), `LegBlock` (`tag` / `actions` / `title` / `dte` / `mark` / `trailing`, `data-action`), `LegTag` (`P C · L S`), `CardFooter`, `CardFooterCell` (`label` / `valueClassName` / `sub`), `styles.ts` (`EYEBROW`, `HEADLINE_FIGURE`, `SUB`, `TONE_TEXT_CLASS`).                                                                                                                                          |
| Minimal PMCC card | `components/position-card/PmccCard.tsx`: teal shell, `PMCC` badge, `PHASE_LABEL[phase]` / `No short open`, price over `Nd to next decision` (`short?.dte ?? long.dte`), one `L`/`S` `LegBlock` per open leg with mark `—`, P&L `—` / `no valuation yet`, Cost basis + **Premium collected** footer. No strip, no tags, no tier 2. `PmccCard.test.tsx` covers it.                                                                                                                                                                                                                                                                                                                                           |
| Action lanes      | `lib/card-actions.ts`: `CardTone`, `CardAction { glyph: '▲' \| '◷'; statusWord; tone; rank: LaneRank; summary }`, `WHEEL_LANES` keyed by `RuleCode`, `LANE_RED_ASSIGNMENT = 1`, `LANE_GOLD_ASSIGNMENT = 2`, `LANE_EXPIRING = 4`, `LANE_MANAGEMENT_WINDOW = 5`; **0 and 3 reserved for US-108's ✕ and ◆**. `rankWheelActions`, `formatActionLine`, `actionsByPosition(rows, ctxById)`. The page builds `ctxById` for **wheel** items only.                                                                                                                                                                                                                                                                  |
| Wheel display     | `lib/wheel-card-display.ts`: `deriveWheelCardDisplay` → `WheelCardDisplay` union (`closed \| shares \| option`); `markNote` builds the wide-spread tooltip `Wide spread: $b × $a — P&L may be unreliable`; `isDteUrgent` (≤ 7) from `lib/dte.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| List shape        | `PmccListItem.pmcc: PmccListSummary = { long, short \| null, basisPerShare, basisTotal }` with `PmccLegSummary = { strike, expiration, dte, contracts }` (`src/main/schemas.ts` 186–197). Built in `services/list-positions.ts` `readPmccSummaries` from `pmccOpenLegs(legs)` + `pmccLedgerFromLegs(legs)`. Wheel-only fields are literal `null` on the PMCC arm. Renderer `lib/position-list-items.ts` `toPmccListItem` mirrors it for the cache insert.                                                                                                                                                                                                                                                  |
| Sort              | `core/position-order.ts` `sortPositionsByDte`: `PositionOrderInput.pmcc?: { long: { dte }; short: { dte } \| null }`, ordered by `(short ?? long).dte`, undated last.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Ledger            | `calculatePmccLedger` (`core/costbasis.ts`) returns `basisPerShare`, `basisTotal`, `leapsCostPerShare/Total`, `shortCreditsPerShare/Total`, `effectiveShareCost`, `premiumRecoveredPercent` (4 dp string, `null` when LEAPS cost ≤ 0). `pmccLedgerFromLegs` (service) wraps it.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Open legs         | `pmccOpenLegs(legs)` → `{ long: PmccLongLeg; short: PmccShortLeg \| null }` by ledger replay; `PmccLongLeg = LegWithRole<'LEAPS_OPEN' \| 'ROLL_TO'>`. **At most one open short.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Entry debit       | `pmccInitialNetDebit(legs)` (`services/pmcc-opening-legs.ts`) — dollars, 4 dp, from the first `LEAPS_OPEN` + `SHORT_CALL_OPEN`; `calculatePmccOpeningDebit().basisPerShare` is the per-share figure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Alert constants   | `core/alerts.ts`: **private** `EXPIRATION_IMMINENT_MAX_DTE = 5`, `PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW = 2`, `EARNINGS_PROXIMITY_MAX_DAYS = 10`, `PMCC_LEAPS_ROLL_WINDOW_MAX_DTE = 60` (US-107 landed it); exported `DEFAULT_MANAGEMENT_WINDOW_DTE = 21`, `resolveManagementWindowDte`, `isNumeric`, `priceDirection`, `strikeProximitySummary`. **Private** `expirationImminentSummary`, `managementWindowSummary`, `pmccAssignmentRiskSummary`, `earningsProximitySummary`, `formatStrike`, `percentBelowStrike`, `proximityPercent`.                                                                                                                                                                  |
| Alert evaluation  | `services/evaluate-alerts.ts` `loadPmccEvaluableRows` reads `management_window_dte_override` and `pmccOpenLegs`; rides `EXPIRATION_IMMINENT` / `MANAGEMENT_WINDOW` / `PROFIT_TARGET` / `EARNINGS_PROXIMITY` / `PMCC_ASSIGNMENT_RISK` on the one open short and `PMCC_LEAPS_ROLL_WINDOW` on the LEAPS. Earnings via async `getEarnings` (fetches) — the alert job keeps `earnings_date` rows warm.                                                                                                                                                                                                                                                                                                          |
| Earnings store    | `services/earnings-dates.ts`: private `readRows(db, tickers)` and `answersNextPrint(next, now)`; only async exports (`getEarnings`, `getEarningsCalendar`). Table `earnings_date` (`next_earnings`, `last_earnings`, `checked_at`, `checked_through`).                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Option snapshots  | `useOptionSnapshots(legs: ActiveLegSummary[])` where `ActiveLegSummary = OccLegInput` (`ticker`, `expiration`, `strike`, `instrumentType`); `occSymbolForLeg` in `src/shared/option-symbol.ts`. `OptionSnapshot.greeks?.delta` optional (all four or none). `PositionsGrid.snapshotForItem` is one symbol per wheel item.                                                                                                                                                                                                                                                                                                                                                                                  |
| Wide spread       | `isWideSpread` / `WIDE_SPREAD_THRESHOLD = 0.1` / `hasNoBid` in `renderer/lib/option-display.ts` (renderer-only; ADR spread-no-bid-renderer-predicates).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Formatting        | `lib/format.ts`: `fmtMoney` (no grouping), `fmtMoneyGrouped` (`$2,120.00`, used by both card footers), `formatSignedMoney` (`+$400.00` / `-$500.00`), `fmtPct1`. `option-display.ts` `formatPnlPercentForDisplay` drops a trailing `.0`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Phase tokens      | `lib/phase.ts`: `PHASE_TOKEN.PMCC_OPEN = 'teal'`, `PHASE_COLOR`, `PHASE_LABEL.PMCC_OPEN = 'LEAPS + short call open'`. `PmccPhase = Extract<WheelPhase, 'PMCC_OPEN'>` — the only PMCC phase today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Settings          | `useAlertDefaults()` → `{ profitTargetPercent, managementWindowDte }`; `PositionsGrid` already takes `profitTargetDefault`. Main: `getAlertDefaults(db)` in `services/alert-defaults.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| E2E seams         | `e2e/position-card-helpers.ts` (`launchBackground` with `prices` / `extraSnapshots`, `cardFor`, `legOf`, `stripLine`, `stripChip`, `pnlLines`, `markerCounts`, `viewDashboard` = alert run + list reload); `e2e/pmcc-ledger-helpers.ts` (`createXyzPmcc` with leg overrides and `contracts`, `recordEvent(s)` through `_test:pmcc-record-leg-event`, fixtures `EXPIRE_1`, `SHORT_2`, `SHORT_ROLL`, `EXPIRE_2`, `LEAPS_ROLL`, `CYCLES`); `e2e/pmcc-helpers.ts` `sqlite()`; `WHEELBASE_MOCK_EARNINGS` fixtures via the fake earnings calendar (see `e2e/screener-helpers.ts` `buildEarningsFixtures`); `e2e/position-cards.spec.ts` S21 already seeds XYZ with a $118 short at 7 DTE and a LEAPS at 161 DTE. |
| US-112 (IVR cell) | Linear says Done, but only `plans/us-112/` exists (commit d8fae04 "plans and mockups"); no `IvrCell` on any position card and no feature page. **Out of scope here** (the story lists it); the mockup's `IvrFace`, the `· IV` suffix on the Detail bar and the two IV-context cells are US-112's and are not built by this plan.                                                                                                                                                                                                                                                                                                                                                                           |

## 2. What the mockup fixes (design reference)

- **Card face**: `ActionStrip` above the header; header = ticker link, `PMCC` badge, awareness
  tags (`⚑ δ ⚠`, `role="img"`, `aria-label`, `title`), price over `Nd to next decision`, `Open ↗`.
  Position line = `Net P&L` eyebrow, headline figure in P&L colour with an inline `⚠` when the LEAPS
  spread is wide, subline (`+18.9% of basis` / `unavailable — a leg has no mark` /
  `basis not positive` / `closed — no live marks`); to the right the state label and the coverage
  line (`1 × 100 sh` / `1 of 3 covered`).
- **Leg blocks** (`PmccLegLine`): tag, `$80.00 LEAPS` / `$108.00 call`, `×N` when contracts > 1,
  `· expiration`, DTE (gold when the LEAPS is ≤ 60 or the short ≤ 7, each with its own tooltip), mark
  (`— unavail.` / `$26.10` / `$26.10 ⚠`), then for a short the `TARGET` chip or `N% of max` in that
  leg's P&L colour, and for the LEAPS `Δ 0.82 · $25.00 debit` (`Δ —` with no greeks).
- **Footer**: Cost basis (`$2,120.00` / `$21.20 / share`; negative → gold + `LEAPS paid for`),
  Credits collected (`$380.00` / `15.2% of LEAPS cost recovered`, 3 px meter clamped at 100 %, green
  < 100 %, gold ≥ 100 %).
- **Detail bar**: `role="button"`, `aria-expanded`; `Detail · breakeven · max if called · Δ ·
extrinsic` / `Hide detail`; chevron rotates; gold while open. Tier 2 = 7 cells (Credits collected,
  Breakeven, Max if called, LEAPS delta, Short extrinsic, LEAPS mark, Entry net debit), each label /
  value / note. The card click toggles; ticker and Open navigate with `stopPropagation`.
- **Precedence**: ✕ 0 › ▲ red 1 › ▲ gold 2 › ◆ 3 › EXPIRING 4 › MANAGEMENT WINDOW 5. Awareness order
  ⚑ δ ⚠. Closed card: no actions, no tags, no Detail bar, every live figure `—`.
- Inline styles in the mockup are for the viewer only; the implementation uses Tailwind + `wb-*`
  tokens (the meter width is the one legitimately dynamic inline value).

## 3. Unknowns and how they were resolved

### U1 — US-18 prerequisite (resolved: shipped)

US-18 is on `main` (db7715a). The grid, shell, strip, leg block and footer primitives exist and are
typed on plain props; this story **replaces** `PmccCard.tsx`'s body and keeps its file name and
props shape (plus new optional props) so `PositionsGrid` and the page test's `PmccCardProps` mock
keep working. The wheel card and its action-lane code are not touched.

### U2 — Where the signal registry lives and how it reuses engine predicates

`core/alerts.ts` keeps its thresholds and summary helpers private. The card needs
`EXPIRATION_IMMINENT_MAX_DTE`, `PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW`, `EARNINGS_PROXIMITY_MAX_DAYS`,
`PMCC_LEAPS_ROLL_WINDOW_MAX_DTE` (all exist today), and the summary helpers `expirationImminentSummary`,
`managementWindowSummary`, `pmccAssignmentRiskSummary`, `earningsProximitySummary`. Resolution:
**export** them from `alerts.ts` unchanged (the summary helpers retyped on `Pick` slices they already
read — `ExpirationImminentInput = Pick<AlertEvaluationInput, 'dte' | 'strike'>`,
`ManagementWindowInput = Pick<AlertEvaluationInput, 'dte'>` — per the tighten-helper-input-types
convention), plus `percentBelowStrike`. No alert behaviour changes. The registry itself is a new pure
module `core/pmcc-card.ts` (ADR below).

### U3 — Wide-spread predicate is renderer-only

`isWideSpread` lives in `renderer/lib/option-display.ts`; core cannot import the renderer.
Resolution: move `WIDE_SPREAD_THRESHOLD`, `SpreadInput`, `isWideSpread`, `NoBidInput`, `hasNoBid` to
`src/shared/option-spread.ts` and re-export them from `option-display.ts` so `wheel-card-display.ts`,
`OptionChainTable` and their tests are untouched. The spread ADR is amended, not reversed: the
predicate is still pure and still 10 %.

### U4 — Earnings on the list item without a provider call

`getEarnings` is async and may fetch; `listPositions` is sync and `positions:list` is not wrapped in
`handleIpcCall`. Resolution: add a sync export `readStoredNextEarnings(db, tickers, now): Map<string,
string>` to `earnings-dates.ts` that reuses the private `readRows` + `answersNextPrint` (a stored
future `next_earnings` → that date; a passed or `NULL` date → no entry). No fetch; the alert job
(which already evaluates every PMCC with a short, US-106) and the screener keep rows warm. The read
degrades to an empty map on a DB error (`readRows` already does). Wheel items receive `nextEarnings`
and ignore it. In e2e the fake calendar (`WHEELBASE_MOCK_EARNINGS`) is read by the alert run that
`viewDashboard` performs, which persists the row the list then reads.

### U5 — Two open shorts and partial coverage

`pmccOpenLegs` yields one short by design (US-104/105 replay). The story says the two-short and
partial states "have no entry path yet" and US-115 owns them. Resolution: the wire shape is
`legs: PmccLegSummary[]` (LEAPS first, shorts by expiration) so US-115 widens the service without a
contract change; today the service emits 1–2 legs. Core and renderer are unit-tested with 2 shorts and
partial coverage. Partial coverage **is** producible end-to-end (`createXyzPmcc` takes one `contracts`
for both legs, but `_test:pmcc-record-leg-event` accepts a `SHORT_CALL_OPEN` with its own `contracts`
after `EXPIRE_1`), so it gets an e2e test. The two-short scenarios cannot be produced by any seam and
are covered by core + renderer tests only, called out in the AC audit.

### U6 — Closed and unknown-phase PMCCs in e2e

No production close path exists for a PMCC (US-111/US-120). `e2e/pmcc-helpers.ts` exports `sqlite()`;
the closed-card and neutral-card scenarios set `status='CLOSED'` / an unlisted `phase` directly, as
US-106's spec did for its gaps. `PmccPhase` is `'PMCC_OPEN'` only, so the neutral card is a **runtime**
guard: the renderer reads `PHASE_LABEL[phase] ?? phase` and `PHASE_TOKEN[phase] ?? 'teal'` behind a
`isKnownPmccPhase` check and renders no signals when the phase is not recognised.

### U7 — Valuation dates

Every AC pins a calendar date; e2e cannot pin the clock for the list (`computeDte` uses `new Date()`
in `listPositions`). Resolution (same as US-18/US-106): fixtures are run-day-relative
(`localDate(14)` for the 14-DTE short, `localDate(315)` for the LEAPS), and assertions use the DTE
literals the fixtures produce. Service and core tests pin `now`.

### U8 — The story's four "open questions for implementation"

1. **Short-leg wide spread** — LEAPS-only, as the mockup renders (`wide = leg.side === 'LONG' &&
leg.wide`). A short-leg ⚠ is a follow-up.
2. **Breakeven on laddered LEAPS** — one LEAPS leg exists today; breakeven = that leg's strike +
   `basisPerShare`. A contract-weighted strike is US-115's concern.
3. **Short-leg rules with two shorts** — ride on the nearest short (lowest DTE), matching
   `evaluate-alerts`.
4. **Gold DTE at 7 vs EXPIRING at 5** — keep both as the AC states them (`14d without the 7-day
gold emphasis`; `4d in gold` with the EXPIRING strip). Not aligned.

### U9 — Cycle count, opened date, entry debit

`cycles` = count of legs with `legRole === 'SHORT_CALL_OPEN'` (a roll's `ROLL_TO` stays in its cycle,
as the mockup's ledger does). `openedAt` = `positions.opened_date` (`PositionRecord.openedDate`;
`LIST_QUERY` must select it). `entryDebitPerShare` = `calculatePmccOpeningDebit(...).basisPerShare`
from the same entry legs `pmccInitialNetDebit` reads — expose a sibling `pmccEntryDebitPerShare(legs)`
in `services/pmcc-opening-legs.ts` rather than dividing the rounded total.

### U10 — Reconciling with US-18's shipped `CardAction`

`CardAction.glyph` is `'▲' | '◷'`, `statusWord` is a four-member union and `rank` is `LaneRank`
(1 | 2 | 4 | 5). The PMCC card needs `'✕'` and `'◆'`, `'BELOW BREAKEVEN'` and `'ROLL WINDOW'`
(US-118's lane words) and the reserved lanes 0 and 3. Resolution: widen the unions in
`lib/card-actions.ts` (`LANE_BELOW_BREAKEVEN = 0`, `LANE_ROLL_WINDOW = 3`, glyph and status-word
members added), keep `WHEEL_LANES` as is, and have `core/pmcc-card.ts` return a **core-side**
`PmccAction` that is assignable to `CardAction` (same field names; `summary` is the strip reason).
`ActionStrip`, the `LegBlock` highlight and `CardShell.edge` then need no change at all. The core type
is not the renderer type because core cannot import the renderer; the shape is identical on purpose and
an `expectTypeOf<PmccAction>().toMatchTypeOf<CardAction>()` test pins it.

### U11 — Where the wheel page's `actionsByPosition` stops and the PMCC's live signals start

The wheel strip **mirrors the queue** (ADR wheel-card-strip-mirrors-management-queue); the PMCC strip
is a **live derivation** (story: "signals are live derivations, not a mirror of the alerts table").
The two coexist: `PositionsListPage` keeps building wheel-only `ctxById`, and `PmccCard` evaluates
`evaluatePmccSignals` itself from the list item, its snapshots and quote. A PMCC never consults
`actionsByPosition`. The page's `legs` memo widens to include each PMCC leg so one `useOptionSnapshots`
call fetches every symbol.

## Architecture Decisions

### ADR: One pure signal registry in `src/main/core/pmcc-card.ts`

- **Decision:** `PMCC_SIGNALS` is an ordered array of `PmccSignalDefinition` entries (`code`, `glyph`,
  `tier: 'action' | 'awareness'`, `statusWord`, `rank`, `leg`, `test`, `tone`, `reason`, `tooltip`),
  evaluated by `evaluatePmccSignals(input: PmccSignalInput)` into `{ actions: PmccAction[]
(ranked, worst first); awareness: PmccTag[] (⚑ δ ⚠ order) }`. The strip, the `+N` chip, each leg's
  highlight, the card edge and the header tags all render from that one result. Thresholds are imported
  from `alerts.ts` (`EXPIRATION_IMMINENT_MAX_DTE`, `PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW`,
  `EARNINGS_PROXIMITY_MAX_DAYS`, `PMCC_LEAPS_ROLL_WINDOW_MAX_DTE`, all now exported); the two short-leg
  entries use the exported `expirationImminentSummary` / `managementWindowSummary` verbatim and the
  resolved management window; `pmccAssignmentRiskSummary` and `earningsProximitySummary` give the ▲ and
  ⚑ tooltips; `LEAPS_DELTA_FLOOR = 0.6` and the ✕ predicate are this module's. Lane ranks are
  `0 | 1 | 2 | 3 | 4 | 5` with the same numbers `lib/card-actions.ts` exports.
- **Why:** mirrors the alert `RULES` registry pattern (ADR alert-rule-registry; memory
  alert-rule-registry-pattern); no `if/return` chain; numbers exist once so US-106/107 and the card
  cannot disagree.
- **Alternatives considered:** evaluating signals inside the React component (rejected — untestable
  without rendering, duplicates thresholds); mirroring the `alerts` table through `actionsByPosition`
  as the wheel card does (rejected by the story — live derivations, no dismissal state, and ✕/δ have
  no alert rule).

### ADR: `computePmccUnrealizedPnl` is a fold over `legs` in `core/costbasis.ts`

- **Decision:** `computePmccUnrealizedPnl({ legs: { side, mid, contracts }[], basisTotal })` →
  `{ gross, pnl, pnlPercentOfBasis: string | null }` (4 dp, `ROUND_HALF_UP`); throws on mid < 0,
  contracts < 1, no LONG leg, or a non-finite basis. `pnlPercentOfBasis` is `null` when
  `basisTotal ≤ 0`. The renderer verifies every open leg has a mark before calling.
- **Why:** the cost basis already nets every credit, so marking the spread minus basis is
  self-consistent across one short, no short, two shorts and partial coverage. Matches
  `computeUnrealizedPnl`'s throw-on-bad-input contract and the failure-isolation rule.
- **Alternatives considered:** per-leg P&L summed (double-counts credits); computing in the service
  (would need marks on the list read, which is a journal read).

### ADR: `PmccListSummary` becomes a legs array plus ledger figures

- **Decision:** `pmcc: { legs: PmccLegSummary[]; cycles: number; entryDebitPerShare: string | null;
openedAt: string; managementWindowDte: number } & Pick<PmccLedgerResult, 'basisPerShare' |
'basisTotal' | 'leapsCostPerShare' | 'shortCreditsPerShare' | 'shortCreditsTotal' |
'premiumRecoveredPercent'>` with `PmccLegSummary = { legId, side: 'LONG' | 'SHORT', strike,
expiration, dte, contracts, fillPerShare }`, LEAPS first then shorts by expiration. `long` / `short`
  are removed; `core/position-order.ts` orders by the exported `pmccNextDecisionDte(legs)` (nearest
  SHORT dte, else nearest LONG dte), which the card header also shows. `nextEarnings: string | null`
  joins `PositionListItemBase`. `managementWindowDte` is resolved in the service with
  `resolveManagementWindowDte(override, getAlertDefaults(db).managementWindowDte)`.
- **Why:** the card is built from a legs array, so a second short or a partial stack add blocks, not
  cell types; ledger field names are reused so the renderer does no money math it does not own; one
  DTE function for sort key and header; the resolved window travels with the item so the renderer
  never reads settings for it.
- **Alternatives considered:** keeping `long`/`short` beside `legs` (two sources of truth); a separate
  `positions:list-pmcc` channel (US-33 precedent is one list, discriminated); resolving the window in
  the renderer from `useAlertDefaults` (the override is not on the list item today and the service
  already owns `resolveManagementWindowDte`).

### ADR: Earnings on the list come from a sync stored-row read

- **Decision:** `readStoredNextEarnings(db, tickers, now)` in `services/earnings-dates.ts`, no fetch;
  `listPositions` stays synchronous and unwrapped.
- **Why:** the list is a journal read that must not block on Finnhub; the row is already kept warm by
  the alert job and the screener. A ticker with no row simply has no ⚑.
- **Alternatives considered:** making the list async over `getEarnings` (network on every list
  poll); fetching in the renderer (a second earnings path).

### ADR: Wide-spread predicate moves to `src/shared/option-spread.ts`

- **Decision:** move `WIDE_SPREAD_THRESHOLD`, `SpreadInput`, `isWideSpread`, `NoBidInput`, `hasNoBid`;
  `renderer/lib/option-display.ts` re-exports them.
- **Why:** `pmcc-card.ts` (core) and `wheel-card-display.ts` (renderer) must share one predicate;
  core cannot import the renderer. `src/shared/` is the established home for pure leaves both sides
  import (`option-symbol.ts`, `decimal-text.ts`).
- **Alternatives considered:** passing a `wide` boolean into the registry (the renderer would then
  own a signal condition).

### ADR: The PMCC card has its own accent and badge, never a wheel phase badge

- **Decision:** `PmccCard` keeps `CardShell accent="PMCC"` and `Badge color={PHASE_COLOR.PMCC_OPEN}`
  (teal); the state label comes from the legs (`LEAPS + short call open`, `LEAPS + N short calls open`,
  `LEAPS open · no short call`, `Closed`). `PhaseBadge` is never used on a PMCC. An unrecognised PMCC
  phase renders the neutral card (that phase's raw label, dashed live figures, no signals).
- **Why:** AC "never a wheel phase badge"; the neutral fallback guards US-111's future phase.
- **Alternatives considered:** extending `PhaseBadge` with PMCC variants (couples the wheel badge to
  PMCC states).

### ADR: Tier 2 is local state; the ticker and `Open ↗` are the only navigation on a PMCC card

- **Decision:** `useState` in `PmccCard`; a click on the card or the Detail bar toggles, `Escape`
  collapses; the ticker and Open links call `stopPropagation`. `CardShell` grows an optional
  `onClick` that replaces its navigate-on-click when supplied, so the wheel card's whole-card
  navigation (US-18 S17) is unchanged.
- **Why:** AC; whole-card navigation is superseded on this card only.
- **Alternatives considered:** persisting the open state (not asked for); a second shell component
  (duplicates the edge/closed logic).

### ADR: Core `PmccAction` is shape-compatible with the renderer's `CardAction`

- **Decision:** `core/pmcc-card.ts` exports `PmccAction = { glyph; statusWord; tone; rank; summary;
leg: PmccLegRef }` where `leg` names the leg the state marks (`{ side: 'LONG' } | { side: 'SHORT';
legId }`). `lib/card-actions.ts` widens `CardAction`'s `glyph`, `StatusWord` and `LaneRank` unions
  (adding `'✕' | '◆'`, `'BELOW BREAKEVEN' | 'ROLL WINDOW'`, lanes 0 and 3) so a `PmccAction` is
  assignable to `CardAction` without mapping, and `ActionStrip` / `LegBlock` / `CardShell` are reused
  as they are.
- **Why:** US-18 reserved the lanes and the primitives for exactly this; one strip component for
  both strategies (ADR position-card-primitives-shared-across-strategies).
- **Alternatives considered:** a PMCC-specific strip (two strips to keep in step); importing
  `CardAction` into core (core cannot import the renderer).

## Open Questions

None. US-18 shipped (db7715a) and its names are the ones above. No `NEEDS CLARIFICATION` items remain.
