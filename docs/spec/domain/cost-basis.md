# Cost Basis

<!-- generated:from us-4,us-12 -->

## Overview

Cost basis tracks a wheel position's effective per-share entry price as
premiums are collected, rolls happen, and the position closes. It lives in
the **`cost_basis_snapshots`** table, which is **append-only** — every
basis-changing event writes a new row stamped with `snapshot_at`, and the
latest row wins via `ORDER BY snapshot_at DESC LIMIT 1`. The opening snapshot
is never mutated, mirroring the immutable leg-pair pattern used for rolls.

Snapshots are produced by three classes of event: **opening** (initial CSP),
**rolling** (linked ROLL_FROM/ROLL_TO pair), and **closing** (early close,
expiration, assignment). Each event calls a pure function in
`src/main/core/costbasis.ts` that returns `basis_per_share`,
`total_premium_collected`, and — only on terminal events — `final_pnl`.

<!-- /generated -->

<!-- generated:from us-4,us-12 -->

## Key decisions

### Append-only snapshots, latest wins

- **Decision:** Every basis-changing event inserts a new row; the opening
  snapshot is never updated.
- **Why:** Free audit trail; matches the immutable leg-pair pattern; the
  latest row is always retrievable via `ORDER BY snapshot_at DESC LIMIT 1`.
- **Driven by:** [us-4 — Close a CSP early](../features/us-4-close-csp.md)

### Cost-basis math lives in a pure engine

- **Decision:** All basis math lives in `src/main/core/costbasis.ts` as pure
  functions; services pass in plain values and persist the result.
- **Why:** Keeps core logic DB- and broker-free and unit-testable; matches
  the lifecycle engine boundary rule.
- **Driven by:** [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md)

### `pnl_percentage` is derived, not stored

- **Decision:** Store only `final_pnl`; recompute percentage on display.
- **Why:** Derivable from `final_pnl / total_premium_collected`. Avoids a
  redundant column and a migration.
- **Driven by:** [us-4 — Close a CSP early](../features/us-4-close-csp.md)

### Rolls carry basis forward via net credit/debit

- **Decision:** `basis_per_share = prevBasisPerShare − net`, where
  `net = newPremium − costToClose` (positive = credit, negative = debit).
- **Why:** Credit reduces basis, debit raises it. Accumulates premium across
  the chain without losing history.
- **Driven by:** [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md)

### Previews are computed client-side

- **Decision:** Close P&L and roll net credit/debit previews are computed in
  the React form as the user types — no IPC round-trip until submit.
- **Why:** All inputs are already local; instant feedback; no debounce needed.
- **Driven by:** [us-4 — Close a CSP early](../features/us-4-close-csp.md),
  [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md)

<!-- /generated -->

<!-- generated:from us-4,us-12 -->

## Cost basis on each lifecycle event

Each event inserts one new row into `cost_basis_snapshots`. Money values are
TEXT, 4 dp, rounded with `ROUND_HALF_UP` via the `round4` helper.

### CSP open

Not yet documented in extracts. Implementation: `calculateInitialCspBasis` in
`src/main/core/costbasis.ts`.

### CSP close (early buy-to-close)

Formula (per-contract math, scaled to total):

```
finalPnl = (openPremium − closePrice) × contracts × 100
```

Snapshot row written:

| Column                    | Value                                                   |
| ------------------------- | ------------------------------------------------------- |
| `basis_per_share`         | copied from the opening snapshot (unchanged)            |
| `total_premium_collected` | copied from the opening snapshot (unchanged)            |
| `final_pnl`               | `(openPremium − closePrice) × contracts × 100` (4 dp)   |
| `annualized_return`       | `NULL` (future story)                                   |
| `snapshot_at`             | now                                                     |

Breakeven (`finalPnl = 0`) is classified as `CSP_CLOSED_LOSS`, not profit.
`pnlPercentage` is per-contract: total P&L scales with contracts, percentage
does not.

### CSP roll

Formula (let `net = newPremium − costToClose`; positive = credit):

