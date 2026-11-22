# Contract: positions:close-pmcc-short

## Purpose

Records buying a PMCC's open short call back early: one `SHORT_CALL_CLOSE` `BUY` leg at the
entered per-share cost and one `PMCC_SHORT_CLOSED` cost-basis snapshot, in one transaction. The
position stays `PMCC_OPEN` with only its LEAPS open; US-103 recalculates the basis with the
buyback as a short-side debit.

## Request

```typescript
// ClosePmccShortPayloadSchema in src/main/schemas.ts
{
  positionId: string // a UUID
  costToClosePerContract: number // per-share buyback price; bounds checked by the engine
  fillDate?: string // YYYY-MM-DD; defaults to the handler's Eastern `today`
  fees?: number // defaults to 0
}
```

Registered through `registerParsedPositionHandler` with log label
`positions_close_pmcc_short_unhandled_error`; one service call:
`closePmccShortEarlyPosition(db, positionId, payload, { today: etDateOf(getCurrentDate()) })`.
The service converts numbers with `money4` before calling `closePmccShortEarly`.

## Response (success)

```typescript
// ClosePmccShortResult in src/main/schemas.ts (data-model.md § 5)
{
  ok: true
  position: { id: string; phase: 'PMCC_OPEN' }
  leg: LegRecord & { legRole: 'SHORT_CALL_CLOSE'; action: 'BUY' }
  // premiumPerContract = fillPrice = '0.5500', fillDate '2027-04-02', fees '0.0000'
  snapshot: CostBasisSnapshotRecord & { triggerEvent: 'PMCC_SHORT_CLOSED'; finalPnl: null }
  ledger: PmccLedgerWithStrike // basisPerShare '16.9000', effectiveShareCost '96.9000'
  cycle: {
    number: number // 5
    outcome: 'CLOSED'
    netPerShare: string // '1.6500'
    netTotal: string // '165.0000'
    percentOfMax: string | null // '75.0000'; null at cost 3.10 (net below zero: only the loss shows)
    rollCount: number // 0 — the renderer labels the % `of cycle net credit` when > 0
    daysHeld: number // 18
    endedOn: string // '2027-04-02'
  } | null
}
```

Logging: INFO `pmcc_short_closed_early` with `positionId`, `ticker`, `cycleNumber`,
`costToClosePerShare`, `netPerShare`, `netTotal`, `percentOfMax`; DEBUG
`pmcc_short_close_payload`, `pmcc_short_close_computed_net` and the transaction checkpoints. A
rejection logs INFO `pmcc_short_close_rejected` with the field and code.

## Error codes

Rules run in this order; the first failure is returned.

| field                    | code                          | message                                                                                   |
| ------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `positionId`             | `invalid_format`              | Zod's message for a non-UUID id                                                           |
| `costToClosePerContract` | `invalid_type`                | Zod's message for a non-number                                                            |
| `fillDate`               | `invalid_format`              | Zod's message for a non-`YYYY-MM-DD` value                                                |
| `__root__`               | `not_found`                   | `Position not found`                                                                      |
| `__root__`               | `no_active_leg`               | `Position has no active leg` (a `PMCC_OPEN` row with no LEAPS leg; `requirePmccOpenLegs`) |
| `__phase__`              | `invalid_phase`               | `Position is not in PMCC_OPEN phase` (also a wheel position)                              |
| `__root__`               | `no_open_short_call`          | `This PMCC has no open short call to retire.`                                             |
| `costToClosePerContract` | `must_be_positive`            | `Cost to close must be greater than zero`                                                 |
| `fees`                   | `must_not_be_negative`        | `Fees cannot be negative.`                                                                |
| `fillDate`               | `close_date_before_open`      | `Fill date cannot be before the short call was sold (2027-03-15)`                         |
| `fillDate`               | `close_date_after_expiration` | `Fill date cannot be after the expiration (2027-04-16)`                                   |
| `fillDate`               | `cannot_be_future`            | `Fill date cannot be in the future`                                                       |
| `__root__`               | `internal_error`              | `An unexpected error occurred` (storage failure; nothing is written)                      |

The dates in the messages are the open short's own fill date and expiration. A cost above the
cycle's credit is accepted (a losing cycle). Every rejection leaves `legs` and
`cost_basis_snapshots` as they were. The renderer maps `internal_error` to `Could not record the
close. Your entries are preserved. Try again.`

## Source

- Handler: `src/main/ipc/positions.ts`
- Service: `closePmccShortEarlyPosition` in `src/main/services/close-pmcc-short-early-position.ts`;
  `recordPmccShortRetirement`, `retiredCycleFor` in `src/main/services/pmcc-short-retire-record.ts`
- Engine: `closePmccShortEarly` in `src/main/core/lifecycle.ts`; `pmccShortCloseIssues` in
  `src/main/core/pmcc-rules.ts`; `retireCycle` in `src/main/core/pmcc-cycle.ts`
- Preload: `closePmccShortEarly` in `src/preload/index.ts` / `index.d.ts`; renderer adapter
  `closePmccShortEarly` in `src/renderer/src/api/positions.ts`
