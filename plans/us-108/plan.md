---
story: us-108
kind: feature
parent: null
topics: [pmcc, position-list, cost-basis, alerts, market-data, ipc-handlers]
status: planned
---

# Implementation Plan: US-108 — Display PMCC-specific position card on dashboard

## Summary

Replace US-18's minimal `PmccCard` with the full PMCC card: a legs-array list item with the US-103
ledger figures, a pure net-P&L fold and a pure signal registry in `src/main/core/`, and a renderer
display that composes the shipped card primitives (`CardShell`, `ActionStrip`, `LegBlock`,
`CardFooterCell`) into the mockup's three tiers. Done means every scenario in OPT-16 has a named
e2e case (the two unproducible two-short scenarios excepted and covered by core + renderer tests),
wheel cards render byte-for-byte as before, and `pnpm test` / `lint` / `typecheck` are green.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** Linear [OPT-16 / US-108](https://linear.app/optionswheel/issue/OPT-16) (the only authority; no markdown copy)
- **Research & Design Decisions:** `plans/us-108/research.md`
- **Data Model & Selection Logic:** `plans/us-108/data-model.md`
- **API Contract(s):** `plans/us-108/contracts/positions-list.md`
- **Quickstart & Verification:** `plans/us-108/quickstart.md`
- **Mockup:** `mockups/epic-09-pmcc-dashboard.mdx` (`PmccCard`, `PmccLegLine`, `GLYPHS`, `PMCC_ACTION`, `pmccActions`, `deriveCard`, `tier2Cells`); `pnpm mockups` renders it
- **Shipped prerequisite:** `docs/spec/features/us-18-position-cards.md`, `docs/us-18-implementation.md`

## Prerequisites

All shipped on `main` @ db7715a:

- US-18 card grid and primitives (`src/renderer/src/components/position-card/*`,
  `lib/card-actions.ts` with lanes 0 and 3 reserved, `PositionsGrid`, `PositionsListPage`'s queue wiring).
- US-101/103/104/105 PMCC legs, `pmccOpenLegs`, `pmccLedgerFromLegs`, `calculatePmccLedger`,
  `pmccInitialNetDebit`, the `_test:pmcc-record-leg-event` seam.
- US-106/107 alert constants and summaries in `core/alerts.ts` (private today; exported by area 2).
- US-56/70 `earnings_date` store and the fake earnings calendar; US-57-58 `getAlertDefaults` and
  `positions.management_window_dte_override`.
- US-33 option snapshots with optional greeks, `computeUnrealizedPnl`, `isWideSpread`, `TargetBadge`.

No migration, no new dependency.

## Implementation Areas

### 1. Shared wide-spread predicate

**Files to create or modify:**

- `src/shared/option-spread.ts` — new: `WIDE_SPREAD_THRESHOLD`, `SpreadInput`, `isWideSpread`, `NoBidInput`, `hasNoBid` (moved verbatim from `option-display.ts`, with the `Decimal.set` rounding line)
- `src/shared/option-spread.test.ts` — new
- `src/renderer/src/lib/option-display.ts` — re-export the five names from `../../../shared/option-spread`; delete the local copies
- `src/renderer/src/lib/option-display.test.ts` — keep; it imports from `option-display` and must still pass unchanged

**Red — tests to write:**

- `option-spread.test.ts`: `isWideSpread` at the threshold — spread exactly 10 % of mid (`bid 0.95, ask 1.05, mid 1.00`) is `false`; 10.01 % (`0.9499 × 1.0500`) is `true`; `mid '0'` is `false`; `hasNoBid` for `'0'`, `'0.00'`, `'0.0000'` true and `'0.0001'` false.
- `option-display.test.ts`: unchanged and green (proves the re-export).

**Green — implementation:**

- Move the code; `option-display.ts` becomes `export { WIDE_SPREAD_THRESHOLD, isWideSpread, hasNoBid } from '../../../shared/option-spread'` plus `export type { SpreadInput, NoBidInput }`.

**Refactor — cleanup to consider:**

- `wheel-card-display.ts` may import from `option-display` or `shared` — leave it on `option-display` (no churn).

**Acceptance criteria covered:**

- Enabler for "A wide LEAPS spread flags the P&L as unreliable" and "Awareness tags render … ⚑ δ ⚠" (core needs the predicate).

### 2. Export the alert thresholds and short-leg summaries from `core/alerts.ts`

**Files to create or modify:**

- `src/main/core/alerts.ts` — `export` `EXPIRATION_IMMINENT_MAX_DTE`, `PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW`, `EARNINGS_PROXIMITY_MAX_DAYS`, `PMCC_LEAPS_ROLL_WINDOW_MAX_DTE`, `expirationImminentSummary`, `managementWindowSummary`, `pmccAssignmentRiskSummary`, `earningsProximitySummary`, `percentBelowStrike`; add `ExpirationImminentInput = Pick<AlertEvaluationInput, 'dte' | 'strike'>` and `ManagementWindowInput = Pick<AlertEvaluationInput, 'dte'>` and type the two helpers on them
- `src/main/core/alerts.test.ts` — add literal-value tests for the newly exported helpers

**Red — tests to write:**

- `alerts.test.ts`: `expirationImminentSummary({ dte: 4, strike: '108.0000' })` is `'Expires in 4 days at $108.00 strike'`; `managementWindowSummary({ dte: 14 })` is `'14 DTE remaining — review for roll or close'`; `pmccAssignmentRiskSummary({ strike: '108.0000', currentUnderlyingPrice: '111.40' })` is `'Stock is 3.1% above the $108.00 short-call strike — in the money, LEAPS would have to cover'` and at `'106.10'` is `'Stock is 1.8% below the $108.00 short-call strike — approaching assignment'`; `earningsProximitySummary({ daysToEarnings: 2, expiration: '2026-11-20' })` is `'Earnings in 2 days before your 2026-11-20 expiration'`; `percentBelowStrike({ strike: '108.0000', currentUnderlyingPrice: '106.10' })` equals `Decimal('1.7592…')` to 4 dp (`1.7593`); the four constants equal `5`, `2`, `10`, `60`.
- No property — constants and string builders already covered by `alerts.property.test.ts` through `evaluatePosition`.

**Green — implementation:**

- Add `export` keywords and the two `Pick` slices; no logic change. `RULES` entries keep calling the same functions.

**Refactor — cleanup to consider:**

- `expirationImminentSummary` / `managementWindowSummary` were typed on the full `AlertEvaluationInput`; narrowing them is the tighten-helper-input-types convention, nothing else moves.

**Acceptance criteria covered:**

- Enabler for every strip scenario whose text is "the queue's summary verbatim" (management-window, EXPIRING, ▲ tooltips, ⚑ tooltip).

### 3. `computePmccUnrealizedPnl` in `core/costbasis.ts`

**Files to create or modify:**

- `src/main/core/costbasis.ts` — `PmccUnrealizedPnlInput`, `PmccUnrealizedPnlResult`, `computePmccUnrealizedPnl` (data-model § 1.5)
- `src/main/core/costbasis.test.ts` — examples
- `src/main/core/costbasis.property.test.ts` — properties

**Red — tests to write:**

- Examples: Background `legs [{LONG, 26.10, 1}, {SHORT, 0.90, 1}], basisTotal 2120` → `{ gross: '2520.0000', pnl: '400.0000', pnlPercentOfBasis: '18.8679' }`; falling stock (`16.40`, `0.20`) → `pnl '-500.0000'`, percent `'-23.5849'`; LEAPS-only (`25.40`, basis 2300) → `'240.0000'` / `'10.4348'`; three contracts (`26.10 ×3`, `0.90 ×3`, basis 6360) → `'1200.0000'` / `'18.8679'`; two shorts (`28.40 ×2`, `1.20`, `1.05`, basis 4240) → `'1215.0000'` / `'28.6557'`; partial coverage (`26.10 ×3`, `0.90 ×1`, basis 6360) → `'1380.0000'` / `'21.6981'`; negative basis (`33.40`, `0.95`, basis `-40`) → `pnl '3285.0000'`, `pnlPercentOfBasis null`; basis exactly `'0'` → `null`; rounding: a mid whose product's fifth decimal is 5 (`mid '0.00005'`, 1 contract → gross `0.0050`) asserts the literal.
- Throws: negative mid, non-numeric mid, `contracts 0`, `contracts 1.5`, no `LONG` leg, `basisTotal 'abc'` — each `toThrow(<message>)`.
- Properties (`costbasis.property.test.ts`): **oracle** — for one LONG and one SHORT leg at the same contracts, `pnl` equals `(midL − midS) × 100 × c − basis` computed independently with `Decimal`; **order independence** — shuffling `legs` leaves the result equal; **scale invariance** — multiplying every `contracts` and `basisTotal` by `k` multiplies `gross` and `pnl` by `k` and leaves `pnlPercentOfBasis` within one rounding unit; **guard** — a legs array with no `LONG` always throws.

**Green — implementation:**

- The fold from data-model § 1.5 with `money4` / `fixed4`, validation before arithmetic, `sharesFromContracts` reused.

**Refactor — cleanup to consider:**

- Share the mid/contracts validation with `computeUnrealizedPnl` if the two guards read the same.

**Acceptance criteria covered:**

- "Net P&L marks the diagonal against the cost basis", "A falling stock …", "A PMCC with only the LEAPS open", "A LEAPS fully paid for by credits" (`basis not positive`), "Totals scale with contracts", "Two short calls …" (fold), "Partial coverage …".

### 4. `pmccNextDecisionDte` and the legs-array sort key

**Files to create or modify:**

- `src/main/core/position-order.ts` — `PositionOrderInput.pmcc` becomes `{ legs: readonly { side: 'LONG' | 'SHORT'; dte: number }[] } | null`; export `pmccNextDecisionDte(legs)`; `orderDte` uses it
- `src/main/core/position-order.test.ts`, `position-order.property.test.ts` — update fixtures to the legs shape

**Red — tests to write:**

- `pmccNextDecisionDte`: LEAPS 315 + short 14 → 14; LEAPS 333 alone → 333; LEAPS 315 + shorts 42 and 14 (any order) → 14.
- Sort: wheels MSFT 10 / AAPL 30 with XYZ short 14 → `[MSFT, XYZ, AAPL]`; XYZ LEAPS-only 333 → `[MSFT, AAPL, XYZ]`; a shares-held wheel (`dte null`) still sorts after XYZ at 333.
- Property: **invariant** — for any list, the sequence of `orderDte` values is non-decreasing with every `null` at the tail (existing property, re-pointed at the legs shape); **oracle** — `pmccNextDecisionDte` equals `Math.min` over the SHORT dtes when any exist, else over the LONG dtes.

**Green — implementation:**

- `pmccNextDecisionDte(legs) = min(dte of SHORT legs) ?? min(dte of LONG legs)`; `orderDte(item) = item.pmcc ? pmccNextDecisionDte(item.pmcc.legs) : item.dte`.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- "The PMCC sorts by its nearest decision point" (both examples); header `Nd to next decision` shares the function.

### 5. `core/pmcc-card.ts` — cues and the signal registry

**Files to create or modify:**

- `src/main/core/pmcc-card.ts` — new: `LEAPS_DELTA_FLOOR`, `pmccBreakeven`, `pmccMaxIfCalled`, `shortExtrinsic`, `premiumRecoveredFraction`, `PmccLegRef`, `PmccLaneRank`, `PmccAction`, `PmccTag`, `PmccSignalInput`, `PmccSignalDefinition` (discriminated on `tier`), `PMCC_SIGNALS`, `evaluatePmccSignals` (data-model § 1.6–1.7)
- `src/main/core/pmcc-card.test.ts` — new
- `src/main/core/pmcc-card.property.test.ts` — new

**Red — tests to write:**

- Cues: `pmccBreakeven('80.0000', '21.2000')` → `'101.2000'`; `pmccMaxIfCalled({ shortStrike: '108', leapsStrike: '80', basisPerShare: '21.2', shortContracts: 1 })` → `'680.0000'`, with 3 contracts `'2040.0000'`, no short → `null`; `shortExtrinsic({ mid: '0.90', price: '104.20', strike: '108' })` → `'0.9000'` (OTM) and `({ mid: '3.50', price: '111.40', strike: '108' })` → `'0.1000'` (ITM); `premiumRecoveredFraction('15.2000')` → `0.152`, `('101.8000')` → `1` (clamped), `(null)` → `null`.
- Each predicate **at and either side of its boundary** (fixtures built in `beforeEach`, never in a `describe` body):
  - ROLL_WINDOW: LEAPS dte 60 fires, 61 does not, 0 fires, −1 does not; rank 3, gold, leg `{ side: 'LONG' }`, reason `'LEAPS 59d left, inside the 60-day window · roll while it has time value'` at 59, tooltip `'LEAPS inside the 60-day roll window'`.
  - ASSIGNMENT_RISK: price 2.0 % below (`105.84` vs `108`) fires gold rank 2; 2.1 % below (`105.73`) does not; at the money (`108.00`) fires red rank 1; above (`111.40`) red with reason `'stock 3.1% above the $108.00 strike · roll or close'`; `106.10` gold with reason `'stock 1.8% below the $108.00 strike · plan the roll'`; tooltip equals `pmccAssignmentRiskSummary`; `price null` never fires; with two shorts (`108` at 14 DTE, `112` at 42 DTE) and price `106.80` only the `108` short is the leg (`{ side: 'SHORT', legId }`).
  - BELOW_BREAKEVEN: short strike `99` with breakeven `101.20` fires red rank 0 with reason `'$99.00 strike is $2.20 under the $101.20 breakeven · roll up before it is called'` and tooltip `'Short strike below breakeven $101.20 — being called away locks in a loss'`; strike equal to breakeven does not fire; `101.21` does not.
  - EXPIRING / MANAGEMENT_WINDOW on the nearest short: dte 5 → EXPIRING only; 6 → MANAGEMENT_WINDOW only; 21 → MANAGEMENT_WINDOW; 22 → neither (window 21); with `managementWindowDte 14`, dte 14 fires and 15 does not; summaries are the exported helpers' literals (`'Expires in 4 days at $108.00 strike'`, `'14 DTE remaining — review for roll or close'`); no short → neither.
  - EARNINGS: `daysToEarnings 10` with short dte 14 fires; 11 does not; 2 with short dte 4 fires; 5 with short dte 4 does not (day after expiry); `null` does not; no short does not; tooltip `'Earnings in 2 days before your 2026-11-20 expiration'`.
  - DELTA_FLOOR: delta `'0.5900'` fires, `'0.6000'` does not, `null` does not; tooltip `'LEAPS delta 0.54 below 0.60 — no longer tracking as synthetic stock'` at `0.54`.
  - WIDE_SPREAD: LEAPS `24.60 × 27.60 / 26.10` fires (11.5 %), `25.70 × 26.50` does not (3.1 %), `spread null` does not; tooltip `'LEAPS spread is 11.5% of the mid — the P&L that depends on it is unreliable'`.
- Composition: `evaluatePmccSignals` returns `actions` sorted by rank across **every pair** of action states (a table of fixtures that co-fire: ✕+▲red, ▲red+MW, ▲gold+MW, ◆+MW, EXPIRING alone when MW cannot co-fire, ✕+▲+MW) asserting `actions.map(a => a.statusWord)`; awareness order is `['⚑', 'δ', '⚠']` when all three fire; an awareness-only input yields `actions: []`; the healthy Background (dte 25, price 104.20, strike 108, breakeven 101.20, LEAPS 326, delta 0.82, spread 3.1 %, no earnings) yields `{ actions: [], awareness: [] }`.
- Type test: `expectTypeOf<Extract<PmccSignalDefinition, { tier: 'awareness' }>>().not.toHaveProperty('rank')`.
- Properties (`pmcc-card.property.test.ts`): **guard** — for any input, `evaluatePmccSignals(...).awareness` never contributes to `actions` (no action has glyph ⚑ δ ⚠) and `actions` is sorted by `rank`; **invariant** — EXPIRING and MANAGEMENT_WINDOW never both fire; **inverse** — `pmccBreakeven(strike, basis) − basis = strike` (4 dp); **bound** — `premiumRecoveredFraction` is always in `[0, 1]` or `null`; **oracle** — ASSIGNMENT_RISK fires iff `percentBelowStrike ≤ 2` using the exported helper on a generated `(strike, price)` pair with `price` generated as `strike × (1 − p/100)` for `p ∈ [−5, 5]` (constraint in the generator, not `fc.pre`).

**Green — implementation:**

- The registry from data-model § 1.7, importing the thresholds and summaries from `./alerts` and `isWideSpread` from `../../shared/option-spread`; `evaluatePmccSignals` filters by `tier`, maps to `PmccAction` / `PmccTag`, sorts actions by `rank` (stable). No I/O, no logging.

**Refactor — cleanup to consider:**

- `formatStrike`-style money helpers: reuse `alerts.ts`'s `formatStrike` (export it) rather than a second `$x.xx` formatter.
- Mutation run (`pnpm test:mutation --mutate src/main/core/pmcc-card.ts`); kill survivors with boundary tests.

**Acceptance criteria covered:**

- Every signal scenario: "Inside the roll window …", "The short-call DTE turns gold inside 7 days" (EXPIRING strip), "▲ assignment risk" (both examples), "More than 2% below …", "The ⚑ glyph …", "✕ below breakeven …", "The δ tag …", "A healthy card …", "Awareness tags render … fixed order", "With two short calls, only the at-risk short is highlighted"; tier-2 cells "Breakeven", "Max if called", "Short extrinsic".

### 6. List shape: legs array, ledger figures, earnings, management window

**Files to create or modify:**

- `src/main/schemas.ts` — `PmccLegSummary` (legId, side, fillPerShare added), `PmccListSummary` (legs + cycles + entryDebitPerShare + openedAt + managementWindowDte & six ledger keys), `PositionListItemBase.nextEarnings`
- `src/main/services/pmcc-opening-legs.ts` — `pmccEntryDebitPerShare(legs): string | null`
- `src/main/services/earnings-dates.ts` — `readStoredNextEarnings(db, tickers, now): Map<string, string>`
- `src/main/services/list-positions.ts` — `LIST_QUERY` selects `p.opened_date`, `p.management_window_dte_override`; `readPmccSummaries` builds `legs` (LONG first, SHORTs by expiration), `cycles`, `entryDebitPerShare`, `openedAt`, `managementWindowDte` via `resolveManagementWindowDte(override, getAlertDefaults(db).managementWindowDte)`; `toListItemBase` sets `nextEarnings` from one `readStoredNextEarnings` call over the distinct tickers; DEBUG logs `pmcc_list_legs_selected` (positionId, legIds) and `list_positions_earnings_joined` (count)
- `src/renderer/src/api/positions.ts` — no change expected (re-exports the schema types)
- `src/renderer/src/lib/position-list-items.ts` — `toPmccListItem` builds `legs` from `longLeg` / `shortLeg` (`legId: leg.id`, `fillPerShare: leg.premiumPerContract`), `cycles: 1`, `entryDebitPerShare: res.openingDebit.basisPerShare`, `openedAt: position.openedDate`, `managementWindowDte` from a new optional argument (default `DEFAULT_MANAGEMENT_WINDOW_DTE`), ledger keys from `res.openingDebit` / zeros where the opening response has them, `nextEarnings: null`
- Tests: `src/main/services/list-positions.test.ts`, `earnings-dates.test.ts`, `pmcc-opening-legs.test.ts`, `src/renderer/src/lib/position-list-items.test.ts`

**Red — tests to write:**

- `pmcc-opening-legs.test.ts`: `pmccEntryDebitPerShare` on the US-103 fixture (`25.00` LEAPS, `1.80` short, 1 contract, no fees) is `'23.2000'`; with fees `1.00` + `1.00` and 1 contract `'23.2200'`; missing short fill → `null`.
- `earnings-dates.test.ts`: `readStoredNextEarnings` with rows `{ XYZ: next 2026-11-18 }`, `{ AAPL: next 2026-10-01 (past) }`, `{ MSFT: next null }` at `now = 2026-11-06` returns a map with only `XYZ → '2026-11-18'`; a ticker with no row is absent; `next === today` is returned (`answersNextPrint` is `>=`); a throwing `db.prepare` returns an empty map and logs `earnings_date_read_failed`.
- `list-positions.test.ts` (pinned `now`): a PMCC with the Background history (entry LEAPS `80` @ `25.00` exp +315, three expired shorts `1.00`/`0.50`/`0.50`, open `108` @ `1.80` exp +14) yields `pmcc.legs` `[{ side: 'LONG', strike: '80.0000', dte: 315, contracts: 1, fillPerShare: '25.0000', legId }, { side: 'SHORT', strike: '108.0000', dte: 14, fillPerShare: '1.8000' }]`, `cycles 4`, `basisPerShare '21.2000'`, `basisTotal '2120.0000'`, `shortCreditsTotal '380.0000'`, `shortCreditsPerShare '3.8000'`, `leapsCostPerShare '25.0000'`, `premiumRecoveredPercent '15.2000'`, `entryDebitPerShare '23.2000'`, `openedAt` the LEAPS fill date, `managementWindowDte 21`; with `management_window_dte_override 14` → `14`; with `saveAlertDefaults({ managementWindowDte: 18 })` and no override → `18`; LEAPS-only after `PMCC_SHORT_EXPIRED` → one LONG leg and `cycles` unchanged; after a short roll (`ROLL_TO`) the SHORT leg is the `ROLL_TO` row and `cycles` is still the `SHORT_CALL_OPEN` count; a closed PMCC (`status 'CLOSED'`) still returns its legs and ledger; `nextEarnings` is `'2026-11-18'` when the store holds it and `null` otherwise, on wheel items too; sort: XYZ (short 14) between MSFT (10) and AAPL (30), LEAPS-only XYZ (333) after AAPL and before a shares-held NVDA; a wheel item is byte-for-byte the pre-change shape plus `nextEarnings: null` (`toEqual` against a literal).
- `position-list-items.test.ts`: `toPmccListItem` yields the new shape from a create response (`legs` two entries, `cycles 1`, `entryDebitPerShare` from `openingDebit.basisPerShare`, `nextEarnings null`); `insertPositionListItem` slots a PMCC by its short DTE.

**Green — implementation:**

- As listed under files; `readPmccSummaries` keeps the `pmcc_list_summary_incomplete` WARN path; `activeLegSubquery` is untouched (PMCC legs come from `readLegsByPosition` as today).

**Refactor — cleanup to consider:**

- `toLegSummary(leg, side)` becomes the one place a `LegRecord` turns into a `PmccLegSummary`; the renderer mirror in `position-list-items.ts` stays a hand copy with a comment, as it is today.

**Acceptance criteria covered:**

- Every scenario's footer figures ("Credits collected, premium recovered …", "A LEAPS fully paid for …", "Totals scale with contracts"), "A PMCC with only the LEAPS open" (one leg), "The PMCC sorts …", the ⚑ scenario's earnings, MANAGEMENT WINDOW with the position's window, tier-2 "Entry net debit … opened … Nd ago" and "N short-call cycles".

### 7. Widen the card-action lanes for ✕ and ◆; `CardShell.onClick`

**Files to create or modify:**

- `src/renderer/src/lib/card-actions.ts` — `LANE_BELOW_BREAKEVEN = 0`, `LANE_ROLL_WINDOW = 3`; `LaneRank` gains `0 | 3`; `CardAction.glyph` gains `'✕' | '◆'`; `StatusWord` gains `'BELOW BREAKEVEN' | 'ROLL WINDOW'`; `WHEEL_LANES`, `rankWheelActions`, `actionsByPosition` unchanged
- `src/renderer/src/lib/card-actions.test.ts` — type pins
- `src/renderer/src/components/position-card/CardShell.tsx` — optional `onClick?: (event: React.MouseEvent) => void`; when supplied it replaces the hash navigation
- `src/renderer/src/components/position-card/CardShell.test.tsx` — new cases

**Red — tests to write:**

- `card-actions.test.ts`: `expectTypeOf<PmccAction>().toMatchTypeOf<CardAction>()` (import from `main/core/pmcc-card`); `expectTypeOf<PmccLaneRank>().toEqualTypeOf<LaneRank>()`; `rankWheelActions` on the US-18 fixtures still ranks `CALL BREACHED` before `EXPIRING` (regression guard that widening changed nothing).
- `CardShell.test.tsx`: with `onClick`, a click inside calls it and does **not** change `window.location.hash`; without `onClick`, the existing "navigates to its href" case still passes.

**Green — implementation:**

- Union widening; `CardShell` `onClick={onClick ?? (() => { window.location.hash = href })}`.

**Refactor — cleanup to consider:**

- `test-fixtures/card-actions.ts` may gain `ROLL_WINDOW` / `BELOW_BREAKEVEN` fixtures for the PMCC card tests.

**Acceptance criteria covered:**

- Enabler for every strip scenario (same `ActionStrip`) and for "The Detail bar opens tier 2; the ticker and Open link open the detail page" (card click no longer navigates on a PMCC).

### 8. `lib/pmcc-card-display.ts` — the display derivation

**Files to create or modify:**

- `src/renderer/src/lib/pmcc-card-display.ts` — new: `PmccCardDisplay` union (`closed | neutral | open`), `OpenLeg`, `ShortTrailing`, `ValuedPmccPnl`, `Tier2Cell`, `derivePmccCardDisplay(item, snapshotsBySymbol, quote, { closed, profitTargetDefault })`, `isKnownPmccPhase`
- `src/renderer/src/lib/pmcc-card-display.test.ts` — new
- `src/renderer/src/test-fixtures/wheel-cards.ts` — `XYZ` fixture moves to the legs shape; add `XYZ_BACKGROUND` (the OPT-16 Background: `80` LEAPS exp `2027-09-17` dte 315 fill `25`, `108` short exp `2026-11-20` dte 14 fill `1.80`, basis `21.2000`, credits `3.8000`/`380.0000`, recovered `15.2000`, cycles 4, entry debit `23.2000`, opened `2026-04-17`, window 21) plus snapshot builders with optional greeks

**Red — tests to write (each a literal from the AC; dates and DTEs are the fixture's):**

- Face: Background with LEAPS `25.70 × 26.50 / 26.10` and short `0.85 × 0.95 / 0.90`, price `104.20` → `state 'LEAPS + short call open'`, `coverage '1 × 100 sh'`, `priceSubline '14d to next decision'`, legs `[L, S]` with `title '$80.00 LEAPS'` / `'$108.00 call'`, `expiration`, `dte '315d'` / `'14d'`, LEAPS trailing `{ delta: '0.82', debit: '$25.00' }`, short trailing `{ target: { pnlPercent: '50.0000', maxProfit: '180.0000', targetPercent: 50 } }`, `pnl { amount '+$400.00', tone 'gain', percentLine '+18.9% of basis' }`, `pnlWide false`, `basis { total '$2,120.00', sub '$21.20 / share', paidFor false }`, `credits { total '$380.00', sub '15.2% of LEAPS cost recovered', meterFraction 0.152, meterGold false }`, `signals.actions[0].statusWord 'MANAGEMENT WINDOW'`.
- Short below target: short `1.15 × 1.25 / 1.20` → trailing `{ percentOfMax: '33.3% of max', tone: 'gain' }`; short above fill (`3.40 × 3.60 / 3.50`) → `{ percentOfMax: '−94.4% of max', tone: 'loss' }`.
- Falling stock (`92.00`, LEAPS `16.40`, short `0.20`) → `pnl '-$500.00'` loss `'-23.6% of basis'`, short `'88.9% of max'` gain **and** a target hit (both facts asserted); no `% of max profit` string anywhere in the display (`JSON.stringify(display)` does not contain it).
- Wide LEAPS (`24.60 × 27.60`) → LEAPS mark `{ mid '$26.10', wide true }`, `pnlWide true`, `awareness` contains ⚠; short's own wide spread (`0.85 × 0.95` is 11 %) marks nothing (`legs[1].mark.wide false`, no ⚠ tag from it when the LEAPS is tight).
- Missing LEAPS snapshot → LEAPS `mark 'unavailable'`, `pnl 'unavailable — a leg has no mark'`, short still `TARGET`, basis/credits unchanged (same literals as the face test).
- Missing greeks → LEAPS trailing `delta '—'`, `awareness` empty, every other field equal to the face test (`toEqual` on the rest via destructuring).
- LEAPS-only (`XYZ_LEAPS_ONLY`: one LONG at dte 333, basis `23.00`, credits `2.00`, cycles 2, LEAPS `25.10 × 25.70 / 25.40`) → `state 'LEAPS open · no short call'`, one leg, `priceSubline '333d to next decision'`, `pnl '+$240.00' / '+10.4% of basis'`, no `target` / `percentOfMax` anywhere, `credits.sub '8.0% of LEAPS cost recovered'`, tier-2 `Max if called` `{ value '—', note 'no short call open' }`.
- DTE emphasis: LEAPS dte 59 → `dteGold true`, `dteTooltip 'Roll window — LEAPS inside the 60-day window'`; 61 → false/null; short dte 4 → gold with `'Expiring soon — short call inside 7 days'`; 14 → plain; 7 → gold (boundary), 8 → plain.
- Paid for (`XYZ_PAID_FOR`: basis `-0.4000`/`-40.0000`, credits `22.9000`/`2290.0000`, recovered `101.7778`, LEAPS `85` exp `2028-01-21`, short `120` `0.90 × 1.00`) → `basis { total '-$40.00', sub 'LEAPS paid for', paidFor true }`, `credits.sub '101.8% of LEAPS cost recovered'`, `meterFraction 1`, `meterGold true`, `pnl { amount '+$3,285.00', percentLine 'basis not positive' }`.
- Three contracts → leg titles `'$80.00 LEAPS'` with `contractsSuffix ' ×3'`, `coverage '3 × 100 sh'`, `pnl '+$1,200.00' / '+18.9% of basis'`, credits `'$1,140.00'` `'15.2% …'`, basis `'$6,360.00'` `'$21.20 / share'`, short `TARGET` at `50.0`.
- Two shorts (2 LEAPS `28.10 × 28.70`, `108` @ `1.80` `1.15 × 1.25`, `112` @ `1.35` `1.00 × 1.10`, price `106.80`) → `state 'LEAPS + 2 short calls open'`, `coverage '2 × 100 sh'`, three legs in order L, S(108), S(112), `pnl '+$1,215.00' / '+28.7% of basis'`, `priceSubline '14d to next decision'`, actions `['ASSIGNMENT RISK', 'MANAGEMENT WINDOW']` both with `leg.legId` = the 108 short's; the 112 short and the LEAPS have `actions: []`.
- Partial coverage (3 LEAPS, one `108` short) → `coverage '1 of 3 covered'`, `pnl '+$1,380.00' / '+21.7% of basis'`.
- Tier 2 (Background): the seven cells equal the AC table literally (`['Credits collected', '$380.00', '4 short-call cycles · 15.2% of LEAPS cost']`, `['Breakeven', '$101.20', 'LEAPS $80.00 + basis $21.20 / share']`, `['Max if called', '+$680.00', 'called away at $108.00']`, `['LEAPS delta', '0.82', 'tracking as synthetic stock']`, `['Short extrinsic', '$0.90', 'OTM — all extrinsic']`, `['LEAPS mark', '$26.10', '$25.70 × $26.50 · 3.1% wide']`, `['Entry net debit', '$2,320.00', '$23.20 / share · opened 2026-04-17 · 203d ago']` with `now` pinned to `2026-11-06`); ITM (`111.40`, short `3.40 × 3.60`) → `['Short extrinsic', '$0.10', 'ITM — assignment math is live']` and `Max if called` still `'+$680.00'`; delta `0.54` → note `'below the 0.60 floor'`; wide LEAPS → `LEAPS mark` note ends `' · 11.5% wide · P&L unreliable'`; no greeks → `['LEAPS delta', '—', 'no greeks this poll']`; no LEAPS snapshot → `['LEAPS mark', '—', 'no snapshot this poll']`.
- Closed (`status 'CLOSED'`) → `kind 'closed'`, `state 'Closed'`, `price null`, `priceSubline 'closed'`, every leg `dte '—'` and `mark '—'`, `pnl 'closed — no live marks'`, basis and credits present, and `expectTypeOf<ClosedPmccDisplay>().not.toHaveProperty('signals')`.
- Neutral (`phase 'PMCC_ASSIGNED' as PmccPhase` via a typed fixture cast in one place) → `kind 'neutral'`, `stateLabel 'PMCC_ASSIGNED'`, dashed figures, no `signals`, no `tier2`.
- Snapshot lookup uses `occSymbolForLeg({ ticker, expiration, strike, instrumentType: 'CALL' })`; a leg whose symbol fails to build (`strike '0'`) reads `mark 'unavailable'` and the display still returns (no throw).

**Green — implementation:**

- `derivePmccCardDisplay`: closed → neutral → open branches; open builds `legs` from `item.pmcc.legs` (snapshots per leg via `occSymbolForLeg`), calls `computePmccUnrealizedPnl` only when every leg's snapshot is usable (same `isUsableSnapshot` rule as `wheel-card-display.ts`, extracted and shared), short cues via `computeUnrealizedPnl` + `resolveProfitTarget` + `formatPnlPercentForDisplay`, signals via `evaluatePmccSignals` (input assembled from the legs, `quote?.price`, `basisPerShare`, `managementWindowDte`, `computeDte(item.nextEarnings)` from `main/core/dte`), tier 2 via the `pmcc-card.ts` cues, money via `fmtMoneyGrouped` / `formatSignedMoney` / `fmtMoney`, percent via `fmtPct1` with the `.0`-preserving rule the AC shows (`8.0%`, `50.0%`, `15.2%` — note this differs from the wheel's `formatPnlPercentForDisplay`; use `fmtPct1`).
- Maps each `PmccAction` onto the leg it names (`leg.side === 'LONG'` → the LEAPS block; `legId` → that short) so `LegBlock.actions` is per leg.

**Refactor — cleanup to consider:**

- Share `isUsableSnapshot` and the wide-spread tooltip builder between `wheel-card-display.ts` and this file (`lib/option-mark.ts`).
- Property-free by design (finite enum mapping, as `wheel-card-display` is).

**Acceptance criteria covered:**

- All 29 scenarios' figures and strings (this is where every literal is produced); the two two-short scenarios are covered **here and in area 5 only**.

### 9. `PmccCard.tsx` — the component

**Files to create or modify:**

- `src/renderer/src/components/position-card/PmccCard.tsx` — rewrite body; new props `snapshots?: OptionSnapshotsBySymbol`, `profitTargetDefault?: number`; keeps `item`, `quote`, `session`, `isClosed`
- `src/renderer/src/components/position-card/SignalTags.tsx` — new: header awareness tags (`data-testid="pmcc-awareness-tags"`, each `role="img"` `aria-label={name}` `title={tooltip}` in `text-wb-gold`)
- `src/renderer/src/components/position-card/RecoveryMeter.tsx` — new: 3 px bar, `bg-wb-green` / `bg-wb-gold`, inline `width` as the one dynamic style, `data-testid="recovery-meter"`, `data-fill` percentage, `title`
- `src/renderer/src/components/position-card/DetailBar.tsx` + `Tier2Panel.tsx` — new: `role="button"` `aria-expanded`, `Detail · breakeven · max if called · Δ · extrinsic` / `Hide detail`, chevron `rotate-180` when open, `text-wb-gold` when open; panel grid of `data-testid="tier2-cell"` cells (label / value / note)
- `src/renderer/src/components/position-card/PmccCard.test.tsx` — rewrite

**Red — tests to write (render with `XYZ_BACKGROUND` + snapshots + quote; query by role/text):**

- Header: `PMCC` badge present, `screen.queryByText('Sell Call')` / any wheel short label absent, `position-card-XYZ-price` reads `$104.20` and `14d to next decision`, `Open ↗` link `href '#/positions/<id>'`.
- Strip: `action-strip` has `data-tone 'gold'` and text `◷ MANAGEMENT WINDOW · 14 DTE remaining — review for roll or close`; the short `leg-block` has `data-action 'gold'` and the ◷ mark whose `title` is that line; the LEAPS block has no `data-action`; `position-card` `data-edge 'gold'`.
- ▲ gold at `106.10`: strip `▲ ASSIGNMENT RISK · stock 1.8% below the $108.00 strike · plan the roll`, `+1` chip with `title` containing `◷ MANAGEMENT WINDOW · 14 DTE remaining — review for roll or close`, short block `data-action 'gold'` with mark title `Stock is 1.8% below the short-call strike — approaching assignment`; ▲ red at `111.40`: `data-tone 'red'`, edge `red`, `… 3.1% above … · roll or close`.
- ✕: (`99` short at 42 DTE sold `1.55`, price `99.40`) strip red `✕ BELOW BREAKEVEN · $99.00 strike is $2.20 under the $101.20 breakeven · roll up before it is called`, `+1` chip listing `▲ ASSIGNMENT RISK · stock 0.4% above the $99.00 strike · roll or close`, short block marks `✕ ▲`, no MANAGEMENT WINDOW text anywhere, edge red.
- ◆: (LEAPS dte 59, short `112` dte 31, price `104.20`) strip `◆ ROLL WINDOW · LEAPS 59d left, inside the 60-day window · roll while it has time value`, no chip, LEAPS block `data-action 'gold'` with mark title `LEAPS inside the 60-day roll window`, LEAPS DTE `59d` has class `text-wb-gold`, short DTE `31d` plain and no `expiring-soon` tooltip, no MANAGEMENT WINDOW text, edge gold, `PMCC` badge still present.
- EXPIRING: short dte 4 → strip `◷ EXPIRING · Expires in 4 days at $108.00 strike`, short DTE `4d` gold with title `Expiring soon — short call inside 7 days`, LEAPS `305d` plain, short block gold with ◷.
- Awareness: earnings 7 days + wide LEAPS at dte 25 → `pmcc-awareness-tags` children in order `⚑`, `⚠` with titles `Earnings — Earnings in 7 days before your 2026-11-20 expiration` and `Wide spread — LEAPS spread is 11.5% of the mid — the P&L that depends on it is unreliable`; **no** `action-strip`, no `data-action` on any leg, edge `PMCC`. δ at `0.54` (LEAPS-only, price `86.50`) → tag `δ` with title `Delta floor — LEAPS delta 0.54 below 0.60 — no longer tracking as synthetic stock`, no strip. Healthy (dte 25, tight spread, delta 0.82, no earnings) → no strip, no tags, edge `PMCC` (positive control: the same render with dte 14 shows a strip).
- Wide spread on the face: LEAPS mark `$26.10 ⚠` (`opt-mid-spread-warning` inside the LEAPS block), the P&L figure carries a `⚠` with title `Wide spread — the LEAPS spread makes this P&L unreliable`, and the strip still reads MANAGEMENT WINDOW.
- Missing LEAPS snapshot: LEAPS mark text `— unavail.`, P&L `—` with `unavailable — a leg has no mark`, `target-badge` still present on the short, footer unchanged.
- Missing greeks: LEAPS trailing `Δ — · $25.00 debit`, no `δ` tag, P&L still `+$400.00`.
- Footer: `Cost basis` cell `$2,120.00` / `$21.20 / share` in `text-wb-sky`; `Credits collected` `$380.00` / `15.2% of LEAPS cost recovered`; `recovery-meter` `data-fill '15.2'` and class `bg-wb-green`; paid-for fixture → `-$40.00` / `LEAPS paid for` both `text-wb-gold`, no `text-wb-red`, meter `data-fill '100'` class `bg-wb-gold`, `101.8% of LEAPS cost recovered`, P&L `+$3,285.00` with `basis not positive`.
- Short cues: `target-badge` at `50.0`; `88.9% of max` in `text-wb-green` beside the TARGET chip on the falling-stock fixture; no text matching `/of max profit/` on the card.
- Coverage and contracts: `3 × 100 sh`, titles `$80.00 LEAPS ×3`, `$108.00 call ×3`; `1 of 3 covered`; two-short fixture renders three `leg-block`s with only the `$108.00` block carrying `data-action`.
- Tier 2: Detail bar `getByRole('button', { name: /Detail · breakeven · max if called · Δ · extrinsic/ })` with `aria-expanded 'false'`; clicking it shows seven `tier2-cell`s with the AC table's values; the bar now reads `Hide detail`, `aria-expanded 'true'`, has `text-wb-gold`; clicking the card body (the P&L figure) toggles it closed; `Escape` closes it; clicking the ticker link does not change `aria-expanded` and sets `window.location.hash` to `#/positions/<id>` (user-event with `stopPropagation` observed through the hash); the `Open ↗` link likewise. ITM fixture → `Short extrinsic` `$0.10` / `ITM — assignment math is live`.
- Closed: `position-card-closed`, `Closed` state, `PMCC` badge, price `—`, both DTEs `—`, both marks `—`, P&L `—` / `closed — no live marks`, no strip, no tags, no Detail bar, footer shows the last basis and credits, `data-edge 'PMCC'`.
- Neutral phase: badge `PMCC`, state label is the raw phase, dashed figures, no strip, no tags, no Detail bar, no wheel badge.
- Page/grid contract: `PositionsGrid` passes `snapshots` and `profitTargetDefault` to `PmccCard` (covered in area 10).

**Green — implementation:**

- Compose from `derivePmccCardDisplay`: `CardShell accent="PMCC" edge={actions[0]?.tone} closed href onClick={toggleTier2 unless closed/neutral}` → `ActionStrip actions` → `CardHeader` (`Badge color={PHASE_COLOR.PMCC_OPEN}`, `SignalTags`, `PriceBlock`) → position line (`EYEBROW` `Net P&L`, `HEADLINE_FIGURE` in `text-wb-green` / `text-wb-red` / `text-wb-text-muted`, inline ⚠, `SUB` percent line; right column state + coverage) → one `LegBlock` per leg (`tag`, `actions` for that leg, title with `×N` and `SUB` expiration, DTE span with gold class + title, `mark` using the wheel's `MarkText` pattern extracted to a shared `OptionMarkText`, `trailing` = `TargetBadge` / `N% of max` / `Δ · debit`) → `CardFooter` with two `CardFooterCell`s (`valueClassName` `text-wb-gold` when paid for) and the `RecoveryMeter` inside the credits cell → `DetailBar` + `Tier2Panel` when open. Tier-2 open state in `useState`; `useEffect` keydown listener for `Escape` only while open. Ticker / Open links get `onClick={(e) => e.stopPropagation()}` — `CardHeader` gains an optional `onLinkClick` prop for this.
- Tailwind + `wb-*` tokens only; the meter width is the one inline style.

**Refactor — cleanup to consider:**

- Extract `MarkText` from `WheelCard.tsx` into `position-card/OptionMarkText.tsx` and use it in both cards.
- Dispatch the code-simplifier agent on the new files (standing authorization).

**Acceptance criteria covered:**

- Every visual scenario; specifically the leg highlight, card edge, `+N` chip, awareness tags, meter, Detail bar / tier 2, closed and neutral cards, and "Classic wheel cards are unchanged" (the wheel card is untouched; `WheelCard.test.tsx` must still pass).

### 10. Grid and page wiring

**Files to create or modify:**

- `src/renderer/src/components/PositionsGrid.tsx` — pass `snapshots` (whole map) and `profitTargetDefault` to `PmccCard`; closed grid passes none
- `src/renderer/src/pages/PositionsListPage.tsx` — the `legs` memo for `useOptionSnapshots` flat-maps PMCC items into one `ActiveLegSummary` per `pmcc.legs` entry (`instrumentType: 'CALL'`); wheel `ctxById` unchanged
- `src/renderer/src/components/PositionsGrid.test.tsx` (new or existing), `src/renderer/src/pages/PositionsListPage.test.tsx` — update the `PmccCard` mock props

**Red — tests to write:**

- `PositionsListPage.test.tsx`: with one wheel and one PMCC (two legs) active, `useOptionSnapshots` is called with three leg summaries whose OCC symbols are the wheel's, the LEAPS's and the short's (assert the array, not just the length); the mocked `PmccCard` receives `snapshots` and `profitTargetDefault`; a PMCC id is absent from `actionsByPosition`'s context (the queue's PMCC rows never reach a card: render a PMCC `MANAGEMENT_WINDOW` queue row and assert the `WheelCard` mock for the PMCC id is never rendered and the `PmccCard` mock gets no `actions` prop).
- `PositionsGrid.test.tsx`: a PMCC item renders `PmccCard` with `snapshots` and `profitTargetDefault`; in the closed grid it receives `isClosed` and no `snapshots`.

**Green — implementation:**

- As listed. No change to `useOptionSnapshots` itself.

**Refactor — cleanup to consider:**

- `legsForSnapshots(items)` helper in `lib/` so the page memo is one call.

**Acceptance criteria covered:**

- Enabler for every live-figure scenario (both legs are quoted) and "Classic wheel cards are unchanged" (wheel wiring untouched).

### 11. E2e Tests

**Files to create or modify:**

- `e2e/pmcc-card-helpers.ts` — new: `launchPmccCards(label, options)` wrapping `launchBackground` with `prices.XYZ`, `extraSnapshots` for the LEAPS/short OCC symbols (built with `occSymbol` from `pmcc-helpers`), and a new `earnings` option; `seedBackgroundPmcc(page, { leapsDte = 315, shortDte = 14, shortStrike = '108.00', shortFill = '1.80', contracts = 1, priorCredits = ['1.00','0.50','0.50'] })` = `createXyzPmcc` (entry LEAPS `80` @ `25.00`, entry short = the current short) followed by `recordEvents` of three past-dated `SHORT_CALL_OPEN` + `SHORT_CALL_EXPIRED` pairs so the ledger reads basis `21.20`, credits `3.80`, 4 cycles (Red verifies the ledger figures through `window.api.getPosition` before any UI assertion); `seedLeapsOnlyPmcc`, `seedPartialCoveragePmcc` (3 LEAPS via `contracts: 3` then `EXPIRE` the 3-lot short and `SHORT_CALL_OPEN` a 1-lot `108`), `setPmccStatus(dbPath, id, 'CLOSED')`, `setPmccPhase(dbPath, id, 'PMCC_ASSIGNED')` via `sqlite()`; locators `legBlocks(card)`, `legMarks(leg)`, `awarenessTags(card)`, `detailBar(card)`, `tier2Cells(card)`, `recoveryMeter(card)`, `pnlFigure(card)`
- `e2e/position-card-helpers.ts` — `BackgroundOptions.earnings?: Record<string, EarningsFixture>` → `env.WHEELBASE_MOCK_EARNINGS` (export `buildEarningsFixtures` from `screener-helpers.ts` or move it to `e2e/earnings-fixtures.ts`)
- `e2e/pmcc-position-card.spec.ts` — new, one `it` per AC, names mirroring the Gherkin
- `e2e/position-cards.spec.ts` — S21 becomes "S21: a PMCC renders the full US-108 card in the same shell" asserting the PMCC badge, two leg blocks and that its strip/tags are US-108's (the old `no strip` assertion inverts: XYZ at `117.00` now shows `▲ ASSIGNMENT RISK`)

All DTEs are run-day relative (`localDate(n)`); every expected string is the AC literal with the
fixture's DTE/date substituted. Each strip test asserts `data-tone`, the leading glyph/word, which
`leg-block` carries `data-action`, and `data-edge`; each "no strip" assertion is paired with a
fixture in the same test or the preceding one that does show a strip.

**Red — tests to write (AC → e2e case):**

1. `the PMCC card face shows the position line and one block per leg` — badge `PMCC`, state, `$104.20`, `14d to next decision`, L then S blocks with the exact leg text, coverage `1 × 100 sh`, footer labels, gold MANAGEMENT WINDOW strip above the ticker row (strip `y` < ticker `y`).
2. `net P&L marks the diagonal against the cost basis` — `+$400.00` green, `+18.9% of basis`, LEAPS mid `$26.10`, short mid `$0.90`.
3. `the short call keeps its own profit-target cue` — `target-badge` on the short block at `0.85 × 0.95`; at `1.15 × 1.25` the block reads `33.3% of max` and no badge.
4. `a falling stock shows a losing position with a profitable short call` — `-$500.00` red, `-23.6% of basis` (must fail on a `+`), `88.9% of max` green with TARGET, no `of max profit` text on the card.
5. `credits collected, premium recovered and the recovery meter` — `$380.00`, `15.2% of LEAPS cost recovered`, meter `data-fill 15.2` green class, `$2,120.00` / `$21.20 / share`.
6. `a wide LEAPS spread flags the P&L as unreliable` — ⚠ on the LEAPS mark, ⚠ on the P&L with the tooltip, ⚠ tag after the badge, strip still MANAGEMENT WINDOW.
7. `a missing LEAPS snapshot leaves the P&L unavailable` — `— unavail.`, P&L `—` / `unavailable — a leg has no mark`, TARGET still present, footer unchanged.
8. `missing greeks blank the delta without breaking the card` — `Δ —`, no δ tag, P&L still `+$400.00`.
9. `a PMCC with only the LEAPS open` — `LEAPS open · no short call`, one block, `333d to next decision`, `+$240.00` / `+10.4% of basis`, no TARGET / `% of max`, `$200.00` / `8.0% of LEAPS cost recovered`.
10. `inside the roll window the ◆ strip marks the LEAPS row` — LEAPS at `localDate(59)`, short `112` at `localDate(31)`: strip text with `59d`, no chip, LEAPS block gold with ◆ and tooltip, LEAPS DTE gold, short block plain, short DTE `31d` plain, no MANAGEMENT WINDOW, edge gold, badge present.
11. `the short-call DTE turns gold inside 7 days` — short at `localDate(4)`: `4d` gold with tooltip, LEAPS `305d` plain (LEAPS at `localDate(305)`), strip `◷ EXPIRING · Expires in 4 days at $108.00 strike`, short block gold with ◷.
12. `▲ assignment risk leads the strip (gold, $106.10)` — strip gold with reason, `+1` chip tooltip lists the MANAGEMENT WINDOW line, short block gold ▲ with tooltip, LEAPS plain, edge gold, badge present.
13. `▲ assignment risk leads the strip (red, $111.40)` — same shape in red with `3.1% above … roll or close` and the ITM tooltip.
14. `more than 2% below the short strike reads MANAGEMENT WINDOW, not ASSIGNMENT RISK` — at `$104.20`: strip MANAGEMENT WINDOW, no chip, no ▲ anywhere, short block gold ◷, DTE `14d` plain, LEAPS plain, edge gold.
15. `the ⚑ glyph follows the earnings-proximity predicate` — short at `localDate(4)`, earnings `dayOffset 2` → ⚑ gold with tooltip `Earnings in 2 days before your ${localDate(4)} expiration`; relaunch with `dayOffset 5` → no ⚑ (positive control: the EXPIRING strip renders in both); a third launch with no XYZ earnings → no ⚑.
16. `✕ below breakeven leads the strip with ▲ behind it on a +1 chip` — short `99` at `localDate(42)` sold `1.55`, price `99.40`: red strip text, `+1` chip tooltip with the red ▲ line, short block marks `✕ ▲` with the breakeven tooltip, no MANAGEMENT WINDOW, edge red.
17. `the δ tag fires when the LEAPS delta drops below the floor and never produces a strip` — LEAPS-only, price `86.50`, delta `0.54`: `Δ 0.54`, δ tag gold with tooltip, no strip, no leg highlight, edge `PMCC`.
18. `a healthy card shows no strip and no tags` — short at `localDate(25)`, LEAPS `localDate(326)`, tight spread, delta `0.82`: no strip, no tags, no highlight, edge `PMCC`; positive control in the same test: MSFT's 10-DTE card shows its strip.
19. `awareness tags render as small header tags in a fixed order and never produce a strip` — healthy dates, earnings `dayOffset 7`, LEAPS `24.60 × 27.60`: tags `⚑` then `⚠` with tooltips, no strip, no highlight, edge `PMCC`.
20. `the Detail bar opens tier 2; the ticker and Open link open the detail page` — bar text and `aria-expanded`, click → seven cells with the AC values (Entry net debit note uses `opened ${localToday()} · 0d ago`), bar reads `Hide detail`, second click collapses; click on the card body toggles; ticker click → URL hash `#/positions/<id>` and, after `goBack`, the tier-2 state is still open; `Open ↗` likewise.
21. `tier 2 in the in-the-money state shows the live assignment math` — price `111.40`, short `3.40 × 3.60`: `Short extrinsic` `$0.10` / `ITM — assignment math is live`, `Max if called` `+$680.00`.
22. `a LEAPS fully paid for by credits` — seed with `LEAPS_ROLL`-style roll to `85` and credits totalling `22.90` (`CYCLES`-style event): `-$40.00` / `LEAPS paid for` gold, `$2,290.00` / `101.8% of LEAPS cost recovered`, meter full gold, `+$3,285.00` with `basis not positive`.
23. `totals scale with contracts, per-share figures do not` — `contracts: 3`: titles `×3`, `3 × 100 sh`, `+$1,200.00` / `+18.9% of basis`, `$1,140.00`, `$6,360.00` / `$21.20 / share`, TARGET.
24. `partial coverage is stated on the card` — `1 of 3 covered`, `+$1,380.00` / `+21.7% of basis`.
25. `the PMCC sorts by its nearest decision point (short call 14 DTE)` — Active order `MSFT, XYZ, AAPL`.
26. `the PMCC sorts by its nearest decision point (LEAPS-only 333 DTE)` — `MSFT, AAPL, XYZ` (NVDA last).
27. `a closed PMCC sits in the Closed section without live figures` — `setPmccStatus CLOSED`: in Closed, `opacity-50`, `PMCC` badge, `Closed`, price / mids / DTEs / P&L `—`, no strip / highlight / tags, edge `PMCC`, last basis and credits shown.
28. `a PMCC phase this story does not know renders a neutral card` — `setPmccPhase 'PMCC_ASSIGNED'`: badge, raw label, dashed figures, no strip, no tags, no wheel badge, no `% of max profit`.
29. `classic wheel cards are unchanged` — MSFT (`CC_OPEN`) in the same launch: one leg block, `CC Open` badge, `% of max profit`, `/ share` basis; no `pmcc-awareness-tags`, no coverage text, no `recovery-meter`, no `of basis` on it.

Not producible end to end (stated in the spec header, covered in areas 5 and 8): "Two short calls
against one LEAPS render as three leg blocks" and "With two short calls, only the at-risk short is
highlighted".

**Green — implementation:**

- Helpers and spec as listed; `viewDashboard` from `position-card-helpers` runs the alert job (which persists the fake earnings row) and reloads the list.

**Refactor — cleanup to consider:**

- Fold `pmcc-leaps-roll-window-alert.spec.ts`'s private `createXyzPmcc(page, leapsDte)` into the shared seeding if the signatures converge.

**Acceptance criteria covered:**

- All of OPT-16 except the two two-short scenarios (see above).

## AC Audit

| #   | Scenario (OPT-16)                                                          | E2e case (area 11)        | Unit/integration coverage           |
| --- | -------------------------------------------------------------------------- | ------------------------- | ----------------------------------- |
| 1   | The PMCC card face shows the position line and one block per leg           | 1                         | 8, 9                                |
| 2   | Net P&L marks the diagonal against the cost basis                          | 2                         | 3, 8                                |
| 3   | The short call keeps its own profit-target cue                             | 3                         | 8, 9                                |
| 4   | A falling stock shows a losing position with a profitable short call       | 4                         | 3, 8, 9                             |
| 5   | Credits collected, premium recovered and the recovery meter                | 5                         | 6, 8, 9                             |
| 6   | A wide LEAPS spread flags the P&L as unreliable                            | 6                         | 1, 5, 8, 9                          |
| 7   | A missing LEAPS snapshot leaves the P&L unavailable                        | 7                         | 8, 9                                |
| 8   | Missing greeks blank the delta without breaking the card                   | 8                         | 5, 8, 9                             |
| 9   | A PMCC with only the LEAPS open                                            | 9                         | 3, 4, 6, 8                          |
| 10  | Inside the roll window the ◆ strip marks the LEAPS row                     | 10                        | 5, 8, 9                             |
| 11  | The short-call DTE turns gold inside 7 days                                | 11                        | 5, 8, 9                             |
| 12  | ▲ assignment risk (outline, gold $106.10)                                  | 12                        | 5, 9                                |
| 13  | ▲ assignment risk (outline, red $111.40)                                   | 13                        | 5, 9                                |
| 14  | More than 2% below the short strike → MANAGEMENT WINDOW                    | 14                        | 5, 9                                |
| 15  | The ⚑ glyph follows US-56's predicate (in window / day after / none)       | 15                        | 5, 6, 9                             |
| 16  | ✕ below breakeven leads the strip with ▲ behind it on a +1 chip            | 16                        | 5, 9                                |
| 17  | The δ tag fires below the floor and never produces a strip                 | 17                        | 5, 9                                |
| 18  | A healthy card shows no strip and no tags                                  | 18                        | 5, 9                                |
| 19  | Awareness tags render in a fixed order and never produce a strip           | 19                        | 5, 9                                |
| 20  | The Detail bar opens tier 2; the ticker and Open link open the detail page | 20                        | 7, 8, 9                             |
| 21  | Tier 2 in the ITM state shows the live assignment math                     | 21                        | 5, 8, 9                             |
| 22  | A LEAPS fully paid for by credits                                          | 22                        | 3, 8, 9                             |
| 23  | Totals scale with contracts, per-share figures do not                      | 23                        | 3, 8, 9                             |
| 24  | Two short calls against one LEAPS render as three leg blocks               | — (no entry path; US-115) | 3, 4, 8, 9                          |
| 25  | With two short calls, only the at-risk short is highlighted                | — (no entry path; US-115) | 5, 8, 9                             |
| 26  | Partial coverage is stated on the card                                     | 24                        | 3, 8                                |
| 27  | The PMCC sorts by its nearest decision point (outline, 14 DTE)             | 25                        | 4, 6                                |
| 28  | The PMCC sorts by its nearest decision point (outline, 333 DTE)            | 26                        | 4, 6                                |
| 29  | A closed PMCC sits in the Closed section without live figures              | 27                        | 6, 8, 9                             |
| 30  | A PMCC phase this story does not know renders a neutral card               | 28                        | 8, 9                                |
| 31  | Classic wheel cards are unchanged                                          | 29                        | 7 (regression pins), WheelCard.test |

Every AC has a named e2e case except the two whose states no seam can produce; those are covered
by core and renderer tests and called out in the spec header, per research U5.
