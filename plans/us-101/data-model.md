# Data Model: US-101 — Open a PMCC position with two linked opening legs

Every money value is a `decimal.js` value rounded `ROUND_HALF_UP` to 4 dp and stored as TEXT.
Dates are `YYYY-MM-DD`. "Per share" means per share of the underlying: a $25.00 per-share fill
on one standard contract is $2,500.00.

## 1. Schema change

### Migration `migrations/017_add_leg_fees.sql`

```sql
ALTER TABLE legs ADD COLUMN fees TEXT NOT NULL DEFAULT '0.0000';
```

Total fees for the leg, in dollars, 4 dp, never negative. Every existing leg reads `'0.0000'`.
No other table changes: `positions.strategy_type` already exists, `cost_basis_snapshots` already
has `trigger_event`.

## 2. Enum extensions (`src/main/core/types.ts`, `src/main/schemas.ts`)

| Enum           | Added value       | Meaning                                                           |
| -------------- | ----------------- | ----------------------------------------------------------------- |
| `WheelPhase`   | `PMCC_OPEN`       | LEAPS + short call open. The only PMCC phase this story produces. |
| `LegRole`      | `LEAPS_OPEN`      | The long call, opened `BUY`.                                      |
| `LegRole`      | `SHORT_CALL_OPEN` | The short call, opened `SELL`.                                    |
| `TriggerEvent` | `PMCC_OPEN`       | The opening cost-basis snapshot.                                  |

Reserved by name for later Epic 09 stories, **not added here**: phases `PMCC_LEAPS_ONLY`,
`PMCC_CLOSED`; roles `SHORT_CALL_CLOSE`, `SHORT_CALL_EXPIRED`, `SHORT_CALL_ASSIGNED`, `LEAPS_CLOSE`.

Renderer mirrors: `WheelPhase` in `src/renderer/src/api/positions.ts` gains `'PMCC_OPEN'`;
`PHASE_COLOR.PMCC_OPEN` (a colour distinct from every wheel phase), `PHASE_LABEL.PMCC_OPEN` and
`PHASE_LABEL_SHORT.PMCC_OPEN` both `'LEAPS + short call open'`; `LEG_ROLE_LABEL.LEAPS_OPEN =
'Buy LEAPS call'`, `LEG_ROLE_LABEL.SHORT_CALL_OPEN = 'Sell short call'`.

## 3. Persisted rows written by `createPmccPosition` (one transaction)

### `positions`

| Column                          | Value             |
| ------------------------------- | ----------------- |
| `id`                            | `randomUUID()`    |
| `ticker`                        | payload `ticker`  |
| `strategy_type`                 | `'PMCC'`          |
| `status`                        | `'ACTIVE'`        |
| `phase`                         | `'PMCC_OPEN'`     |
| `opened_date`                   | `long.fillDate`   |
| `thesis`, `notes`, `account_id` | payload or `NULL` |
| `tags`                          | `'[]'`            |

### `legs` — two rows, linked by `position_id` only (not a roll pair; `roll_chain_id` is NULL)

| Column                 | LEAPS row                          | Short row                               |
| ---------------------- | ---------------------------------- | --------------------------------------- |
| `leg_role`             | `'LEAPS_OPEN'`                     | `'SHORT_CALL_OPEN'`                     |
| `action`               | `'BUY'`                            | `'SELL'`                                |
| `instrument_type`      | `'CALL'`                           | `'CALL'`                                |
| `strike`               | `long.strike` (4 dp)               | `short.strike` (4 dp)                   |
| `expiration`           | `long.expiration`                  | `short.expiration`                      |
| `contracts`            | `long.contracts`                   | `short.contracts` (equal by validation) |
| `premium_per_contract` | `long.fillPrice` (per share, 4 dp) | `short.fillPrice` (per share, 4 dp)     |
| `fill_price`           | same as `premium_per_contract`     | same                                    |
| `fill_date`            | `long.fillDate`                    | `short.fillDate`                        |
| `fees`                 | `long.fees` (4 dp)                 | `short.fees` (4 dp)                     |

