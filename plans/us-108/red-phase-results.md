# Red Phase Results: US-108 PMCC position card

## Area 4 — `pmccNextDecisionDte` and the legs-array sort key

- **Plan**: `plans/us-108/plan.md` § 4; `plans/us-108/data-model.md` § 1.4
- **Files modified**:
  - `/Users/johnteague/my-stuff/wb-108/src/main/core/position-order.test.ts`
  - `/Users/johnteague/my-stuff/wb-108/src/main/core/position-order.property.test.ts`
  - `/Users/johnteague/my-stuff/wb-108/src/main/core/position-order.ts` (typed stub + reshaped input)

### Interfaces under test

```typescript
// src/main/core/position-order.ts
export interface PmccOrderLeg {
  side: 'LONG' | 'SHORT'
  dte: number
}
export interface PositionOrderInput {
  dte: number | null
  pmcc?: { legs: readonly PmccOrderLeg[] } | null
}
export function pmccNextDecisionDte(legs: readonly PmccOrderLeg[]): number
export function sortPositionsByDte<T extends PositionOrderInput>(items: readonly T[]): T[]
```

### Tests

- `pmccNextDecisionDte`: LEAPS 315 + short 14 → 14; LEAPS 333 alone → 333; LEAPS 315 + shorts
  14/42 in both orders → 14; LEAPS 10 + short 14 → 14 (kills "min over every leg").
- Sort: MSFT 10 / AAPL 30 / XYZ short 14 → `[MSFT, XYZ, AAPL]`; XYZ LEAPS-only 333 with a
  shares-held row → `[MSFT, AAPL, XYZ, SHARES]`.
- Property (oracle): `pmccNextDecisionDte` = `Math.min` over SHORT dtes when any, else LONG dtes;
  legs generated as 1–2 LONG + 0–3 SHORT, shuffled (constraints in the generator, no `fc.pre`).
- Property (invariant): the existing permutation / non-decreasing-nulls-last / idempotence
  properties re-pointed at the legs shape, ordered by the same independent oracle.
- No new shared generator: `dteValue` / `pmccLegs` are local to this engine's ordering domain.

### Results

`pnpm test src/main/core/position-order` — 11 failed | 3 passed (14). Every failure is the stub's
`Error: not implemented`; the 3 passing are the unchanged wheel-only examples.

Typecheck after the reshape (expected until Area 6 Green): `src/main/services/list-positions.ts`
(170,38) and (173,3); **also** `src/renderer/src/lib/position-list-items.ts:85` (three errors via
`insertPositionListItem`), which the plan's "confined to list-positions\*.ts" note does not list —
it is masked in `pnpm typecheck` because `typecheck:node` fails first and `&&` skips `typecheck:web`.

## Area 3 — `computePmccUnrealizedPnl` (`src/main/core/costbasis.ts`)

- Plan: `plans/us-108/plan.md` § 3; data-model § 1.5. Story: Linear OPT-16 / US-108.
- Files: `/Users/johnteague/my-stuff/wb-108/src/main/core/costbasis.test.ts` (26 examples),
  `/Users/johnteague/my-stuff/wb-108/src/main/core/costbasis.property.test.ts` (4 properties),
  `/Users/johnteague/my-stuff/wb-108/src/main/core/test-fixtures/arbitraries.ts` (+ `signedMoney`, `pmccMarkedLeg`).
- Interface (typed stub throws `not implemented`):

```typescript
export interface PmccUnrealizedPnlInput {
  legs: { side: 'LONG' | 'SHORT'; mid: string; contracts: number }[]
  basisTotal: string
}
export interface PmccUnrealizedPnlResult {
  gross: string
  pnl: string
  pnlPercentOfBasis: string | null
}
export function computePmccUnrealizedPnl(input: PmccUnrealizedPnlInput): PmccUnrealizedPnlResult
```

- Examples: every plan § 3 worked value (Background, falling stock, LEAPS-only, three contracts, two
  shorts, partial coverage, negative basis, basis `0`); basis boundary at `0` / `0.0001` / `-40`; mid
  boundary `0` accepted, `-0.0001` rejected. Error messages: `mid must be >= 0` (also `abc`, `NaN`,
  `Infinity`), `contracts must be a positive integer` (0, −1, 1.5, and on a short leg),
  `legs must include a LONG leg` (SHORT-only and empty), `basisTotal must be a finite number`.
