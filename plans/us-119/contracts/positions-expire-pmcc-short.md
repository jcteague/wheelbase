# Contract: positions:expire-pmcc-short

## Purpose

Records that a PMCC's open short call expired worthless: one `SHORT_CALL_EXPIRED` leg dated the
contract's expiration and one `PMCC_SHORT_EXPIRED` cost-basis snapshot, in one transaction. The
position stays `PMCC_OPEN` with only its LEAPS open; the cycle's credit moves from open to
realized and the cost basis is unchanged.

## Request

```typescript
// ExpirePmccShortPayloadSchema in src/main/schemas.ts
{
  positionId: string // a UUID
}
```

The handler is registered through `registerParsedPositionHandler` in `src/main/ipc/positions.ts`
with log label `positions_expire_pmcc_short_unhandled_error`, and makes one service call:
`expirePmccShortPosition(db, positionId, payload, { today: etDateOf(getCurrentDate()) })`, using
the same `getCurrentDate` as `positions:get`. There is no date in the payload: the expiration is
fixed to the contract.

## Response (success)

```typescript
// ExpirePmccShortResult in src/main/schemas.ts (data-model.md § 5)
{
  ok: true
  position: { id: string; phase: 'PMCC_OPEN' }
  leg: LegRecord & { legRole: 'SHORT_CALL_EXPIRED'; action: 'EXPIRE' }
  // premiumPerContract '0.0000', fillPrice null, fillDate = the short's expiration, fees '0.0000'
  snapshot: CostBasisSnapshotRecord & { triggerEvent: 'PMCC_SHORT_EXPIRED'; finalPnl: null }
  ledger: PmccLedgerWithStrike // basisPerShare unchanged
  cycle: {
    number: number // 8
    outcome: 'EXPIRED'
    netPerShare: string // '2.4000'
    netTotal: string // '240.0000'
    percentOfMax: string | null // '100.0000'
    daysHeld: number // 24
    endedOn: string // '2027-07-16'
  } | null
}
```

Logging: INFO `pmcc_short_expired` with `positionId`, `ticker`, `cycleNumber`, `netPerShare`,
`netTotal`; DEBUG `pmcc_short_expire_payload` and the transaction checkpoints
(`pmcc_short_retire_leg_inserted`, `pmcc_short_retire_snapshot_appended`). A rejection logs INFO
`pmcc_short_expire_rejected` with the field and code (via `logPmccRollRejection`'s pattern).

## Error codes

| field        | code                  | message                                                                  |
| ------------ | --------------------- | ------------------------------------------------------------------------ |
| `positionId` | `invalid_format`      | Zod's message for a non-UUID id                                          |
| `__root__`   | `not_found`           | `Position not found`                                                     |
| `__root__`   | `no_active_leg`       | `Position has no active leg` (a `PMCC_OPEN` row with no LEAPS leg; `requirePmccOpenLegs`) |
| `__phase__`  | `invalid_phase`       | `Position is not in PMCC_OPEN phase` (also a wheel position)                                   |
| `__root__`   | `no_open_short_call`  | `This PMCC has no open short call to retire.`                            |
| `expiration` | `too_early`           | `Cannot record expiration until after the expiration date (2027-07-16)` |
| `__root__`   | `internal_error`      | `An unexpected error occurred` (storage failure; nothing is written)     |

Every rejection leaves the `legs` and `cost_basis_snapshots` tables as they were.

## Source

- Handler: `src/main/ipc/positions.ts`
- Service: `expirePmccShortPosition` in `src/main/services/expire-pmcc-short-position.ts`;
  `recordPmccShortRetirement`, `retiredCycleFor` in `src/main/services/pmcc-short-retire-record.ts`
- Engine: `expirePmccShort` in `src/main/core/lifecycle.ts`; `retireCycle` in
  `src/main/core/pmcc-cycle.ts`
- Preload: `expirePmccShort` in `src/preload/index.ts` / `index.d.ts`; renderer adapter
  `expirePmccShort` in `src/renderer/src/api/positions.ts`
