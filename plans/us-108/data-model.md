# US-108 — Data Model: PMCC position card

Story: Linear [OPT-16 / US-108](https://linear.app/optionswheel/issue/OPT-16). Decisions:
[research.md](research.md). No migration: every figure below is derived from `legs`,
`cost_basis_snapshots`, `positions` (`opened_date`, `management_window_dte_override`), `app_settings`
(the management-window default) and the `earnings_date` store, all of which exist.

## 1. Entities

### 1.1 `PmccLegSummary` (wire, `src/main/schemas.ts`) — replaces the current shape

| Field          | Type                | Source                                                                                                                                |
| -------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `legId`        | `string`            | `legs.id` of the open leg (`pmccOpenLegs`: `LEAPS_OPEN` / `SHORT_CALL_OPEN` / a `ROLL_TO`)                                            |
| `side`         | `'LONG' \| 'SHORT'` | LEAPS → `LONG`; short call → `SHORT`                                                                                                  |
| `strike`       | `string` (4 dp)     | `money4(leg.strike)`                                                                                                                  |
| `expiration`   | `string` ISO day    | `leg.expiration`                                                                                                                      |
| `dte`          | `number`            | `computeDte(leg.expiration, now)`; a leg whose DTE is `null` drops the position with the existing `pmcc_list_summary_incomplete` WARN |
| `contracts`    | `number` ≥ 1        | `leg.contracts`                                                                                                                       |
| `fillPerShare` | `string` (4 dp)     | `money4(leg.premiumPerContract)` — the LEAPS debit / the short's credit per share                                                     |

Order: the `LONG` leg first, then `SHORT` legs by `expiration` ascending (today at most one).

### 1.2 `PmccListSummary` (wire) — replaces `{ long, short, basisPerShare, basisTotal }`

| Field                     | Type                    | Source / rule                                                                                                                |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `legs`                    | `PmccLegSummary[]`      | § 1.1; at least one `LONG` entry                                                                                             |
| `basisPerShare`           | `string` (4 dp)         | `pmccLedgerFromLegs(legs).basisPerShare` (may be ≤ 0)                                                                        |
| `basisTotal`              | `string` (4 dp)         | ledger `basisTotal`                                                                                                          |
| `leapsCostPerShare`       | `string` (4 dp)         | ledger `leapsCostPerShare`                                                                                                   |
| `shortCreditsPerShare`    | `string` (4 dp)         | ledger `shortCreditsPerShare`                                                                                                |
| `shortCreditsTotal`       | `string` (4 dp)         | ledger `shortCreditsTotal` — the footer's `Credits collected`                                                                |
| `premiumRecoveredPercent` | `string \| null` (4 dp) | ledger; `null` when LEAPS cost ≤ 0; **not clamped** (`101.8000` is valid)                                                    |
| `cycles`                  | `number` ≥ 0            | count of legs with `legRole === 'SHORT_CALL_OPEN'`                                                                           |
| `entryDebitPerShare`      | `string \| null`        | `pmccEntryDebitPerShare(legs)` = `calculatePmccOpeningDebit(entry legs).basisPerShare`; `null` when an entry fill is missing |
| `openedAt`                | `string` ISO day        | `positions.opened_date`                                                                                                      |
| `managementWindowDte`     | `number`                | `resolveManagementWindowDte(positions.management_window_dte_override, getAlertDefaults(db).managementWindowDte)`             |

### 1.3 `PositionListItemBase` (wire) — one added field

| Field          | Type             | Source                                                                                                                                                   |
| -------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nextEarnings` | `string \| null` | `readStoredNextEarnings(db, tickers, now).get(ticker) ?? null` — a stored `next_earnings` ≥ today; otherwise `null`. Wheel items carry it and ignore it. |

`PmccListItem` keeps its typed-null wheel fields (`strike`, `expiration`, `dte`, `instrumentType`,
`contracts`, `entryPremiumPerContract`), so the calendar and every wheel-only consumer stay unchanged.

### 1.4 `PositionOrderInput` (`src/main/core/position-order.ts`)

`pmcc?: { legs: readonly { side: 'LONG' | 'SHORT'; dte: number }[] } | null`. Order DTE =
`pmccNextDecisionDte(legs)` = the smallest `SHORT` dte, else the smallest `LONG` dte. Exported so the
card header shows the same number (`Nd to next decision`).

### 1.5 `computePmccUnrealizedPnl` (`src/main/core/costbasis.ts`)

Input `PmccUnrealizedPnlInput = { legs: { side: 'LONG' | 'SHORT'; mid: string; contracts: number }[];
basisTotal: string }`. Output `PmccUnrealizedPnlResult = { gross: string; pnl: string;
pnlPercentOfBasis: string | null }`, all 4 dp `ROUND_HALF_UP`.

- `gross = Σ (side === 'SHORT' ? −1 : +1) × mid × 100 × contracts`
- `pnl = gross − basisTotal`
- `pnlPercentOfBasis = basisTotal > 0 ? pnl / basisTotal × 100 : null`
- Throws (`Error`) when: any `mid` is non-finite or < 0; any `contracts` is not an integer ≥ 1; no
  `LONG` leg; `basisTotal` is non-finite. Mirrors `computeUnrealizedPnl`'s contract.

Worked values (Background): `(26.10 − 0.90) × 100 − 2120 = 400.0000`, percent `18.8679` → `+18.9%`.

### 1.6 PMCC card cues (`src/main/core/pmcc-card.ts`)

Pure helpers over plain values (all money 4 dp strings; DTEs integers):

| Helper                                                                         | Formula                                                              | Null when                        |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------- |
| `pmccBreakeven(leapsStrike, basisPerShare)`                                    | `leapsStrike + basisPerShare`                                        | —                                |
| `pmccMaxIfCalled({ shortStrike, leapsStrike, basisPerShare, shortContracts })` | `(shortStrike − leapsStrike − basisPerShare) × 100 × shortContracts` | no short                         |
| `shortExtrinsic({ mid, price, strike })`                                       | `mid − max(0, price − strike)`                                       | no mid or no price               |
| `premiumRecoveredFraction(percent)`                                            | `percent / 100`, **clamped to [0, 1] for the meter only**            | `percent === null`               |
| `pmccNextDecisionDte(legs)`                                                    | § 1.4                                                                | never (a LONG leg always exists) |

### 1.7 Signal registry (`src/main/core/pmcc-card.ts`)

`PmccSignalInput` (plain values the card already holds):

| Field                 | Type                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `leaps`               | `{ strike: string; dte: number; delta: string \| null; spread: { bid; ask; mid } \| null }` |
| `shorts`              | `{ legId: string; strike: string; dte: number; expiration: string }[]` sorted by dte        |
| `price`               | `string \| null` (underlying)                                                               |
| `basisPerShare`       | `string`                                                                                    |
| `managementWindowDte` | `number`                                                                                    |
| `daysToEarnings`      | `number \| null`                                                                            |

`PmccSignalDefinition` — one registry entry (ordered array `PMCC_SIGNALS`, no if/return chain):

| Field        | Type                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`       | `'BELOW_BREAKEVEN' \| 'ASSIGNMENT_RISK' \| 'ROLL_WINDOW' \| 'EXPIRING' \| 'MANAGEMENT_WINDOW' \| 'EARNINGS' \| 'DELTA_FLOOR' \| 'WIDE_SPREAD'` |
| `tier`       | `'action' \| 'awareness'`                                                                                                                      |
| `glyph`      | `'✕' \| '▲' \| '◆' \| '◷' \| '⚑' \| 'δ' \| '⚠'`                                                                                                |
| `statusWord` | `'BELOW BREAKEVEN' \| 'ASSIGNMENT RISK' \| 'ROLL WINDOW' \| 'EXPIRING' \| 'MANAGEMENT WINDOW'` (action only)                                   |
| `leg`        | `(input) => PmccLegRef \| null` — which leg the state marks (action only)                                                                      |
| `test`       | `(input) => boolean`                                                                                                                           |
| `tone`       | `(input) => 'red' \| 'gold'`                                                                                                                   |
| `rank`       | `(input) => 0 \| 1 \| 2 \| 3 \| 4 \| 5` (action only)                                                                                          |
| `reason`     | `(input) => string` (the strip text after `WORD ·`)                                                                                            |
| `tooltip`    | `(input) => string` (the leg mark / header tag title)                                                                                          |

Rules (every threshold imported from `alerts.ts` unless marked _own_):

| code                | tier      | fires when                                                                                                           | tone                                 | rank  | leg                               | reason / tooltip                                                                                                                                                |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BELOW_BREAKEVEN`   | action    | some short `strike < pmccBreakeven` (_own_)                                                                          | red                                  | 0     | that short                        | `$99.00 strike is $2.20 under the $101.20 breakeven · roll up before it is called` / `Short strike below breakeven $101.20 — being called away locks in a loss` |
| `ASSIGNMENT_RISK`   | action    | `price` numeric and some short with `percentBelowStrike ≤ PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW` (2)                | red when `price ≥ strike`, else gold | 1 / 2 | the first such short (lowest dte) | `stock 1.8% below the $108.00 strike · plan the roll` / `stock 3.1% above the $108.00 strike · roll or close`; tooltip = `pmccAssignmentRiskSummary`            |
| `ROLL_WINDOW`       | action    | `0 ≤ leaps.dte ≤ PMCC_LEAPS_ROLL_WINDOW_MAX_DTE` (60)                                                                | gold                                 | 3     | LEAPS                             | `LEAPS 59d left, inside the 60-day window · roll while it has time value` / `LEAPS inside the 60-day roll window`                                               |
| `EXPIRING`          | action    | nearest short `0 ≤ dte ≤ EXPIRATION_IMMINENT_MAX_DTE` (5)                                                            | gold                                 | 4     | nearest short                     | `expirationImminentSummary({ dte, strike })` verbatim, both                                                                                                     |
| `MANAGEMENT_WINDOW` | action    | nearest short `EXPIRATION_IMMINENT_MAX_DTE < dte ≤ managementWindowDte`                                              | gold                                 | 5     | nearest short                     | `managementWindowSummary({ dte })` verbatim, both                                                                                                               |
| `EARNINGS`          | awareness | `0 ≤ daysToEarnings ≤ EARNINGS_PROXIMITY_MAX_DAYS` (10) **and** `daysToEarnings ≤ nearest short dte` (needs a short) | gold                                 | —     | —                                 | tooltip `earningsProximitySummary({ daysToEarnings, expiration: nearest short expiration })`                                                                    |
| `DELTA_FLOOR`       | awareness | `leaps.delta !== null && delta < LEAPS_DELTA_FLOOR` (0.6, _own_)                                                     | gold                                 | —     | —                                 | `LEAPS delta 0.54 below 0.60 — no longer tracking as synthetic stock`                                                                                           |
| `WIDE_SPREAD`       | awareness | `leaps.spread !== null && isWideSpread(leaps.spread)` (shared predicate)                                             | gold                                 | —     | —                                 | `LEAPS spread is 11.5% of the mid — the P&L that depends on it is unreliable`                                                                                   |

`evaluatePmccSignals(input)` → `{ actions: PmccAction[]; awareness: PmccTag[] }` where actions are
sorted by `rank` ascending (stable) and awareness keeps registry order (⚑ δ ⚠).

`PmccAction = { glyph; statusWord; tone; rank; summary; leg: PmccLegRef }` with
`PmccLegRef = { side: 'LONG' } | { side: 'SHORT'; legId: string }`.
`PmccTag = { glyph: '⚑' | 'δ' | '⚠'; name: string; tone: 'gold'; tooltip: string }`.

A closed card never calls the registry (the renderer short-circuits on `closed`).

### 1.8 Renderer display (`src/renderer/src/lib/pmcc-card-display.ts`)

`derivePmccCardDisplay(item, snapshotsBySymbol, quote, { closed, profitTargetDefault })` →
`PmccCardDisplay`, a discriminated union like `WheelCardDisplay`:

- `{ kind: 'closed'; price: null; priceSubline: 'closed'; state: 'Closed'; coverage; legs: ClosedLeg[]; pnl: 'closed — no live marks'; basis; credits }`
- `{ kind: 'neutral'; stateLabel: string (the raw phase); …dashed live figures; no signals }` — for an unrecognised PMCC phase
- `{ kind: 'open'; price; priceSubline: 'Nd to next decision'; state; coverage; legs: OpenLeg[]; pnl: ValuedPmccPnl | 'unavailable — a leg has no mark'; pnlWide: boolean; basis; credits; signals: { actions; awareness }; tier2: Tier2Cell[] }`

`OpenLeg = { legId; tag: 'L' | 'S'; title; contractsSuffix: '' | ' ×3'; expiration; dte: string; dteGold: boolean; dteTooltip: string | null; mark: { mid; wide: boolean } | 'unavailable'; trailing: LeapsTrailing | ShortTrailing; actions: CardAction[] }`
where `LeapsTrailing = { delta: string | '—'; debit: string }` and `ShortTrailing = { target: ProfitTargetHit } | { percentOfMax: string; tone: 'gain' | 'loss' | 'flat' } | 'unavailable'`.

`ValuedPmccPnl = { amount: string; tone: 'gain' | 'loss'; percentLine: '+18.9% of basis' | 'basis not positive' }`.

`basis = { total: string; sub: '$21.20 / share' | 'LEAPS paid for'; paidFor: boolean }`,
`credits = { total: string; sub: '15.2% of LEAPS cost recovered' | '—'; meterFraction: number | null; meterGold: boolean }`.

`Tier2Cell = { label; value; note }` × 7 in the mockup's order.

## 2. Validation rules (from the AC)

- Net P&L renders only when **every** open leg has a usable snapshot (`bid`, `ask`, `mid` numeric,
  `mid ≥ 0`); otherwise `—` / `unavailable — a leg has no mark`. Cost basis and credits never depend
  on a quote.
- The ⚠ on the Net P&L follows the LEAPS mark only; a short's wide spread marks nothing (U8.1).
- `TARGET` on a short leg when `computeUnrealizedPnl({ entryPremium: fillPerShare, currentMid, contracts }).pnlPercent ≥ resolveProfitTarget(item.profitTargetPercent, profitTargetDefault)`; otherwise `N% of max` with one decimal (`88.9% of max`), negative shown with a leading `−`.
- Cost basis ≤ 0 → amount shown as is (`-$40.00`), sub `LEAPS paid for`, gold, never red/green.
- Meter width = `min(1, premiumRecoveredPercent / 100)`, green below 100 %, gold at or above.
- `TARGET` and the DTE gold emphasis never produce an action; awareness tags never produce a strip,
  a leg highlight or an edge.
- Card edge = `actions[0]?.tone`, else the PMCC teal (`CardShell` already does this).
- A LEAPS DTE ≤ 60 is gold with tooltip `Roll window — LEAPS inside the 60-day window`; a short DTE ≤ 7
  is gold with the existing `Expiring soon` tooltip (`isDteUrgent`).
- Sort: `pmccNextDecisionDte(legs)` among the wheel DTEs; closed PMCCs sort in the Closed section.
- A PMCC whose `phase` is not `PMCC_OPEN` renders the neutral card: `PMCC` badge, the raw phase as the
  state label, every live figure `—`, no strip, no tags, no Detail bar.

## 3. State transitions

None owned here. The card renders whatever legs the ledger replay yields; the events that change
them belong to US-104/105/111/115/119/120.

## Type Design

Per `/typescript-advanced-types`: the simplest type that encodes the rule, an advanced construct
only where it removes an illegal state, a drift, or a cast.

| Type                                                                                                                      | File                                                      | Construct                                                                                                        | What it buys                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PmccLegSummary`                                                                                                          | `src/main/schemas.ts`                                     | plain interface with `side: 'LONG' \| 'SHORT'` literal union                                                     | one shape for both legs so a second short is an array entry, not a new field                                                                              |
| `PmccListSummary`                                                                                                         | `src/main/schemas.ts`                                     | `{ legs; cycles; entryDebitPerShare; openedAt; managementWindowDte } & Pick<PmccLedgerResult, …six keys…>`       | the ledger field names cannot drift from `calculatePmccLedger`'s result                                                                                   |
| `PositionListItemBase.nextEarnings`                                                                                       | `src/main/schemas.ts`                                     | plain `string \| null`                                                                                           | —                                                                                                                                                         |
| `PositionOrderInput`                                                                                                      | `src/main/core/position-order.ts`                         | `pmcc?: { legs: readonly Pick<PmccLegSummary, 'side' \| 'dte'>[] } \| null` (structural, no import of schemas)   | the sort reads exactly two fields; the renderer cache insert satisfies it without a cast                                                                  |
| `PmccUnrealizedPnlInput` / `Result`                                                                                       | `src/main/core/costbasis.ts`                              | plain interfaces                                                                                                 | —                                                                                                                                                         |
| `PmccLegRef`                                                                                                              | `src/main/core/pmcc-card.ts`                              | discriminated union on `side` (`{ side: 'LONG' } \| { side: 'SHORT'; legId }`)                                   | a LEAPS ref cannot carry a short's `legId`; a short ref must                                                                                              |
| `PmccSignalDefinition`                                                                                                    | `src/main/core/pmcc-card.ts`                              | discriminated union on `tier`: action entries require `statusWord`, `rank`, `leg`; awareness entries forbid them | an awareness entry cannot be given a lane or a leg, which is how "never produces a strip" is enforced by the type rather than by a runtime filter         |
| `PmccLaneRank`                                                                                                            | `src/main/core/pmcc-card.ts`                              | `0 \| 1 \| 2 \| 3 \| 4 \| 5` literal union                                                                       | matches the `LANE_*` constants in `lib/card-actions.ts`; a `expectTypeOf` test pins `PmccLaneRank` to `LaneRank`                                          |
| `PmccAction`                                                                                                              | `src/main/core/pmcc-card.ts`                              | plain interface, field-compatible with `CardAction` + `leg`                                                      | assignable to the renderer's `CardAction` with no mapping (pinned by `expectTypeOf<PmccAction>().toMatchTypeOf<CardAction>()` in `card-actions.test.ts`)  |
| `CardAction`, `StatusWord`, `LaneRank`                                                                                    | `src/renderer/src/lib/card-actions.ts`                    | widened literal unions (`glyph` gains `'✕' \| '◆'`, `StatusWord` gains two words, `LaneRank` gains `0 \| 3`)     | `ActionStrip`, `LegBlock`, `CardShell` reused unchanged                                                                                                   |
| `ExpirationImminentInput`, `ManagementWindowInput`, `PmccAssignmentRiskInput` (exists), `EarningsProximityInput` (exists) | `src/main/core/alerts.ts`                                 | `Pick<AlertEvaluationInput, …>` slices                                                                           | the exported summary helpers take only what they read (tighten-helper-input-types)                                                                        |
| `PmccCardDisplay`                                                                                                         | `src/renderer/src/lib/pmcc-card-display.ts`               | discriminated union on `kind: 'closed' \| 'neutral' \| 'open'`                                                   | a closed or neutral card cannot carry signals, a TARGET or tier-2 cells (same guard `WheelCardDisplay` uses, with `expectTypeOf(...).not.toExtend` tests) |
| `ShortTrailing`                                                                                                           | `src/renderer/src/lib/pmcc-card-display.ts`               | discriminated union (`target` / `percentOfMax` / `'unavailable'`)                                                | a leg cannot show both the TARGET chip and `N% of max`                                                                                                    |
| `CardShellProps.onClick`                                                                                                  | `src/renderer/src/components/position-card/CardShell.tsx` | optional `(e: MouseEvent) => void`                                                                               | plain; when present it replaces navigate-on-click                                                                                                         |
| `SpreadInput`, `NoBidInput`                                                                                               | `src/shared/option-spread.ts`                             | moved as is                                                                                                      | —                                                                                                                                                         |
