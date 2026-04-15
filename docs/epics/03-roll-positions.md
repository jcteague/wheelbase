# Epic: Roll Positions with Full History

## Phase

Phase 1

## Goal

A trader can roll any open leg (CSP or CC) to a new strike and/or expiration, see the net credit or debit before confirming, and review the complete roll history on the position detail page. The full transaction history is preserved as linked leg pairs — never mutated in place.

## Success Criteria

- Trader initiates a roll on any open leg (CSP or CC)
- Roll form shows: current leg details, new leg inputs, and calculated net credit/debit
- Confirming the roll atomically closes the old leg and opens the new one as a linked pair (roll_chain_id)
- Cost basis updates to reflect the roll's net credit or debit
- Position detail page shows each roll as a linked pair in the leg timeline
- Multiple sequential rolls on the same position are tracked and displayed correctly
- Lifecycle engine validates the roll: position stays in the same phase (CSP_OPEN or CC_OPEN)

## Vertical Slice

| Layer        | What ships                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| Core engines | Roll validation in lifecycle engine, cost basis recalculation with roll credits/debits                        |
| Database     | roll_chain_id linking on Leg model                                                                            |
| API          | POST /api/positions/:id/roll (atomic close + open)                                                            |
| Frontend     | Roll form with current leg summary, new leg inputs, net credit/debit preview, roll history in position detail |

## Stories

- [ ] US-12: Roll an open CSP to a new expiration (roll out) with net credit/debit preview
- [ ] US-13: Roll an open CSP to a different strike and expiration (roll down and out)
- [ ] US-14: Roll an open CC to a new expiration or strike
- [ ] US-15: Display linked roll pairs in the position detail leg timeline
- [ ] US-16: Update cost basis correctly after multiple sequential rolls
- [ ] US-17: Reject a roll when the position is not in a rollable phase

## Dependencies

- Epic 01: Open and Track a CSP (CSP rolls)
- Epic 02: Assignment and Covered Calls (CC rolls)

## Strategy

Classic Wheel (PMCC rolls are covered in Epic 09)

## Out of Scope

- Roll execution via broker API (Epic 10)
- Roll suggestions or automation (Epic 07)
- PMCC LEAPS rolls (Epic 09)
