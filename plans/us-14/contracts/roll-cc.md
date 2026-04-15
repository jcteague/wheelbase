# IPC Contract: positions:roll-cc

## Channel

`positions:roll-cc`

## Request Payload (validated by `RollCcPayloadSchema`)

```ts
{
  positionId: string           // UUID — position in CC_OPEN phase
  costToClosePerContract: number   // positive — buy-to-close price
  newPremiumPerContract: number    // positive — sell-to-open price
  newExpiration: string        // YYYY-MM-DD — must be >= current CC expiration
  newStrike?: number           // positive — defaults to current CC strike if omitted
  fillDate?: string            // YYYY-MM-DD — defaults to today
}
```

**Zod schema name:** `RollCcPayloadSchema` in `src/main/schemas.ts`

## Success Response (`{ ok: true, ...RollCcResult }`)

```ts
{
  ok: true
  position: {
    id: string
    ticker: string
    phase: 'CC_OPEN'
    status: 'ACTIVE'
  }
  rollFromLeg: LegRecord // BUY CALL — closes old CC
  rollToLeg: LegRecord // SELL CALL — opens new CC
  rollChainId: string // UUID linking the two legs
  costBasisSnapshot: CostBasisSnapshotRecord
}
```

**TypeScript type name:** `RollCcResult` in `src/main/schemas.ts`

## Error Response

```ts
{
  ok: false
  errors: Array<{ field: string; code: string; message: string }>
}
```

| Field                    | Code                          | Message                                                                      | Trigger                                                           |
| ------------------------ | ----------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `__phase__`              | `invalid_phase`               | `'No open covered call on this position'`                                    | Not CC_OPEN                                                       |
| `newExpiration`          | `must_be_on_or_after_current` | `'New expiration must be on or after the current expiration (MMM DD, YYYY)'` | newExpiration < currentExpiration                                 |
| `__roll__`               | `no_change`                   | `'Roll must change the expiration, strike, or both'`                         | newStrike == currentStrike AND newExpiration == currentExpiration |
| `costToClosePerContract` | `must_be_positive`            | `'Cost to close must be greater than zero'`                                  | <= 0                                                              |
| `newPremiumPerContract`  | `must_be_positive`            | `'New premium must be greater than zero'`                                    | <= 0                                                              |
| `__root__`               | `not_found`                   | `'Position not found'`                                                       | Bad positionId                                                    |
| `__root__`               | `no_active_leg`               | `'Position has no active leg'`                                               | Data integrity issue                                              |

## Renderer API Function

```ts
// src/renderer/src/api/positions.ts

type RollCcPayload = {
  position_id: string
  cost_to_close_per_contract: number
  new_premium_per_contract: number
  new_expiration: string
  new_strike?: number
  fill_date?: string
}

type RollCcResponse = {
  position: { id: string; ticker: string; phase: 'CC_OPEN'; status: 'ACTIVE' }
  rollFromLeg: LegData & {
    legRole: 'ROLL_FROM'
    action: 'BUY'
    fillDate: string
    premiumPerContract: string
  }
  rollToLeg: LegData & {
    legRole: 'ROLL_TO'
    action: 'SELL'
    fillDate: string
    premiumPerContract: string
  }
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

async function rollCc(payload: RollCcPayload): Promise<RollCcResponse>
```

## Preload Bridge

```ts
// src/preload/index.ts
rollCc: (payload: unknown) => invoke('positions:roll-cc', payload)
```

## IPC Error Field Mapping (IPC_TO_FORM_FIELD)

Add to the mapping in `src/renderer/src/api/positions.ts`:

```ts
newExpiration: 'new_expiration',       // already present
newPremiumPerContract: 'new_premium_per_contract'  // already present for CSP; verify coverage
```

No new field mappings needed — all fields mirror the CSP roll mapping.
