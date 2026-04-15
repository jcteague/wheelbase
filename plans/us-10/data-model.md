# Data Model: US-10 — Record Shares Called Away

No new database tables are required. The story uses the existing `legs`, `positions`, and `cost_basis_snapshots` tables.

---

## Enum Extension

### `LegAction` (in `src/main/core/types.ts`)

The `LegAction` enum must be extended with `'EXERCISE'`:

```ts
export const LegAction = z.enum(['SELL', 'BUY', 'EXPIRE', 'ASSIGN', 'EXERCISE'])
```

`EXERCISE` is used exclusively for the CC_CLOSE leg created by call-away — it signals shares delivered by option exercise, not a market buy.

---

## New Leg: CC_CLOSE (Exercise)

| Field                  | Value                              | Source                         |
| ---------------------- | ---------------------------------- | ------------------------------ |
| `id`                   | `randomUUID()`                     | generated                      |
| `position_id`          | position.id                        | from request                   |
| `leg_role`             | `'CC_CLOSE'`                       | constant                       |
| `action`               | `'EXERCISE'`                       | constant                       |
| `instrument_type`      | `'CALL'`                           | constant                       |
| `strike`               | CC_OPEN leg strike                 | from CC_OPEN leg               |
| `expiration`           | CC_OPEN leg expiration             | from CC_OPEN leg               |
| `contracts`            | CC_OPEN leg contracts              | from CC_OPEN leg               |
| `premium_per_contract` | `'0.0000'`                         | exercise: no premium collected |
| `fill_price`           | CC_OPEN leg strike (the CC strike) | from CC_OPEN leg               |
| `fill_date`            | CC_OPEN leg expiration             | from CC_OPEN leg               |
| `created_at`           | now ISO string                     | generated                      |
| `updated_at`           | now ISO string                     | generated                      |

---

## Position Update

| Field         | New Value                 | Condition |
| ------------- | ------------------------- | --------- |
| `phase`       | `'WHEEL_COMPLETE'`        | always    |
| `status`      | `'CLOSED'`                | always    |
| `closed_date` | fill_date (CC expiration) | always    |
| `updated_at`  | now ISO string            | always    |

---

## New Cost Basis Snapshot

| Field                     | Value                                                   |
| ------------------------- | ------------------------------------------------------- |
| `id`                      | `randomUUID()`                                          |
| `position_id`             | position.id                                             |
| `basis_per_share`         | copied from most recent CC_OPEN snapshot                |
| `total_premium_collected` | copied from most recent CC_OPEN snapshot                |
| `final_pnl`               | `(ccStrike − basisPerShare) × sharesHeld` (4 dp string) |
| `snapshot_at`             | now ISO string                                          |
| `created_at`              | now ISO string                                          |

---

## Derived Calculations

### Final P&L

```
sharesHeld     = ccOpenLeg.contracts × 100
finalPnl       = (ccStrike − basisPerShare) × sharesHeld
```

Where `basisPerShare` is the current effective cost basis from the latest `cost_basis_snapshot`.

### Annualized Return

```
capitalDeployed   = basisPerShare × sharesHeld
cycleDays         = fill_date − position.openedDate  (calendar days, inclusive)
annualizedReturn  = (finalPnl / capitalDeployed) × (365 / cycleDays) × 100
```

Return is `null` if `cycleDays <= 0` (guard against division by zero).

---

## Validation Rules

From acceptance criteria and technical notes:

| Rule                                                 | Error field | Error code                   | Message                                           |
| ---------------------------------------------------- | ----------- | ---------------------------- | ------------------------------------------------- |
| Position must be in `CC_OPEN` phase                  | `__phase__` | `invalid_phase`              | `"No open covered call on this position"`         |
| `contracts` must be 1 (multi-contract not supported) | `contracts` | `multi_contract_unsupported` | `"Multi-contract call-away is not yet supported"` |
| `fillDate >= ccOpenLeg.fillDate`                     | `fillDate`  | `close_date_before_open`     | `"Fill date cannot be before the CC open date"`   |
| CC_OPEN leg must exist                               | `__root__`  | `no_cc_open_leg`             | `"Position has no open covered call leg"`         |

---

## State Transition

```
CC_OPEN (ACTIVE) → WHEEL_COMPLETE (CLOSED)
```

This is the terminal state for the wheel cycle — no further transitions are valid from `WHEEL_COMPLETE`.
