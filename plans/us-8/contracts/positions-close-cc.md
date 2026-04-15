# IPC Contract: positions:close-cc-early

## Channel

`positions:close-cc-early`

## Direction

Renderer → Main (via `ipcRenderer.invoke`)

## Preload API method

`window.api.closeCoveredCallEarly(payload: unknown): Promise<...>`

---

## Request Payload (Zod schema: `CloseCcPayloadSchema`)

```ts
import { z } from 'zod'

export const CloseCcPayloadSchema = z.object({
  positionId: z.string().uuid(),
  closePricePerContract: z.number().positive(),
  fillDate: z.string().optional() // YYYY-MM-DD; defaults to today
})

export type CloseCcPayload = z.infer<typeof CloseCcPayloadSchema>
```

---

## Success Response (`ok: true`)

```ts
export interface CloseCcPositionResult {
  position: {
    id: string
    ticker: string
    phase: 'HOLDING_SHARES'
    status: 'ACTIVE'
    closedDate: null
  }
  leg: LegRecord // the new CC_CLOSE leg
  ccLegPnl: string // Decimal string, e.g. "120.0000" or "-120.0000"
}
```

Full IPC envelope:

```json
{
  "ok": true,
  "position": { "id": "...", "ticker": "AAPL", "phase": "HOLDING_SHARES", "status": "ACTIVE", "closedDate": null },
  "leg": { "id": "...", "legRole": "CC_CLOSE", "action": "BUY", "instrumentType": "CALL", "strike": "182.0000", "expiration": "2026-02-21", "contracts": 1, "premiumPerContract": "1.1000", "fillPrice": "1.1000", "fillDate": "2026-02-01", ... },
  "ccLegPnl": "120.0000"
}
```

---

## Error Response (`ok: false`)

```json
{
  "ok": false,
  "errors": [
    {
      "field": "__phase__",
      "code": "invalid_phase",
      "message": "No open covered call on this position"
    },
    {
      "field": "closePricePerContract",
      "code": "must_be_positive",
      "message": "Close price must be greater than zero"
    },
    {
      "field": "fillDate",
      "code": "close_date_before_open",
      "message": "Fill date cannot be before the CC open date"
    },
    {
      "field": "fillDate",
      "code": "close_date_after_expiration",
      "message": "Fill date cannot be after the CC expiration date — use Record Expiry instead"
    },
    { "field": "__root__", "code": "not_found", "message": "Position not found" },
    { "field": "__root__", "code": "internal_error", "message": "An unexpected error occurred" }
  ]
}
```

---

## IPC Field → Form Field Mapping (renderer)

| IPC field               | Form field                 |
| ----------------------- | -------------------------- |
| `closePricePerContract` | `close_price_per_contract` |
| `fillDate`              | `fill_date`                |

Add both to `IPC_TO_FORM_FIELD` map in `src/renderer/src/api/positions.ts`.
