# Data Model: US-119 — Retire the PMCC short call — record expiration or close early

No migration. Both actions write one row to `legs` and one row to `cost_basis_snapshots`; the
`positions` row is not touched (research.md ADR "Coverage is derived from open legs"). Money is
`decimal.js`, `ROUND_HALF_UP`, 4-dp strings everywhere in main; rounding to 2 dp happens in the
renderer only.

## 1. Lifecycle engines (`src/main/core/lifecycle.ts`)

Pure, no I/O, no logging. Both reuse `requirePmccOpenPhase`, `PmccShortCallTerms` (strike,
expiration, fillDate) and `throwIssue`; both are generic over the caller's short-leg type so the
service gets its own `PmccShortLeg` back without a cast (as `rollPmccShortCall<S>` does).

```typescript
export interface ExpirePmccShortInput<S extends PmccShortCallTerms = PmccShortCallTerms> {
  currentPhase: WheelPhase
  /** The open short call; `null` when the PMCC holds only its LEAPS. */
  openShort: S | null
  /** The Eastern valuation date; the expiration must be strictly before it. */
  referenceDate: string
}

export interface ExpirePmccShortAccepted<S extends PmccShortCallTerms = PmccShortCallTerms> {
  phase: 'PMCC_OPEN'
  openShort: S
  /** The terminal leg's fill date: always the contract's expiration. */
  fillDate: S['expiration']
}

export interface ClosePmccShortEarlyInput<S extends PmccShortCallTerms = PmccShortCallTerms> {
  currentPhase: WheelPhase
  openShort: S | null
  /** Per-share buyback price, 4-dp string. */
  costToClosePerContract: string
  /** 4-dp string; '0.0000' when the trader entered none. */
  fees: string
  fillDate: string
  /** The Eastern valuation date; the fill date may not be after it. */
  referenceDate: string
}

export interface ClosePmccShortEarlyAccepted<S extends PmccShortCallTerms = PmccShortCallTerms> {
  phase: 'PMCC_OPEN'
  openShort: S
}
```

Rule order, first failure throws `ValidationError(field, code, message)`:

| Engine                | Order                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expirePmccShort`     | phase (`__phase__` / `invalid_phase`) → open short (`__root__` / `no_open_short_call`) → `referenceDate > expiration` (`expiration` / `too_early`)                                              |
| `closePmccShortEarly` | phase → open short → cost > 0 (`requirePositiveDecimal`) → fees ≥ 0 (`fees` / `must_not_be_negative`) → the first `pmccShortCloseIssues` issue (before open → after expiration → in the future) |

## 2. Shared close-early rules (`src/main/core/pmcc-rules.ts`)

```typescript
export interface PmccShortCloseInput {
  openShort: { fillDate: string; expiration: string }
  fillDate: string
  /** Eastern valuation date. */
  today: string
}

export type PmccShortCloseField = Extract<keyof PmccShortCloseInput, 'fillDate'>

/** Fill-date issues in AC order: before the sale, after the expiration, in the future. */
export function pmccShortCloseIssues(input: PmccShortCloseInput): PmccIssue<PmccShortCloseField>[]

export const NO_OPEN_SHORT_TO_RETIRE = {
  code: 'no_open_short_call',
  message: 'This PMCC has no open short call to retire.'
} as const

export const FEES_NOT_NEGATIVE = {
  code: 'must_not_be_negative',
  message: 'Fees cannot be negative.'
} as const

export const expirationNotPassedMessage = (expiration: string): string =>
  `Cannot record expiration until after the expiration date (${expiration})`
```

The renderer's `closePmccShortSchema` (`src/renderer/src/schemas/close-pmcc-short.ts`) calls
`pmccShortCloseIssues` in `superRefine`, so the form and the engine produce identical text.

## 3. The cycle fold (`src/main/core/pmcc-cycle.ts`, new)

Extracted from `src/main/core/pmcc-timeline.ts` (`netDollars` + the per-share division in
`toCycle`; `daysBetween` in `cycleStatus`). Pure.

```typescript
/** A cycle's signed net: received minus paid, fees included; 4-dp strings. */
export type PmccCycleNet = Pick<PmccCycleCommon, 'netPerShare' | 'netTotal'>