Insert order: LEAPS then short, same `created_at`, so `GET_LEGS_QUERY` (`fill_date ASC,
created_at ASC`) returns the LEAPS first when the fill dates tie.

### `cost_basis_snapshots` — one row, US-103's ledger convention

| Column                    | Value                                 | Fixture (no fees) | Fixture ($1 + $1 fees) |
| ------------------------- | ------------------------------------- | ----------------- | ---------------------- |
| `trigger_event`           | `'PMCC_OPEN'`                         |                   |                        |
| `basis_per_share`         | `initialNetDebit / (contracts × 100)` | `23.0000`         | `23.0200`              |
| `total_premium_collected` | `shortCredit − short.fees` (dollars)  | `200.0000`        | `199.0000`             |
| `final_pnl`               | `NULL`                                |                   |                        |
| `snapshot_at`             | `makeSnapshotAt(long.fillDate)`       |                   |                        |

## 4. Engine types

### `calculatePmccOpeningDebit` (`src/main/core/costbasis.ts`, pure)

```typescript
export interface PmccOpeningLegInput {
  strike: string // per share
  fillPrice: string // per share
  fees: string // total for the leg, dollars
}
export interface PmccOpeningDebitInput {
  contracts: number
  long: PmccOpeningLegInput
  short: PmccOpeningLegInput
}
export interface PmccOpeningDebitResult {
  leapsCost: string // long.fillPrice × 100 × contracts             → '2500.0000'
  shortCredit: string // short.fillPrice × 100 × contracts            → '200.0000'
  fees: string // long.fees + short.fees                       → '0.0000' | '2.0000'
  initialNetDebit: string // leapsCost − shortCredit + fees               → '2300.0000' | '2302.0000'
  netDebitBeforeFees: string // leapsCost − shortCredit                      → '2300.0000'
  basisPerShare: string // initialNetDebit / (100 × contracts)          → '23.0000' | '23.0200'
  strikeWidthPerShare: string // short.strike − long.strike                   → '30.0000'
  debitToWidthPercent: string | null // (long.fillPrice − short.fillPrice) / strikeWidth × 100, fees excluded → '76.6667'; null when width ≤ 0
}
```

