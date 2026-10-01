# Contract: positions:list (delta)

## Purpose

Unchanged purpose — one item per position for the dashboard table — extended so a PMCC row can
identify its strategy and label both legs' expirations without going through the wheel's
single-active-leg fields.

## Request

```typescript
// no payload (unchanged)
```

## Response (success)

```typescript
// PositionListItem — now a discriminated union on strategyType (data-model §6). Each item is
// exactly one of the two arms; every field a consumer read before still exists on both.
type PositionListItem = WheelListItem | PmccListItem

// shared by both arms
{
  id: string
  ticker: string
  phase: WheelPhase // now includes 'PMCC_OPEN'
  status: WheelStatus
  premiumCollected: string // PMCC: short-call credit after fees, from the PMCC_OPEN snapshot
  effectiveCostBasis: string // PMCC: basis per share from the PMCC_OPEN snapshot
  profitTargetPercent: number | null
}

// WheelListItem — the shipped shape plus the discriminator
{
  strategyType: 'WHEEL'
  pmcc: null
  strike: string | null
  expiration: string | null
  dte: number | null
  instrumentType: 'PUT' | 'CALL' | null
  contracts: number | null
  entryPremiumPerContract: string | null
}

// PmccListItem — wheel-only fields are typed null (keeps the calendar and option polling wheel-only)
{
  strategyType: 'PMCC'
  pmcc: {
    long: {
      strike: string
      expiration: string
      dte: number
      contracts: number
    }
    short: {
      strike: string
      expiration: string
      dte: number
      contracts: number
    }
    initialNetDebit: string // dollars, 4 dp
  }
  strike: null
  expiration: null
  dte: null
  instrumentType: null
  contracts: null
  entryPremiumPerContract: null
}
```

`dte` inside `pmcc` is never null: both expirations passed the ISO regex and the engine's date
rules before they were stored.

`positions:list` is not wrapped in `handleIpcCall` today (it returns the array directly); that
stays as is.

## Error codes

| field | code | message                                                                                           |
| ----- | ---- | ------------------------------------------------------------------------------------------------- |
| —     | —    | Only the standard envelope applies; this handler has no payload and no story-specific validation. |

## Source

- Handler: `src/main/ipc/positions.ts` (unchanged)
- Service: `src/main/services/list-positions.ts` (selects `p.strategy_type`; one extra query for the `LEAPS_OPEN` / `SHORT_CALL_OPEN` legs of PMCC ids)
- Preload types: `src/preload/index.d.ts` (`IpcPositionListItem`, the same union)
- Renderer adapter: `src/renderer/src/api/positions.ts` (`PositionListItem` union; the mapper branches once on `strategyType`)
