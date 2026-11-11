# Contract: positions:list

## Purpose

Returns every position as a list item, in display order; US-108 reshapes the PMCC arm from two
named legs to a legs array with ledger figures, and adds `nextEarnings` to every item.

## Request

```typescript
// No payload. Channel `positions:list`, preload `window.api.listPositions()`.
```

## Response (success)

```typescript
// The handler returns the array directly (not wrapped in handleIpcCall — unchanged since US-2).
type Response = PositionListItem[]

interface PositionListItemBase {
  id: string
  ticker: string
  status: 'ACTIVE' | 'CLOSED'
  premiumCollected: string // 4 dp
  effectiveCostBasis: string // 4 dp
  profitTargetPercent: number | null
  nextEarnings: string | null // NEW (US-108): stored next print ≥ today, else null
}

interface WheelListItem extends PositionListItemBase {
  strategyType: 'WHEEL'
  phase: StrategyPhase<'WHEEL'>
  pmcc: null
  strike: string | null
  expiration: string | null
  dte: number | null
  instrumentType: 'PUT' | 'CALL' | null
  contracts: number | null
  entryPremiumPerContract: string | null
}

interface PmccLegSummary {
  legId: string // NEW
  side: 'LONG' | 'SHORT' // NEW
  strike: string // 4 dp
  expiration: string // YYYY-MM-DD
  dte: number
  contracts: number
  fillPerShare: string // NEW, 4 dp
}

type PmccListSummary = {
  legs: PmccLegSummary[] // LEAPS first, then shorts by expiration — replaces `long` / `short`
  cycles: number // SHORT_CALL_OPEN legs to date
  entryDebitPerShare: string | null // 4 dp
  openedAt: string // positions.opened_date
  managementWindowDte: number // override ?? global default
} & Pick<
  PmccLedgerResult,
  | 'basisPerShare'
  | 'basisTotal'
  | 'leapsCostPerShare'
  | 'shortCreditsPerShare'
  | 'shortCreditsTotal'
  | 'premiumRecoveredPercent'
>

interface PmccListItem extends PositionListItemBase {
  strategyType: 'PMCC'
  phase: PmccPhase
  pmcc: PmccListSummary
  strike: null
  expiration: null
  dte: null
  instrumentType: null
  contracts: null
  entryPremiumPerContract: null
}

type PositionListItem = WheelListItem | PmccListItem
```

Ordering: `sortPositionsByDte` — a PMCC sorts by `pmccNextDecisionDte(pmcc.legs)` (nearest SHORT
dte, else nearest LONG dte); undated rows last. Unchanged for wheels.

Omission: a PMCC with no LEAPS leg, no ledger, or a leg whose expiration yields no DTE is dropped
with WARN `pmcc_list_summary_incomplete` (unchanged behaviour).

## Error codes

| field      | code             | message                                                            |
| ---------- | ---------------- | ------------------------------------------------------------------ |
| `__root__` | `internal_error` | Only the standard envelope applies; the handler has no validation. |

## Source

- Handler: `src/main/ipc/positions.ts` (unchanged)
- Service: `src/main/services/list-positions.ts` (`readPmccSummaries`, `toListItemBase`,
  `LIST_QUERY` gains `p.opened_date`, `p.management_window_dte_override`)
- Earnings read: `src/main/services/earnings-dates.ts` `readStoredNextEarnings`
- Types: `src/main/schemas.ts`; renderer re-export `src/renderer/src/api/positions.ts`; preload
  already aliases the schema type
