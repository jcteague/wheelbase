# Contract: `positions:get` IPC Channel

## Channel

`positions:get`

## Current Shape (before US-11)

**Request payload:**

```ts
{
  positionId: string
}
```

**Response (success):**

```ts
{
  ok: true
  position: PositionRecord
  activeLeg: LegRecord | null
  costBasisSnapshot: CostBasisSnapshotRecord | null  // latest snapshot only
  legs: LegRecord[]
}
```

---

## Updated Shape (after US-11)

**Request payload:** _(unchanged)_

```ts
{
  positionId: string
}
```

**Response (success):**

```ts
{
  ok: true
  position: PositionRecord
  activeLeg: LegRecord | null
  costBasisSnapshot: CostBasisSnapshotRecord | null  // latest snapshot (unchanged)
  legs: LegRecord[]
  allSnapshots: CostBasisSnapshotRecord[]            // NEW — all snapshots, snapshot_at ASC
}
```

**Response (not found):** _(unchanged)_

```ts
{
  ok: false
  errors: [{ field: '__root__', code: 'not_found', message: 'Position not found' }]
}
```

---

## `CostBasisSnapshotRecord` shape

```ts
{
  id: string
  positionId: string
  basisPerShare: string // Decimal string, 4dp e.g. "176.5000"
  totalPremiumCollected: string
  finalPnl: string | null // Non-null only on terminal events
  snapshotAt: string // ISO-8601 datetime e.g. "2026-01-03T15:30:00.000Z"
  createdAt: string
}
```

---

## Backend changes required

### `src/main/schemas.ts`

Add `allSnapshots` to `GetPositionResult`:

```ts
export interface GetPositionResult {
  position: PositionRecord
  activeLeg: LegRecord | null
  costBasisSnapshot: CostBasisSnapshotRecord | null
  legs: LegRecord[]
  allSnapshots: CostBasisSnapshotRecord[] // NEW
}
```

### `src/main/services/get-position.ts`

Add a new SQL query constant and execute it alongside the existing legs query:

```ts
const GET_ALL_SNAPSHOTS_QUERY = `
  SELECT id, position_id, basis_per_share, total_premium_collected, final_pnl, snapshot_at, created_at
  FROM cost_basis_snapshots
  WHERE position_id = ?
  ORDER BY snapshot_at ASC
`
```

In the return value, add:

```ts
allSnapshots: snapshotRows.map((r) => ({
  id: r.id,
  positionId: r.position_id,
  basisPerShare: r.basis_per_share,
  totalPremiumCollected: r.total_premium_collected,
  finalPnl: r.final_pnl ?? null,
  snapshotAt: r.snapshot_at,
  createdAt: r.created_at
}))
```

---

## Renderer changes required

### `src/renderer/src/api/positions.ts`

Add `allSnapshots` to `PositionDetail`:

```ts
export type PositionDetail = {
  // ... existing fields ...
  allSnapshots: Array<{
    id: string
    positionId: string
    basisPerShare: string
    totalPremiumCollected: string
    finalPnl: string | null
    snapshotAt: string
    createdAt: string
  }>
}
```

No change needed to `getPosition()` adapter function — it casts the IPC result directly.

---

## IPC handler

`src/main/ipc/positions.ts` — the `positions:get` handler requires **no change**. It calls `getPosition(db, payload.positionId)` and spreads the result. The new `allSnapshots` field flows through automatically.
