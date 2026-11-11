# US-108 — Display PMCC-specific position card on dashboard — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Work in the worktree `/Users/johnteague/my-stuff/wb-108` (branch `wb-108`)
- Literals, fixtures and formulas live in `plan.md` (by area number) and `data-model.md`; each task
  names the section to read rather than repeating it
- Vitest needs `pnpm rebuild:node`, e2e needs `pnpm rebuild:electron`; never run the two
  concurrently across agents

### Typecheck between areas

Two reshapes break consumers until a later area lands:

- **Area 4** changes `PositionOrderInput.pmcc` to `{ legs }`. `list-positions.ts` and its test
  fail to typecheck until **Area 6 Green**. Area 4's Refactor gate is therefore scoped:
  `pnpm test src/main/core/position-order` + `pnpm lint`, and `pnpm typecheck` with errors
  confined to `src/main/services/list-positions*.ts`. The full gate runs at Area 6 Refactor.
- **Area 6** reshapes `PmccListSummary` (`long`/`short` → `legs`). Area 6 Green adapts US-18's
  placeholder `PmccCard.tsx` (one destructure: LEAPS = `legs.find(l => l.side === 'LONG')`,
  short = first `SHORT`) so typecheck stays clean until Area 9 rewrites the card.

---

## Layer 1 — Foundation (no dependencies)

> These areas can be started immediately and run in parallel. They touch disjoint files.

### Area 1 — Shared wide-spread predicate

- [x] **[Red]** Write failing tests — `src/shared/option-spread.test.ts`
  - Test cases: `isWideSpread` at exactly 10 % of mid (`bid 0.95, ask 1.05, mid 1.00`) → `false`;
    10.01 % (`0.9499 × 1.0500`) → `true`; `mid '0'` → `false`; `hasNoBid` for `'0'`, `'0.00'`,
    `'0.0000'` → `true` and `'0.0001'` → `false`
  - `src/renderer/src/lib/option-display.test.ts` stays unchanged (it proves the re-export once Green lands)
  - Property cases: no property — not a `src/main/core/` engine; a moved predicate with boundary examples
  - Run `pnpm test src/shared/option-spread` — all new tests must fail (module missing)
- [x] **[Green]** Implement — `src/shared/option-spread.ts` _(depends on: Area 1 Red ✓)_
  - Move `WIDE_SPREAD_THRESHOLD`, `SpreadInput`, `isWideSpread`, `NoBidInput`, `hasNoBid` verbatim
    from `src/renderer/src/lib/option-display.ts`, including the `Decimal.set` rounding line
  - `option-display.ts`: `export { WIDE_SPREAD_THRESHOLD, isWideSpread, hasNoBid } from '../../../shared/option-spread'`
    - `export type { SpreadInput, NoBidInput }`; delete the local copies
  - Run `pnpm test src/shared/option-spread src/renderer/src/lib/option-display` — all must pass
- [x] **[Refactor]** `/refactor` — `src/shared/option-spread.ts`, `src/renderer/src/lib/option-display.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Leave `wheel-card-display.ts` importing from `option-display` (no churn)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 2 — Export alert thresholds and short-leg summaries (`core/alerts.ts`)

- [x] **[Red]** Write failing tests — `src/main/core/alerts.test.ts`
  - Test cases (plan § 2 Red, literal strings): `expirationImminentSummary({ dte: 4, strike: '108.0000' })`;
    `managementWindowSummary({ dte: 14 })`; `pmccAssignmentRiskSummary` at `'111.40'` (above) and
    `'106.10'` (below); `earningsProximitySummary({ daysToEarnings: 2, expiration: '2026-11-20' })`;
    `percentBelowStrike({ strike: '108.0000', currentUnderlyingPrice: '106.10' })` → `1.7593` at 4 dp;
    the four constants equal `5`, `2`, `10`, `60`
  - Property cases: no property — constants and string builders are already exercised through
    `evaluatePosition` in `alerts.property.test.ts`
  - Run `pnpm test src/main/core/alerts` — new tests must fail (names not exported)
- [x] **[Green]** Implement — `src/main/core/alerts.ts` _(depends on: Area 2 Red ✓)_
  - `export` `EXPIRATION_IMMINENT_MAX_DTE`, `PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW`,
    `EARNINGS_PROXIMITY_MAX_DAYS`, `PMCC_LEAPS_ROLL_WINDOW_MAX_DTE`, `expirationImminentSummary`,
    `managementWindowSummary`, `pmccAssignmentRiskSummary`, `earningsProximitySummary`, `percentBelowStrike`
  - Add `ExpirationImminentInput = Pick<AlertEvaluationInput, 'dte' | 'strike'>` and
    `ManagementWindowInput = Pick<AlertEvaluationInput, 'dte'>`; type the two helpers on them. No logic change
  - Run `pnpm test src/main/core/alerts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/alerts.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `RULES` entries keep calling the same functions; only the narrowed input slices move
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 3 — `computePmccUnrealizedPnl` (`core/costbasis.ts`)

