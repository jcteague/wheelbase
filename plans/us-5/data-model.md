# Data Model: US-5 — Record CSP Expiring Worthless

## Type Changes

### `LegAction` (src/main/core/types.ts)
Add `'EXPIRE'` to the existing enum:
```
LegAction = 'SELL' | 'BUY' | 'EXPIRE'
```
No DB migration needed — the `legs.action` column has no CHECK constraint.

---

## New Leg Record (written by `expireCspPosition`)

| Column                | Value                                    | Notes                              |
|-----------------------|------------------------------------------|------------------------------------|
| `id`                  | UUID                                     | randomUUID()                       |
| `position_id`         | parent position UUID                     |                                    |
| `leg_role`            | `'EXPIRE'`                               | existing enum value                |
| `action`              | `'EXPIRE'`                               | new enum value                     |
| `option_type`         | `'PUT'`                                  | copied from open leg               |
| `strike`              | copied from open leg                     | TEXT, 4 dp                         |
| `expiration`          | copied from open leg                     | YYYY-MM-DD                         |
| `contracts`           | copied from open leg                     | INTEGER                            |
| `premium_per_contract`| `'0.0000'`                               | expires worthless → zero fill      |
| `fill_price`          | `null`                                   | no fill price for expiration       |
| `fill_date`           | open leg's `expiration` date             | the date the option expired        |

---

## Position Record Changes (written by `expireCspPosition`)

| Column         | Before              | After             |
|----------------|---------------------|-------------------|
| `phase`        | `CSP_OPEN`          | `WHEEL_COMPLETE`  |
| `status`       | `ACTIVE`            | `CLOSED`          |
| `closed_date`  | `null`              | expiration date   |
| `updated_at`   | —                   | now               |

---

## New Cost Basis Snapshot (written by `expireCspPosition`)

| Column                   | Value                                        | Notes                              |
|--------------------------|----------------------------------------------|------------------------------------|
| `id`                     | UUID                                         |                                    |
| `position_id`            | parent position UUID                         |                                    |
| `basis_per_share`        | copied from most recent prior snapshot       | unchanged by expiration            |
| `total_premium_collected`| copied from most recent prior snapshot       | unchanged by expiration            |
| `final_pnl`              | `= total_premium_collected`                  | 100% captured                      |
| `snapshot_at`            | now + 1ms                                    | sorts after opening snapshot       |

---

## Validation Rules (enforced in `expireCsp` lifecycle engine)

| Rule                              | Error field     | Error code              | Message                                          |
|-----------------------------------|-----------------|-------------------------|--------------------------------------------------|
| `currentPhase === 'CSP_OPEN'`     | `__phase__`     | `invalid_phase`         | `'Position is not in CSP_OPEN phase'`            |
| `referenceDate >= expirationDate` | `expiration`    | `too_early`             | `'Cannot record expiration before the expiration date'` |

---

## Phase Transition

```
CSP_OPEN  →  WHEEL_COMPLETE
```
Skips any intermediate `CSP_EXPIRED` state (single-step, as specified in the story technical notes).

---

## Cost Basis Calculation (pure function in `calculateCspExpiration`)

```
finalPnl = openPremiumPerContract × contracts × 100
pnlPercentage = "100.0000"
```

Example (from AC):
- `openPremiumPerContract = 2.50`, `contracts = 1`
- `finalPnl = 2.50 × 1 × 100 = $250.00`
- `pnlPercentage = 100%`
