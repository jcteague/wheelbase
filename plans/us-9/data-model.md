# Data Model: US-9 — Record CC Expiring Worthless

## No New Tables or Columns

US-9 uses only existing database tables. No migration is required.

---

## New Leg Written at Expiry

A single EXPIRE leg is inserted into the `legs` table.

| Column                | Value                                        |
|-----------------------|----------------------------------------------|
| `id`                  | new UUID                                     |
| `position_id`         | the CC_OPEN position's ID                   |
| `leg_role`            | `'EXPIRE'`                                   |
| `action`              | `'EXPIRE'`                                   |
| `instrument_type`     | `'CALL'`                                     |
| `strike`              | copied from the active CC_OPEN leg           |
| `expiration`          | copied from the active CC_OPEN leg           |
| `contracts`           | copied from the active CC_OPEN leg           |
| `premium_per_contract`| `'0.0000'` — expiration collects no premium  |
| `fill_price`          | `NULL` — no market fill on expiry            |
| `fill_date`           | the CC's expiration date string (YYYY-MM-DD) |
| `created_at`          | ISO timestamp now                            |
| `updated_at`          | ISO timestamp now                            |

---

## Position Update at Expiry

The `positions` row is updated (not closed).

| Column        | Before         | After              |
|---------------|----------------|--------------------|
| `phase`       | `CC_OPEN`      | `HOLDING_SHARES`   |
| `status`      | `ACTIVE`       | `ACTIVE` (no change) |
| `closed_date` | `NULL`         | `NULL` (no change) |
| `updated_at`  | prior value    | ISO timestamp now  |

---

## Cost Basis Snapshot

**No new snapshot is written.** The CC premium was already incorporated into the snapshot created when the CC was opened (US-7). The existing snapshot remains the source of truth for `basisPerShare` and `totalPremiumCollected`.

---

## Phase Transition

```
CC_OPEN  ──expireCc()──►  HOLDING_SHARES
```

This is the only valid lifecycle transition for CC expiry. The position stays `ACTIVE`.

---

## Validation Rules

| Rule | Error field | Error code | Message |
|------|-------------|------------|---------|
| `currentPhase === 'CC_OPEN'` | `__phase__` | `invalid_phase` | `"No open covered call on this position"` |
| `referenceDate >= expirationDate` | `expiration` | `too_early` | `"Cannot record expiration before the expiration date (YYYY-MM-DD)"` where the date is the actual `expirationDate` value |

---

## Active Leg Lookup

`getPosition` returns `activeLeg` using the query:
```sql
WHERE (p.phase = 'CC_OPEN' AND leg_role = 'CC_OPEN')
```
This is already implemented in `src/main/services/get-position.ts`. No changes needed.

---

## Shares Held Computation

```
sharesHeld = ASSIGN leg.contracts × 100
```

The ASSIGN leg is retrieved from `positionDetail.legs` (full leg history). This value is included in the IPC result so the renderer can display "Still Holding: N shares of TICKER".
