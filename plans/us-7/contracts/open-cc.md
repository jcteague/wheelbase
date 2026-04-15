# IPC Contract: `positions:open-cc`

## Channel

`positions:open-cc`

## Input Schema (Zod)

Defined in `src/main/schemas.ts` as `OpenCcPayloadSchema`:

```typescript
export const OpenCcPayloadSchema = z.object({
  positionId: z.string().uuid(),
  strike: z.number().positive(),
  expiration: z.string(),
  contracts: z.number().int().positive(),
  premiumPerContract: z.number().positive(),
  fillDate: z.string().optional()
})
```

## Response Shape

### Success (`ok: true`)

```typescript
{
  ok: true,
  position: {
    id: string,
    ticker: string,
    phase: 'CC_OPEN',
    status: 'ACTIVE',
    closedDate: null
  },
  leg: {
    id: string,
    positionId: string,
    legRole: 'CC_OPEN',
    action: 'SELL',
    instrumentType: 'CALL',
    strike: string,        // e.g. "182.0000"
    expiration: string,    // e.g. "2026-02-21"
    contracts: number,
    premiumPerContract: string,  // e.g. "2.3000"
    fillPrice: null,
    fillDate: string,
    createdAt: string,
    updatedAt: string
  },
  costBasisSnapshot: {
    id: string,
    positionId: string,
    basisPerShare: string,           // e.g. "174.2000"
    totalPremiumCollected: string,   // e.g. "460.0000"
    finalPnl: null,
    snapshotAt: string,
    createdAt: string
  }
}
```

### Error (`ok: false`)

```typescript
{
  ok: false,
  errors: [
    { field: string, code: string, message: string }
  ]
}
```

**Known error codes:**

| field                | code                | message                                                                                        |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| `__phase__`          | `invalid_phase`     | "Position is not in HOLDING_SHARES phase" or "A covered call is already open on this position" |
| `contracts`          | `exceeds_shares`    | "Contracts cannot exceed shares held ({n})"                                                    |
| `fillDate`           | `before_assignment` | "Fill date cannot be before the assignment date"                                               |
| `fillDate`           | `cannot_be_future`  | "Fill date cannot be in the future"                                                            |
| `strike`             | `must_be_positive`  | "Strike must be positive"                                                                      |
| `premiumPerContract` | `must_be_positive`  | "Premium per contract must be positive"                                                        |

## Preload Binding

```typescript
openCoveredCall: (payload: unknown) => ipcRenderer.invoke('positions:open-cc', payload)
```

## Renderer API Function

```typescript
export type OpenCcPayload = {
  position_id: string
  strike: number
  expiration: string
  contracts: number
  premium_per_contract: number
  fill_date?: string
}

export type OpenCcResponse = {
  position: PositionData
  leg: LegData & {
    positionId: string
    legRole: string
    action: string
    instrumentType: string
    premiumPerContract: string
    fillPrice: null
    fillDate: string
    createdAt: string
    updatedAt: string
  }
  costBasisSnapshot: {
    id: string
    positionId: string
    basisPerShare: string
    totalPremiumCollected: string
    finalPnl: null
    snapshotAt: string
    createdAt: string
  }
}
```