- [x] **[Red]** Write failing tests — `src/main/core/costbasis.test.ts`
  - Test cases (plan § 3 Red, data-model § 1.5): Background → `{ gross '2520.0000', pnl '400.0000',
pnlPercentOfBasis '18.8679' }`; falling stock `-500.0000` / `-23.5849`; LEAPS-only `240.0000` /
    `10.4348`; three contracts `1200.0000` / `18.8679`; two shorts `1215.0000` / `28.6557`; partial
    coverage `1380.0000` / `21.6981`; negative basis `3285.0000` / `null`; basis `'0'` → `null`;
    rounding case `mid '0.00005'` × 1 contract → gross `0.0050`
  - Throws (`toThrow(<message>)`): negative mid, non-numeric mid, `contracts 0`, `contracts 1.5`,
    no `LONG` leg, `basisTotal 'abc'`
  - Property cases — `src/main/core/costbasis.property.test.ts`: **oracle** (one LONG + one SHORT at
    equal contracts: `pnl = (midL − midS) × 100 × c − basis` via independent `Decimal`); **order
    independence** (shuffled legs → equal result); **scale invariance** (× k on contracts and basis
    scales gross and pnl by k, percent within one rounding unit); **guard** (no `LONG` always throws).
    Stress each once with `fc.configureGlobal({ numRuns: 500, seed })` across a few seeds
  - Fixtures that call `src/main/` code go in `beforeEach` / inside `it`, never a `describe` body
  - Run `pnpm test src/main/core/costbasis` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/costbasis.ts` _(depends on: Area 3 Red ✓)_
  - `PmccUnrealizedPnlInput`, `PmccUnrealizedPnlResult`, `computePmccUnrealizedPnl` exactly as
    data-model § 1.5 and § Type Design: validate before arithmetic, `money4` / `fixed4`, reuse
    `sharesFromContracts`; `pnlPercentOfBasis` is `null` when basis ≤ 0
  - Run `pnpm test src/main/core/costbasis` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/costbasis.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Share the mid/contracts validation with `computeUnrealizedPnl` if the two guards read the same
  - `pnpm test:mutation --mutate src/main/core/costbasis.ts` — kill survivors with tests or record equivalents
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 4 — `pmccNextDecisionDte` and the legs-array sort key (`core/position-order.ts`)

- [x] **[Red]** Write failing tests — `src/main/core/position-order.test.ts`
  - Test cases: `pmccNextDecisionDte` — LEAPS 315 + short 14 → 14; LEAPS 333 alone → 333; LEAPS 315 +
    shorts 42 and 14 in either order → 14. Sort — wheels MSFT 10 / AAPL 30 with XYZ short 14 →
    `[MSFT, XYZ, AAPL]`; XYZ LEAPS-only 333 → `[MSFT, AAPL, XYZ]`; a shares-held wheel (`dte null`)
    sorts after XYZ at 333
  - Property cases — `src/main/core/position-order.property.test.ts`: **invariant** (re-point the
    existing non-decreasing-with-nulls-last property at the legs shape); **oracle**
    (`pmccNextDecisionDte` = `Math.min` over SHORT dtes when any, else over LONG dtes)
  - Run `pnpm test src/main/core/position-order` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/position-order.ts` _(depends on: Area 4 Red ✓)_
  - `PositionOrderInput.pmcc: { legs: readonly { side: 'LONG' | 'SHORT'; dte: number }[] } | null`
  - `export pmccNextDecisionDte(legs)` = min SHORT dte ?? min LONG dte;
    `orderDte(item) = item.pmcc ? pmccNextDecisionDte(item.pmcc.legs) : item.dte`
  - Run `pnpm test src/main/core/position-order` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/position-order.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `pnpm test:mutation --mutate src/main/core/position-order.ts`
  - Scoped gate (see "Typecheck between areas"): `pnpm test src/main/core/position-order && pnpm lint`;
    `pnpm typecheck` errors allowed only in `src/main/services/list-positions*.ts` until Area 6 Green

