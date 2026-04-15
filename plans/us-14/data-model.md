# Data Model: US-14 — Roll Open Covered Call

## No New Database Entities

US-14 does not introduce new tables or columns. The CC roll persists into the same tables as every other leg operation:

| Table                  | New rows written per roll                                    |
| ---------------------- | ------------------------------------------------------------ |
| `legs`                 | 2 — one `ROLL_FROM` (BUY CALL) and one `ROLL_TO` (SELL CALL) |
| `cost_basis_snapshots` | 1 — post-roll snapshot                                       |
| `positions`            | 0 — phase stays `CC_OPEN`, no update                         |

---

## ROLL_FROM Leg (BUY CALL — close the current CC)

| Field                  | Value                                               |
| ---------------------- | --------------------------------------------------- |
| `leg_role`             | `'ROLL_FROM'`                                       |
| `action`               | `'BUY'`                                             |
| `instrument_type`      | `'CALL'`                                            |
| `strike`               | current CC strike (from `activeLeg.strike`)         |
| `expiration`           | current CC expiration (from `activeLeg.expiration`) |
| `contracts`            | inherited from `activeLeg.contracts`                |
| `premium_per_contract` | `costToClosePerContract`                            |
| `fill_price`           | `costToClosePerContract`                            |
| `fill_date`            | payload `fillDate` or today                         |
| `roll_chain_id`        | new UUID (unique per roll event)                    |

---

## ROLL_TO Leg (SELL CALL — open the new CC)

| Field                  | Value                                                     |
| ---------------------- | --------------------------------------------------------- |
| `leg_role`             | `'ROLL_TO'`                                               |
| `action`               | `'SELL'`                                                  |
| `instrument_type`      | `'CALL'`                                                  |
| `strike`               | `newStrike` (payload value, or current strike if omitted) |
| `expiration`           | `newExpiration`                                           |
| `contracts`            | inherited from `activeLeg.contracts`                      |
| `premium_per_contract` | `newPremiumPerContract`                                   |
| `fill_price`           | `newPremiumPerContract`                                   |
| `fill_date`            | payload `fillDate` or today                               |
| `roll_chain_id`        | same UUID as ROLL_FROM leg                                |

---

## Cost Basis Snapshot

Updated using `calculateRollBasis()` from `src/main/core/costbasis.ts`:

```
net = newPremiumPerContract − costToClosePerContract
basisPerShare = prevBasisPerShare − net
totalPremiumCollected = prevTotalPremiumCollected + (net × contracts × 100)
```

A net credit (newPremium > costToClose) **reduces** basis. A net debit **increases** it.

Example from ACs:

- prevBasisPerShare: `176.50`
- costToClose: `3.50`, newPremium: `4.20`, net: `+0.70`
- postRollBasis: `176.50 − 0.70 = 175.80/share` ✓

---

## Validation Rules (from Acceptance Criteria)

| Rule                                                                   | Where enforced                         |
| ---------------------------------------------------------------------- | -------------------------------------- |
| Position must be in `CC_OPEN` phase                                    | Lifecycle engine (`rollCc`)            |
| `newExpiration >= currentExpiration`                                   | Lifecycle engine                       |
| `newStrike !== currentStrike` OR `newExpiration !== currentExpiration` | Lifecycle engine                       |
| `costToClosePerContract > 0`                                           | Lifecycle engine                       |
| `newPremiumPerContract > 0`                                            | Lifecycle engine                       |
| `newStrike > 0` (positive number)                                      | Zod schema                             |
| `newExpiration` is valid date format                                   | Zod schema                             |
| New strike below cost basis → amber warning                            | Renderer (`RollCcForm`) — non-blocking |

---

## Roll Type Classification (renderer only)

Used for the badge label shown in the form and success screen:

| Condition                       | Label                                                |
| ------------------------------- | ---------------------------------------------------- |
| same strike, same expiration    | `'No Change'` (triggers disabled submit + red error) |
| same strike, later expiration   | `'Roll Out'`                                         |
| higher strike, same expiration  | `'Roll Up'`                                          |
| lower strike, same expiration   | `'Roll Down'`                                        |
| higher strike, later expiration | `'Roll Up & Out'`                                    |
| lower strike, later expiration  | `'Roll Down & Out'`                                  |

Color mapping:

- Contains "Up" → purple (`var(--wb-purple)`)
- Contains "Down" or is "No Change" → red (`var(--wb-red)`)
- "Roll Out" → gold (`var(--wb-gold)`)