- Rounding: the plan's `mid '0.00005'` case lands exactly on `0.0050` and does not exercise rounding, so
  it is named "keeps a sub-cent mid at its exact 4-dp gross"; two real half-up cases were added —
  gross `0.00005` → `0.0001` (mid `0.0000005`) and percent `0.00005` → `0.0001` (mid `20.00001`, basis 2000).
- Properties: oracle (one LONG + one SHORT at equal contracts vs an independent `Decimal` formula, incl.
  the percent / null rule), order independence (shuffled legs `toEqual`), scale invariance (× k on
  contracts and basis — percent asserted **exactly equal**, since pnl·k / basis·k is the same rational),
  guard (SHORT-only legs always throw).
- Run: `pnpm test src/main/core/costbasis` → 30 failed (all `not implemented`), 117 passed.

## Area 5 — `core/pmcc-card.ts`: cues and the signal registry

- **Plan**: `plans/us-108/plan.md` § 5; `plans/us-108/data-model.md` § 1.6–1.7, § Type Design
- **Files**:
  - `/Users/johnteague/my-stuff/wb-108/src/main/core/pmcc-card.test.ts` (new, 85 cases)
  - `/Users/johnteague/my-stuff/wb-108/src/main/core/pmcc-card.property.test.ts` (new, 6 properties)
  - `/Users/johnteague/my-stuff/wb-108/src/main/core/pmcc-card.ts` (typed stub — every body throws `not implemented`)
  - `/Users/johnteague/my-stuff/wb-108/src/main/core/test-fixtures/arbitraries.ts` (added `pmccSignalShort`, `pmccSignalInput`)

### Interfaces under test

```typescript
export const LEAPS_DELTA_FLOOR = 0.6
export function pmccBreakeven(leapsStrike: string, basisPerShare: string): string
export function pmccMaxIfCalled(input: {
  shortStrike: string | null
  leapsStrike: string
  basisPerShare: string
  shortContracts: number
}): string | null
export function shortExtrinsic(input: {
  mid: string | null
  price: string | null
  strike: string
}): string | null
export function premiumRecoveredFraction(percent: string | null): number | null
export type PmccLegRef = { side: 'LONG' } | { side: 'SHORT'; legId: string }
export type PmccLaneRank = 0 | 1 | 2 | 3 | 4 | 5
export interface PmccAction {
  glyph
  statusWord
  tone
  rank: PmccLaneRank
  summary
  tooltip
  leg: PmccLegRef
}
export interface PmccTag {
  glyph: '⚑' | 'δ' | '⚠'
  name
  tone: 'gold'
  tooltip
}
export type PmccSignalDefinition = PmccActionSignal | PmccAwarenessSignal // discriminated on tier
export const PMCC_SIGNALS: readonly PmccSignalDefinition[]
export function evaluatePmccSignals(input: PmccSignalInput): {
  actions: PmccAction[]
  awareness: PmccTag[]
}
```

### Coverage

- Cues: the plan's literals, plus negative basis breakeven, a negative max-if-called (`99` short → `-220.0000`), ATM extrinsic, both null branches, meter clamp at 0 / 100 / 101.8 / −5.
- Each predicate at and either side of its boundary: ROLL_WINDOW 60/61/0/−1; ASSIGNMENT_RISK 2.0 % / 2.1 %, ATM red, 3.1 % above red, 1.8 % below gold, null price, two-short leg choice (nearest at-risk, later at-risk when nearest is not, lowest dte when both are); BELOW_BREAKEVEN 101.19 / 101.20 / 101.21 and the second short; EXPIRING / MW −1 / 0 / 5 / 6 / 21 / 22, window 14 → 13 / 14 / 15, nearest-short-only, no short; EARNINGS −1 / 0 / 10 / 11, 2 / 4 / 5 vs short dte 4, null, no short; DELTA_FLOOR 0.59 / 0.60 / 0.61 / null; WIDE_SPREAD 11.5 % / 10.1 % / 10.0 % / 3.1 % / null.
- Composition table (✕+▲red, ▲red+MW, ▲gold+MW, ◆+MW, EXPIRING alone, ✕+▲+MW) asserts glyph + word + tone in rank order; awareness order ⚑ δ ⚠; awareness-only → `actions: []`; healthy Background → `{ actions: [], awareness: [] }`.
- Properties: guard (no awareness glyph in actions), sorted by rank, EXPIRING/MW exclusive, ASSIGNMENT_RISK oracle against `percentBelowStrike` with price generated as `strike × (1 − p/100)`, `p ∈ [−5, 5]`; breakeven inverse; meter bound.

### Design decisions

