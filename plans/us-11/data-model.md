# Data Model: US-11 — Wheel Leg Chain Display

## Existing Entities (unchanged schema)

### `LegRecord` (from `src/main/schemas.ts`)

Used as-is. Key fields for this story:
| Field | Type | Notes |
|---|---|---|
| `id` | `string` | UUID |
| `legRole` | `LegRole` | CSP_OPEN, ASSIGN, CC_OPEN, CC_CLOSE, CC_EXPIRED, CALLED_AWAY, ROLL_FROM, ROLL_TO |
| `action` | `LegAction` | SELL, BUY, ASSIGN, EXPIRE |
| `instrumentType` | `InstrumentType` | PUT, CALL |
| `strike` | `string` | Decimal (4dp) |
| `expiration` | `string` | YYYY-MM-DD or null for assignment/called-away legs |
| `contracts` | `number` | Integer |
| `premiumPerContract` | `string` | Decimal (4dp); `'0.0000'` for ASSIGN/CALLED_AWAY |
| `fillDate` | `string` | YYYY-MM-DD |

### `CostBasisSnapshotRecord` (from `src/main/schemas.ts`)

Used as-is. Key fields:
| Field | Type | Notes |
|---|---|---|
| `id` | `string` | UUID |
| `positionId` | `string` | FK → positions |
| `basisPerShare` | `string` | Decimal (4dp) |
| `totalPremiumCollected` | `string` | Decimal (4dp) |
| `finalPnl` | `string \| null` | Set only on terminal events |
| `snapshotAt` | `string` | ISO-8601 datetime |

---

## Modified Types

### `GetPositionResult` (in `src/main/schemas.ts`)

Adds one new field:

```ts
export interface GetPositionResult {
  position: PositionRecord
  activeLeg: LegRecord | null
  costBasisSnapshot: CostBasisSnapshotRecord | null
  legs: LegRecord[]
  allSnapshots: CostBasisSnapshotRecord[] // NEW — ordered snapshot_at ASC
}
```

### `PositionDetail` (in `src/renderer/src/api/positions.ts`)

Adds one new field to the renderer-side type, mirroring `GetPositionResult`:

```ts
allSnapshots: Array<{
  id: string
  positionId: string
  basisPerShare: string
  totalPremiumCollected: string
  finalPnl: string | null
  snapshotAt: string
  createdAt: string
}>
```

---

## New Display Types

### `EnrichedLeg`

Produced by `deriveRunningBasis()` in `src/renderer/src/lib/deriveRunningBasis.ts`:

```ts
type EnrichedLeg = LegRecord & {
  runningCostBasis: string | null
}
```

`runningCostBasis` is the `basisPerShare` from the most recent snapshot whose `snapshotAt.slice(0,10) <= fillDate`, or `null` if no snapshot has been seen yet at that point in the chain.

---

## `LegHistoryEntry` Type (in `src/renderer/src/components/LegHistoryTable.tsx`)

Updated to include all fields needed for the new 8-column table:

```ts
type LegHistoryEntry = {
  id: string
  legRole: string
  action: string
  instrumentType: string
  strike: string
  expiration: string | null // null for ASSIGN, CALLED_AWAY
  contracts: number // NEW
  premiumPerContract: string | null // null for ASSIGN, CALLED_AWAY, CC_EXPIRED
  fillDate: string
  runningCostBasis: string | null // NEW — derived by deriveRunningBasis()
}
```

---

## Snapshot Creation Events (reference)

| Leg Role    | Creates Snapshot? | finalPnl set? |
| ----------- | ----------------- | ------------- |
| CSP_OPEN    | Yes               | No            |
| ASSIGN      | Yes               | No            |
| CC_OPEN     | Yes               | No            |
| CC_CLOSE    | **No**            | N/A           |
| CC_EXPIRED  | Yes               | Yes           |
| CALLED_AWAY | Yes               | Yes           |
| ROLL_FROM   | No                | N/A           |
| ROLL_TO     | No                | N/A           |

CC_CLOSE running basis always carries forward from the prior CC_OPEN snapshot.

---

## Snapshot-to-Leg Matching

**Input:** `legs` sorted `fill_date ASC, created_at ASC` (guaranteed by DB query), `snapshots` sorted `snapshot_at ASC`.

**Algorithm:**

```
currentBasis = null
si = 0
for each leg in legs:
  while si < snapshots.length AND snapshots[si].snapshotAt.slice(0,10) <= leg.fillDate:
    currentBasis = snapshots[si].basisPerShare
    si++
  leg.runningCostBasis = currentBasis
```

**Result:** Each leg gets the basis from the most recent snapshot at or before its `fillDate`. Legs before the first snapshot (edge case) get `null`.

---

## Final P&L Display

Source: `costBasisSnapshot.finalPnl` (the latest snapshot's `finalPnl` field, which is non-null only when `position.status === 'CLOSED'` / terminal event).

Rendering:

- Positive: green (`var(--wb-green)`) with `+$X.XX` format
- Negative: red (`var(--wb-red)`) with `-$X.XX` format
- Use existing `pnlColor()` from `src/renderer/src/lib/format.ts`
