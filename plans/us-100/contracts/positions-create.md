# Contract: positions:create (amended)

## Purpose

Open a new wheel position (CSP_OPEN) and, after the transaction commits, collect the ticker's
IV rank on demand without making the create wait on the network.

## Request

```typescript
// CreatePositionPayloadSchema — unchanged
{
  ticker: string
  strike: number
  expiration: string        // YYYY-MM-DD, must be after fillDate
  contracts: number
  premiumPerContract: number
  fillDate?: string
  accountId?: string | null
  notes?: string | null
  thesis?: string | null
}
```

## Response (success)

```typescript
{
  ok: true,
  position: PositionRecord,   // unchanged
  leg: LegRecord,             // unchanged
  snapshot: CostBasisSnapshot // unchanged
}
```

Returned **before** any IVR request is made.

## Error codes

Only the existing lifecycle/validation errors apply (`__phase__`, `expiration`, etc. — unchanged
from US-1). **An IVR fetch failure is never an error on this channel.**

## Side effect (US-100)

After `db.transaction(...)()` returns, `createPosition` calls `void ivrOnDemand?.collect(payload.ticker)`
with the same dedupe and never-rejects guarantees as `watchlist:add`. Only `positions:create`
triggers collection — rolls, assignments and CC opens do not introduce a new ticker.

## Source

- Handler: `src/main/ipc/positions.ts` (`registerPositionsHandlers(db, { ivrOnDemand })`)
- Service: `src/main/services/positions.ts` (`createPosition(db, payload, ivrOnDemand?)`)
- Port: `src/main/services/ivr-on-demand.ts`
