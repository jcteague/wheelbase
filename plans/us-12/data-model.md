# Data Model: US-12 — Roll Open CSP Out

## Roll Input

| Field                  | Type                          | Validation                                         |
| ---------------------- | ----------------------------- | -------------------------------------------------- |
| positionId             | UUID string                   | Required, must match an existing CSP_OPEN position |
| costToClosePerContract | number (positive)             | > 0                                                |
| newPremiumPerContract  | number (positive)             | > 0                                                |
| newExpiration          | string (YYYY-MM-DD)           | Must be after the current CSP expiration           |
| newStrike              | number (optional)             | > 0; defaults to current strike if omitted         |
| fillDate               | string (YYYY-MM-DD, optional) | Defaults to today                                  |

## Leg Rows Created (per roll)

### ROLL_FROM leg (buy-to-close)

| Column               | Value                                             |
| -------------------- | ------------------------------------------------- |
| leg_role             | `ROLL_FROM`                                       |
| action               | `BUY`                                             |
| instrument_type      | `PUT`                                             |
| strike               | current CSP strike (unchanged)                    |
| expiration           | current CSP expiration (unchanged)                |
| contracts            | same as current CSP                               |
| premium_per_contract | `costToClosePerContract` (what it costs to close) |
| fill_date            | payload fillDate (or today)                       |
| roll_chain_id        | shared UUID generated for this roll               |

### ROLL_TO leg (sell-to-open)

| Column               | Value                                        |
| -------------------- | -------------------------------------------- |
| leg_role             | `ROLL_TO`                                    |
| action               | `SELL`                                       |
| instrument_type      | `PUT`                                        |
| strike               | `newStrike` (or current strike for roll-out) |
| expiration           | `newExpiration`                              |
| contracts            | same as current CSP                          |
| premium_per_contract | `newPremiumPerContract`                      |
| fill_date            | payload fillDate (or today)                  |
| roll_chain_id        | same UUID as ROLL_FROM                       |

## Position Row (unchanged)

The position row is **not updated** — phase stays `CSP_OPEN`, status stays `ACTIVE`. The new ROLL_TO leg becomes the effective open leg (most recent SELL leg in leg history).

## Cost Basis Snapshot

| Field                   | Value                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| basis_per_share         | `prevBasisPerShare - netCreditPerContract` (credit) or `prevBasisPerShare + netDebitPerContract` (debit)          |
| total_premium_collected | `prevTotalPremiumCollected + (newPremium - costToClose) * contracts * 100` (net, can be negative on a debit roll) |
| final_pnl               | `null` (position not closed)                                                                                      |

### Net calculation

```
netPerContract = newPremiumPerContract - costToClosePerContract
isCredit       = netPerContract > 0
basisPerShare  = prevBasisPerShare - netPerContract   // credit lowers basis; debit raises it
```

## Phase Transition

| From       | Event     | To                           |
| ---------- | --------- | ---------------------------- |
| `CSP_OPEN` | `rollCsp` | `CSP_OPEN` (no phase change) |

## Validation Rules (lifecycle engine)

1. `currentPhase === 'CSP_OPEN'` — must be in CSP_OPEN
2. `newExpiration > currentExpiration` — new expiration must be strictly later
3. `costToClosePerContract > 0` — must be positive
4. `newPremiumPerContract > 0` — must be positive
