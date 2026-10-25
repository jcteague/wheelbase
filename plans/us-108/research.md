# US-108 — Research: PMCC position card on the dashboard

Story: Linear [OPT-16 / US-108](https://linear.app/optionswheel/issue/OPT-16) (authoritative).
Mockup: `mockups/epic-09-pmcc-dashboard.mdx` (consolidated Epic 09 dashboard; the `PmccCard`,
`PmccLegLine`, `ActionStrip`, `LegMarks`, `CardShell`, `tier2Cells` and `deriveCard` exports are
the design reference). `mockups/us-108-pmcc-position-row-cards.mdx` is design history only.

## 1. Starting point (verified against `src/` on 2026-10-24, `main` @ 8242372)

| Concern          | Today                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard        | `PositionsListPage` renders a 10-column `<table>` (`PositionTable`); `PositionRow` in `components/PositionCard.tsx` is a `<tr>`. **There is no card grid.**                                                                                                                                                                                                                                                                  |
| PMCC row         | `PmccPositionRow` (US-101/103/105): PMCC badge, `LEAPS + short call open`, both expirations, both DTEs, `—` for mid and P&L, `basisTotal` grouped.                                                                                                                                                                                                                                                                           |
| List shape       | `PmccListItem.pmcc: PmccListSummary = { long, short \| null, basisPerShare, basisTotal }` built in `services/list-positions.ts` from `pmccOpenLegs(legs)` + `pmccLedgerFromLegs(legs)`. Wheel-only fields are literal `null` on the PMCC arm.                                                                                                                                                                                |
| Sort             | `core/position-order.ts` `sortPositionsByDte`: PMCC ordered by `pmcc.short?.dte ?? pmcc.long.dte`, undated last. Also used by the renderer cache insert (`lib/position-list-items.ts`).                                                                                                                                                                                                                                      |
| Ledger           | `calculatePmccLedger` already returns `basisPerShare`, `basisTotal`, `leapsCostPerShare/Total`, `shortCreditsPerShare/Total`, `effectiveShareCost`, `premiumRecoveredPercent` (null when LEAPS cost ≤ 0).                                                                                                                                                                                                                    |
| Open legs        | `pmccOpenLegs(legs)` → `{ long: PmccLongLeg; short: PmccShortLeg \| null }` by ledger replay. **It yields at most one open short.**                                                                                                                                                                                                                                                                                          |
| Entry debit      | `pmccInitialNetDebit(legs)` in `services/pmcc-opening-legs.ts` (used by `positions:get`).                                                                                                                                                                                                                                                                                                                                    |
| Option snapshots | `useOptionSnapshots(legs: ActiveLegSummary[])` builds OCC symbols; `OptionSnapshot.greeks?.delta` optional. `snapshotForItem` in the page is one leg per item.                                                                                                                                                                                                                                                               |
| Wide spread      | `isWideSpread` / `WIDE_SPREAD_THRESHOLD = 0.1` / `hasNoBid` in `renderer/lib/option-display.ts` (renderer-only).                                                                                                                                                                                                                                                                                                             |
| Alert rules      | `core/alerts.ts` registry: `EXPIRATION_IMMINENT` (0–5), `MANAGEMENT_WINDOW` (6–window), `PROFIT_TARGET`, `STRIKE_PROXIMITY`, `EARNINGS_PROXIMITY` (0–10 and ≤ dte), `COVERED_CALL_BREACH`, `PMCC_ASSIGNMENT_RISK` (percent-below ≤ 2, no upper bound). Thresholds and summary helpers are **module-private**. No LEAPS rule yet (US-107 is planned, not built: `plans/us-107/` names `PMCC_LEAPS_ROLL_WINDOW_MAX_DTE = 60`). |
| Thresholds       | `resolveManagementWindowDte(override, default)` exported; `getAlertDefaults(db)` (sync, `app_settings`) returns `{ profitTargetPercent, managementWindowDte }`; `positions.management_window_dte_override` exists (migration 010).                                                                                                                                                                                           |
| Earnings         | `earnings_date` table (US-70). `getEarnings` is async read-through (may hit Finnhub). `readRows(db, tickers)` and `answersNextPrint(next, now)` are private sync helpers in `services/earnings-dates.ts`.                                                                                                                                                                                                                    |
| DTE              | `core/dte.ts` `computeDte(expiration, now)` (calendar days, null-safe). Renderer `lib/dte.ts` `isDteUrgent` (≤ 7).                                                                                                                                                                                                                                                                                                           |
| Formatting       | `fmtMoney`, `formatSignedMoney`, `fmtMoneyGrouped` (thousands separators, exists), `fmtPct1`, `pnlClass`.                                                                                                                                                                                                                                                                                                                    |
| Tokens           | `--wb-teal`, `--wb-teal-dim`, `--wb-sky`, `--wb-violet(-dim)`, `--wb-red-dim`, `--wb-gold-dim`, `--wb-bg-elevated`, `--wb-border-subtle` all exist in `index.css` as Tailwind colour tokens.                                                                                                                                                                                                                                 |
| Badge            | `ui/Badge` takes `color` (tint derived) — `PmccPositionRow` uses `PHASE_COLOR.PMCC_OPEN` (`#2dd4bf`, teal).                                                                                                                                                                                                                                                                                                                  |
| Queue badge      | `ManagementQueueRow` shows `PMCC · short call` on `phase === 'PMCC_OPEN'` (US-106).                                                                                                                                                                                                                                                                                                                                          |
| E2E seams        | `createPmccPosition` IPC, dev-only `_test:pmcc-record-leg-event` (arbitrary later legs incl. `contracts`), `sqlite()` helper in `e2e/pmcc-helpers.ts`, `WHEELBASE_MOCK_STOCK_QUOTES` / `WHEELBASE_MOCK_OPTION_SNAPSHOTS` (greeks optional), `WHEELBASE_MOCK_EARNINGS` + `runAlertEvaluation(page)` persists the earnings row, `reloadPositionsList`. Fixture dates are run-day-relative (`localDate(n)`), never pinned.      |
| Phase types      | `PmccPhase = 'PMCC_OPEN'` only; `PHASE_LABEL.PMCC_OPEN = 'LEAPS + short call open'`.                                                                                                                                                                                                                                                                                                                                         |

## 2. Mockup extraction (`epic-09-pmcc-dashboard.mdx`)

- **Card shell**: rounded surface, `border-l-2 border-l-wb-teal` accent; while an action state is open `border-l-4` in the state tone (`EDGE_CLASS`); closed card `opacity-50`. `data-testid="position-card"` / `position-card-closed`, `data-edge`.
- **Action strip** (`data-testid="action-strip"`, `data-tone`, `role="status"`): 16px glyph, bold status word, `· reason`; `+N` chip (`cursor-help`, `title` = "Also open:\n…" one line per other state, formatted `glyph WORD · reason`).
- **Header**: ticker link (`#/positions/:id`, `stopPropagation`), teal `PMCC` badge, awareness tags (`data-testid="pmcc-awareness-tags"`, each `role="img"` `aria-label=name` `title="name — sentence"`), IVR face (US-112, not this story), price block (`$104.20` over `14d to next decision`), `Open ↗` link.
- **Position line**: eyebrow `Net P&L · marked against basis`, 2xl signed figure in P&L tone with inline gold `⚠` when the LEAPS spread is wide; sub-line `+18.9% of basis` / `unavailable — a leg has no mark` / `basis not positive` / `closed — no live marks`. Right: state label + coverage line (`1 × 100 sh` / `1 of 3 covered`).
- **Leg block** (`data-testid="pmcc-leg"`, `data-action`): 4-col grid; `L`/`S` tag with tooltip; glyph marks before the strike (tooltip lists each state's sentence); `$80.00 LEAPS ×3 · 2027-09-17`; DTE (gold + tooltip inside LEAPS 60-day window or short 7-day rule); mid (`$26.10 ⚠` / `— unavail.`); trailing: LEAPS `Δ 0.82 · $25.00 debit`, short `TargetBadge` or `N% of max` in the leg's P&L tone. Highlighted: tone tint + `border-l-[3px]`.
- **Footer**: two `FootCell`s on `bg-wb-bg-elevated`: Cost basis (`$2,120.00` / `$21.20 / share`; `-$40.00` / `LEAPS paid for` in gold when ≤ 0) and Credits collected (`$380.00` / `15.2% of LEAPS cost recovered`, 3px meter green <100%, gold ≥100%, width clamped).
- **Detail bar**: `role="button"` `aria-expanded`; text `Detail · breakeven · max if called · Δ · extrinsic` (US-112 appends `· IV`), chevron rotates; gold while open. Panel: 7 cells (Credits collected, Breakeven, Max if called, LEAPS delta, Short extrinsic, LEAPS mark, Entry net debit), each label / value / note. Card click toggles; ticker and Open links navigate.
- **Precedence**: ✕ 0 › ▲ red 1 › ▲ gold 2 › ◆ 3 › EXPIRING 4 › MANAGEMENT WINDOW 5. Awareness order ⚑ δ ⚠. Closed card: no actions, no tags, no Detail bar, all live figures `—`.
- **Inline styles in the mockup are for the viewer only**; implementation uses Tailwind + `wb-*` tokens (the meter width is the one legitimately dynamic inline value).

## 3. Unknowns and how they were resolved

### U1 — The story's blocking prerequisite (US-18 card grid) has not shipped

The story and the mockup both say the dashboard becomes **one card grid**, with US-18 (Epic 04, archive only) pulled forward and ported to Linear first. Verified: no US-18 Linear issue, no grid in `src/`, `PositionsListPage` is still a table. Mixed table + card is explicitly rejected by the story. This cannot be resolved by research — see § Open Questions.

### U2 — Where the signal registry lives and how it reuses engine predicates

`core/alerts.ts` keeps its thresholds and summary helpers private. The card needs `EXPIRATION_IMMINENT_MAX_DTE`, `PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW`, `EARNINGS_PROXIMITY_MAX_DAYS`, `expirationImminentSummary`, `managementWindowSummary`, and the (not-yet-existing) `PMCC_LEAPS_ROLL_WINDOW_MAX_DTE`. Resolution: export them from `alerts.ts` (summary helpers typed on `Pick` slices, per the helper-input convention) and add the 60-day constant there so US-107 consumes it unchanged. The registry itself is a new pure module `core/pmcc-card.ts` (ADR below).

### U3 — Wide-spread predicate is renderer-only

`isWideSpread` lives in `renderer/lib/option-display.ts`; core cannot import it. Resolution: move `WIDE_SPREAD_THRESHOLD`, `isWideSpread` and `hasNoBid` to `src/shared/option-spread.ts` and re-export from `option-display.ts` so `OptMidCell` and its tests are untouched.

### U4 — Earnings on the list item without a provider call

`getEarnings` is async and may fetch. `listPositions` is sync and `positions:list` is not wrapped in `handleIpcCall`. Resolution: add a sync `readStoredNextEarnings(db, tickers, now)` export to `earnings-dates.ts` that reuses the private `readRows` + `answersNextPrint` (a stored future date → that date; a passed or missing date → `null`). No fetch; the alert job (which already evaluates every PMCC with a short, US-106) and the screener keep rows warm. Wheel items receive the field and ignore it.

### U5 — Two open shorts and partial coverage

`pmccOpenLegs` yields one short by design (US-104/105 replay). The story says the two-short and partial states "have no entry path yet" and US-115 owns them. Resolution: the wire shape is `legs: PmccLegSummary[]` (LEAPS first, shorts by expiration) so US-115 widens the service without a contract change; today the service emits 1–2 legs. Core and renderer are unit-tested with 2 shorts and partial coverage. Partial coverage **is** producible end-to-end (`_test:pmcc-record-leg-event` accepts `contracts`), so it gets an e2e test. The two-short scenarios cannot be produced by any seam and are covered by core + renderer tests only, called out in the AC audit.

### U6 — Closed and unknown-phase PMCCs in e2e

No production close path exists for a PMCC (US-111/US-120). `e2e/pmcc-helpers.ts` exports `sqlite()`; the closed card and neutral-card scenarios set `status='CLOSED'` / an unlisted `phase` directly, as US-106's spec did for its gaps.

### U7 — Valuation dates

Every AC pins a calendar date; e2e cannot pin the clock for the list (`computeDte` uses `new Date()` in `listPositions`). Resolution (same as US-106): fixtures are run-day-relative (`localDate(14)` for the 14-DTE short, `localDate(315)` for the LEAPS), and assertions use the DTE literals the fixtures produce.

### U8 — The story's four "open questions for implementation"

1. **Short-leg wide spread** — LEAPS-only, as the mockup renders (`wide = leg.side === 'LONG' && leg.wide`). A short-leg ⚠ is a follow-up.
2. **Breakeven on laddered LEAPS** — one LEAPS leg exists today; breakeven = that leg's strike + `basisPerShare`. A contract-weighted strike is US-115's concern.
3. **Short-leg rules with two shorts** — ride on the nearest short (lowest DTE), matching `evaluate-alerts`.
4. **Gold DTE at 7 vs EXPIRING at 5** — keep both as the AC states them (`14d without the 7-day gold emphasis`; `4d in gold` with the EXPIRING strip). Not aligned.

### U9 — Cycle count and opened date

`cycles` = count of legs with `legRole === 'SHORT_CALL_OPEN'` (a roll's `ROLL_TO` stays in its cycle, as the mockup's ledger does). `openedAt` = `positions.opened_date`. `entryDebitPerShare` = `pmccInitialNetDebit(legs)` ÷ (100 × LEAPS contracts), or reuse `calculatePmccOpeningDebit().netDebitPerShare` if present — verify in Green.

## Architecture Decisions

### ADR: One pure signal registry in `src/main/core/pmcc-card.ts`

- **Decision:** `PMCC_SIGNALS` is an ordered array of `{ code, glyph, tier, statusWord, rank, leg, test, tone, reason, tooltip }` entries, evaluated by `evaluatePmccSignals(input)` into `{ actions: ranked PmccAction[]; awareness: PmccTag[] }`. The strip, the `+N` chip, each leg's highlight, the card edge and the header tags all render from that one result. Thresholds are imported from `alerts.ts` (`EXPIRATION_IMMINENT_MAX_DTE`, `PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW`, `EARNINGS_PROXIMITY_MAX_DAYS`, new `PMCC_LEAPS_ROLL_WINDOW_MAX_DTE = 60`); the two short-leg entries use the exported `expirationImminentSummary` / `managementWindowSummary` verbatim; `LEAPS_DELTA_FLOOR = 0.6` and the ✕ predicate are this module's.
- **Why:** mirrors the alert `RULES` registry pattern (memory: alert-rule-registry-pattern); no `if/return` chain; numbers exist once so US-106/107 and the card cannot disagree.
- **Alternatives considered:** evaluating signals inside the React component (rejected — untestable without rendering, duplicates thresholds); mirroring the `alerts` table (rejected by the story — live derivations, no dismissal state).

### ADR: `computePmccUnrealizedPnl` is a fold over `legs` in `core/costbasis.ts`

- **Decision:** `computePmccUnrealizedPnl({ legs: { side, mid, contracts }[], basisTotal })` → `{ gross, pnl, pnlPercentOfBasis: string | null }` (4-dp, `ROUND_HALF_UP`); throws on mid < 0, contracts < 1, no LONG leg, or a non-finite basis. The renderer verifies every open leg has a mark before calling.
- **Why:** the cost basis already nets every credit, so marking the spread minus basis is self-consistent across one short, no short, two shorts and partial coverage. Matches `computeUnrealizedPnl`'s throw-on-bad-input contract and the failure-isolation rule.
- **Alternatives considered:** per-leg P&L summed (double-counts credits); computing in the service (would need marks on the list read, which is a journal read).

### ADR: `PmccListSummary` becomes a legs array plus ledger figures

- **Decision:** `pmcc: { legs: PmccLegSummary[]; cycles; entryDebitPerShare; openedAt; managementWindowDte } & Pick<PmccLedgerResult, 'basisPerShare' | 'basisTotal' | 'leapsCostPerShare' | 'shortCreditsPerShare' | 'shortCreditsTotal' | 'premiumRecoveredPercent'>` with `PmccLegSummary = { legId, side: 'LONG' | 'SHORT', strike, expiration, dte, contracts, fillPerShare }`. `long` / `short` are removed; `position-order.ts` orders by `pmccNextDecisionDte(legs)` (nearest SHORT dte, else nearest LONG dte), which the card header also shows. `nextEarnings: string | null` joins `PositionListItemBase`.
- **Why:** the card is built from a legs array, so a second short or a partial stack add blocks, not cell types; ledger field names are reused so the renderer does no money math it does not own; one DTE function for sort key and header.
- **Alternatives considered:** keeping `long`/`short` beside `legs` (two sources of truth); a separate `positions:list-pmcc` channel (US-33 precedent is one list, discriminated).

### ADR: Earnings on the list come from a sync stored-row read

- **Decision:** `readStoredNextEarnings(db, tickers, now)` in `services/earnings-dates.ts`, no fetch; `listPositions` stays synchronous and unwrapped.
- **Why:** the list is a journal read that must not block on Finnhub; the row is already kept warm by the alert job and the screener. A ticker with no row simply has no ⚑.
- **Alternatives considered:** making the list async over `getEarnings` (network on every list poll); fetching in the renderer (a second earnings path).

### ADR: Wide-spread predicate moves to `src/shared/option-spread.ts`

- **Decision:** move `WIDE_SPREAD_THRESHOLD`, `isWideSpread`, `hasNoBid`; `renderer/lib/option-display.ts` re-exports them.
- **Why:** `pmcc-card.ts` (core) and `OptMidCell` (renderer) must share one predicate; core cannot import the renderer.
- **Alternatives considered:** passing a `wide` boolean into the registry (the renderer would then own a signal condition).

### ADR: The PMCC card has its own accent and badge, never a wheel phase badge

- **Decision:** `PmccPositionCard` branches at the grid on `item.strategyType`; it renders `Badge color={PHASE_COLOR.PMCC_OPEN}` (teal) and a state label from `PHASE_LABEL[phase] ?? phase`, with the LEAPS-only / N-short labels derived from `legs`. `PhaseBadge` is never used on a PMCC. An unrecognised PMCC phase renders the neutral card (dashed live figures, no signals).
- **Why:** AC "never a wheel phase badge"; the neutral fallback guards US-111's future phase.
- **Alternatives considered:** extending `PhaseBadge` with PMCC variants (couples the wheel badge to PMCC states).

### ADR: Tier 2 is local state; the ticker and `Open ↗` are the only navigation

- **Decision:** `useState` in `PmccPositionCard`; card click / Detail bar toggles; `Escape` collapses; ticker and Open are `<a href="#/positions/:id">` with `stopPropagation`.
- **Why:** AC; whole-card navigation (US-24) is superseded on this card only.
- **Alternatives considered:** persisting the open state (not asked for).

### ADR: `PMCC_LEAPS_ROLL_WINDOW_MAX_DTE` lands in `alerts.ts` with whichever story merges first

- **Decision:** this plan adds `export const PMCC_LEAPS_ROLL_WINDOW_MAX_DTE = 60` to `core/alerts.ts`; if US-107 (planned, same name) merges first, Green reuses it.
- **Why:** the story says the constants "can land here first and be shared"; the name is already fixed by `plans/us-107/data-model.md`.
- **Alternatives considered:** a card-local 60 (two numbers).

## Open Questions

**Resolved 2026-10-24 (user decision):** US-18 is ported to Linear as
[OPT-30](https://linear.app/optionswheel/issue/OPT-30) (Epic 04 project), reconciled against the
`WheelCard` / `PositionsGrid` design in `mockups/epic-09-pmcc-dashboard.mdx`, and is planned and
implemented **first**. It supplies the grid, `CardShell`, `ActionStrip`, `LegBlock`,
`CardFooterCell` and a minimal PMCC card. US-108's Phase 1/2 are deferred until US-18 ships; when
resumed, this plan builds on US-18's shipped names (`plans/us-18/plan.md`) and replaces the
minimal PMCC card.

No other `NEEDS CLARIFICATION` items remain.
