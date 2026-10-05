# Contract: positions:list (US-103 extension)

## Purpose

Lists every position; a PMCC row's summary now carries the running cost basis instead of the
initial net debit.

## Request

None (unchanged).

## Response (success)

```typescript
// Wheel arm unchanged. PMCC arm:
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

type PmccListSummary = {
  long: PmccLegSummary // opening LEAPS leg, unchanged
  short: PmccLegSummary // opening short leg, unchanged
} & Pick<PmccLedgerResult, 'basisPerShare' | 'basisTotal'> // REPLACES initialNetDebit
```

`PositionListItemBase.effectiveCostBasis` still reads the latest snapshot's `basis_per_share`;
`premiumCollected` still reads `total_premium_collected` (short credits after fees).

Example after the short-call roll: `pmcc.basisPerShare = "21.8000"`, `pmcc.basisTotal = "2180.0000"`.

## Error codes

| field | code | message                                                                                                                                                                |
| ----- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | —    | The handler returns the bare array and has no error envelope (unchanged). A PMCC whose legs are missing is dropped with WARN `pmcc_list_summary_incomplete`, as today. |

## Source

- Handler: `src/main/ipc/positions.ts` (unchanged)
- Service: `src/main/services/list-positions.ts`, `src/main/services/pmcc-ledger.ts`, `src/main/services/leg-rows.ts`
- Renderer optimistic row: `src/renderer/src/lib/position-list-items.ts`