- **`PmccAction.tooltip` added** (data-model lists `{ glyph; statusWord; tone; rank; summary; leg }`): the registry's action tooltips (`LEAPS inside the 60-day roll window`, `pmccAssignmentRiskSummary`, the ✕ tooltip) must reach the renderer's leg-mark title (plan § 9), and an action that drops it leaves them untestable and unreachable. Still assignable to `CardAction`.
- Awareness definitions carry `name` (for `PmccTag.name`) and no `reason` / `rank` / `leg` / `statusWord`.
- The type test (`expectTypeOf … not.toHaveProperty('rank')`) is compile-time: it passes at runtime against the stub and is enforced by `pnpm typecheck`.

### Result

`pnpm vitest run src/main/core/pmcc-card` → 85 failed, 1 passed (the type test); every failure is `Error: not implemented` from the stub. `tsc -p tsconfig.node.json` reports no error in Area 5 files.

## Area 6 — List shape: legs array, ledger figures, earnings, management window

- **Plan**: `plans/us-108/plan.md` § 6; `data-model.md` § 1.1–1.3; `contracts/positions-list.md`
- **Files modified**:
  - `/Users/johnteague/my-stuff/wb-108/src/main/schemas.ts` (types reshaped per the contract)
  - `/Users/johnteague/my-stuff/wb-108/src/main/services/pmcc-opening-legs.ts` + `.test.ts`
  - `/Users/johnteague/my-stuff/wb-108/src/main/services/earnings-dates.ts` + `.test.ts`
  - `/Users/johnteague/my-stuff/wb-108/src/main/services/list-positions.test.ts`
  - `/Users/johnteague/my-stuff/wb-108/src/renderer/src/lib/position-list-items.test.ts`

### Interfaces under test

```typescript
// src/main/services/pmcc-opening-legs.ts
export function pmccEntryDebitPerShare(legs: LegRecord[]): string | null
// src/main/services/earnings-dates.ts
export function readStoredNextEarnings(
  db: Database.Database,
  tickers: readonly string[],
  now: Date
): Map<string, string>
// src/renderer/src/lib/position-list-items.ts
export function toPmccListItem(
  res: CreatePmccPositionResponse,
  now?: Date,
  managementWindowDte?: number
): PmccListItem | null
```

### Tests

- `pmccEntryDebitPerShare`: 25.00 − 1.80 → `23.2000`; fees 1.00 + 1.00 → `23.2200`; later short ignored;
  missing short fill → `null`.
- `readStoredNextEarnings` at 2026-11-06: XYZ 11-18 kept, AAPL past / MSFT null / no-row TSLA absent;
  today inclusive, yesterday absent; throwing `db.prepare` → empty map + `earnings_date_read_failed` WARN.
- `listPositions` (clock pinned to 2026-11-06 local noon): Background → full `pmcc` literal (legs with
  legIds/fills, `cycles 4`, six ledger figures, `entryDebitPerShare '23.2000'`, `openedAt`,
  `managementWindowDte 21`); override 14 beats default 18; default 18 with no override; LEAPS-only →
  one LONG leg, `cycles 3`; short roll → SHORT is the ROLL_TO, `cycles 4`; closed keeps legs + ledger;
  `nextEarnings` on PMCC and wheel items (stored / none / past); AC sort outline (both rows). Existing
  US-101/103/105 PMCC assertions moved to `legs`; the wheel literal gains `nextEarnings: null`.
- `toPmccListItem`: full literal (two legs, `cycles 1`, ledger, `nextEarnings null`); $1.00 fees a leg
  book into the ledger figures like the list; explicit management window 14.
- No property — service/renderer mapping, not a `src/main/core/` engine.

### Design decisions / deviations

- **Background history**: the plan's "three expired shorts 1.00/0.50/0.50" makes the entry short
  $1.00 and the entry debit `24.0000`, contradicting both the plan's own `23.2000` and the AC
  ("initial net debit was $23.20"). The fixture uses entry short **$1.80**, then $0.10, $0.10, open
  $108 @ $1.80 — credits $3.80, basis $21.20, entry debit $23.20, 4 cycles, all as the AC states.
- The US-108 PMCCs are written straight to the tables (`insertPosition` + `insertLegs` +
  `appendPmccSnapshot`) because `createPmccPosition` validates the past-dated entry short against
  the pinned clock.
- LEAPS-only sort uses DTE 315 (the pinned 2026-11-06) instead of the AC's 333 (2026-10-19); the
  ordering claim is the same.

### Result

