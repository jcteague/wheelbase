# Data Model: US-4 — Close a CSP Early

## No new tables or columns required

The existing schema fully supports CSP closing. No migration is needed.

---

## Entities affected

### `positions` row (UPDATE)

When a CSP is closed:

| Field         | Before close   | After close                              |
| ------------- | -------------- | ---------------------------------------- |
| `phase`       | `CSP_OPEN`     | `CSP_CLOSED_PROFIT` or `CSP_CLOSED_LOSS` |
| `status`      | `ACTIVE`       | `CLOSED`                                 |
| `closed_date` | `NULL`         | close fill date (ISO string)             |
| `updated_at`  | open timestamp | close timestamp                          |

### `legs` row (INSERT — close leg)

A new leg row is inserted with:

| Field                  | Value                                |
| ---------------------- | ------------------------------------ |
| `id`                   | new UUID                             |
| `position_id`          | parent position ID                   |
| `leg_role`             | `'CSP_CLOSE'`                        |
| `action`               | `'BUY'`                              |
| `option_type`          | `'PUT'`                              |
| `strike`               | copied from the CSP_OPEN leg         |
| `expiration`           | copied from the CSP_OPEN leg         |
| `contracts`            | copied from the CSP_OPEN leg         |
| `premium_per_contract` | close price per contract (4 dp TEXT) |
| `fill_price`           | close price per contract (4 dp TEXT) |
| `fill_date`            | close fill date (ISO string)         |
| `created_at`           | now                                  |
| `updated_at`           | now                                  |

### `cost_basis_snapshots` row (INSERT — close snapshot)

A new snapshot row is inserted with:

| Field                     | Value                                                      |
| ------------------------- | ---------------------------------------------------------- |
| `id`                      | new UUID                                                   |
| `position_id`             | parent position ID                                         |
| `basis_per_share`         | copied from the opening snapshot                           |
| `total_premium_collected` | copied from the opening snapshot                           |
| `final_pnl`               | `(openPremium − closePrice) × contracts × 100` (4 dp TEXT) |
| `annualized_return`       | `NULL` (future story)                                      |
| `snapshot_at`             | now                                                        |
| `created_at`              | now                                                        |

---

## Phase transition

```
CSP_OPEN  ──(net P&L > 0)──►  CSP_CLOSED_PROFIT
CSP_OPEN  ──(net P&L ≤ 0)──►  CSP_CLOSED_LOSS
```

The determination is made by the lifecycle engine (`closeCsp()`):

```
netPnlPerContract = openPremiumPerContract − closePricePerContract
phase = netPnlPerContract > 0 ? 'CSP_CLOSED_PROFIT' : 'CSP_CLOSED_LOSS'
```

---

## P&L calculations (cost basis engine `calculateCspClose()`)

| Field           | Formula                                          | Example ($2.50 open, $1.00 close, 1 contract) |
| --------------- | ------------------------------------------------ | --------------------------------------------- |
| `finalPnl`      | `(openPremium − closePrice) × contracts × 100`   | `(2.50 − 1.00) × 1 × 100 = 150.00`            |
| `pnlPercentage` | `(openPremium − closePrice) / openPremium × 100` | `1.50 / 2.50 × 100 = 60`                      |

`pnlPercentage` is returned by the engine for display but is **not stored** in the DB (derivable).

---

## Validation rules

| Rule                                 | Error field             | Error code                    | Message                                    |
| ------------------------------------ | ----------------------- | ----------------------------- | ------------------------------------------ |
| Position must be in `CSP_OPEN` phase | `__phase__`             | `invalid_phase`               | Position is not in CSP_OPEN phase          |
| Close price must be > 0              | `closePricePerContract` | `must_be_positive`            | Close price must be positive               |
| Close fill date ≥ open leg fill date | `fillDate`              | `close_date_before_open`      | Close date cannot be before the open date  |
| Close fill date ≤ expiration         | `fillDate`              | `close_date_after_expiration` | Close date cannot be after expiration date |

---

## New types to add to `src/main/schemas.ts`

```typescript
CloseCspPayloadSchema // IPC input: positionId, closePricePerContract, fillDate?
CloseCspPayload // inferred from schema
CloseCspPositionResult // IPC return: { position, leg, costBasisSnapshot }
GetPositionResult // IPC return: position detail with active leg + snapshot
```

---

## New type to add to `src/main/core/lifecycle.ts`

```typescript
CloseCspInput // currentPhase, closePricePerContract, openPremiumPerContract, closeFillDate, openFillDate, expiration
CloseCspResult // phase: 'CSP_CLOSED_PROFIT' | 'CSP_CLOSED_LOSS'
```

## New types to add to `src/main/core/costbasis.ts`

```typescript
CspCloseInput // openPremiumPerContract, closePricePerContract, contracts
CspCloseResult // finalPnl: string, pnlPercentage: string
```