/** The two ways this story retires a short call. */
export type PmccRetireOutcome = Extract<PmccShortOutcome, 'EXPIRED' | 'CLOSED'>

/** What a retired cycle netted, in the timeline's own field names. */
export type PmccRetiredCycle<O extends PmccRetireOutcome = PmccRetireOutcome> = Pick<
  PmccCycleCommon,
  'number' | 'netPerShare' | 'netTotal' | 'rollCount'
> &
  Pick<Extract<PmccCycle, { status: 'ENDED' }>, 'endedOn' | 'daysHeld'> & {
    outcome: O
    /** net ÷ max as a 4-dp percent string (e.g. '75.0000'); null when max ≤ 0 or net < 0. */
    percentOfMax: string | null
  }

export function cycleNet(contributions: readonly PmccContribution[], shares: number): PmccCycleNet
export function extendCycleNet(
  net: PmccCycleNet,
  contribution: PmccContribution,
  shares: number
): PmccCycleNet
export function cycleDaysHeld(openedOn: string, endedOn: string): number
export function percentOfMaxCaptured(net: string, max: string): string | null
/** The timeline cycle still holding `openShort` (OPEN or UNRECORDED, current contract equal). */
export function findOpenCycle(
  timeline: PmccTimeline,
  openShort: Pick<PmccShortCallTerms, 'strike' | 'expiration'>
): Extract<PmccCycle, { status: 'OPEN' | 'UNRECORDED' }> | null
export function retireCycle<O extends PmccRetireOutcome>(input: {
  cycle: Pick<PmccCycleCommon, 'number' | 'openedOn' | 'netPerShare' | 'netTotal' | 'rollCount'>
  shares: number
  outcome: O
  endedOn: string
  /** The terminal leg's contribution: zero cash for EXPIRED, the buyback debit + fees for CLOSED. */
  contribution: PmccContribution
}): PmccRetiredCycle<O>
```

Definitions:

- `cycleNet(cs, shares).netTotal` = `−Σ contributionDollars(c)` (positive = credit);
  `netPerShare` = `netTotal ÷ shares`.
- `extendCycleNet(cycleNet(cs), c)` = `cycleNet([...cs, c])` (property, § 8).
- `retireCycle`: `max` = the cycle's pre-retirement `netTotal`; the retired net is
  `extendCycleNet(cycle, contribution)`; `percentOfMax` =
  `percentOfMaxCaptured(retired.netTotal, max)`; `daysHeld` =
  `cycleDaysHeld(cycle.openedOn, endedOn)`; `rollCount` is the cycle's, passed through (the
  renderer picks the `% of …` label from it).
- `percentOfMaxCaptured(net, max)` = `net ÷ max × 100` (4 dp), `null` when `max ≤ 0` or
  `net < 0`: a losing cycle shows only the loss, never a percentage (research.md ADR "Rolled and
  losing cycles in the retire sheets").

## 4. Legs written

| Field                  | `SHORT_CALL_EXPIRED`                           | `SHORT_CALL_CLOSE`                           |
| ---------------------- | ---------------------------------------------- | -------------------------------------------- |
| `leg_role`             | `SHORT_CALL_EXPIRED`                           | `SHORT_CALL_CLOSE`                           |
| `action`               | `EXPIRE`                                       | `BUY`                                        |
| `instrument_type`      | `CALL`                                         | `CALL`                                       |
| `strike`, `expiration` | the open short's                               | the open short's                             |
| `contracts`            | the open short's                               | the open short's (no partial buyback)        |
| `premium_per_contract` | `'0.0000'`                                     | cost to close, 4 dp                          |
| `fill_price`           | `NULL`                                         | cost to close, 4 dp                          |
| `fill_date`            | the open short's `expiration`                  | the entered fill date                        |
| `fees`                 | `'0.0000'`                                     | the entered fees, 4 dp (default 0)           |
| `roll_chain_id`        | `NULL`                                         | `NULL`                                       |
| Snapshot trigger       | `PMCC_SHORT_EXPIRED`, `eventDate` = expiration | `PMCC_SHORT_CLOSED`, `eventDate` = fill date |

The US-103 ledger (`legContribution`): `EXPIRE` → `{ side: 'SHORT', cashPerShare: '0', fees:
'0' }`; `BUY` → `{ side: 'SHORT', cashPerShare: +cost, fees }`. So expiry leaves
`basisPerShare` unchanged, and a buyback raises it by `cost + fees ÷ shares`.

## 5. IPC payloads and results (`src/main/schemas.ts`)

```typescript
export const ExpirePmccShortPayloadSchema = z.object({ positionId: z.uuid() })
export type ExpirePmccShortPayload = z.infer<typeof ExpirePmccShortPayloadSchema>