`pnpm test src/main/services/list-positions src/main/services/earnings-dates src/main/services/pmcc-opening-legs src/renderer/src/lib/position-list-items`
→ 30 failed / 76 passed. Failures: `not implemented` (8 stub tests), assertion mismatches on the old
shape, and `Cannot read properties of undefined (reading 'filter'|'map')` where the old summary has no
`legs` — all missing behaviour, no fixture errors.

## Area 7 — Widen the card-action lanes for ✕ and ◆; `CardShell.onClick`

- **Plan**: `plans/us-108/plan.md` § 7; `plans/us-108/data-model.md` § Type Design
- **Files**:
  - `/Users/johnteague/my-stuff/wb-108/src/renderer/src/lib/card-actions.test.ts` — the closed-set describe now pins six ranks, four glyphs, seven status words, `PmccLaneRank ≡ LaneRank` and `PmccAction` ⊑ `CardAction`
  - `/Users/johnteague/my-stuff/wb-108/src/renderer/src/components/position-card/CardShell.test.tsx` — new case: a supplied `onClick` receives the click and the hash stays `''`
  - `/Users/johnteague/my-stuff/wb-108/src/renderer/src/components/position-card/CardShell.tsx` — typed stub: `onClick?: (event: React.MouseEvent) => void` on the props, not yet wired

### Interfaces under test

```typescript
// src/renderer/src/lib/card-actions.ts
export type LaneRank = 0 | 1 | 2 | 3 | 4 | 5 // from LANE_BELOW_BREAKEVEN = 0 … LANE_MANAGEMENT_WINDOW = 5
export type StatusWord = 'BELOW BREAKEVEN' | 'CALL BREACHED' | 'STRIKE PROXIMITY' | 'ASSIGNMENT RISK' | 'ROLL WINDOW' | 'EXPIRING' | 'MANAGEMENT WINDOW'
export interface CardAction { glyph: '✕' | '▲' | '◆' | '◷'; statusWord: StatusWord; tone: CardTone; rank: LaneRank; summary: string }
// src/renderer/src/components/position-card/CardShell.tsx
type CardShellProps = { …; onClick?: (event: React.MouseEvent) => void }
```

### Design decisions

- **`StatusWord` gains three words, not two.** The plan lists `'BELOW BREAKEVEN' | 'ROLL WINDOW'`, but Area 5's `PmccStatusWord` includes `'ASSIGNMENT RISK'` (the PMCC ▲ word, distinct from the wheel's `STRIKE PROXIMITY`), so `PmccAction` is assignable to `CardAction` only if `StatusWord` carries it too. The pin names all seven words.
- `toExtend` rather than the plan's `toMatchTypeOf` — the repo's expect-type idiom (`toMatchTypeOf` is deprecated); same assignability check.
- **Regression guard is the existing case.** `rankWheelActions — ordering › sorts actions by rank ascending` already asserts `CALL BREACHED 1, EXPIRING 4, MANAGEMENT WINDOW 5` on the US-18 rows; a second copy would give one regression two failing tests. It stays green through the widening.
- The type pins are compile-time: they pass at runtime and fail under `pnpm typecheck:web`.
- The `onClick` case asserts the handler got one `click` event and the hash stayed `''`; the existing "navigates to its href" case is the positive control that a click does set the hash.

### Result

- `pnpm vitest run src/renderer/src/lib/card-actions src/renderer/src/components/position-card/CardShell` → 1 failed, 52 passed. The failure is `expected "vi.fn()" to be called 1 times, but got 0 times` (stub ignores `onClick`, the card still navigates).
- `pnpm typecheck:web` → 5 `TS2344` errors in `card-actions.test.ts` (rank, glyph, status word, `PmccLaneRank`, `PmccAction`), none elsewhere in Area 7 files.

---

## Area 8 — `lib/pmcc-card-display.ts`: the display derivation

- **Plan**: `plans/us-108/plan.md` § 8; `plans/us-108/data-model.md` § 1.8 + Type Design; AC: Linear OPT-16
- **Files**:
  - `/Users/johnteague/my-stuff/wb-108/src/renderer/src/lib/pmcc-card-display.test.ts` — new, 94 cases
  - `/Users/johnteague/my-stuff/wb-108/src/renderer/src/lib/pmcc-card-display.ts` — typed stub (every export with its real signature, bodies throw `not implemented`)
  - `/Users/johnteague/my-stuff/wb-108/src/renderer/src/test-fixtures/wheel-cards.ts` — additive: `XYZ_LEAPS_LEG`, `XYZ_SHORT_LEG`, `XYZ_SHORT_112_LEG`, `XYZ_BACKGROUND`, `XYZ_LEAPS_ONLY`, `XYZ_PAID_FOR`, `XYZ_THREE_CONTRACTS`, `XYZ_TWO_SHORTS`, `XYZ_PARTIAL_COVERAGE`, `XYZ_LEAPS_SNAPSHOT`, `XYZ_SHORT_SNAPSHOT`, `pmccSnapshots(item, byLegId)`, `xyzQuote(price)`; `optionSnapshot` gains an optional `delta` that adds a full greeks block (existing callers unchanged). `XYZ` was already on the legs shape (Area 6) and is untouched.

