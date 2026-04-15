# Data Model: US-8 — Close Covered Call Early

## Lifecycle Transition

| From Phase | To Phase         | Trigger                          |
| ---------- | ---------------- | -------------------------------- |
| `CC_OPEN`  | `HOLDING_SHARES` | `closeCoveredCall()` engine call |

No other phase transitions are valid — calling from any other phase throws a `ValidationError`.

## New Leg: CC_CLOSE

When the CC is closed early, a new leg row is inserted:

| Field                | Value                                   | Notes                                   |
| -------------------- | --------------------------------------- | --------------------------------------- |
| `id`                 | `randomUUID()`                          |                                         |
| `positionId`         | input                                   |                                         |
| `legRole`            | `'CC_CLOSE'`                            | Already in enum                         |
| `action`             | `'BUY'`                                 | Buy to close                            |
| `instrumentType`     | `'CALL'`                                |                                         |
| `strike`             | from CC_OPEN leg                        | Decimal-formatted to 4dp                |
| `expiration`         | from CC_OPEN leg                        |                                         |
| `contracts`          | from CC_OPEN leg                        | Must match; partial close not supported |
| `premiumPerContract` | `closePricePerContract` (formatted 4dp) | The buy-to-close fill price             |
| `fillPrice`          | same as `premiumPerContract`            |                                         |
| `fillDate`           | from payload (or today)                 |                                         |

## Position Update

| Field       | New Value        |
| ----------- | ---------------- |
| `phase`     | `HOLDING_SHARES` |
| `updatedAt` | now              |

## No Cost Basis Snapshot Update

The existing `cost_basis_snapshots` row created during `CC_OPEN` is **not** modified or replaced. The cost basis is unchanged by the close.

## CC Leg P&L (computed, not stored)

Returned in the IPC response for the renderer to display:

```
ccLegPnl = (openPremiumPerContract − closePricePerContract) × contracts × 100
```

`Decimal.js` with `ROUND_HALF_UP`, 4 decimal places internally, serialised as a string.

## Validation Rules

| Rule                         | Error field             | Error code                    | Message                                                                          |
| ---------------------------- | ----------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `currentPhase !== 'CC_OPEN'` | `__phase__`             | `invalid_phase`               | `'No open covered call on this position'`                                        |
| `closePricePerContract <= 0` | `closePricePerContract` | `must_be_positive`            | `'Close price must be greater than zero'`                                        |
| `fillDate < openFillDate`    | `fillDate`              | `close_date_before_open`      | `'Fill date cannot be before the CC open date'`                                  |
| `fillDate > expiration`      | `fillDate`              | `close_date_after_expiration` | `'Fill date cannot be after the CC expiration date — use Record Expiry instead'` |

## P&L Preview Display Logic (renderer)

| Condition                    | Display                               |
| ---------------------------- | ------------------------------------- |
| `closePrice < openPremium`   | `+$X.XX profit · Y.Y% of max` (green) |
| `closePrice > openPremium`   | `−$X.XX loss · Y.Y% above open` (red) |
| `closePrice === openPremium` | `$0.00 break-even` (neutral)          |
| `closePrice <= 0` or empty   | No preview                            |
