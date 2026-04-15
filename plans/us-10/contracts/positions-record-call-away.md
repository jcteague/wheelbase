# IPC Contract: `positions:record-call-away`

## Overview

Records that the trader's shares were called away at the CC strike, completing the wheel cycle.

- Fill price is **always** the CC strike — derived from the CC_OPEN leg, never entered by the user.
- Fill date is **always** the CC_OPEN leg expiration — derived by the service, not sent in the payload.
- Position transitions `CC_OPEN → WHEEL_COMPLETE` and `ACTIVE → CLOSED`.

---

## Payload Schema

Defined in `src/main/schemas.ts`:

```ts
export const RecordCallAwayPayloadSchema = z.object({
  positionId: z.string().uuid()
})

export type RecordCallAwayPayload = z.infer<typeof RecordCallAwayPayloadSchema>
```

No fill date or fill price in the payload — both are derived by the service from the CC_OPEN leg.

---

## IPC Handler

**Channel:** `positions:record-call-away`

**Registration:** in `src/main/ipc/positions.ts` via `registerPositionsHandlers(db)`:

```ts
ipcMain.handle('positions:record-call-away', (_, payload: unknown) =>
  handleIpcCall('positions_record_call_away_unhandled_error', () => {
    const parsed = RecordCallAwayPayloadSchema.parse(payload)
    return recordCallAwayPosition(db, parsed.positionId, parsed)
  })
)
```

---

## Response Shapes

### Success (`ok: true`)

```ts
export interface RecordCallAwayResult {
  position: {
    id: string
    ticker: string
    phase: 'WHEEL_COMPLETE'
    status: 'CLOSED'
    closedDate: string // ISO date: CC expiration
  }
  leg: LegRecord // CC_CLOSE leg (action: EXERCISE)
  costBasisSnapshot: CostBasisSnapshotRecord & { finalPnl: string }
  finalPnl: string // e.g. "780.0000"
  cycleDays: number // calendar days, position.openedDate → fill_date
  annualizedReturn: string // e.g. "16.7500", or "0.0000" if cycleDays <= 0
  basisPerShare: string // effective cost basis used in the calculation
}
```

### Failure (`ok: false`)

```ts
{
  ok: false,
  errors: [
    {
      field: string,    // '__phase__' | 'contracts' | 'fillDate' | '__root__'
      code: string,     // 'invalid_phase' | 'multi_contract_unsupported' | 'close_date_before_open' | 'not_found' | 'no_cc_open_leg'
      message: string
    }
  ]
}
```

---

## Preload API (`src/preload/index.ts`)

```ts
recordCallAway: (payload: unknown) => ipcRenderer.invoke('positions:record-call-away', payload)
```

---

## Renderer API Adapter (`src/renderer/src/api/positions.ts`)

```ts
export type RecordCallAwayPayload = {
  position_id: string
}

export type RecordCallAwayResponse = {
  position: {
    id: string
    ticker: string
    phase: 'WHEEL_COMPLETE'
    status: 'CLOSED'
    closedDate: string
  }
  leg: LegData & {
    positionId: string
    legRole: string
    action: string
    instrumentType: string
    premiumPerContract: string
    fillPrice: string
    fillDate: string
    createdAt: string
    updatedAt: string
  }
  costBasisSnapshot: ClosedSnapshotData
  finalPnl: string
  cycleDays: number
  annualizedReturn: string
  basisPerShare: string
}

export async function recordCallAway(
  payload: RecordCallAwayPayload
): Promise<RecordCallAwayResponse>
```

---

## Validation Error Mapping

| IPC field   | Renderer field |
| ----------- | -------------- |
| `__phase__` | `__phase__`    |
| `contracts` | `contracts`    |
| `fillDate`  | `fill_date`    |
| `__root__`  | `__root__`     |
