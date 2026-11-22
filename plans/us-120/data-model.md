# Data Model: US-120 — Close a PMCC by selling the LEAPS

No migration. Every column used exists: `positions.phase` / `status` / `closed_date`,
`legs.fees` (017), `cost_basis_snapshots.final_pnl` (001) and `trigger_event` (004, free TEXT).

## 1. Vocabulary changes (`src/main/core/types.ts`, `src/main/schemas.ts`)

| Name                                                                                                  | Change    | Value                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `WheelPhase` (Zod enum)                                                                               | add       | `'PMCC_CLOSED'` (after `'PMCC_OPEN'`) — Resolved: confirmed by options-expert review, John approved 2026-11-22 |
| `PmccPhase`                                                                                           | widen     | `Extract<WheelPhase, 'PMCC_OPEN' \| 'PMCC_CLOSED'>`                                                            |
| `PmccOpenPhase`                                                                                       | new       | `Extract<PmccPhase, 'PMCC_OPEN'>` — what every PMCC write guard accepts                                        |
| `PmccClosedPhase`                                                                                     | new       | `Extract<PmccPhase, 'PMCC_CLOSED'>` — what `closePmccLeaps` returns (US-111 returns it too)                    |
| `PmccSettlementLegRole`                                                                               | new       | `Extract<PmccLegRole, 'LEAPS_CLOSE'>`                                                                          |
| `PmccBasisLegRole`                                                                                    | new       | `Exclude<PmccLegRole, PmccSettlementLegRole>`                                                                  |
| `isPmccBasisLegRole(role)`                                                                            | new guard | `isPmccLegRole(role) && role !== 'LEAPS_CLOSE'`                                                                |
| `PmccTriggerEvent` (Zod enum)                                                                         | add       | `'PMCC_LEAPS_CLOSED'` — Assumption (pending John)                                                              |
| `PmccTerminalTriggerEvent`                                                                            | new       | `Extract<PmccTriggerEvent, 'PMCC_LEAPS_CLOSED'>` (US-111 widens it)                                            |
| `KNOWN_PMCC_PHASES` (`src/main/pmcc-phase.ts`)                                                        | add       | `PMCC_CLOSED: true` (forced by `Record<PmccPhase, true>`)                                                      |
| Renderer `WheelPhase` mirror (`src/renderer/src/api/positions.ts`)                                    | add       | `'PMCC_CLOSED'`                                                                                                |
| `PHASE_TOKEN` / `PHASE_COLOR` / `PHASE_LABEL` / `PHASE_LABEL_SHORT` (`src/renderer/src/lib/phase.ts`) | add       | `'text-muted'` / its hex / `'PMCC Closed'` / `'Closed'` (forced by `Record<WheelPhase, …>`)                    |

`PMCC_LEAPS_ONLY` is **not** added (research ADR "Terminal phase").

## 2. Engine inputs and outputs

### 2.1 Fill-date floor (`src/main/core/pmcc-rules.ts`)

One shared tie-break for US-115 and US-120. `lastShortRetiredOn(legs)` is US-115's helper in
`src/main/services/pmcc-ledger.ts` (latest `fill_date` of a `SHORT_CALL_EXPIRED` /
`SHORT_CALL_CLOSE` / `SHORT_CALL_ASSIGNED` leg, `null` when none); this story calls it rather
than computing the date again. `pmccFillDateFloor` encodes US-115's comparison
(`previousShortRetiredOn >= leaps.fillDate` → the short binds), and US-115's
`pmccSubsequentShortIssues` floor rows call it too. Whichever story lands first creates both.

```typescript
/** Which earlier event bounds a fill date, and its date. */
export type PmccFillDateFloor =
  | { kind: 'leaps'; date: string } // the held LEAPS' fill (incl. a LEAPS roll's buy)
  | { kind: 'previousShort'; date: string } // lastShortRetiredOn(legs)

/** The later of the two; a tie binds on the short (as US-115). `lastShortRetiredOn` is null with no cycle. */
export function pmccFillDateFloor(input: {
  previousShortRetiredOn: string | null
  leapsFillDate: string
}): PmccFillDateFloor
```

