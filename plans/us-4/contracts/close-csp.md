# IPC Contract: Close CSP Position

> In Electron, there is no HTTP API. All communication uses `ipcMain.handle` / `ipcRenderer.invoke`.
> These contracts define the IPC channel names, payload shapes, and response shapes.

---

## Channel: `positions:get`

Fetch full detail for a single position (needed to hydrate the detail page and close form).

### Request payload

```typescript
// Passed as second argument to ipcRenderer.invoke('positions:get', payload)
{
  positionId: string   // UUID
}
```

### Success response

```typescript
{
  ok: true,
  position: {
    id: string
    ticker: string
    phase: WheelPhase
    status: WheelStatus
    openedDate: string        // ISO date
    closedDate: string | null
  },
  activeLeg: {
    id: string
    legRole: string           // 'CSP_OPEN' | 'CC_OPEN'
    action: string
    optionType: string
    strike: string            // 4 dp TEXT
    expiration: string        // ISO date
    contracts: number
    premiumPerContract: string // 4 dp TEXT
    fillDate: string          // ISO date
  } | null,
  costBasisSnapshot: {
    id: string
    basisPerShare: string           // 4 dp TEXT
    totalPremiumCollected: string   // 4 dp TEXT
    finalPnl: string | null         // 4 dp TEXT, set on close
  } | null
}
```

### Error responses

```typescript
// Position not found
{ ok: false, errors: [{ field: '__root__', code: 'not_found', message: 'Position not found' }] }

// Internal error
{ ok: false, errors: [{ field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }] }
```

---

## Channel: `positions:close-csp`

Close a CSP position early (buy to close).

### Request payload

```typescript
// Passed as second argument to ipcRenderer.invoke('positions:close-csp', payload)
{
  positionId: string                 // UUID — required
  closePricePerContract: number      // positive number — required
  fillDate?: string                  // ISO date (YYYY-MM-DD) — defaults to today
}
```

### Success response

```typescript
{
  ok: true,
  position: {
    id: string
    ticker: string
    phase: 'CSP_CLOSED_PROFIT' | 'CSP_CLOSED_LOSS'
    status: 'CLOSED'
    closedDate: string    // ISO date
  },
  leg: {
    id: string
    legRole: 'CSP_CLOSE'
    action: 'BUY'
    optionType: 'PUT'
    strike: string        // 4 dp TEXT
    expiration: string    // ISO date
    contracts: number
    premiumPerContract: string  // 4 dp TEXT (= close price)
    fillDate: string            // ISO date
  },
  costBasisSnapshot: {
    id: string
    basisPerShare: string             // 4 dp TEXT
    totalPremiumCollected: string     // 4 dp TEXT
    finalPnl: string                  // 4 dp TEXT
  }
}
```

### Validation error response

```typescript
{
  ok: false,
  errors: [
    {
      field: '__phase__' | 'closePricePerContract' | 'fillDate',
      code: 'invalid_phase' | 'must_be_positive' | 'close_date_before_open' | 'close_date_after_expiration',
      message: string
    }
  ]
}
```

### Internal error response

```typescript
{ ok: false, errors: [{ field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }] }
```

---

## Renderer API adapter mapping (snake_case ↔ camelCase)

### `getPosition(positionId: string)`

| IPC field (camelCase)              | Renderer field (snake_case)               |
|------------------------------------|-------------------------------------------|
| `activeLeg.premiumPerContract`     | `active_leg.premium_per_contract`         |
| `activeLeg.fillDate`               | `active_leg.fill_date`                    |
| `activeLeg.legRole`                | `active_leg.leg_role`                     |
| `activeLeg.optionType`             | `active_leg.option_type`                  |
| `costBasisSnapshot.basisPerShare`  | `cost_basis_snapshot.basis_per_share`     |
| `costBasisSnapshot.totalPremiumCollected` | `cost_basis_snapshot.total_premium_collected` |
| `costBasisSnapshot.finalPnl`       | `cost_basis_snapshot.final_pnl`           |
| `position.openedDate`              | `position.opened_date`                    |
| `position.closedDate`              | `position.closed_date`                    |

### `closePosition(payload: CloseCspPayload)`

| Renderer field (snake_case)         | IPC field (camelCase)            |
|-------------------------------------|----------------------------------|
| `position_id`                       | `positionId`                     |
| `close_price_per_contract`          | `closePricePerContract`          |
| `fill_date`                         | `fillDate`                       |

Error field mapping (IPC → form):
| IPC field              | Form field                      |
|------------------------|---------------------------------|
| `closePricePerContract`| `close_price_per_contract`      |
| `fillDate`             | `fill_date`                     |