`PmccOpeningLegInput` is a structural subset of `OpenPmccLegInput` below (strike, fill, fees
are the leg's own facts), so the service passes the validated legs through unchanged:
`calculatePmccOpeningDebit({ contracts, long, short })`. The `null` on `debitToWidthPercent`
is reachable only from the renderer preview, which runs before validation; rule 15 makes it
impossible at the service boundary.

Display: money at 2 dp with thousands separators (`$2,300.00`); ratio at 2 dp (`76.67%`).

### `openPmcc` (`src/main/core/lifecycle.ts`, pure)

```typescript
export interface OpenPmccLegInput {
  underlying: string
  instrumentType: OptionInstrumentType // core/types.ts: Extract<InstrumentType, 'PUT' | 'CALL'>
  deliverableShares: number // 100 for a standard contract
  strike: string
  expiration: string
  contracts: number
  fillPrice: string
  fillDate: string
  fees: string
}
export interface OpenPmccInput {
  ticker: string
  long: OpenPmccLegInput
  short: OpenPmccLegInput
  referenceDate: string // today, local calendar date
}
export interface OpenPmccResult {
  phase: 'PMCC_OPEN'
}

/** Every field path `openPmcc` can reject on. `ValidationError.field` stays `string`, but the
 *  per-leg helpers in `openPmcc` take `field: PmccField`, so a misspelled path fails
 *  `pnpm typecheck` instead of landing beside no form field. The renderer schema's
 *  `superRefine` paths are checked against it with `satisfies` (§7). */
export type PmccField = 'ticker' | '__pair__' | `${'long' | 'short'}.${keyof OpenPmccLegInput}`
```

### Validation rules, in the order `openPmcc` checks them

Field paths are dotted and map 1:1 to the payload and to RHF `setError` paths. `L`/`S` means the
rule runs for each leg and reports on that leg's path.

| #   | Rule                                          | Field                                                | Code                        | Message                                                     |
| --- | --------------------------------------------- | ---------------------------------------------------- | --------------------------- | ----------------------------------------------------------- |
| 1   | Ticker matches `^[A-Z]{1,5}$`                 | `ticker`                                             | `invalid_format`            | `Ticker must be 1–5 uppercase letters`                      |
| 2   | Each leg's `underlying` equals `ticker`       | `long.underlying` / `short.underlying`               | `underlying_mismatch`       | `Both calls must have the same underlying.`                 |
| 3   | Each leg is a `CALL`                          | `long.instrumentType` / `short.instrumentType`       | `not_a_call`                | `PMCC entry requires two call options.`                     |
| 4   | Each leg's `deliverableShares === 100`        | `long.deliverableShares` / `short.deliverableShares` | `nonstandard_deliverable`   | `This entry supports standard 100-share contracts only.`    |
| 5   | Each leg's `contracts` is a positive integer  | `long.contracts` / `short.contracts`                 | `must_be_positive_integer`  | `Contracts must be a positive whole number.`                |
| 6   | `long.contracts === short.contracts`          | `short.contracts`                                    | `quantity_mismatch`         | `Opening quantities must match for this PMCC entry.`        |
| 7   | Each strike > 0                               | `long.strike` / `short.strike`                       | `must_be_positive`          | `Strike must be positive`                                   |
| 8   | Each `fillPrice > 0`                          | `long.fillPrice` / `short.fillPrice`                 | `must_be_positive`          | `Actual fill price must be greater than zero.`              |
| 9   | Each `fees ≥ 0`                               | `long.fees` / `short.fees`                           | `must_be_non_negative`      | `Fees cannot be negative.`                                  |
| 10  | Each `fillDate ≤ referenceDate`               | `long.fillDate` / `short.fillDate`                   | `cannot_be_future`          | `Fill date cannot be in the future.`                        |
| 11  | `long.fillDate ≤ short.fillDate`              | `short.fillDate`                                     | `long_after_short`          | `LEAPS must be acquired no later than the short-call fill.` |
| 12  | Each `expiration > fillDate`                  | `long.expiration` / `short.expiration`               | `expiration_not_after_fill` | `Expiration must be after the fill date.`                   |
| 13  | Each `expiration ≥ referenceDate`             | `long.expiration` / `short.expiration`               | `expired_contract`          | `Use an unexpired contract for opening a current position.` |
| 14  | `short.expiration < long.expiration` (strict) | `short.expiration`                                   | `short_not_before_long`     | `Short call must expire before the LEAPS call.`             |
| 15  | `short.strike > long.strike` (strict)         | `short.strike`                                       | `strike_not_above_long`     | `Short-call strike must be above the LEAPS strike.`         |
| 16  | `long.fillPrice − short.fillPrice > 0`        | `__pair__`                                           | `not_net_debit`             | `This PMCC entry requires a net debit before fees.`         |

A missing fill price is a Zod-level rejection (rule 8's precondition): `long.fillPrice` →
`Enter the actual LEAPS fill price.`; `short.fillPrice` → `Enter the actual short-call fill price.`
(code `required`). Both the renderer schema and the payload schema carry these messages.

Boundary-only rules (no form field can produce them; covered by engine tests and e2e calls to
the IPC): 2, 3, 4, 6.

## 5. IPC payload (`src/main/schemas.ts`)

```typescript
const PmccLegPayloadSchema = z.object({
  underlying: z.string(),
  instrumentType: z.enum(['PUT', 'CALL']),
  deliverableShares: z.number(), // no .int(): rule 4 (=== 100) is the engine's, like rules 5–9
  strike: z.number(),
  expiration: z.string().regex(IsoDateRegex, IsoDateMessage),
  contracts: z.number(),
  fillPrice: z.number({ error: '<leg message, see §4>' }),
  fillDate: z.string().regex(IsoDateRegex, IsoDateMessage),
  fees: z.number()
})

export const CreatePmccPositionPayloadSchema = z.object({
  strategy: z.literal('PMCC'),
  ticker: z.string(),
  long: PmccLegPayloadSchema,
  short: PmccLegPayloadSchema,
  accountId: z.string().optional(),
  thesis: z.string().optional(),
  notes: z.string().optional()
})
export type CreatePmccPositionPayload = z.infer<typeof CreatePmccPositionPayloadSchema>

// The invariants live in the type, as OpenCcPositionResult / AssignCspPositionResult and the
// existing `CostBasisSnapshotRecord & { finalPnl: string }` already do — not in comments.
export interface CreatePmccPositionResult {
  position: PositionRecord & {
    strategyType: 'PMCC'
    phase: 'PMCC_OPEN'
    status: 'ACTIVE'
    closedDate: null
  }
  longLeg: LegRecord & {
    legRole: 'LEAPS_OPEN'
    action: 'BUY'
    instrumentType: 'CALL'
    fillPrice: string // LegRecord.fillPrice is string | null; both PMCC legs always carry a fill
  }
  shortLeg: LegRecord & {
    legRole: 'SHORT_CALL_OPEN'
    action: 'SELL'
    instrumentType: 'CALL'
    fillPrice: string
  }
  costBasisSnapshot: CostBasisSnapshotRecord & { triggerEvent: 'PMCC_OPEN'; finalPnl: null }
  openingDebit: PmccOpeningDebitResult
}
```

Numeric bounds (positive, integer, non-negative) are deliberately **not** in Zod: the engine owns
those messages (rules 4–9) so the renderer sees one code per rule. Zod only guards shape and the
required fill price. `LegRecord` gains `fees: string`.

`strategy: z.literal('PMCC')` is redundant on a PMCC-only channel. It stays so a later
`z.discriminatedUnion('strategy', …)` can merge the two create payloads without a wire change.

The preload mirror `IpcCreatePmccPositionResult` carries the same literals (`phase: 'PMCC_OPEN'`,
`legRole: 'LEAPS_OPEN'`, …) as `IpcRollCspResult` does with `phase: 'CSP_OPEN'`, not the loose
`string` of `IpcPositionRecord`.

## 6. List item (`PositionListItem`, `positions:list`)

```typescript
export interface PmccLegSummary {
  strike: string // 4 dp
  expiration: string
  dte: number // computeDte(expiration); never null — the expiration passed Zod's ISO regex and rules 12–14 before it was stored
  contracts: number
}
export interface PmccListSummary {
  long: PmccLegSummary
  short: PmccLegSummary
  initialNetDebit: string // dollars, 4 dp, from the PMCC_OPEN snapshot: basis_per_share × 100 × contracts
}

// PositionListItem becomes a discriminated union on strategyType — the IpcIvRankPair pattern.
// Exactly one arm carries a summary, and the wheel-only fields are *typed* null on the PMCC arm
// rather than documented as null.
interface PositionListItemBase {
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
  premiumCollected: string
  effectiveCostBasis: string
  profitTargetPercent: number | null
}
export interface WheelListItem extends PositionListItemBase {
  strategyType: 'WHEEL'
  pmcc: null
  strike: string | null
  expiration: string | null
  dte: number | null
  instrumentType: OptionInstrumentType | null
  contracts: number | null
  entryPremiumPerContract: string | null
}
export interface PmccListItem extends PositionListItemBase {
  strategyType: 'PMCC'
  pmcc: PmccListSummary
  strike: null
  expiration: null
  dte: null
  instrumentType: null
  contracts: null
  entryPremiumPerContract: null
}
export type PositionListItem = WheelListItem | PmccListItem
```

Every existing consumer keeps compiling: the wheel fields exist on both arms with the same or a
narrower type, and `premiumCollected` / `effectiveCostBasis` carry the snapshot values as today.
`listPositions` builds the arms with `toWheelItem` / `toPmccItem`; `PositionCard` narrows on
`strategyType === 'PMCC'` and reads `item.pmcc` without a null check. Existing test fixtures that
build a `PositionListItem` literal gain `strategyType: 'WHEEL', pmcc: null`. Sort order is
unchanged (`dte === null` sorts last, so PMCC rows sit after wheel rows — acceptable for the
minimal row; US-108 owns the card ordering).

The preload `IpcPositionListItem` and the renderer `PositionListItem` (`api/positions.ts`) carry
the same union; the renderer's `listPositions` mapper branches once on `strategyType`.

## 7. Renderer form model (`src/renderer/src/schemas/pmcc-entry.ts`)

```typescript
const pmccLegSchema = z.object({
  contractId: z.string().optional(), // OCC symbol when picked from the chain; absent for manual entry
  strike: positiveMoneySchema, // 'Strike must be positive'
  expiration: isoDateSchema,
  fillPrice: z.string().min(1, '<leg required message>').pipe(positiveFillSchema), // 'Actual fill price must be greater than zero.'
  fees: nonNegativeMoneySchema, // 'Fees cannot be negative.'
  fillDate: isoDateSchema
})
export const pmccEntrySchema = z
  .object({
    ticker: tickerSchema,
    contracts: positiveWholeSchema, // 'Contracts must be a positive whole number.'
    long: pmccLegSchema,
    short: pmccLegSchema,
    thesis: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(5_000).optional()
  })
  .superRefine(crossLegRules) // rules 10–16 of §4 with the same messages and paths
export type PmccEntryFormValues = z.infer<typeof pmccEntrySchema>

// The paths crossLegRules reports on, pinned to the engine's field set.
const CROSS_LEG_PATHS = [
  'long.fillDate',
  'short.fillDate', // rules 10, 11
  'long.expiration',
  'short.expiration', // rules 12–14
  'short.strike', // rule 15
  '__pair__' // rule 16
] as const satisfies readonly PmccField[]
```

Defaults (`fees: '0.00'`, `fillDate: today`) live in `EMPTY_PMCC_DEFAULTS(today)` and are passed
as `useForm`'s `defaultValues` — never as `.default()` on the schema, which would split
`z.input` from `z.output` and force the three-generic `useForm`. The schema has no transforms
either, so `PmccEntryFormValues` is both the input and the output type.

`toCreatePmccPayload(values)` maps to §5: `underlying: values.ticker`, `instrumentType: 'CALL'`,
`deliverableShares: 100`, `contracts` on both legs from the shared field, numbers parsed with
`parseInputDecimal`. IPC errors on `long.contracts`/`short.contracts` are shown on the shared
`contracts` field; `__pair__` errors render above the cash-flows block.

## 8. Contract picker view model (`src/renderer/src/lib/pmcc-entry.ts`, pure)

```typescript
export type LegPreset = { dteMin: number; dteMax: number | null; deltaMin: string; deltaMax: string; side: 'below' | 'above' }
export const LEAPS_PRESET: LegPreset = { dteMin: 180, dteMax: null, deltaMin: '0.70', deltaMax: '0.85', side: 'below' }
export const SHORT_PRESET: LegPreset = { dteMin: 20, dteMax: 45, deltaMin: '0.25', deltaMax: '0.35', side: 'above' }

// A kind, not the copy — the PromoteBanner / promoteBannerMessage pattern in lib/promote.ts.
// Copy changes stay copy changes, and tests assert on the kind.
export type ChainNotice = 'loading' | 'empty' | 'unavailable' | 'stale' | null
export const CHAIN_NOTICE_COPY: Record<NonNullable<ChainNotice>, string> = {
  loading: 'Loading call contracts…',
  empty: 'No matching calls. Adjust filters or enter manually.',
  unavailable: 'Quotes unavailable. Enter your filled trade manually.',
  stale: 'Quote is stale. Verify against your actual fill.'
}
export function chainNoticeMessage(notice: ChainNotice): string | null

// What a chain pick writes into a leg; null = "Enter manually".
export type ContractSelection = { contractId: string; strike: string; expiration: string }

export const STALE_QUOTE_MS = 5 * 60 * 1000

filterCallChain(quotes: OptionChainQuote[], preset: LegPreset): OptionChainQuote[]
  // keeps delta within [deltaMin, deltaMax] (absolute value); contracts without greeks appended after, so they are selectable
deriveChainNotice(input: { status: 'pending' | 'error' | 'success'; contracts: OptionChainQuote[]; selected?: OptionChainQuote; now: Date }): ChainNotice
  // priority: pending → 'loading'; error → 'unavailable'; no contracts → 'empty'; selected.timestamp older than STALE_QUOTE_MS → 'stale'; else null
chainWindow(preset: LegPreset, today: Date): { expirationFrom: string; expirationTo?: string }
strikeBounds(preset: LegPreset, underlyingPrice: string | null): { strikeFrom?: string; strikeTo?: string }
formatContractOption(q: OptionChainQuote, today: Date): string   // 'Sep 17, 2027 · $80.00 · 368 DTE · Δ 0.80 · mid $25.00'
```

Selecting a contract calls `onSelect(selection: ContractSelection | null)`; a selection writes
`strike`, `expiration`, `contractId` into the leg's form values, `null` (`Enter manually`) clears
`contractId`. Fill price, fees and fill date are never written by a
selection or a refetch.

## 9. State transitions

| From              | Event                       | To                | Owner      |
| ----------------- | --------------------------- | ----------------- | ---------- |
| (none)            | `positions:create-pmcc`     | `PMCC_OPEN`       | this story |
| `PMCC_OPEN`       | short expires / bought back | `PMCC_LEAPS_ONLY` | US-119     |
| `PMCC_LEAPS_ONLY` | sell next short             | `PMCC_OPEN`       | US-115     |
| `PMCC_OPEN`       | assignment settled          | `PMCC_CLOSED`     | US-111     |
| `PMCC_LEAPS_ONLY` | LEAPS sold                  | `PMCC_CLOSED`     | US-120     |

Wheel-only consumers and the value they see for a `PMCC_OPEN` position: `activeLegSubquery()` →
no row; `evaluate-alerts` → not selected; `detect-assignments` → not selected;
`PositionDetailActions` → badge only; calendar → skipped (`expiration` null on the list item).

## 10. Pre-existing type debt this story widens (not fixed here)

- Preload `IpcPositionListItem.phase` and `IpcPositionRecord.phase` are `string`; the renderer
  casts with `as WheelPhase`. Adding `PMCC_OPEN` widens what the cast admits. The new PMCC
  mirrors use literals; the old loose mirrors stay as they are.
- `get-position.ts` casts `trigger_event as CostBasisSnapshotRecord['triggerEvent']` unchecked;
  `PMCC_OPEN` joins the union the cast asserts.

## 11. Fixture (Background of the AC)

| Item                    | Value                                                                             |
| ----------------------- | --------------------------------------------------------------------------------- |
| Valuation / fill date   | 2026-09-14                                                                        |
| Underlying              | XYZ at $100.00                                                                    |
| LEAPS                   | XYZ $80 call, exp 2027-09-17, fill $25.00, Δ 0.80, bid 24.80 / ask 25.20, 368 DTE |
| Short                   | XYZ $110 call, exp 2026-10-16, fill $2.00, Δ 0.30, bid 1.90 / ask 2.10, 32 DTE    |
| OCC symbols             | `XYZ270917C00080000`, `XYZ261016C00110000`                                        |
| Cash flows              | $2,500.00 / $200.00 / $0.00 → $2,300.00; width $30.00; 76.67%                     |
| With $1.00 fees per leg | $2,302.00; ratio still 76.67%; basis/share $23.02                                 |

In e2e the dates are generated relative to the run date (`localDate(368)`, `localDate(32)`) so
the DTE labels hold; the money figures are date-independent.
