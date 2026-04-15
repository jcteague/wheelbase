# Data Model: US-6 — Record CSP Assignment

---

## Schema Changes

### 1. New DB migration: `migrations/003_rename_option_type_to_instrument_type.sql`

Rename the `option_type` column to `instrument_type` in the `legs` table and expand the CHECK constraint to include `'STOCK'`.

```sql
ALTER TABLE legs RENAME COLUMN option_type TO instrument_type;
-- SQLite does not support modifying CHECK constraints in place.
-- Recreate with the expanded constraint via a table rebuild if needed,
-- or add a trigger-based guard. Simplest approach for SQLite:
-- Drop and recreate the table with the new constraint (migration runner handles this).
```

Updated CHECK constraint: `instrument_type IN ('PUT', 'CALL', 'STOCK')`

---

## Type Changes (`src/main/core/types.ts`)

### `InstrumentType` (renamed from `OptionType`)

```typescript
export const InstrumentType = z.enum(['PUT', 'CALL', 'STOCK'])
export type InstrumentType = z.infer<typeof InstrumentType>
```

### `LegAction` (extended)

```typescript
export const LegAction = z.enum(['SELL', 'BUY', 'EXPIRE', 'ASSIGN'])
export type LegAction = z.infer<typeof LegAction>
```

---

## New IPC Schema Types (`src/main/schemas.ts`)

### `AssignCspPayloadSchema`

```typescript
z.object({
  positionId: z.string().uuid(),
  assignmentDate: z.string() // ISO date string YYYY-MM-DD
})
```

### `AssignCspPositionResult`

```typescript
interface AssignCspPositionResult {
  position: {
    id: string
    ticker: string
    phase: 'HOLDING_SHARES'
    status: 'ACTIVE'
  }
  leg: LegRecord
  costBasisSnapshot: CostBasisSnapshotRecord
  premiumWaterfall: Array<{ label: string; amount: string }>
}
```

### Updated `LegRecord`

Rename `optionType: OptionType` → `instrumentType: InstrumentType`

---

## New Core Engine Types (`src/main/core/`)

### `RecordAssignmentInput` (lifecycle.ts)

```typescript
interface RecordAssignmentInput {
  currentPhase: WheelPhase
  assignmentDate: string // YYYY-MM-DD
  openFillDate: string // YYYY-MM-DD — assignment must not precede this
}
```

### `RecordAssignmentResult` (lifecycle.ts)

```typescript
interface RecordAssignmentResult {
  phase: 'HOLDING_SHARES'
}
```

### `AssignmentBasisInput` (costbasis.ts)

```typescript
interface AssignmentBasisLeg {
  legRole: LegRole // 'CSP_OPEN' | 'ROLL_TO'
  premiumPerContract: string
  contracts: number
}

interface AssignmentBasisInput {
  strike: string
  contracts: number
  premiumLegs: AssignmentBasisLeg[]
}
```

### `AssignmentBasisResult` (costbasis.ts)

```typescript
interface AssignmentBasisResult {
  basisPerShare: string
  totalPremiumCollected: string
  sharesHeld: number
  premiumWaterfall: Array<{ label: string; amount: string }>
}
```

---

## Assignment Leg Record (written by service)

| Field                  | Value                                        |
| ---------------------- | -------------------------------------------- |
| `leg_role`             | `'ASSIGN'`                                   |
| `action`               | `'ASSIGN'`                                   |
| `instrument_type`      | `'STOCK'`                                    |
| `strike`               | CSP open leg's strike (the assignment price) |
| `expiration`           | CSP open leg's expiration (for reference)    |
| `contracts`            | CSP open leg's contracts                     |
| `premium_per_contract` | `'0.0000'` (no premium on assignment itself) |
| `fill_price`           | `NULL`                                       |
| `fill_date`            | `assignmentDate` from payload                |

---

## Phase Transition

| Before     | After            | Status change  |
| ---------- | ---------------- | -------------- |
| `CSP_OPEN` | `HOLDING_SHARES` | remains ACTIVE |

- `positions.closed_date` remains NULL
- `positions.status` remains `'ACTIVE'`

---

## Cost Basis Snapshot (written by service)

| Field                     | Value                                                           |
| ------------------------- | --------------------------------------------------------------- |
| `basis_per_share`         | `strike − Σ(premiumPerContract for each CSP/roll credit leg)`   |
| `total_premium_collected` | `Σ(premiumPerContract × contracts × 100)` for all CSP/roll legs |
| `final_pnl`               | `NULL` — position still open                                    |

---

## Validation Rules

| Rule                                   | Error field      | Code               | Message                                                        |
| -------------------------------------- | ---------------- | ------------------ | -------------------------------------------------------------- |
| `currentPhase !== 'CSP_OPEN'`          | `__phase__`      | `invalid_phase`    | Assignment can only be recorded on a CSP_OPEN position         |
| `assignmentDate` missing (client-side) | `assignmentDate` | `required`         | Assignment date is required                                    |
| `assignmentDate < openFillDate`        | `assignmentDate` | `date_before_open` | Assignment date cannot be before the CSP open date             |
| `assignmentDate > today` (client-side) | n/a (warning)    | n/a                | This date is in the future — are you sure? (soft warning only) |

Note: future-date is a client-side warning only. The backend does not reject future dates.
