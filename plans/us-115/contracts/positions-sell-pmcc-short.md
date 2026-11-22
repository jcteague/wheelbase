# Contract: positions:sell-pmcc-short

## Purpose

Records the next short call against a PMCC's open LEAPS when no short call is open: one
`SHORT_CALL_OPEN` sell leg and one US-103 cost-basis snapshot (`PMCC_SHORT_OPEN`), in one
transaction. The phase stays `PMCC_OPEN`. No broker order is placed.

## Request

```typescript
// SellPmccShortPayloadSchema in src/main/schemas.ts
z.object({
  positionId: PositionIdSchema,
  strike: z.number(),
  expiration: IsoDateSchema,
  /** 1..LEAPS contracts — the range is the engine's rule, not Zod's, so a bypass gets the domain message. */
  contracts: z.number(),
  /** Actual sale price per share. */
  fillPrice: z.number(),
  /** Defaults to the Eastern calendar day of the request. */
  fillDate: IsoDateSchema.optional(),
  /** Total fees for the sale. */
  fees: z.number().default(0)
})
```

Money is wired as numbers and formatted with `money4` in the service, like every other PMCC
channel (`research.md` ADR "Wire money as numbers"). The handler is registered with
`registerParsedPositionHandler` in `src/main/ipc/positions.ts` under the log label
`positions_sell_pmcc_short_unhandled_error`, and makes one service call:

```typescript
sellPmccShortPosition(db, positionId, payload, { today: etDateOf(getCurrentDate()) })
```

The LEAPS terms, the open-short check and the fill-date floor are read from the stored legs
inside the service; nothing about the LEAPS is accepted from the renderer.

Preload: `window.api.sellPmccShort(payload)` → `invoke('positions:sell-pmcc-short', payload)`;
typed in `src/preload/index.d.ts` as `(payload: SellPmccShortPayload) =>
Promise<IpcResult<SellPmccShortResult>>`.

## Response (success)

```typescript
// SellPmccShortResult in src/main/schemas.ts:
// { position; shortLeg; cycleNumber } & AppendPmccSnapshotResult<'PMCC_SHORT_OPEN'>
{
  ok: true
  position: { id: string; ticker: string; phase: 'PMCC_OPEN'; status: 'ACTIVE' }
  /** The leg just written; US-101's type, by indexed access: `CreatePmccPositionResult['shortLeg']`
   *  (`LegRecord & { legRole: 'SHORT_CALL_OPEN'; action: 'SELL'; instrumentType: 'CALL'; fillPrice: string }`). */
  shortLeg: CreatePmccPositionResult['shortLeg']
  /** From `appendPmccSnapshot` — `AppendPmccSnapshotResult<'PMCC_SHORT_OPEN'>['snapshot']`. */
  snapshot: CostBasisSnapshotRecord & { triggerEvent: 'PMCC_SHORT_OPEN'; finalPnl: null }
  /** The US-103 ledger after the sale (equals `projectPmccLedger` over the pre-sale ledger). */
  ledger: PmccLedgerWithStrike
  /** The cycle this short starts: SHORT_CALL_OPEN legs before it + 1. */
  cycleNumber: number
}
```

Example (Background, `$118.00 · 2027-08-20 · $1.95 · 1 contract · fill 2027-07-23`):
`ledger.basisPerShare` `6.5500`, `ledger.effectiveShareCost` `91.5500`,
`ledger.premiumRecoveredPercent` `70.8889`, `cycleNumber` `9`.

Logging: INFO `pmcc_short_call_sold` with `positionId`, `cycleNumber`, `contracts`,
`basisPerShare`; INFO `pmcc_basis_recalculated` from `appendPmccSnapshot`; INFO
`pmcc_sell_short_rejected` with `code` and `field` on a `ValidationError` (through
`logPmccRollRejection`); DEBUG the payload, the comparator inputs (`expiration`,
`leaps.expiration`), the floor dates and the projected basis.

## Error codes

Validation runs before any write; every row below leaves `legs` and `cost_basis_snapshots`
unchanged.

| field        | code                        | message                                                                             |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| `__root__`   | `not_found`                 | `Position not found`                                                                |
| `__phase__`  | `invalid_phase`             | `Position is not in PMCC_OPEN phase`                                                |
| `__root__`   | `no_active_leg`             | `Position has no active leg`                                                        |
| `__root__`   | `short_call_already_open`   | `This PMCC already has an open short call — roll it instead.`                       |
| `contracts`  | `must_be_positive_integer`  | `Contracts must be a positive whole number.`                                        |
| `strike`     | `must_be_positive`          | `Strike must be positive`                                                           |
| `fillPrice`  | `must_be_positive`          | `Actual fill price must be greater than zero.`                                      |
| `fees`       | `must_be_non_negative`      | `Fees cannot be negative.`                                                          |
| `contracts`  | `exceeds_leaps_contracts`   | `Cannot sell more short calls than LEAPS contracts held (N).`                       |
| `fillDate`   | `cannot_be_future`          | `Fill date cannot be in the future.`                                                |
| `fillDate`   | `before_previous_short`     | `Fill date cannot be before the previous short call was retired (YYYY-MM-DD).`      |
| `fillDate`   | `long_after_short`          | `LEAPS must be acquired no later than the short-call fill.`                         |
| `expiration` | `expired_contract`          | `Use an unexpired contract for opening a current position.`                         |
| `expiration` | `expiration_not_after_fill` | `Expiration must be after the fill date.`                                           |
| `expiration` | `short_not_before_long`     | `Short call must expire before the LEAPS call.`                                     |
| `strike`     | `strike_not_above_long`     | `Short-call strike must be above the LEAPS strike.`                                 |
| _(Zod path)_ | _(Zod issue code)_          | _(Zod message)_ — wrong type or a missing required field                            |
| `__root__`   | `internal_error`            | `An unexpected error occurred` — e.g. a storage failure; the transaction rolls back |

`N` is the live LEAPS contract count; `YYYY-MM-DD` is `lastShortRetiredOn(legs)`. Only the first
broken rule is returned (rule order in `data-model.md` § 3). The renderer maps the
`internal_error` envelope to `Could not record the short call. Your entries are preserved. Try
again.`

## Source

- Handler: `src/main/ipc/positions.ts` (`registerParsedPositionHandler`)
- Service: `src/main/services/sell-pmcc-short-position.ts` (`sellPmccShortPosition`)
- Engine: `src/main/core/lifecycle.ts` (`sellPmccShort`), `src/main/core/pmcc-rules.ts`
  (`pmccSubsequentShortIssues`), `src/main/core/costbasis.ts` (`projectPmccLedger`)
- Helpers reused: `loadPmccRollContext`, `logPmccRollRejection`
  (`src/main/services/pmcc-roll-record.ts`); `appendPmccSnapshot`, `lastShortRetiredOn`,
  `nextPmccCycleNumber` (`src/main/services/pmcc-ledger.ts`); `insertLegRow`
  (`src/main/services/leg-rows.ts`)
- Schemas: `SellPmccShortPayloadSchema`, `SellPmccShortResult` (`src/main/schemas.ts`)
- Preload: `src/preload/index.ts`, `src/preload/index.d.ts`; renderer client
  `sellPmccShort` in `src/renderer/src/api/positions.ts`
