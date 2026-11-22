# Contract: positions:close-pmcc

## Purpose

Records that the trader sold a PMCC's LEAPS to close at the broker: writes one `LEAPS_CLOSE`
`SELL` leg, closes the position in `PMCC_CLOSED`, and appends a terminal cost-basis snapshot
carrying the final P&L. Journal only — no broker order is placed. Allowed only when the PMCC
holds its LEAPS and no short call.

## Request

```typescript
// ClosePmccPayloadSchema in src/main/schemas.ts
{
  positionId: string           // PositionIdSchema (UUID)
  salePricePerShare: number    // the fill; money4'd in the service; > 0 checked by the engine
  fillDate?: string            // IsoDateSchema; defaults to today (New York) in the service
  fees?: number                // defaults to 0; money4'd; ≥ 0 checked by the engine
}
```

Registered with `registerParsedPositionHandler(db, 'positions:close-pmcc',
'positions_close_pmcc_unhandled_error', ClosePmccPayloadSchema, (db, id, payload) =>
closePmccPosition(db, id, payload, { today: etDateOf(getCurrentDate()) }))` — thin: one parse,
one service call, inside `handleIpcCall`. `getCurrentDate` is the clock passed to
`registerPositionsHandlers` (`WHEELBASE_FAKE_NOW` in e2e).

Preload: `window.api.closePmcc(payload: ClosePmccPayload): Promise<IpcClosePmccResult>`
(`src/preload/index.ts`, `src/preload/index.d.ts`).

## Response (success)

```typescript
// ClosePmccPositionResult in src/main/schemas.ts
{
  ok: true
  position: {
    id: string
    ticker: string
    phase: 'PMCC_CLOSED'
    status: 'CLOSED'
    closedDate: string                    // = leg.fillDate
  }
  leg: LegRecord                          // legRole 'LEAPS_CLOSE', action 'SELL', fees on this leg
  costBasisSnapshot: CostBasisSnapshotRecord & {
    triggerEvent: 'PMCC_LEAPS_CLOSED'
    finalPnl: string                      // 4 dp, signed
  }
  settlement: PmccCloseSettlement         // { proceeds, settlementCash, finalPnl, percentOfBasis }
  ledger: PmccLedgerResult                // the basis the sale settled against (unchanged by it)
}
```

XYZ, sale 24.10 on 2027-07-19, no fees: `leg.premiumPerContract '24.1000'`,
`costBasisSnapshot.basisPerShare '8.5000'`, `finalPnl '1560.0000'`,
`settlement.proceeds '2410.0000'`, `settlement.percentOfBasis '183.5294'`,
`position.closedDate '2027-07-19'`.

Logging: INFO `pmcc_position_closed` with `{ positionId, ticker, fillDate, finalPnl }`;
INFO `pmcc_close_rejected` with `{ positionId, field, code }` (via `logPmccRollRejection`'s
pattern); DEBUG for the parsed payload, the settlement figures and each transaction step.

## Error codes

| field | code | message | when |
| --- | --- | --- | --- |
| `positionId` | `invalid_format` | Zod's message | not a UUID |
| `salePricePerShare` | `invalid_type` | Zod's message | missing or not a number |
| `fillDate` | `invalid_format` | Zod's message | not `YYYY-MM-DD` |
| `__root__` | `not_found` | `Position not found` | no such position |
| `__phase__` | `invalid_phase` | `Position is not in PMCC_OPEN phase` | a wheel, or a PMCC already `PMCC_CLOSED` |
| `__root__` | `no_active_leg` | `Position has no active leg` | PMCC with no LEAPS (existing `requirePmccOpenLegs`) |
| `__root__` | `short_call_open` | `This PMCC has an open short call — selling the LEAPS would leave it naked. Retire or roll the short call first.` | a short call is open |
| `salePricePerShare` | `must_be_positive` | `Sale price must be greater than zero` | ≤ 0 |
| `fees` | `must_be_non_negative` | `Fees cannot be negative.` | < 0 |
| `fillDate` | `before_leaps_open` | `Fill date cannot be before the LEAPS was bought (2027-06-01)` | before the held LEAPS' fill, which binds |
| `fillDate` | `before_short_retired` | `Fill date cannot be before the last short call was retired (2027-07-16)` | before the last short's terminal fill, which binds |
| `fillDate` | `cannot_be_future` | `Fill date cannot be in the future` | after today (New York) |
| `__root__` | `internal_error` | `An unexpected error occurred` | any other throw (e.g. a storage failure); the transaction rolled back, nothing written |

Every rejection leaves the database unchanged: no leg, no snapshot, position still
`PMCC_OPEN` / `ACTIVE` with `closed_date NULL`.

## Source

- Handler: `src/main/ipc/positions.ts`
- Service: `closePmccPosition` in `src/main/services/close-pmcc-position.ts`
- Engines: `closePmccLeaps` (`src/main/core/lifecycle.ts`), `pmccLeapsCloseIssues` /
  `pmccCloseFillDateFloor` (`src/main/core/pmcc-rules.ts`), `settlePmccClose`
  (`src/main/core/costbasis.ts`)
- Snapshot: `appendPmccSnapshot` (`src/main/services/pmcc-ledger.ts`)
