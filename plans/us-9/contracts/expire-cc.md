# IPC Contract: positions:expire-cc

## Overview

Records a covered call expiring worthless. Transitions the position from `CC_OPEN` back to `HOLDING_SHARES`. No cost basis snapshot is created.

---

## Channel

```
positions:expire-cc
```

---

## Payload Schema

Defined in `src/main/schemas.ts` as `ExpireCcPayloadSchema`.

```typescript
export const ExpireCcPayloadSchema = z.object({
  positionId: z.string().uuid(),
  expirationDateOverride: z.string().optional() // YYYY-MM-DD; used in tests to bypass today's date
})

export type ExpireCcPayload = z.infer<typeof ExpireCcPayloadSchema>
```

`expirationDateOverride` serves as both `referenceDate` (today) and `recordedDate` (fill_date on the leg) when provided — same dual-use pattern as `ExpireCspPayloadSchema.expirationDateOverride`.

---

## Success Response

```typescript
{ ok: true } & ExpireCcPositionResult

export interface ExpireCcPositionResult {
  position: {
    id: string
    ticker: string
    phase: 'HOLDING_SHARES'
    status: 'ACTIVE'
    closedDate: null
  }
  leg: LegRecord          // the newly inserted EXPIRE/CALL leg
  costBasisSnapshot: CostBasisSnapshotRecord   // latest snapshot (unchanged from CC open)
  sharesHeld: number      // ASSIGN leg.contracts × 100
}
```

---

## Error Response

```typescript
{
  ok: false,
  errors: Array<{ field: string; code: string; message: string }>
}
```

### Known error cases

| Scenario                       | `field`      | `code`           | `message`                                                            |
| ------------------------------ | ------------ | ---------------- | -------------------------------------------------------------------- |
| Position not found             | `__root__`   | `not_found`      | `"Position not found"`                                               |
| Phase is not CC_OPEN           | `__phase__`  | `invalid_phase`  | `"No open covered call on this position"`                            |
| No active CC leg               | `__root__`   | `no_active_leg`  | `"Position has no active leg"`                                       |
| referenceDate < expirationDate | `expiration` | `too_early`      | `"Cannot record expiration before the expiration date (YYYY-MM-DD)"` |
| Zod validation failure         | field name   | zod code         | zod message                                                          |
| Unexpected error               | `__root__`   | `internal_error` | `"An unexpected error occurred"`                                     |

---

## Preload Method

In `src/preload/index.ts`:

```typescript
expireCc: (payload: unknown) => ipcRenderer.invoke('positions:expire-cc', payload)
```

In `src/preload/index.d.ts`, add to the `api` object type:

```typescript
expireCc: (payload: unknown) => Promise<{ ok: boolean; [key: string]: unknown }>
```

---

## Renderer API Adapter

In `src/renderer/src/api/positions.ts`:

```typescript
export type ExpireCcPayload = {
  position_id: string
  expiration_date_override?: string
}

export type ExpireCcResponse = {
  position: {
    id: string
    ticker: string
    phase: 'HOLDING_SHARES'
    status: 'ACTIVE'
    closedDate: null
  }
  leg: LegData & {
    legRole: string
    action: string
    instrumentType: string
    premiumPerContract: string
    fillDate: string
    createdAt: string
    updatedAt: string
  }
  costBasisSnapshot: {
    id: string
    positionId: string
    basisPerShare: string
    totalPremiumCollected: string
    finalPnl: string | null
    snapshotAt: string
    createdAt: string
  }
  sharesHeld: number
}

export async function expireCc(payload: ExpireCcPayload): Promise<ExpireCcResponse> {
  const result = await window.api.expireCc({
    positionId: payload.position_id,
    expirationDateOverride: payload.expiration_date_override
  })
  if (!result.ok) {
    throw apiError(400, { detail: mapIpcErrors(result.errors) })
  }
  return result as unknown as ExpireCcResponse
}
```