---

## Layer 2 — Core signal registry + list shape (depends on Layer 1)

> These areas can run in parallel with each other **after** their Layer 1 dependencies are complete.
> They touch disjoint files (`core/pmcc-card*` vs schemas / services / renderer list mirror).

### Area 5 — `core/pmcc-card.ts`: cues and the signal registry

**Requires:** Area 1 Green ✓, Area 2 Green ✓

- [x] **[Red]** Write failing tests — `src/main/core/pmcc-card.test.ts` _(depends on: Area 1 Green ✓, Area 2 Green ✓)_
  - Cues (plan § 5 Red): `pmccBreakeven('80.0000', '21.2000')` → `'101.2000'`; `pmccMaxIfCalled`
    1 contract `'680.0000'`, 3 contracts `'2040.0000'`, no short `null`; `shortExtrinsic` OTM
    `'0.9000'` and ITM `'0.1000'`; `premiumRecoveredFraction` `'15.2000'` → `0.152`, `'101.8000'` → `1`, `null` → `null`
  - Each predicate at and either side of its boundary, with the plan's literal reason/tooltip strings:
    ROLL_WINDOW (dte 60 / 61 / 0 / −1), ASSIGNMENT_RISK (2.0 % / 2.1 % below, ATM red, above red,
    `106.10` gold, `price null`, two shorts → only the `108` short is `leg`), BELOW_BREAKEVEN
    (`99` fires, strike = breakeven and `101.21` do not), EXPIRING / MANAGEMENT_WINDOW (dte 5 / 6 / 21 / 22,
    window 14 → 14 fires / 15 not, no short → neither), EARNINGS (10 vs 11 days, 2 vs 5 with short dte 4,
    `null`, no short), DELTA_FLOOR (`0.5900` / `0.6000` / `null`, tooltip at `0.54`), WIDE_SPREAD
    (11.5 % fires, 3.1 % not, `spread null` not)
  - Composition table: every co-firing pair (✕+▲red, ▲red+MW, ▲gold+MW, ◆+MW, EXPIRING alone,
    ✕+▲+MW) asserts `actions.map(a => a.statusWord)`; awareness order `['⚑', 'δ', '⚠']`;
    awareness-only → `actions: []`; healthy Background → `{ actions: [], awareness: [] }`
  - Type test: `expectTypeOf<Extract<PmccSignalDefinition, { tier: 'awareness' }>>().not.toHaveProperty('rank')`
  - Property cases — `src/main/core/pmcc-card.property.test.ts`: **guard** (no action glyph is ⚑ δ ⚠;
    `actions` sorted by rank); **invariant** (EXPIRING and MANAGEMENT_WINDOW never both fire);
    **inverse** (`pmccBreakeven(strike, basis) − basis = strike`); **bound** (`premiumRecoveredFraction`
    ∈ [0, 1] or null); **oracle** (ASSIGNMENT_RISK fires iff `percentBelowStrike ≤ 2`, price generated
    as `strike × (1 − p/100)`, `p ∈ [−5, 5]` — constraint in the generator, not `fc.pre`)
  - Fixtures in `beforeEach`, never in a `describe` body
  - Run `pnpm test src/main/core/pmcc-card` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/pmcc-card.ts` _(depends on: Area 5 Red ✓)_
  - Per data-model § 1.6–1.7 and § Type Design: `LEAPS_DELTA_FLOOR = 0.6`, `pmccBreakeven`,
    `pmccMaxIfCalled`, `shortExtrinsic`, `premiumRecoveredFraction`, `PmccLegRef`, `PmccLaneRank`,
    `PmccAction`, `PmccTag`, `PmccSignalInput`, `PmccSignalDefinition` (discriminated on `tier`),
    `PMCC_SIGNALS`, `evaluatePmccSignals`
  - Import thresholds + summaries from `./alerts`, `isWideSpread` from `../../shared/option-spread`;
    filter by tier, map to `PmccAction` / `PmccTag`, stable sort actions by rank. No I/O, no logging
  - Run `pnpm test src/main/core/pmcc-card` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/pmcc-card.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Reuse `alerts.ts`'s `formatStrike` (export it) instead of a second `$x.xx` formatter
  - `pnpm test:mutation --mutate src/main/core/pmcc-card.ts` — kill survivors with boundary tests
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 6 — List shape: legs array, ledger figures, earnings, management window

**Requires:** Area 4 Green ✓

- [x] **[Red]** Write failing tests _(depends on: Area 4 Green ✓)_
  - `src/main/services/pmcc-opening-legs.test.ts`: `pmccEntryDebitPerShare` US-103 fixture → `'23.2000'`;
    fees `1.00` + `1.00` → `'23.2200'`; missing short fill → `null`
  - `src/main/services/earnings-dates.test.ts`: `readStoredNextEarnings` at `now 2026-11-06` with
    XYZ next `2026-11-18`, AAPL past, MSFT null → only `XYZ → '2026-11-18'`; no-row ticker absent;
    `next === today` returned; throwing `db.prepare` → empty map + `earnings_date_read_failed` log
  - `src/main/services/list-positions.test.ts` (pinned `now`; plan § 6 Red for literals): Background
    history → `pmcc.legs` LONG then SHORT with legIds and fills, `cycles 4`, the six ledger figures,
    `entryDebitPerShare '23.2000'`, `openedAt` = LEAPS fill date, `managementWindowDte 21`; override
    14 → 14; `saveAlertDefaults({ managementWindowDte: 18 })` → 18; LEAPS-only after expiry → one leg,
    cycles unchanged; after short roll the SHORT is the `ROLL_TO` row; closed PMCC keeps legs + ledger;
    `nextEarnings` set / `null` on PMCC and wheel items; sort MSFT / XYZ / AAPL and LEAPS-only XYZ
    before shares-held NVDA; a wheel item `toEqual` the pre-change literal plus `nextEarnings: null`
  - `src/renderer/src/lib/position-list-items.test.ts`: `toPmccListItem` → two legs, `cycles 1`,
    `entryDebitPerShare` from `openingDebit.basisPerShare`, `nextEarnings null`;
    `insertPositionListItem` slots a PMCC by its short DTE
  - Run `pnpm test src/main/services/list-positions src/main/services/earnings-dates src/main/services/pmcc-opening-legs src/renderer/src/lib/position-list-items` — new tests must fail
- [x] **[Green]** Implement _(depends on: Area 6 Red ✓)_
  - `src/main/schemas.ts`: `PmccLegSummary` (+ `legId`, `side`, `fillPerShare`), `PmccListSummary`
    (legs + cycles + entryDebitPerShare + openedAt + managementWindowDte & `Pick<PmccLedgerResult, six keys>`),
    `PositionListItemBase.nextEarnings` — per `contracts/positions-list.md`
  - `src/main/services/pmcc-opening-legs.ts`: `pmccEntryDebitPerShare(legs): string | null`
  - `src/main/services/earnings-dates.ts`: `readStoredNextEarnings(db, tickers, now): Map<string, string>`
    (sync, degrade to empty + log)
  - `src/main/services/list-positions.ts`: `LIST_QUERY` adds `p.opened_date`,
    `p.management_window_dte_override`; `readPmccSummaries` builds legs (LONG first, SHORTs by
    expiration), cycles, entry debit, openedAt, `managementWindowDte` via
    `resolveManagementWindowDte(override, getAlertDefaults(db).managementWindowDte)`; one
    `readStoredNextEarnings` over distinct tickers feeds `toListItemBase`; DEBUG
    `pmcc_list_legs_selected`, `list_positions_earnings_joined`; keep the `pmcc_list_summary_incomplete` WARN
  - `src/renderer/src/lib/position-list-items.ts`: `toPmccListItem` builds the new shape
    (optional `managementWindowDte` argument defaulting to `DEFAULT_MANAGEMENT_WINDOW_DTE`)
  - `src/renderer/src/components/position-card/PmccCard.tsx`: minimal adaptation of the placeholder's
    `long` / `short` destructure to `legs` (Area 9 rewrites it) so typecheck stays clean
  - Update `src/main/core/position-order*.test.ts` fixtures only if Area 4 left any on the old shape
  - Run the Red command — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `toLegSummary(leg, side)` is the single `LegRecord` → `PmccLegSummary` mapper; the renderer
    mirror stays a commented hand copy
  - Full gate (closes Area 4's deferred one): `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Card-action lanes + `CardShell.onClick` (depends on Area 5)

