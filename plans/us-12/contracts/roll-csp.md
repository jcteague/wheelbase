# IPC Contract: positions:roll-csp

## Channel

`positions:roll-csp`

## Request Payload (Zod schema: `RollCspPayloadSchema`)

```typescript
z.object({
  positionId: z.string().uuid(),
  costToClosePerContract: z.number().positive(),
  newPremiumPerContract: z.number().positive(),
  newExpiration: z.string(), // YYYY-MM-DD
  newStrike: z.number().positive().optional(), // defaults to current strike if omitted
  fillDate: z.string().optional() // YYYY-MM-DD; defaults to today
})
```

## Success Response `{ ok: true, ...RollCspResult }`

```typescript
{
  ok: true,
  position: {
    id: string,
    ticker: string,
    phase: 'CSP_OPEN',
    status: 'ACTIVE',
  },
  rollFromLeg: LegRecord,  // ROLL_FROM BUY leg
  rollToLeg: LegRecord,    // ROLL_TO SELL leg
  rollChainId: string,     // shared UUID
  costBasisSnapshot: CostBasisSnapshotRecord
}
```

## Error Response `{ ok: false, errors: [...] }`

```typescript
{
  ok: false,
  errors: [
    { field: string, code: string, message: string }
  ]
}
```

### Known error codes

| field                    | code                    | message                                               |
| ------------------------ | ----------------------- | ----------------------------------------------------- |
| `__phase__`              | `invalid_phase`         | `Position is not in CSP_OPEN phase`                   |
| `newExpiration`          | `must_be_after_current` | `New expiration must be after the current expiration` |
| `costToClosePerContract` | `must_be_positive`      | `Cost to close must be greater than zero`             |
| `newPremiumPerContract`  | `must_be_positive`      | `New premium must be greater than zero`               |
| `__root__`               | `not_found`             | `Position not found`                                  |
| `__root__`               | `no_active_leg`         | `Position has no active leg`                          |

## Renderer API Adapter

File: `src/renderer/src/api/positions.ts`

```typescript
export type RollCspPayload = {
  position_id: string
  cost_to_close_per_contract: number
  new_premium_per_contract: number
  new_expiration: string
  new_strike?: number
  fill_date?: string
}

export type RollCspResponse = {
  position: { id: string; ticker: string; phase: 'CSP_OPEN'; status: 'ACTIVE' }
  rollFromLeg: LegData & { legRole: 'ROLL_FROM'; action: 'BUY'; fillDate: string }
  rollToLeg: LegData & { legRole: 'ROLL_TO'; action: 'SELL'; fillDate: string }
  rollChainId: string
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

Adapter function maps snake_case payload fields to camelCase IPC fields, using the `IPC_TO_FORM_FIELD` map pattern already established in the file.

## Preload binding

`src/preload/index.ts` — add:

```typescript
rollCsp: (payload: unknown) => invoke('positions:roll-csp', payload)
```