```
basisPerShare         = prevBasisPerShare − net
totalPremiumCollected = prevTotalPremiumCollected + net × contracts × 100
```

Option contracts are already per-share, so `netPerShare = net` directly
(a roll with `net = 0.10` reduces basis by $0.10/share). On a debit roll,
`net` is negative, raising basis and reducing `total_premium_collected`.

Snapshot row written:

| Column                    | Value                                            |
| ------------------------- | ------------------------------------------------ |
| `basis_per_share`         | `prevBasisPerShare − net` (4 dp)                 |
| `total_premium_collected` | `prevTotalPremiumCollected + net × contracts × 100` (4 dp) |
| `final_pnl`               | `NULL` (position remains open)                   |
| `snapshot_at`             | now                                              |

The position row is **not** updated on a roll — phase stays `CSP_OPEN`,
`status` stays `ACTIVE`. The new ROLL_TO leg becomes the effective open leg.

<!-- /generated -->

<!-- generated:from us-4,us-12 -->

## Function signatures

Pure entry points in `src/main/core/costbasis.ts`. All money fields are 4-dp
TEXT strings; `contracts` is a number.

```typescript
// Opening — initial CSP basis
export function calculateInitialCspBasis(leg: CspLegInput): CostBasisResult

// Close — early buy-to-close P&L
export interface CspCloseInput {
  openPremiumPerContract: string
  closePricePerContract:  string
  contracts:              number
}
export interface CspCloseResult {
  finalPnl:       string
  pnlPercentage:  string
}
export function calculateCspClose(input: CspCloseInput): CspCloseResult

// Roll — basis carry-forward
export interface RollBasisInput {
  prevBasisPerShare:         string
  prevTotalPremiumCollected: string
  costToClosePerContract:    string
  newPremiumPerContract:     string
  contracts:                 number
}
export interface RollBasisResult {
  basisPerShare:         string
  totalPremiumCollected: string
}
export function calculateRollBasis(input: RollBasisInput): RollBasisResult
```

Other engine functions (referenced for completeness, not detailed in these
extracts): `calculateCcOpenBasis`, `calculateCspExpiration`,
`calculateAssignmentBasis`, `calculateCcClose`, `calculateCallAway`,
`computeUnrealizedPnl`.

<!-- /generated -->

<!-- generated:from us-4,us-12 -->

## Snapshot row reference

`cost_basis_snapshots` columns (from `migrations/001_initial_schema.sql`,
extended by `migrations/004_add_trigger_event_to_snapshots.sql`):

| Column                    | Type          | When set                                            | When null                       |
| ------------------------- | ------------- | --------------------------------------------------- | ------------------------------- |
| `id`                      | TEXT (UUID)   | always — new UUID per row                           | never                           |
| `position_id`             | TEXT FK       | always — parent position                            | never                           |
| `basis_per_share`         | TEXT (4 dp)   | always — effective basis after the event            | never                           |
| `total_premium_collected` | TEXT (4 dp)   | always — running total across the chain             | never                           |
| `final_pnl`               | TEXT (4 dp)   | set on terminal events (close, expiry, call-away)   | open snapshots and rolls        |
| `annualized_return`       | TEXT          | future story — reserved                             | always today                    |
| `trigger_event`           | TEXT          | always — which lifecycle event produced this row    | never (defaults to `'UNKNOWN'`) |
| `snapshot_at`             | TEXT (ISO)    | always — event timestamp; used for latest-row sort  | never                           |
| `created_at`              | TEXT (ISO)    | always — insert timestamp                           | never                           |

Latest-row selector pattern used everywhere:

```sql
SELECT * FROM cost_basis_snapshots
WHERE position_id = ?
ORDER BY snapshot_at DESC
LIMIT 1
```

<!-- /generated -->

<!-- generated:from us-4,us-12 -->

## Driven by

- [us-4 — Close a CSP early](../features/us-4-close-csp.md)
- [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md)

<!-- /generated -->

<!-- Hand-written sections below this line are preserved across regeneration. -->
