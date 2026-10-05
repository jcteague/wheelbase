# Contract: positions:get (US-103 extension)

## Purpose

Hydrates the position detail page; for a PMCC it now also returns the running cost-basis ledger
recomputed from the position's legs.

## Request

```typescript
{
  positionId: string
} // unchanged
```

## Response (success)

```typescript
{
  ok: true,
  position: PositionRecord,
  activeLeg: LegRecord | null,
  costBasisSnapshot: CostBasisSnapshotRecord | null,   // latest; triggerEvent now typed TriggerEvent incl. PmccTriggerEvent
  legs: LegRecord[],                                   // legRole may now be any of the six PMCC roles
  allSnapshots: CostBasisSnapshotRecord[],             // ASC by snapshot_at — the audit chain
  initialNetDebit: string | null,                      // unchanged (US-101)
  pmccLedger: PmccLedgerResult | null                  // NEW — null for a wheel or a PMCC with no legs
}

interface PmccLedgerResult {
  basisPerShare: string            // 4 dp, may be negative
  basisTotal: string               // dollars, 4 dp
  leapsCostPerShare: string
  leapsCostTotal: string
  shortCreditsPerShare: string     // positive = net credit received
  shortCreditsTotal: string
  effectiveShareCost: string | null       // current long strike + basisPerShare; null without an open long BUY leg
  premiumRecoveredPercent: string | null  // 0–100 scale, 4 dp; null when leapsCostTotal ≤ 0
}
```

Example for the AC fixture after the short-call roll (`rs-recorded`):

```json
{
  "pmccLedger": {
    "basisPerShare": "21.8000",
    "basisTotal": "2180.0000",
    "leapsCostPerShare": "25.0000",
    "leapsCostTotal": "2500.0000",
    "shortCreditsPerShare": "3.2000",
    "shortCreditsTotal": "320.0000",
    "effectiveShareCost": "101.8000",
    "premiumRecoveredPercent": "12.8000"
  }
}
```

## Error codes

| field      | code        | message              |
| ---------- | ----------- | -------------------- |
| `__root__` | `not_found` | `Position not found` |

Only the existing envelope error applies; the handler is unchanged and still not wrapped by
`handleIpcCall` (it never throws).

## Source

- Handler: `src/main/ipc/positions.ts` (unchanged)
- Service: `src/main/services/get-position.ts`, `src/main/services/pmcc-ledger.ts`, `src/main/services/leg-rows.ts`