### Interfaces under test

```typescript
export function isKnownPmccPhase(phase: string): phase is PmccListItem['phase']
export function derivePmccCardDisplay(
  item: PmccListItem,
  snapshotsBySymbol: OptionSnapshotsBySymbol | undefined,
  quote: StockQuote | undefined,
  options: { closed: boolean; profitTargetDefault?: number; now?: Date }
): ClosedPmccDisplay | NeutralPmccDisplay | OpenPmccDisplay
```

### Coverage

Face (state, coverage, subline, both leg blocks literally, P&L, basis, credits, MANAGEMENT WINDOW on the short); OCC-symbol lookup by literal symbols; P&L zero / one-cent-loss sign and a `18.85 → 18.9` half-up rounding case; short cue below target, above fill (`−94.4%`), flat, one cent under target, position override and app default; falling stock (loss + `88.9% of max` + target, no `of max profit` in `JSON.stringify`); wide LEAPS (mark note, `pnlWide`, ⚠ tag, strip unchanged) vs the short's own 11 % spread marking nothing; missing / non-numeric / negative / unbuildable-symbol / no-snapshots-at-all marks (no throw); missing greeks (everything else `toEqual` the face); LEAPS-only; DTE emphasis at LEAPS 59/60/61 and short 4/7/8/14; ◆ on the LEAPS block, ◷ EXPIRING on the 4-DTE short; signal wiring (quote → ▲, `managementWindowDte` 13/14, `nextEarnings` via `now` in-window / day-after, delta → δ, healthy, ✕+▲ on the 99 short); paid for; basis 0 / 0.0001 and meter 100.0000 / 99.9900 / null boundaries; three contracts; two shorts (order, per-short cue, P&L, only the 108 short highlighted, reversed input order); partial coverage; tier 2 (seven Background cells, singular cycle, ITM, at-strike ITM / one cent under OTM, no quote, contract scaling, delta 0.54/0.5999/0.6000, wide LEAPS, no greeks, no LEAPS snapshot, null entry debit, pinned clock default `now`); closed (full literal + type guard); neutral (literal + closed precedence + type guard); `isKnownPmccPhase`.

No property file — a finite mapping in the renderer over the core engines, as `wheel-card-display` is.

### Design decisions / deviations