### Area 7 — Widen the card-action lanes for ✕ and ◆; `CardShell.onClick`

**Requires:** Area 5 Green ✓

- [x] **[Red]** Write failing tests _(depends on: Area 5 Green ✓)_
  - `src/renderer/src/lib/card-actions.test.ts`: `expectTypeOf<PmccAction>().toMatchTypeOf<CardAction>()`
    (import from `main/core/pmcc-card`); `expectTypeOf<PmccLaneRank>().toEqualTypeOf<LaneRank>()`;
    regression — `rankWheelActions` on US-18 fixtures still ranks `CALL BREACHED` before `EXPIRING`
  - `src/renderer/src/components/position-card/CardShell.test.tsx`: with `onClick`, a click calls it and
    leaves `window.location.hash` unchanged; without it the existing "navigates to its href" case passes
  - Run `pnpm test src/renderer/src/lib/card-actions src/renderer/src/components/position-card/CardShell`
    and `pnpm typecheck` — new tests / type pins must fail
- [x] **[Green]** Implement _(depends on: Area 7 Red ✓)_
  - `src/renderer/src/lib/card-actions.ts`: `LANE_BELOW_BREAKEVEN = 0`, `LANE_ROLL_WINDOW = 3`;
    `LaneRank` gains `0 | 3`; `CardAction.glyph` gains `'✕' | '◆'`; `StatusWord` gains
    `'BELOW BREAKEVEN' | 'ROLL WINDOW'`; `WHEEL_LANES`, `rankWheelActions`, `actionsByPosition` unchanged
  - `src/renderer/src/components/position-card/CardShell.tsx`: optional
    `onClick?: (event: React.MouseEvent) => void`, used as `onClick ?? (() => { window.location.hash = href })`
  - Run the Red commands — all must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider `ROLL_WINDOW` / `BELOW_BREAKEVEN` fixtures in `src/renderer/src/test-fixtures/card-actions.ts`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Display derivation (depends on Areas 3, 5, 6, 7)

