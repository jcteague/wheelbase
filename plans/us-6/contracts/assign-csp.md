# IPC Contract: positions:assign-csp

---

## Channel

`positions:assign-csp`

Registered in `src/main/ipc/positions.ts` via `ipcMain.handle`.
Exposed in `src/preload/index.ts` as `window.api.assignPosition(payload)`.

---

## Payload (Main Process — validated via Zod)

```typescript
// Schema: AssignCspPayloadSchema in src/main/schemas.ts
{
  positionId: string    // UUID — the position to assign
  assignmentDate: string // ISO date string YYYY-MM-DD
}
```

The IPC handler calls `AssignCspPayloadSchema.parse(payload)` before dispatching to the service.

---

## Success Response

```typescript
{
  ok: true
  position: {
    id: string
    ticker: string
    phase: 'HOLDING_SHARES'
    status: 'ACTIVE'
  }
  leg: {
    id: string
    positionId: string
    legRole: 'ASSIGN'
    action: 'ASSIGN'
    instrumentType: 'STOCK'
    strike: string
    expiration: string
    contracts: number
    premiumPerContract: '0.0000'
    fillPrice: null
    fillDate: string        // the assignmentDate from payload
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
  premiumWaterfall: Array<{
    label: string    // e.g. "CSP premium", "Roll credit"
    amount: string   // premiumPerContract for that leg (per-share, 4dp)
  }>
}
```

---

## Error Response

```typescript
{
  ok: false
  errors: Array<{
    field: string
    code: string
    message: string
  }>
}
```

### Error cases

| `field`         | `code`           | Trigger                                               |
|-----------------|------------------|-------------------------------------------------------|
| `__root__`      | `not_found`      | Position does not exist                               |
| `__root__`      | `no_active_leg`  | Position has no active CSP leg                        |
| `__phase__`     | `invalid_phase`  | Position is not in `CSP_OPEN` phase                   |
| `assignmentDate`| `date_before_open` | assignmentDate is before the CSP open fill date     |
| `__root__`      | `internal_error` | Unexpected error (logged server-side)                 |

Note: future `assignmentDate` is NOT an error — the backend accepts it without complaint.

---

## Renderer-side Adapter (`src/renderer/src/api/positions.ts`)

```typescript
// Renderer payload type (snake_case form fields)
type AssignCspPayload = {
  position_id: string
  assignment_date: string
}

// Response type
type AssignCspResponse = {
  position: { id: string; ticker: string; phase: WheelPhase; status: WheelStatus }
  leg: { ... }
  costBasisSnapshot: { ... }
  premiumWaterfall: Array<{ label: string; amount: string }>
}

// Adapter function
async function assignPosition(payload: AssignCspPayload): Promise<AssignCspResponse> {
  const result = await window.api.assignPosition({
    positionId: payload.position_id,
    assignmentDate: payload.assignment_date
  })
  if (!result.ok) {
    throw apiError(400, { detail: mapIpcErrors(result.errors) })
  }
  return result as unknown as AssignCspResponse
}
```

IPC field → form field mapping to add to `IPC_TO_FORM_FIELD`:
```typescript
assignmentDate: 'assignment_date'
```
