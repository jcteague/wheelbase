# Data Model: US-7 — Open Covered Call

## No New Entities

US-7 uses existing tables only. No migration required.

## Entities Used

### Leg (existing table: `legs`)

A new row is inserted with these values:

| Field                  | Value              | Notes                                        |
| ---------------------- | ------------------ | -------------------------------------------- |
| `id`                   | UUID               | Generated                                    |
| `position_id`          | FK → positions     | The HOLDING_SHARES position                  |
| `leg_role`             | `'CC_OPEN'`        | Existing enum value                          |
| `action`               | `'SELL'`           | Selling a call                               |
| `instrument_type`      | `'CALL'`           | Existing enum value                          |
| `strike`               | Decimal TEXT       | The CC strike price                          |
| `expiration`           | ISO date string    | CC expiration date                           |
| `contracts`            | Integer            | Must be ≤ position contracts from ASSIGN leg |
| `premium_per_contract` | Decimal TEXT (4dp) | Credit received per share                    |
| `fill_price`           | `null`             | Not applicable for manual entry              |
| `fill_date`            | ISO date string    | Date the CC was sold                         |

### Cost Basis Snapshot (existing table: `cost_basis_snapshots`)

A new row is inserted:

| Field                     | Value              | Notes                                       |
| ------------------------- | ------------------ | ------------------------------------------- |
| `id`                      | UUID               | Generated                                   |
| `position_id`             | FK → positions     | Same position                               |
| `basis_per_share`         | Decimal TEXT (4dp) | `prevBasisPerShare − ccPremiumPerContract`  |
| `total_premium_collected` | Decimal TEXT (4dp) | `prevTotal + (ccPremium × contracts × 100)` |
| `final_pnl`               | `null`             | Position still open                         |
| `snapshot_at`             | ISO timestamp      | When snapshot was taken                     |

### Position (existing table: `positions`)

Updated in-place:

| Field        | New Value         |
| ------------ | ----------------- |
| `phase`      | `'CC_OPEN'`       |
| `updated_at` | Current timestamp |

## Validation Rules

### From Acceptance Criteria

1. **Phase guard**: Position must be in `HOLDING_SHARES`. If `CC_OPEN` → reject: "A covered call is already open on this position"
2. **Strike required**: Must be positive number
3. **Premium required**: Must be positive number
4. **Contracts required**: Must be positive integer, ≤ position contracts (from ASSIGN leg)
5. **Expiration required**: Must be a valid date string
6. **Fill date**: Must be ≥ assignment date (from ASSIGN leg's fill_date), must be ≤ today

### Guardrail (client-side only, non-blocking)

- `strike < basisPerShare` → warning: "This strike is below your cost basis — you would lock in a loss of ${diff}/share if called away"
- `strike == basisPerShare` → warning: "This strike is at your cost basis — you would break even if called away"
- `strike > basisPerShare` → info: "Shares called away at ${strike} → profit of ${diff}/share"

## State Transition

```
HOLDING_SHARES → CC_OPEN
```

Triggered by: inserting a CC_OPEN leg via the `openCoveredCall` service function.

## Cost Basis Formula

```
newBasisPerShare = prevBasisPerShare − ccPremiumPerContract
newTotalPremium  = prevTotalPremium + (ccPremiumPerContract × contracts × 100)
```

Where:

- `prevBasisPerShare` = latest cost_basis_snapshot.basis_per_share
- `prevTotalPremium` = latest cost_basis_snapshot.total_premium_collected
- `ccPremiumPerContract` = premium received per share for the CC
- `contracts` = number of CC contracts sold
- `× 100` = shares per contract multiplier