### Area 8 — `lib/pmcc-card-display.ts`

**Requires:** Area 3 Green ✓, Area 5 Green ✓, Area 6 Green ✓, Area 7 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/pmcc-card-display.test.ts` _(depends on: Areas 3, 5, 6, 7 Green ✓)_
  - Fixtures — `src/renderer/src/test-fixtures/wheel-cards.ts`: move `XYZ` to the legs shape; add
    `XYZ_BACKGROUND`, `XYZ_LEAPS_ONLY`, `XYZ_PAID_FOR`, three-contract, two-short and partial-coverage
    fixtures, plus snapshot builders with optional greeks (plan § 8 for every value)
  - Test cases (plan § 8 Red, every string literal from the AC): face (state, coverage, subline, legs,
    trailing, pnl, basis, credits, first action MANAGEMENT WINDOW); short below / above target;
    falling stock (loss P&L + profitable short + TARGET, no `% of max profit` in `JSON.stringify`);
    wide LEAPS vs wide short; missing LEAPS snapshot; missing greeks; LEAPS-only; DTE emphasis at
    59 / 61 / 4 / 14 / 7 / 8; paid for; three contracts; two shorts (only the 108 short carries
    actions); partial coverage `1 of 3 covered`; tier 2 seven cells for Background with `now`
    pinned to `2026-11-06`, plus ITM, δ 0.54, wide LEAPS, no greeks, no LEAPS snapshot variants;
    closed (+ `expectTypeOf<ClosedPmccDisplay>().not.toHaveProperty('signals')`); neutral
    (`PMCC_ASSIGNED`); failed OCC symbol (`strike '0'`) → `mark 'unavailable'`, no throw
  - Property cases: no property — finite enum mapping in the renderer, as `wheel-card-display` is
  - Run `pnpm test src/renderer/src/lib/pmcc-card-display` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/pmcc-card-display.ts` _(depends on: Area 8 Red ✓)_
  - `PmccCardDisplay` union (`closed | neutral | open`), `OpenLeg`, `ShortTrailing`, `ValuedPmccPnl`,
    `Tier2Cell`, `derivePmccCardDisplay(item, snapshotsBySymbol, quote, { closed, profitTargetDefault })`,
    `isKnownPmccPhase` — per data-model § Type Design
  - Snapshots per leg via `occSymbolForLeg`; `computePmccUnrealizedPnl` only when every leg snapshot is
    usable (shared `isUsableSnapshot` rule); short cues via `computeUnrealizedPnl` + `resolveProfitTarget`;
    signals via `evaluatePmccSignals` with `computeDte(item.nextEarnings)`; tier 2 from the `pmcc-card.ts`
    cues; money via `fmtMoneyGrouped` / `formatSignedMoney` / `fmtMoney`; percents via `fmtPct1`
  - Map each `PmccAction` onto the leg it names (LONG → LEAPS block, `legId` → that short)
  - Run `pnpm test src/renderer/src/lib/pmcc-card-display` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Share `isUsableSnapshot` and the wide-spread tooltip builder with `wheel-card-display.ts`
    (`src/renderer/src/lib/option-mark.ts`)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Component (depends on Area 8)

