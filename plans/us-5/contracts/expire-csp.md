# IPC Contract: positions:expire-csp

## Channel

`positions:expire-csp`

## Direction

Renderer → Main (via `ipcRenderer.invoke`)

## Request Payload

```typescript
{
  positionId: string              // UUID — required
  expirationDateOverride?: string // YYYY-MM-DD — optional override if actual date differs from recorded
}
```

Zod schema name: `ExpireCspPayloadSchema` in `src/main/schemas.ts`

## Success Response

```typescript
{
  ok: true
  position: {
    id: string
    ticker: string
    phase: 'WHEEL_COMPLETE'
    status: 'CLOSED'
    closedDate: string // YYYY-MM-DD
  }
  leg: {
    id: string
    positionId: string
    legRole: 'EXPIRE'
    action: 'EXPIRE'
    optionType: 'PUT'
    strike: string
    expiration: string
    contracts: number
    premiumPerContract: '0.0000'
    fillDate: string // YYYY-MM-DD (expiration date)
    createdAt: string
    updatedAt: string
  }
  costBasisSnapshot: {
    id: string
    positionId: string
    basisPerShare: string
    totalPremiumCollected: string
    finalPnl: string // equals totalPremiumCollected
    snapshotAt: string
    createdAt: string
  }
}
```

## Error Responses

```typescript
// Position not found
{ ok: false, errors: [{ field: '__root__', code: 'not_found', message: 'Position not found' }] }

// Wrong phase
{ ok: false, errors: [{ field: '__phase__', code: 'invalid_phase', message: 'Position is not in CSP_OPEN phase' }] }

// Too early to expire
{ ok: false, errors: [{ field: 'expiration', code: 'too_early', message: 'Cannot record expiration before the expiration date' }] }

// Unexpected error
{ ok: false, errors: [{ field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }] }
```

## Preload Binding

```typescript
// src/preload/index.ts
expirePosition: (payload: unknown) => ipcRenderer.invoke('positions:expire-csp', payload)
```

## Renderer API Function

```typescript
// src/renderer/src/api/positions.ts
export type ExpireCspPayload = {
  position_id: string
  expiration_date_override?: string
}

export type ExpireCspResponse = {
  position: { id: string; ticker: string; phase: WheelPhase; status: WheelStatus; closedDate: string }
  leg: { id: string; legRole: string; action: string; fillDate: string; ... }
  costBasisSnapshot: { finalPnl: string; totalPremiumCollected: string; ... }
}

export async function expirePosition(payload: ExpireCspPayload): Promise<ExpireCspResponse>
```