- **`ShortTrailing` carries both facts.** The data-model union made `target` and `percentOfMax` exclusive, but OPT-16 AC 4 requires "`88.9% of max` in green **with** the TARGET chip" (and plan § 9 renders them side by side). Shape: `{ percentOfMax; tone: 'gain' | 'loss' | 'flat'; target: ProfitTargetHit | null } | 'unavailable'`.
- **Leg mark is the wheel's mark shape** (`{ mid; note: MarkNote | null } | 'unavailable'`) instead of the plan's `{ mid; wide }`, so Area 9's shared `OptionMarkText` renders both cards and the wide-spread tooltip builder is shared (refactor task). The short leg's note is always `null` (research U8.1).
- **`now` is an injectable option** (defaults to the real clock) for days-to-earnings and `Nd ago`; one case pins the clock to cover the default.
- **Short extrinsic is not clamped** (core's `shortExtrinsic`); every plan literal is non-negative, so no clamp is needed. Its note is `no quote this poll` when either the short mark or the stock price is missing (no plan literal; the mockup would have said `OTM`, which is untrue without a price).
- **Neutral** keeps basis and credits (ledger figures, never quote-dependent) and dashes price, P&L and legs; `priceSubline '—'`, `pnl '—'`.
- The neutral fixture uses one widening cast (`laterPhase as PmccListItem['phase']` from a `string`), as plan § 8 allows; no `as unknown as`.

### Result

- `pnpm vitest run src/renderer/src/lib/pmcc-card-display` → 92 failed, 2 passed. Every runtime failure is `Error: not implemented` from the stub; the 2 passes are the compile-time `expectTypeOf` guards (pass at runtime, enforced by `pnpm typecheck`).
- `pnpm typecheck` clean; eslint clean on the three files; fixture consumers (`wheel-card-display`, `position-card/*`, `PositionsGrid`, `PositionsListPage`) 203/203 green.

## Area 9 — `PmccCard.tsx` and its sub-components

- **Plan**: `plans/us-108/plan.md` § 9; mockup `mockups/epic-09-pmcc-dashboard.mdx` (`PmccCard`, `PmccLegLine`); AC: Linear OPT-16 (1–8, 10–23, 25, 29, 30 at the component level)
- **Files**:
  - `/Users/johnteague/my-stuff/wb-108/src/renderer/src/components/position-card/PmccCard.test.tsx` — rewritten, 44 cases, clock pinned to 2026-11-06 10:00 local
  - `/Users/johnteague/my-stuff/wb-108/src/renderer/src/components/position-card/LegBlock.test.tsx` — +1 case: an action's own `tooltip` titles the leg mark
  - Stubs: `PmccCardProps` gains `snapshots?: OptionSnapshotsBySymbol` and `profitTargetDefault?: number` (unused by the placeholder body); `CardAction` gains optional `tooltip?: string` (`lib/card-actions.ts`)

### Interfaces under test

```typescript
export type PmccCardProps = {
  item: PmccListItem
  quote?: StockQuote
  session?: MarketStatus['session']
  isClosed?: boolean
  snapshots?: OptionSnapshotsBySymbol
  profitTargetDefault?: number
}
// CardAction.tooltip?: string — LegBlock's mark title uses it, else formatActionLine
```

### Coverage

Face (badge, no wheel labels, price + `14d to next decision`, ticker/Open hrefs, both leg blocks literally, coverage, `+$400.00` / `+18.9% of basis` green, `-$500.00` / `-23.6%` red); short cues (TARGET at 50 %, `33.3% of max` below target with no chip, `−94.4% of max` red, `88.9% of max` green with TARGET, no `of max profit`); action states (MANAGEMENT WINDOW, ▲ gold `106.10` with `+1` chip, ▲ red `111.40`, ✕ with ▲ on the chip, ◆ on the LEAPS with gold `59d` + tooltip and plain `31d`, EXPIRING with gold `4d`) — each asserts `data-tone`, which `leg-block` carries `data-action`, the mark glyphs and title, and `data-edge`; awareness (⚑ ⚠ order/titles/aria-labels, δ, healthy with a dte-14 positive control); wide LEAPS (mark ⚠ + tooltip, P&L ⚠ + tooltip, short mark plain, strip stays); missing LEAPS snapshot; missing greeks; footer (sky basis, green credits, meter `15.2` green with width, paid-for gold with meter `100` gold and `basis not positive`); contracts `×3`, partial `1 of 3 covered`, two shorts (three blocks, only `$108.00` highlighted); tier 2 (bar name / `aria-expanded` / gold, seven cells literally, second click, card-body toggle without navigation, `Escape`, ticker and Open ↗ navigate leaving tier 2 open, ITM cells); closed (muted, edge PMCC, dashed, no strip/tags/bar, footer, click navigates, `isClosed`); neutral (raw label, dashed, no signals/bar, no wheel badge).

No property file — renderer component.

### Design decisions / deviations

- **Leg-mark title is the action's `tooltip`, not the strip line.** OPT-16 AC 12/13 give the ▲ mark tooltip as the `Stock is … short-call strike — …` sentence, which is the registry's `tooltip`; `formatActionLine` (US-18's leg-mark title) would give the strip line instead. So `CardAction` gains an optional `tooltip` that `LegBlock`'s marks prefer; wheel actions carry none and keep their line. Consequence: the MANAGEMENT WINDOW mark title is `14 DTE remaining — review for roll or close` (the registry tooltip), not plan § 9's `◷ MANAGEMENT WINDOW · …` line, and EXPIRING's is `Expires in 4 days at $108.00 strike`.
- **▲ tooltip carries the strike.** The display yields `Stock is 1.8% below the $108.00 short-call strike — approaching assignment` (`pmccAssignmentRiskSummary`); OPT-16 / plan omit `$108.00`. The test asserts what the display yields.
- **Short cue shows percent and TARGET together** (AC 4), so the TARGET case also asserts `50.0% of max`.
- **Neutral** price and P&L read `—` over `—` (PriceBlock in closed mode, no "unavailable" note).
- The P&L testid stays `position-card-XYZ-pnl` (wheel parity); each leg's mark is `data-testid="leg-mark"`.

### Result

- `pnpm test src/renderer/src/components/position-card/PmccCard src/renderer/src/components/position-card/LegBlock` → 37 failed, 11 passed. All 37 failures are assertion / element-not-found against the US-18 placeholder card. The 4 PmccCard passes are behaviour the placeholder already had and must keep (PMCC badge + state, price/links, `isClosed`, a closed card's click navigates); LegBlock's 4 existing cases pass.

## Area 10 — `PositionsGrid` and `PositionsListPage`

- **Plan**: `plans/us-108/plan.md` § 10 (enabler for every live-figure scenario, and "Classic wheel cards are unchanged")
- **Files**:
  - `/Users/johnteague/my-stuff/wb-108/src/renderer/src/components/PositionsGrid.test.tsx` — PmccCard mock now renders `data-target` and the snapshot map's keys (`NO_SNAPSHOTS` when absent); +2 cases
  - `/Users/johnteague/my-stuff/wb-108/src/renderer/src/pages/PositionsListPage.test.tsx` — WheelCard / PmccCard mocks carry `data-kind`; PmccCard mock renders `data-target`, the snapshot keys and a `mock-pmcc-actions-<ticker>` marker when an `actions` prop is present; +3 cases
- No new interfaces — `PmccCardProps.snapshots` / `profitTargetDefault` exist since Area 9.

### Coverage

- Page: `[AAPL, XYZ]` → `useOptionSnapshots`' last legs argument is exactly `[AAPL 2027-09-12 180 PUT, XYZ 2028-01-21 80 CALL, XYZ 2027-08-20 118 CALL]`, and its OCC symbols (via `occSymbolForLeg`) are `AAPL270912P00180000`, `XYZ280121C00080000`, `XYZ270820C00118000`.
- Page: the PmccCard mock receives the whole snapshot map (both the wheel's and the LEAPS's symbols) and `profitTargetDefault` `50` from `useAlertDefaults`.
- Page: a PMCC `MANAGEMENT_WINDOW` queue row (phase `PMCC_OPEN`) beside an AAPL one → cards are `[AAPL wheel, XYZ pmcc]` (no wheel card for XYZ), AAPL gets its MANAGEMENT WINDOW, no `mock-actions-XYZ` and no `mock-pmcc-actions-XYZ` (positive control: the PMCC card and AAPL's actions render).
- Grid: active `[AAPL, XYZ]` → PMCC card gets the whole map (`AAPL270912P00180000 XYZ280121C00080000`) and `data-target` `60`; closed grid given a snapshot map → PMCC card closed, `NO_SNAPSHOTS`.

No property file — renderer wiring.

### Design decisions

- The closed grid still passes `profitTargetDefault` (as it does to the wheel card); `derivePmccCardDisplay` ignores it for a closed card, so only `snapshots` is withheld.
- Two cases pass against the current code by design — they are regression guards the plan calls for, not new behaviour: the closed-grid PMCC (the grid passes no snapshots to the PMCC card at all today) and the PMCC queue row (`ctxById` is wheel-only already). Each would fail if Green passed snapshots to a closed card or routed actions to a PMCC.

### Result

`pnpm test src/renderer/src/pages/PositionsListPage src/renderer/src/components/PositionsGrid` → 3 failed, 65 passed. Failures: the page legs array (PMCC contributes one all-null summary instead of two CALL legs), the page PMCC mock showing `NO_SNAPSHOTS`, the grid PMCC mock showing `NO_SNAPSHOTS`. All assertion failures against missing wiring; `pnpm typecheck` clean.

## E2E — `e2e/pmcc-position-card.spec.ts` (Layer 7)

- **Plan**: `plans/us-108/plan.md` § 11 and the AC Audit; acceptance authority OPT-16 (Linear)
- **Files**:
  - `/Users/johnteague/my-stuff/wb-108/e2e/pmcc-position-card.spec.ts` — new, one `it()` per scenario (29), names mirroring the Gherkin; header states the two two-short scenarios have no entry path until US-115 and are covered by Areas 5 and 8
  - `/Users/johnteague/my-stuff/wb-108/e2e/pmcc-card-helpers.ts` — new: `launchPmccCards`, `seedBackgroundPmcc`, `seedLeapsOnlyPmcc`, `seedPartialCoveragePmcc`, `setPmccStatus`, `setPmccPhase`, `readLedger` / `BACKGROUND_LEDGER`, and the card locators (`legParts`, `legMarks`, `legDte`, `awarenessTags`, `detailBar`, `tier2Cells` / `tier2Rows`, `recoveryMeter`, `pnlFigure`, `footerCell`)
  - `/Users/johnteague/my-stuff/wb-108/e2e/earnings-fixtures.ts` — new: `EarningsFixture` + `buildEarningsFixtures(byTicker, dateOf)` moved out of `screener-helpers.ts` so the run-day-anchored card specs and the fake-clock screener specs share it
  - `/Users/johnteague/my-stuff/wb-108/e2e/position-card-helpers.ts` — `BackgroundOptions.earnings` → `WHEELBASE_MOCK_EARNINGS`; `snapshotOverrides` (e.g. `greeks`) per OCC symbol
  - `/Users/johnteague/my-stuff/wb-108/e2e/screener-helpers.ts` — imports the shared earnings builder, passing `screenerDate`
  - `/Users/johnteague/my-stuff/wb-108/e2e/position-cards.spec.ts` — S21 rewritten: "S21: a PMCC renders the full US-108 card in the same shell" (badge, two leg blocks, XYZ at $117.00 now leads with `▲ ASSIGNMENT RISK · stock 0.8% below the $118.00 strike · plan the roll`, `+1` MANAGEMENT WINDOW chip, short block gold, edge gold; markers `{ strip: 1 }`)

### Seeding

- The corrected Background ledger: entry short $1.80, two expired $0.10 cycles, then the open $108 call @ $1.80 → `readLedger` = basis `21.2000`, credits `3.8000`, LEAPS cost `25.0000`, initial net debit `2320.0000`, 4 cycles — asserted through `window.api.getPosition` / `listPositions` before every UI assertion that depends on it.
- The PMCC opens 203 days before the run day and every later leg event sits on its own earlier day, so the ledger replays in fill-date order (no reliance on two rows' `created_at` differing) and tier 2 reads `opened <run day − 203> · 203d ago`, matching the AC's 2026-04-17 → 2026-11-06.
- Fixtures that change the open short keep basis $21.20 by adjusting the expired cycles: ✕ ($99 @ $1.55) uses priors `0.35, 0.10`; partial coverage (3 LEAPS, 1-lot short) uses 3-lot priors `1.30, 0.10`; paid-for uses priors `19.20, 0.10` with an open $120 short, then the real `rollPmccLeaps` IPC ($80 → $85, $26.00 / $23.50) → basis `-0.4000`, credits `22.9000`, LEAPS cost `22.5000`.
- LEAPS-only: two expired $1.00 cycles → basis `23.0000`, credits `2.0000`, 2 cycles.

### Falsifiability

- Each strip test asserts `data-tone`, the lead line (glyph + word + reason), the `+N` chip title (or its absence), which `leg-block` carries `data-action`, and `data-edge` in one `stripFacts` object.
- Every "no strip" pairs with MSFT's 10-DTE strip on the same page; tag absence pairs with a fired tag (⚑ in the missing-greeks test, ⚠ on XYZ in the wheel-unchanged test); the closed and neutral tests first view the same PMCC open with its strip, highlight and ⚑ ⚠ tags, then close / re-phase it.
- `-$500.00` asserts both lines exactly and that they carry `text-wb-red` with no `text-wb-green`; the ⚑ test launches with earnings inside (2 d), the day after (5 d) and none, each with the EXPIRING strip as positive control.
- Ticker / `Open ↗` "tier 2 untouched": a one-shot capture-phase `preventDefault` holds the navigation back so the post-click `aria-expanded` is observable on the same mounted card; then each link navigates for real.

### Result

The product areas (1–10) were built before this layer, so no test can fail for missing implementation: `pnpm rebuild:electron`, then `LOG_LEVEL=debug pnpm test:e2e e2e/pmcc-position-card.spec.ts --bail=0` → **29 passed** on the first run (helpers and seeding work). In place of a red run, hand mutants in product code (each restored from a scratch copy, verified with `cmp`) show the assertions bite:

| Mutant                                          | Tests that failed                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `derivePnl` tone always `gain`                  | a falling stock shows a losing position…                                                 |
| ⚑ predicate drops `daysToEarnings <= short.dte` | the ⚑ glyph follows the earnings-proximity predicate                                     |
| `pnlWide: false`                                | a wide LEAPS spread flags the P&L as unreliable                                          |
| PmccCard `onClick` → navigation                 | the Detail bar opens tier 2…; tier 2 in the in-the-money state…                          |
| `LegBlock` drops `data-action`                  | 8 tests: ◆ roll window, ◷ expiring, ▲ gold, ▲ red, MANAGEMENT WINDOW, ✕, closed, neutral |

Note: `pnpm test:e2e -- <file>` does not filter (vitest ignores arguments after `--`); use `pnpm test:e2e <file>`.
