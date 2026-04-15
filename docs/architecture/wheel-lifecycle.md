# Wheel Lifecycle & Domain Model

The options wheel strategy: sell puts → accept assignment → sell calls → repeat or exit.

## Phase state machine

```
                    CSP_OPEN
                   /    |    \
     CSP_EXPIRED  CSP_CLOSED  HOLDING_SHARES
         |        /      \          |
   WHEEL_COMPLETE PROFIT  LOSS    CC_OPEN
                                /    |    \
                   CC_EXPIRED  CC_CLOSED  (called away)
                       |       /      \         |
                 WHEEL_COMPLETE PROFIT  LOSS  WHEEL_COMPLETE
```

### All phases

| Phase               | Meaning                                             | Status                        |
| ------------------- | --------------------------------------------------- | ----------------------------- |
| `CSP_OPEN`          | Cash-secured put sold, waiting for expiration/close | ACTIVE                        |
| `CSP_EXPIRED`       | Put expired worthless                               | CLOSED                        |
| `CSP_CLOSED_PROFIT` | Put bought back for less than sold                  | CLOSED                        |
| `CSP_CLOSED_LOSS`   | Put bought back for more than sold                  | CLOSED                        |
| `HOLDING_SHARES`    | Assigned, holding 100 shares per contract           | ACTIVE                        |
| `CC_OPEN`           | Covered call sold against shares                    | ACTIVE                        |
| `CC_EXPIRED`        | Call expired worthless                              | ACTIVE (still holding shares) |
| `CC_CLOSED_PROFIT`  | Call bought back for less                           | ACTIVE                        |
| `CC_CLOSED_LOSS`    | Call bought back for more                           | ACTIVE                        |
| `WHEEL_COMPLETE`    | Shares called away or position fully exited         | CLOSED                        |

### Implemented transitions (Phase 1)

| From       | Action           | To                                       | Service             |
| ---------- | ---------------- | ---------------------------------------- | ------------------- |
| (new)      | Sell CSP         | `CSP_OPEN`                               | `createPosition`    |
| `CSP_OPEN` | Buy to close     | `CSP_CLOSED_PROFIT` or `CSP_CLOSED_LOSS` | `closeCspPosition`  |
| `CSP_OPEN` | Expire worthless | `WHEEL_COMPLETE`                         | `expireCspPosition` |

Future phases will add: assignment, covered call open/close/expire, roll operations.

## Leg roles

Each transaction on a position is a "leg":

| Role        | Action | When                              |
| ----------- | ------ | --------------------------------- |
| `CSP_OPEN`  | SELL   | Open a cash-secured put           |
| `CSP_CLOSE` | BUY    | Buy back the put                  |
| `CC_OPEN`   | SELL   | Sell a covered call               |
| `CC_CLOSE`  | BUY    | Buy back the call                 |
| `ASSIGN`    | —      | Assignment (shares received)      |
| `ROLL_FROM` | BUY    | Close existing leg (part of roll) |
| `ROLL_TO`   | SELL   | Open new leg (part of roll)       |
| `EXPIRE`    | EXPIRE | Option expired worthless          |

Legs are **immutable** — never updated after insert. Rolls are stored as linked pairs via `roll_chain_id`.

## Cost basis calculation

### CSP open

```
basis_per_share = strike - premium_per_contract
total_premium   = premium_per_contract × contracts × 100
```

### CSP close (buy to close)

```
net_pnl     = (open_premium - close_price) × contracts × 100
pnl_percent = net_pnl / (open_premium × contracts × 100) × 100
```

Positive net_pnl → CLOSED_PROFIT. Negative → CLOSED_LOSS.

### CSP expiration

```
final_pnl   = open_premium × contracts × 100  (keep 100% of premium)
pnl_percent = 100%
```

### Full wheel (future)

```
effective_basis = assignment_strike
                - CSP_premiums_collected
                - CC_premiums_collected
                + roll_debits
                - roll_credits
```

## Validation rules

### openWheel (create position)

| Field                | Rule                     |
| -------------------- | ------------------------ |
| ticker               | 1-5 uppercase letters    |
| strike               | Positive decimal         |
| contracts            | Positive integer         |
| premium_per_contract | Positive decimal         |
| fill_date            | Not in future            |
| expiration           | Strictly after fill_date |

### closeCsp (buy to close)

| Field       | Rule                             |
| ----------- | -------------------------------- |
| phase       | Must be `CSP_OPEN`               |
| close_price | Positive decimal                 |
| close_date  | >= open fill_date, <= expiration |

### expireCsp (expire worthless)

| Field          | Rule               |
| -------------- | ------------------ |
| phase          | Must be `CSP_OPEN` |
| reference_date | >= expiration date |

All validation happens in core engines (`src/main/core/lifecycle.ts`) which throw `ValidationError(field, code, message)`. Core engines are pure functions — no DB or I/O imports.

## Cost basis snapshots

A new snapshot is inserted (never updated) after every leg event. This provides an immutable audit trail of how cost basis evolved over the wheel's lifetime.

Query latest: `SELECT * FROM cost_basis_snapshots WHERE position_id = ? ORDER BY snapshot_at DESC LIMIT 1`