export const ClosePmccShortPayloadSchema = z.object({
  positionId: z.uuid(),
  /** Per-share buyback price; bounds are the engine's. */
  costToClosePerContract: z.number(),
  fillDate: IsoDateSchema.optional(), // defaults to the service's `today`
  fees: z.number().optional() // defaults to 0
})
export type ClosePmccShortPayload = z.infer<typeof ClosePmccShortPayloadSchema>

type RetirePmccShortResultBase<
  Role extends 'SHORT_CALL_EXPIRED' | 'SHORT_CALL_CLOSE',
  Action extends 'EXPIRE' | 'BUY',
  Trigger extends 'PMCC_SHORT_EXPIRED' | 'PMCC_SHORT_CLOSED',
  Outcome extends PmccRetireOutcome
> = {
  position: { id: string; phase: 'PMCC_OPEN' }
  leg: LegRecord & { legRole: Role; action: Action }
  snapshot: AppendPmccSnapshotResult<Trigger>['snapshot']
  ledger: PmccLedgerWithStrike
  cycle: PmccRetiredCycle<Outcome> | null
}

export type ExpirePmccShortResult = RetirePmccShortResultBase<
  'SHORT_CALL_EXPIRED',
  'EXPIRE',
  'PMCC_SHORT_EXPIRED',
  'EXPIRED'
>
export type ClosePmccShortResult = RetirePmccShortResultBase<
  'SHORT_CALL_CLOSE',
  'BUY',
  'PMCC_SHORT_CLOSED',
  'CLOSED'
>