### Area 9 — `PmccCard.tsx` and its sub-components

**Requires:** Area 8 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/position-card/PmccCard.test.tsx` (rewrite) _(depends on: Area 8 Green ✓)_
  - Render with `XYZ_BACKGROUND` + snapshots + quote; query by role / text (plan § 9 Red):
    header (PMCC badge, no wheel labels, `$104.20`, `14d to next decision`, `Open ↗` href);
    MANAGEMENT WINDOW strip, short `leg-block` `data-action 'gold'`, edge gold; ▲ gold `106.10` with
    `+1` chip, ▲ red `111.40`; ✕ with ▲ on the chip; ◆ on the LEAPS block with gold LEAPS DTE;
    EXPIRING with gold `4d`; awareness tags ⚑ ⚠ in order with tooltips and no strip; δ tag; healthy
    (no strip / tags) with a dte-14 positive control; wide spread on the face; missing LEAPS snapshot;
    missing greeks; footer (sky basis, credits, `recovery-meter` `data-fill '15.2'` green) and the
    paid-for gold variant; short cues (TARGET, `88.9% of max` green, no `/of max profit/`); coverage
    and `×3` titles, `1 of 3 covered`, two-short three blocks with only `$108.00` highlighted;
    Detail bar role/name/`aria-expanded`, seven `tier2-cell`s, `Hide detail` gold, card-body toggle,
    `Escape`, ticker and `Open ↗` navigate without toggling; ITM tier 2; closed card; neutral card
  - Run `pnpm test src/renderer/src/components/position-card/PmccCard` — all new tests must fail
- [x] **[Green]** Implement _(depends on: Area 9 Red ✓)_
  - `src/renderer/src/components/position-card/PmccCard.tsx`: rewrite; props `item`, `quote`, `session`,
    `isClosed`, `snapshots?`, `profitTargetDefault?`; compose `CardShell` (edge = `actions[0]?.tone`,
    `onClick` toggles tier 2 unless closed / neutral) → `ActionStrip` → `CardHeader` (`PMCC` badge,
    `SignalTags`, `PriceBlock`) → position line → one `LegBlock` per leg → `CardFooter` (two
    `CardFooterCell`s, `RecoveryMeter`) → `DetailBar` + `Tier2Panel`. Follow the mockup
    `mockups/epic-09-pmcc-dashboard.mdx` (`PmccCard`, `PmccLegLine`, `GLYPHS`, `tier2Cells`)
  - New: `SignalTags.tsx` (`data-testid="pmcc-awareness-tags"`, `role="img"`, `aria-label`, `title`,
    `text-wb-gold`); `RecoveryMeter.tsx` (3 px bar, `bg-wb-green` / `bg-wb-gold`, inline `width` is the
    only inline style, `data-testid="recovery-meter"`, `data-fill`); `DetailBar.tsx` + `Tier2Panel.tsx`
    (`role="button"`, `aria-expanded`, chevron `rotate-180`, `data-testid="tier2-cell"`)
  - `CardHeader` gains optional `onLinkClick` so ticker / Open links `stopPropagation`; tier-2 open state
    in `useState`, `Escape` listener only while open. Tailwind + `wb-*` tokens only
  - Run `pnpm test src/renderer/src/components/position-card` — all tests must pass, `WheelCard.test.tsx` unchanged
- [x] **[Refactor]** `/refactor` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract `MarkText` from `WheelCard.tsx` into `position-card/OptionMarkText.tsx`, used by both cards
  - Dispatch the code-simplifier agent on the new files (standing authorization)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — Grid and page wiring (depends on Area 9)

### Area 10 — `PositionsGrid` and `PositionsListPage`

**Requires:** Area 6 Green ✓, Area 9 Green ✓

- [x] **[Red]** Write failing tests _(depends on: Area 9 Green ✓)_
  - `src/renderer/src/pages/PositionsListPage.test.tsx`: one wheel + one two-leg PMCC → `useOptionSnapshots`
    called with exactly three leg summaries whose OCC symbols are the wheel's, the LEAPS's and the short's
    (assert the array); mocked `PmccCard` receives `snapshots` and `profitTargetDefault`; a PMCC
    `MANAGEMENT_WINDOW` queue row never renders a `WheelCard` for the PMCC id and the `PmccCard` mock gets no `actions` prop
  - `src/renderer/src/components/PositionsGrid.test.tsx`: active PMCC → `PmccCard` with `snapshots` and
    `profitTargetDefault`; closed grid → `isClosed` and no `snapshots`
  - Run `pnpm test src/renderer/src/pages/PositionsListPage src/renderer/src/components/PositionsGrid` — new tests must fail
- [x] **[Green]** Implement _(depends on: Area 10 Red ✓)_
  - `src/renderer/src/components/PositionsGrid.tsx`: pass the whole `snapshots` map and `profitTargetDefault`
    to `PmccCard`; the closed grid passes neither
  - `src/renderer/src/pages/PositionsListPage.tsx`: the `useOptionSnapshots` legs memo flat-maps each PMCC
    into one `ActiveLegSummary` per `pmcc.legs` entry (`instrumentType: 'CALL'`); wheel `ctxById` unchanged
  - Run the Red command — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 10 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider a `legsForSnapshots(items)` helper in `src/renderer/src/lib/` so the page memo is one call
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 7 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/pmcc-position-card.spec.ts` _(depends on: all Green tasks ✓)_
  - Helpers: new `e2e/pmcc-card-helpers.ts` (`launchPmccCards`, `seedBackgroundPmcc`, `seedLeapsOnlyPmcc`,
    `seedPartialCoveragePmcc`, `setPmccStatus`, `setPmccPhase`, locators); `BackgroundOptions.earnings` in
    `e2e/position-card-helpers.ts` → `WHEELBASE_MOCK_EARNINGS` (share `buildEarningsFixtures`). Verify the
    seeded ledger (basis `21.20`, credits `3.80`, 4 cycles) through `window.api.getPosition` before any UI assertion
  - Dates are run-day relative (`localDate(n)`); each strip test asserts `data-tone`, leading glyph/word,
    which `leg-block` has `data-action`, and `data-edge`; each "no strip" pairs with a positive control
  - Spec file header states the two two-short scenarios have no entry path (US-115) and are covered by Areas 5 and 8
  - One `it()` per AC, names mirroring the Gherkin:
    - AC 1: The PMCC card face shows the position line and one block per leg → `it('the PMCC card face shows the position line and one block per leg')`
    - AC 2: Net P&L marks the diagonal against the cost basis → `it('net P&L marks the diagonal against the cost basis')`
    - AC 3: The short call keeps its own profit-target cue → `it('the short call keeps its own profit-target cue')`
    - AC 4: A falling stock shows a losing position with a profitable short call → `it('a falling stock shows a losing position with a profitable short call')`
    - AC 5: Credits collected, premium recovered and the recovery meter → `it('credits collected, premium recovered and the recovery meter')`
    - AC 6: A wide LEAPS spread flags the P&L as unreliable → `it('a wide LEAPS spread flags the P&L as unreliable')`
    - AC 7: A missing LEAPS snapshot leaves the P&L unavailable → `it('a missing LEAPS snapshot leaves the P&L unavailable')`
    - AC 8: Missing greeks blank the delta without breaking the card → `it('missing greeks blank the delta without breaking the card')`
    - AC 9: A PMCC with only the LEAPS open → `it('a PMCC with only the LEAPS open')`
    - AC 10: Inside the roll window the ◆ strip marks the LEAPS row → `it('inside the roll window the ◆ strip marks the LEAPS row')`
    - AC 11: The short-call DTE turns gold inside 7 days → `it('the short-call DTE turns gold inside 7 days')`
    - AC 12: ▲ assignment risk (gold, $106.10) → `it('▲ assignment risk leads the strip (gold, $106.10)')`
    - AC 13: ▲ assignment risk (red, $111.40) → `it('▲ assignment risk leads the strip (red, $111.40)')`
    - AC 14: More than 2% below the short strike → MANAGEMENT WINDOW → `it('more than 2% below the short strike reads MANAGEMENT WINDOW, not ASSIGNMENT RISK')`
    - AC 15: The ⚑ glyph follows US-56's predicate → `it('the ⚑ glyph follows the earnings-proximity predicate')`
    - AC 16: ✕ below breakeven leads the strip with ▲ behind it → `it('✕ below breakeven leads the strip with ▲ behind it on a +1 chip')`
    - AC 17: The δ tag fires below the floor and never produces a strip → `it('the δ tag fires when the LEAPS delta drops below the floor and never produces a strip')`
    - AC 18: A healthy card shows no strip and no tags → `it('a healthy card shows no strip and no tags')`
    - AC 19: Awareness tags render in a fixed order and never produce a strip → `it('awareness tags render as small header tags in a fixed order and never produce a strip')`
    - AC 20: The Detail bar opens tier 2; the ticker and Open link open the detail page → `it('the Detail bar opens tier 2; the ticker and Open link open the detail page')`
    - AC 21: Tier 2 in the ITM state shows the live assignment math → `it('tier 2 in the in-the-money state shows the live assignment math')`
    - AC 22: A LEAPS fully paid for by credits → `it('a LEAPS fully paid for by credits')`
    - AC 23: Totals scale with contracts, per-share figures do not → `it('totals scale with contracts, per-share figures do not')`
    - AC 24 / 25: Two short calls … three leg blocks / only the at-risk short highlighted → no e2e (no entry path until US-115); covered by Areas 3, 4, 5, 8, 9
    - AC 26: Partial coverage is stated on the card → `it('partial coverage is stated on the card')`
    - AC 27: The PMCC sorts by its nearest decision point (14 DTE) → `it('the PMCC sorts by its nearest decision point (short call 14 DTE)')`
    - AC 28: The PMCC sorts by its nearest decision point (333 DTE) → `it('the PMCC sorts by its nearest decision point (LEAPS-only 333 DTE)')`
    - AC 29: A closed PMCC sits in the Closed section without live figures → `it('a closed PMCC sits in the Closed section without live figures')`
    - AC 30: A PMCC phase this story does not know renders a neutral card → `it('a PMCC phase this story does not know renders a neutral card')`
    - AC 31: Classic wheel cards are unchanged → `it('classic wheel cards are unchanged')`
  - `e2e/position-cards.spec.ts`: rewrite S21 as "S21: a PMCC renders the full US-108 card in the same shell"
    (PMCC badge, two leg blocks, XYZ at `117.00` now shows `▲ ASSIGNMENT RISK`)
  - `pnpm rebuild:electron`, then `LOG_LEVEL=debug pnpm test:e2e -- e2e/pmcc-position-card.spec.ts` —
    all new tests must fail for the right reason (helpers and seeding work; assertions fail)
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Fix product code, not assertions, when a case fails on behaviour
  - Run `LOG_LEVEL=debug pnpm test:e2e -- e2e/pmcc-position-card.spec.ts e2e/position-cards.spec.ts`, then
    the full `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Fold `pmcc-leaps-roll-window-alert.spec.ts`'s private `createXyzPmcc(page, leapsDte)` into the shared
    seeding if the signatures converge
  - `pnpm rebuild:node`, then `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for the right reason)
- [ ] Core-engine areas have property tests, or a stated "no property" reason (Areas 2, 3, 4, 5)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] Mutation: no surviving non-equivalent mutant in `pmcc-card.ts`, `costbasis.ts`, `position-order.ts`
- [ ] E2E tests cover every AC (AC 24 / 25 documented as core + renderer only)
- [ ] Changed files ≥ 95 % line coverage
- [ ] `pnpm test && pnpm lint && pnpm typecheck` — all clean; `pnpm format` run