| XYZ Background        | `leapsFillDate`                 | `lastShortRetiredOn` | Floor                                            |
| --------------------- | ------------------------------- | -------------------- | ------------------------------------------------ |
| After cycle 8 expired | `2027-07-09` (LEAPS roll's buy) | `2027-07-16`         | `{ previousShort, 2027-07-16 }`                  |
| LEAPS only            | `2027-06-01`                    | `null`               | `{ leaps, 2027-06-01 }`                          |
| Same day              | `2027-07-16`                    | `2027-07-16`         | `{ previousShort, 2027-07-16 }` (tie, as US-115) |

### 2.2 Rule list (`src/main/core/pmcc-rules.ts`)

```typescript
export type PmccLeapsCloseField = 'salePricePerShare' | 'fees' | 'fillDate'

/** `undefined` = not yet decided (a form field mid-edit); every rule reading it is skipped. */
export interface PmccLeapsCloseValues {
  salePricePerShare: string | undefined
  fees: string | undefined
  fillDate: string | undefined
  floor: PmccFillDateFloor
  /** ISO New York date the fill is judged against. */
  today: string
}

export function pmccLeapsCloseIssues(values: PmccLeapsCloseValues): PmccIssue<PmccLeapsCloseField>[]
```

### 2.3 Lifecycle engine (`src/main/core/lifecycle.ts`)

```typescript
export interface ClosePmccLeapsInput {
  currentPhase: WheelPhase
  /** The open short call, or null when the PMCC holds only its LEAPS. */
  openShort: PmccLegTerms | null
  salePricePerShare: string // 4 dp
  fees: string // 4 dp
  fillDate: string
  floor: PmccFillDateFloor
  today: string
}

export type ClosePmccLeapsAccepted = { phase: PmccClosedPhase }

export function closePmccLeaps(input: ClosePmccLeapsInput): ClosePmccLeapsAccepted
```

### 2.4 Settlement engine (`src/main/core/costbasis.ts`)

```typescript
export interface PmccCloseSettlementInput {
  salePricePerShare: string
  contracts: number // the held LEAPS' contracts
  fees: string
  /** The US-103 ledger's basisTotal before the sale (may be ≤ 0 when credits ≥ LEAPS cost). */
  basisTotal: string
}

export interface PmccCloseSettlement {
  proceeds: string //       sale × 100 × contracts
  settlementCash: string // proceeds − fees
  finalPnl: string //       settlementCash − basisTotal
  /** finalPnl ÷ basisTotal × 100, 4 dp; null when basisTotal ≤ 0. */
  percentOfBasis: string | null
}

export function settlePmccClose(input: PmccCloseSettlementInput): PmccCloseSettlement
```

All `decimal.js`, `ROUND_HALF_UP`, 4 dp via `money4`; throws `RangeError` on a non-finite
input or a contract count that is not a positive integer (same guard as `sharesFromContracts`).

## 3. Rows written by `closePmccPosition` (one `db.transaction`, in this order)

### 3.1 `legs` — the terminal leg

| Column                                | Value                       | XYZ                                      |
| ------------------------------------- | --------------------------- | ---------------------------------------- |
| `leg_role`                            | `'LEAPS_CLOSE'`             |                                          |
| `action`                              | `'SELL'`                    |                                          |
| `instrument_type`                     | `'CALL'`                    |                                          |
| `strike` / `expiration` / `contracts` | `currentLeapsLeg(legs)`'s   | `85.0000` / `2028-01-21` / `1`           |
| `premium_per_contract`, `fill_price`  | `money4(salePricePerShare)` | `24.1000`                                |
| `fill_date`                           | `payload.fillDate ?? today` | `2027-07-19`                             |
| `fees`                                | `money4(payload.fees ?? 0)` | `0.0000` (`0.6500` in the fees scenario) |
| `roll_chain_id`                       | `NULL`                      |                                          |

### 3.2 `positions`

```sql
UPDATE positions
   SET phase = 'PMCC_CLOSED', status = 'CLOSED', closed_date = ?, updated_at = ?
 WHERE id = ?
```

### 3.3 `cost_basis_snapshots` — via `appendPmccSnapshot`, last

| Column                    | Value                                                                | XYZ                                 |
| ------------------------- | -------------------------------------------------------------------- | ----------------------------------- |
| `basis_per_share`         | `pmccLedgerFromLegs(legs).basisPerShare` — **unchanged by the sale** | `8.5000`                            |
| `total_premium_collected` | `.shortCreditsTotal`                                                 | `1400.0000`                         |
| `final_pnl`               | `settlePmccClose(...).finalPnl`                                      | `1560.0000` (`1559.3500` with fees) |
| `trigger_event`           | `'PMCC_LEAPS_CLOSED'`                                                |                                     |
| `snapshot_at`             | `fill_date`                                                          | `2027-07-19`                        |

`appendPmccSnapshot` signature after this story:

```typescript
type AppendPmccSnapshotOptions<T extends PmccTriggerEvent> = {
  triggerEvent: T
  eventDate: string
  now: string
} & (T extends PmccTerminalTriggerEvent ? { finalPnl: string } : { finalPnl?: never })

type AppendedPmccSnapshot<T extends PmccTriggerEvent> = CostBasisSnapshotRecord & {
  triggerEvent: T
  finalPnl: T extends PmccTerminalTriggerEvent ? string : null
}

export function appendPmccSnapshot<T extends PmccTriggerEvent>(
  db: Database.Database,
  positionId: string,
  options: AppendPmccSnapshotOptions<T>
): { snapshot: AppendedPmccSnapshot<T>; ledger: PmccLedgerResult }
```

The existing callers (US-103 / US-104 / US-105 / test seam) pass non-terminal triggers and
compile unchanged; their `finalPnl: null` result types still hold.

## 4. Ledger change (US-103 rule)

| Leg                        | Before                                          | After               |
| -------------------------- | ----------------------------------------------- | ------------------- |
| `LEAPS_CLOSE` `SELL` 24.10 | `{ side: 'LONG', cashPerShare: '-24.1000', … }` | **no contribution** |

- `PMCC_LEG_SIDE: Record<PmccBasisLegRole, PmccLedgerSide>` (drops `LEAPS_CLOSE`).
- `orderedLedgerEvents` / `legContribution` take only `LegWithRole<PmccBasisLegRole>`; `pmccLedgerFromLegs` filters with `isPmccBasisLegRole`.
- Timeline: `PmccTimelineEvent`'s `LEAPS_CLOSE` member becomes `EventBase & Dated & { kind: 'LEAPS_CLOSE'; contract: Fill; fees: string }` — no `contribution`. `applyEvent` appends its `CLOSE` row without touching the contribution prefix. `legEvent` (`src/main/services/pmcc-timeline.ts`) and the `LEAPS_CLOSE` arbitrary (`src/main/core/test-fixtures/arbitraries.ts`) supply `fees` instead of a contribution.

Reads after the XYZ close: `basisPerShare 8.5000`, `basisTotal 850.0000`,
`leapsCostPerShare 22.5000`, `shortCreditsPerShare 14.0000`, `effectiveShareCost 93.5000`,
`premiumRecoveredPercent 62.2222`. Closed surfaces label the figure as the basis at close:
`PmccCostBasis`'s `Cost basis at close / share` and the closed `PmccCard`'s `Cost basis at close`
(open positions keep `Cost basis / share` / `Cost basis`).

## 5. Validation rules (from the acceptance criteria), checked in this order

| #   | Rule                                                         | Field               | Code                   | Message                                                                                                           |
| --- | ------------------------------------------------------------ | ------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Position exists                                              | `__root__`          | `not_found`            | `Position not found`                                                                                              |
| 2   | Strategy is PMCC and phase is `PMCC_OPEN`                    | `__phase__`         | `invalid_phase`        | `Position is not in PMCC_OPEN phase`                                                                              |
| 3   | A LEAPS is held                                              | `__root__`          | `no_active_leg`        | `Position has no active leg` (existing `requirePmccOpenLegs`)                                                     |
| 4   | No short call is open                                        | `__root__`          | `short_call_open`      | `This PMCC has an open short call — selling the LEAPS would leave it naked. Retire or roll the short call first.` |
| 5   | Sale price > 0                                               | `salePricePerShare` | `must_be_positive`     | `Sale price must be greater than zero`                                                                            |
| 6   | Fees ≥ 0                                                     | `fees`              | `must_be_non_negative` | `Fees cannot be negative.`                                                                                        |
| 7a  | Fill date ≥ floor, floor binds on LEAPS (LEAPS bought later) | `fillDate`          | `before_leaps_open`    | `Fill date cannot be before the LEAPS was bought (YYYY-MM-DD)`                                                    |
| 7b  | Fill date ≥ floor, floor binds on short (later, or a tie)    | `fillDate`          | `before_short_retired` | `Fill date cannot be before the last short call was retired (YYYY-MM-DD)`                                         |
| 8   | Fill date ≤ today (New York)                                 | `fillDate`          | `cannot_be_future`     | `Fill date cannot be in the future`                                                                               |

Rules 1 and 3 are the service guards `loadPmccRollContext` / `requirePmccOpenLegs` (reused, not
restated); 2 and 4 are in `closePmccLeaps` (a closed PMCC still has `pmccOpenLegs`, so its
rejection is rule 2's); 5–8 are `pmccLeapsCloseIssues`, shared with the form.

## 6. Renderer view model (`src/renderer/src/lib/pmcc-close-view.ts`)

```typescript
export type ClosePmccLeapsCard = {
  strike: string //            '$85.00'
  expires: string //           '2028-01-21 · 186 DTE'
  bought: string //            '2027-07-09 at $23.50'
  contracts: number //         1
  leapsCost: string //         '$22.50 / share'
  mid: string //               '$24.10 ($23.80 × $24.40)' | '—'
  saleHint: string //          'defaults to the mid · bid $23.80 · ask $24.40' | 'no quote — type your fill'
  delta: string //             '0.81' | '—'
  intrinsicExtrinsic: string // '$18.10 · $6.00' | '—'
}

export type ClosePmccPositionCard = {
  line: string // '8 cycles · $14.00 / share credits realized · 62.2% of LEAPS cost recovered · held since 2026-09-14'
  costBasis: string //          '$8.50 / share ($850.00)'
  effectiveShareCost: string // '$93.50' | '—'
}

/** `null` until a positive sale price is typed. */
export type ClosePmccResultView = {
  cashLine: string //      'Proceeds $2,410.00 · fees $0.00 · cost basis $850.00'
  proceedsLabel: string // 'Proceeds · $24.10 × 100 sh'
  proceeds: string //      '+$2,410.00'
  fees: string //          '−$0.00'
  costBasis: string //     '−$850.00'
  finalPnl: string //      '+$1,560.00' | '−$210.00'
  tone: 'gain' | 'loss'
  percentOfBasis: string | null // '+183.5% of basis'
  reconciliation: string // 'LEAPS cost $22.50 − credits $14.00 = cost basis $8.50 / share · matches the Cost basis drawer'
  /** Non-null only when finalPnl < 0 AND sale < leapsCostPerShare AND shortCreditsPerShare > 0. */
  lossNote: string | null // 'The LEAPS is being sold $16.10 / share below its cost to date; short-call credits of $14.00 recover all but $2.10'
} | null

export type ClosePmccSuccessView = {
  finalPnl: string //  '+$1,560.00'
  tone: 'gain' | 'loss'
  summary: string //   'held 308 days · 8 cycles · 62.2% of LEAPS cost recovered by credits'
  detail: string //    'XYZ $85.00 LEAPS · 2028-01-21 sold to close at $24.10 on 2027-07-19 · cost basis $8.50 / share unchanged'
}
```

Builders: `closePmccLeapsCard`, `closePmccPositionCard`, `closePmccResult` (calls
`settlePmccClose`), `closePmccSuccess`. Every money string via `fmtMoneyGrouped` /
`signedMoneyGrouped` (U+2212 minus); percentages via `fmtPct1`. DTE and days via
`differenceInCalendarDays(parseISO(b), parseISO(a))` from `today`. Intrinsic / extrinsic via
`shortExtrinsic` from `src/main/core/pmcc-card.ts` (`intrinsic = max(0, price − strike)`).

## 7. Reference figures (the story's Background, verified)

| Case                   | Inputs                                    | Proceeds                                  | Fees     | Basis       | Final P&L                      | % of basis                                                          |
| ---------------------- | ----------------------------------------- | ----------------------------------------- | -------- | ----------- | ------------------------------ | ------------------------------------------------------------------- |
| Happy path             | 24.10 × 1, fees 0                         | `2410.0000`                               | `0.0000` | `850.0000`  | `1560.0000`                    | `183.5294`                                                          |
| Fees                   | 24.10 × 1, fees 0.65                      | `2410.0000`                               | `0.6500` | `850.0000`  | `1559.3500`                    | `183.4529`                                                          |
| Losing                 | 6.40 × 1                                  | `640.0000`                                | `0.0000` | `850.0000`  | `-210.0000`                    | `-24.7059`                                                          |
| Losing, no credits     | 15.00 × 1, `LEAPS_ONLY` basis 19.80       | `1500.0000`                               | `0.0000` | `1980.0000` | `-480.0000`                    | `-24.2424` (loss note `null`: credits 0)                            |
| 3 contracts            | 24.10 × 3                                 | `7230.0000`                               | `0.0000` | `2550.0000` | `4680.0000`                    | `183.5294`                                                          |
| No cycles              | 21.00 × 1, basis 19.80                    | `2100.0000`                               | `0.0000` | `1980.0000` | `120.0000`                     | `6.0606`                                                            |
| LEAPS leg alone (trap) | 24.10 − 22.50                             | —                                         | —        | —           | `+$160.00` must **not** appear | —                                                                   |
| Rounding               | 20.0001 × 1, fees 0.0090, basis 2000.0000 | `2000.0100` (settlement cash `2000.0010`) | `0.0090` | `2000.0000` | `0.0010`                       | `0.0001` (0.00005 rounds up; `ROUND_HALF_EVEN` would give `0.0000`) |

Day counts: held 2026-09-14 → 2027-07-19 = **308**; DTE 2027-07-19 → 2028-01-21 = **186**;
recovered 14.00 ÷ 22.50 = **62.2%**; intrinsic 103.10 − 85.00 = **18.10**; extrinsic
24.10 − 18.10 = **6.00**; loss note 22.50 − 6.40 = **16.10**, 210 ÷ 100 = **2.10** (credits $14.00 > 0, so the note shows).

## Type Design

| Type                                                                                         | File                                      | Construct                                                                                                                                                       | What it buys                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PmccPhase` / `PmccOpenPhase` / `PmccClosedPhase`                                            | `src/main/core/types.ts`                  | `Extract<WheelPhase, …>` chain                                                                                                                                  | The terminal phase is a `WheelPhase` value, so `KNOWN_PMCC_PHASES` and the four renderer `Record<WheelPhase, …>` maps fail to compile until they name it; `closePmccLeaps` cannot return an open phase        |
| `PmccSettlementLegRole` / `PmccBasisLegRole`                                                 | `src/main/core/types.ts`                  | `Extract` / `Exclude` over `PmccLegRole`                                                                                                                        | `PMCC_LEG_SIDE: Record<PmccBasisLegRole, …>` cannot map `LEAPS_CLOSE`, and `legContribution` cannot be called with one, so "the sale is folded into the basis" does not type-check                            |
| `PmccTimelineEvent` `LEAPS_CLOSE` member                                                     | `src/main/core/pmcc-timeline-types.ts`    | Union member without `LedgerEventBase`                                                                                                                          | The replay cannot append a sale's contribution — there is none to append                                                                                                                                      |
| `PmccFillDateFloor`                                                                          | `src/main/core/pmcc-rules.ts`             | Discriminated union on `kind` (US-115's type)                                                                                                                   | The message is chosen by `switch (floor.kind)`; "a floor with no reason" is unrepresentable, and an exhaustive switch catches a third bound (US-111). Shared with US-115, so the tie-break lives in one place |
| `PmccLeapsCloseField`                                                                        | `src/main/core/pmcc-rules.ts`             | String-literal union                                                                                                                                            | The renderer's server-error routing (`Record<CloseErrorField, keyof ClosePmccFormValues>`) fails to compile on a missing or misspelled field                                                                  |
| `PmccIssue<PmccLeapsCloseField>`                                                             | `src/main/core/pmcc-rules.ts`             | Existing generic                                                                                                                                                | Engine and form share one issue shape                                                                                                                                                                         |
| `PmccTerminalTriggerEvent`                                                                   | `src/main/schemas.ts`                     | `Extract<PmccTriggerEvent, …>`                                                                                                                                  | Names the triggers that close a PMCC once; US-111 widens it                                                                                                                                                   |
| `AppendPmccSnapshotOptions<T>` / `AppendedPmccSnapshot<T>`                                   | `src/main/services/pmcc-ledger.ts`        | Conditional types over `T extends PmccTerminalTriggerEvent`                                                                                                     | A terminal snapshot without `final_pnl`, or an open-position snapshot with one, does not type-check; the result's `finalPnl` is `string` exactly when terminal, so `ClosePmccPositionResult` needs no cast    |
| `ClosePmccPositionResult`                                                                    | `src/main/schemas.ts`                     | Interface with literal members (`phase: PmccClosedPhase`, `status: 'CLOSED'`, `costBasisSnapshot: … & { triggerEvent: 'PMCC_LEAPS_CLOSED'; finalPnl: string }`) | The renderer's success state reads a non-null final P&L without a fallback                                                                                                                                    |
| `ClosePmccPayload`                                                                           | `src/main/schemas.ts`                     | `z.infer` of `ClosePmccPayloadSchema`                                                                                                                           | The preload typing and the handler share one shape                                                                                                                                                            |
| `PmccCloseSettlement.percentOfBasis`                                                         | `src/main/core/costbasis.ts`              | `string \| null`                                                                                                                                                | "Percent of a non-positive basis" cannot be rendered by accident                                                                                                                                              |
| `ClosePmccResultView`                                                                        | `src/renderer/src/lib/pmcc-close-view.ts` | Object `\| null`                                                                                                                                                | Unpriced → one null check in the component; every figure exists together or not at all                                                                                                                        |
| `ClosePmccLeapsCard`, `ClosePmccPositionCard`, `ClosePmccSuccessView`, `ClosePmccFormValues` | renderer                                  | Plain object types                                                                                                                                              | Plain types — no advanced constructs needed                                                                                                                                                                   |