export const GetStockClosePayloadSchema = z.object({
  ticker: z.string().min(1).max(MAX_TICKER_LENGTH),
  date: IsoDateSchema
})
export type GetStockClosePayload = z.infer<typeof GetStockClosePayloadSchema>
export type StockCloseResult = { close: string | null }
```

`MAX_TICKER_LENGTH` is the bound `TickerListSchema` (the stock-quotes payload) already uses.

## 6. Services

| Function                                                                                      | File                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `expirePmccShortPosition(db, positionId, payload, { today, now? }): ExpirePmccShortResult`    | `src/main/services/expire-pmcc-short-position.ts`      |
| `closePmccShortEarlyPosition(db, positionId, payload, { today, now? }): ClosePmccShortResult` | `src/main/services/close-pmcc-short-early-position.ts` |
| `recordPmccShortRetirement(db, { positionId, leg, triggerEvent, eventDate, now })`            | `src/main/services/pmcc-short-retire-record.ts`        |
| `retiredCycleFor(db, positionId, openShort, outcome, endedOn, contribution, today)`           | `src/main/services/pmcc-short-retire-record.ts`        |
| `fetchStockClose(provider, ticker, date): Promise<StockCloseResult>`                          | `src/main/services/market-data.ts`                     |

`recordPmccShortRetirement` runs `insertLegRow` + `appendPmccSnapshot` inside one
`db.transaction(...)`, so a throw rolls both back. `retiredCycleFor` builds the pre-write
timeline with `getPositionDetail(db, positionId, { valuationDate: today })`, picks
`findOpenCycle`, and calls `retireCycle`; it returns `null` when no cycle matches.

## 7. Renderer display model

| File                                    | What it holds                                                                                                                                                                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/src/lib/pmcc-coverage.ts` | `pmccCoverageLabel({ shortCount, shortContracts, leapsContracts })`: `LEAPS open · no short call` / `LEAPS + short call open` / `LEAPS + short call open · 1 of 3 covered` (US-115's signature; moved from `pmcc-card-display.ts`'s private `stateLabel`) |
| `src/renderer/src/lib/pmcc-retire.ts`   | `isShortExpirationPassed(expiration, valuationDate)`; `pmccCloseAdvisory({ ticker, strike, expiration, close })` → `PmccCloseAdvisory`; `closeEarlyPreview(...)` → `PmccCloseEarlyPreview`; copy builders below                                           |
| `src/renderer/src/lib/pmcc-roll.ts`     | `pmccBasisAfter(ledger, contribution)` extracted from `pmccPostRollEffectiveCost` (US-103's `calculatePmccLedger` with the basis as one LONG contribution); both the roll and retire previews call it                                                     |

```typescript
export type PmccCloseAdvisory =
  | { kind: 'at_or_above_strike'; message: string } // close ≥ strike → AlertBox warning
  | { kind: 'below_strike'; message: string } // close < strike → muted line
  | { kind: 'no_close'; message: 'Confirm with your broker that this call was not assigned' }

export type PmccCloseEarlyPreview = {
  cycle: PmccRetiredCycle<'CLOSED'>
  basisAfter: string
  basisBefore: string
  effectiveAfter: string
  effectiveBefore: string
  losing: boolean // netTotal < 0
}
```

Copy (from the AC and the mockup):

| Builder                                  | Output                                                                                                                                                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retireTitle(ticker, short)`             | `XYZ $112.00 call · 2027-07-16`                                                                                                                                                                                                                |
| `pmccCloseAdvisory` `at_or_above_strike` | `XYZ closed at $114.30 on 2027-07-16, at or above the $112.00 strike — this call may have been assigned. Check with your broker; if it was, record an assignment instead.` (at `112.00`: `XYZ closed at $112.00 on 2027-07-16, at or above …`) |
| `pmccCloseAdvisory` `below_strike`       | `XYZ closed at $104.20 on 2027-07-16 — below the $112.00 strike. Confirm with your broker that this call was not assigned.`                                                                                                                    |
| `shortSoldLine(cycle)`                   | the expiring contract: `$112.00 · 2027-07-16 · sold at $2.40 · 24 days held`; rolled cycle 2: `$112.00 · 2026-12-18 · sold at $2.40` (the `ROLL_TO` sale)                                                                                      |
| `rolledCycleLine(cycle)`                 | rolled only: `opened 2026-10-23 · rolled 1× · cycle net +$1.20 / share`; `null` when `rollCount === 0`                                                                                                                                         |
| `expiredCycleNetLine(cycle)`             | `Cycle 8 net +$2.40 / share (+$240.00) · 100% of max` (whole-percent `fmtPct`); rolled: `Cycle 2 net +$1.20 / share (+$120.00) · 100% of cycle net credit`                                                                                     |
| `closedCycleNetLine(cycle)`              | `+$1.65 / share (+$165.00) · 75.0% of max captured · 18 days held` (`fmtPct1`); rolled: `+$0.90 / share (+$90.00) · 75.0% of cycle net credit captured · 38 days held`; losing: `−$0.90 / share (−$90.00) · 18 days held`                      |
| `previewNetLine(cycle)`                  | `Cycle net +$1.65 / share · 75.0% of max captured`; rolled: `Cycle net +$0.90 / share · 75.0% of cycle net credit captured`; losing: `Cycle net −$0.90 / share (−$90.00)`                                                                      |
| `basisAfterLine(after, before)`          | `Cost basis after: $16.90 / share (from $16.35)`                                                                                                                                                                                               |
| `effectiveAfterLine(after, before)`      | `Effective share cost after: $96.90 (from $96.35)`                                                                                                                                                                                             |
| `leapsContextLine(leaps, dte)`           | `$85.00 · 2028-01-21 · 186 DTE`                                                                                                                                                                                                                |
| `LOSING_CYCLE_NOTE`                      | `Buying back above the credit collected — this cycle nets a loss`                                                                                                                                                                              |
| `percentOfMax` null                      | the `· N% of …` segment is omitted (losing cycle, or max ≤ 0)                                                                                                                                                                                  |

Signs use the app's U+2212 `−` (`signedMoneyGrouped`). The `% of …` label is `of max` /
`of max captured` when `rollCount === 0` (the AC's wording) and `of cycle net credit` / `of cycle
net credit captured` when `rollCount > 0` (research.md ADR "Rolled and losing cycles in the
retire sheets").

## 8. Validation rules from the acceptance criteria

- Expiration requires an open short and `valuationDate > expiration`; the leg's `fill_date` is
  always the contract's expiration, never entered.
- Close-early requires an open short; `cost > 0`; `fees ≥ 0`; `openShort.fillDate ≤ fillDate ≤
expiration`; `fillDate ≤ today`. The expiration bound is reported before the future bound.
- A cost above the credit is valid (a losing cycle); nothing blocks it.
- The closing-price advisory never blocks: Confirm Expiration is enabled whatever `close` is.
- Neither action writes the `positions` row; `pmccOpenLegs.short` is `null` afterwards.
- A retire with no open short writes no leg and no snapshot.

## 9. Reference fixture (US-109's Background, two cut-off points)

The e2e and service tests reuse US-109's XYZ legs (`e2e/pmcc-timeline-helpers.ts` `BACKGROUND`,
`src/main/core/test-fixtures/pmcc-timeline-events.ts`), cut at the day before the outcome being
recorded. 1 contract, fees $0.00.

| Variant        | Valuation date | Legs kept                                                                   | Open short                          | LEAPS            | Basis | Effective |
| -------------- | -------------- | --------------------------------------------------------------------------- | ----------------------------------- | ---------------- | ----- | --------- |
| `atCycle8Open` | 2027-07-19     | all up to and including the 07-09 LEAPS roll; no cycle-8 expiry, no cycle 9 | $112 · 2027-07-16 sold 06-22 @ 2.40 | $85 · 2028-01-21 | 8.50  | 93.50     |
| `atCycle5Open` | 2027-04-02     | all up to cycle 5's sale; no buyback, nothing after                         | $114 · 2027-04-16 sold 03-15 @ 2.20 | $80 · 2027-09-17 | 16.35 | 96.35     |

Expected after the action:

| Action                  | Basis after | Effective after | Cycle net               | % of max      | Days held |
| ----------------------- | ----------- | --------------- | ----------------------- | ------------- | --------- |
| Expire cycle 8          | 8.50        | 93.50           | +2.40 / share (+240.00) | 100           | 24        |
| Buy back cycle 5 @ 0.55 | 16.90       | 96.90           | +1.65 / share (+165.00) | 75.0          | 18        |
| Buy back cycle 5 @ 3.10 | 19.45       | 99.45           | −0.90 / share (−90.00)  | none (losing) | 18        |

Rolled-cycle literal (renderer copy and sheet tests only; no AC uses it): Background cycle 2,
sold $108.00 · 2026-11-20 at 1.80 on 2026-10-23, rolled on 2026-11-06 (buy back 3.00, sell
$112.00 · 2026-12-18 at 2.40), `rollCount` 1, open net +1.20 / share (+120.00). Expired on
2026-12-18: `100% of cycle net credit`, 56 days held. Bought back at 0.30 on 2026-11-30: net
+0.90 / share (+90.00), `75.0% of cycle net credit captured`, 38 days held.

## Type Design

| Type                                                                      | File                                                      | Construct                                                                                                                           | Invariant it protects                                                                                                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExpirePmccShortInput<S>` / `ExpirePmccShortAccepted<S>`                  | `src/main/core/lifecycle.ts`                              | Generic over `S extends PmccShortCallTerms`; the accepted shape narrows `openShort: S \| null` to `S`, `fillDate: S['expiration']`  | The service gets its own `PmccShortLeg` back non-null with no `!` or cast; the terminal fill date cannot be anything but the contract's expiration   |
| `ClosePmccShortEarlyInput<S>` / `ClosePmccShortEarlyAccepted<S>`          | `src/main/core/lifecycle.ts`                              | Same generic narrowing                                                                                                              | As above                                                                                                                                             |
| `PmccShortCloseField`                                                     | `src/main/core/pmcc-rules.ts`                             | `Extract<keyof PmccShortCloseInput, 'fillDate'>` (local to `pmcc-rules.ts`, which `lifecycle.ts` already imports — no import cycle) | A rule's field is a real input key shared by the engine input and the form, so the form routes it to an existing input and a rename breaks the build |
| `PmccRetireOutcome`                                                       | `src/main/core/pmcc-cycle.ts`                             | `Extract<PmccShortOutcome, 'EXPIRED' \| 'CLOSED'>`                                                                                  | This story cannot produce `ASSIGNED` (US-111's), and the labels stay the timeline's                                                                  |
| `PmccCycleNet`                                                            | `src/main/core/pmcc-cycle.ts`                             | `Pick<PmccCycleCommon, 'netPerShare' \| 'netTotal'>`                                                                                | The fold's output is the timeline's own fields; the two cannot drift                                                                                 |
| `PmccRetiredCycle<O>`                                                     | `src/main/core/pmcc-cycle.ts`                             | Intersection of `Pick` slices of `PmccCycleCommon` (incl. `rollCount`) and the `ENDED` arm of `PmccCycle`, plus `outcome: O`        | The success state, the preview and the INFO log carry exactly an ended cycle's fields; an "ended with no `endedOn`" cycle cannot be built            |
| `findOpenCycle` return                                                    | `src/main/core/pmcc-cycle.ts`                             | `Extract<PmccCycle, { status: 'OPEN' \| 'UNRECORDED' }> \| null`                                                                    | An ended cycle can never be retired twice                                                                                                            |
| `RetirePmccShortResultBase<Role, Action, Trigger, Outcome>`               | `src/main/schemas.ts`                                     | Generic base instantiated twice; `snapshot` via `AppendPmccSnapshotResult<Trigger>['snapshot']`                                     | An expiration result cannot carry a `BUY` leg or a `PMCC_SHORT_CLOSED` snapshot; position phase is the literal `'PMCC_OPEN'`                         |
| `ExpirePmccShortPayload`, `ClosePmccShortPayload`, `GetStockClosePayload` | `src/main/schemas.ts`                                     | `z.infer` of their schemas                                                                                                          | The preload, renderer API and handler share one shape                                                                                                |
| `PmccCloseAdvisory`                                                       | `src/renderer/src/lib/pmcc-retire.ts`                     | Discriminated union on `kind`                                                                                                       | The sheet picks the warning `AlertBox` or the muted line by `kind`, never by string matching; `no_close` has its one fixed message                   |
| Retire sheet step                                                         | `ClosePmccShortEarlySheet.tsx`, `PmccExpirationSheet.tsx` | `{ step: 'form' } \| { step: 'success'; result: ExpirePmccShortResult \| ClosePmccShortResult }`                                    | The success view cannot render without a result                                                                                                      |
| `PmccRetireSheet`                                                         | `src/renderer/src/pages/usePositionDetailSheets.ts`       | `'expire' \| 'close' \| null`                                                                                                       | At most one retire sheet open                                                                                                                        |
| `PmccCloseEarlyPreview`, `StockCloseResult`                               | `pmcc-retire.ts`, `schemas.ts`                            | Plain object types                                                                                                                  | Plain types — no advanced constructs needed                                                                                                          |
