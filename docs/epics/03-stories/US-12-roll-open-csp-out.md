# US-12: Roll an open CSP to a new expiration (roll out) with net credit/debit preview

**As a** wheel trader with an open CSP approaching expiration,
**I want to** roll the put to a later expiration at the same strike and see the net credit or debit before confirming,
**So that** I can extend the trade, collect additional premium, and make an informed decision about whether the roll is worth it.

---

## Context

Rolling out is the most common roll type for CSPs. The underlying hasn't moved enough to trigger assignment, but the trader wants more time for theta decay rather than letting the option expire and re-entering. A roll is always two atomic transactions: buy-to-close the current put, then sell-to-open a new put at a later expiration. The net credit/debit preview is critical — traders will reject a roll that costs more to close than the new premium provides.

This story introduces the roll form UI, the `rollCsp` lifecycle validation, the atomic roll service, and the `positions:roll-csp` IPC channel. US-13 extends this to support strike changes (roll down and out).

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has an open wheel on AAPL in phase CSP_OPEN
  And the current CSP has strike $180.00, expiration 2026-04-18, premium $3.50/contract, 1 contract

Scenario: Roll form shows current leg summary and new leg inputs
  When the trader opens the roll form for this position
  Then the form displays the current leg: strike $180.00, expiration 2026-04-18, DTE remaining, premium collected $350.00
  And the form has inputs for: new expiration date, cost to close (per contract), new premium (per contract)
  And the strike field is pre-filled with $180.00 and read-only (roll out keeps the same strike)

Scenario: Net credit/debit preview updates as trader enters values
  Given the trader is on the roll form
  When the trader enters cost to close as $1.20/contract and new premium as $2.80/contract
  Then the net credit/debit preview shows "Net Credit: $1.60/contract ($160.00 total)"
  And the preview is displayed in green to indicate a credit

Scenario: Net debit preview shown with warning
  Given the trader is on the roll form
  When the trader enters cost to close as $3.00/contract and new premium as $2.50/contract
  Then the net credit/debit preview shows "Net Debit: $0.50/contract ($50.00 total)"
  And the preview is displayed in amber/yellow with a warning icon
  And a note reads "This roll will cost more to close than the new premium provides"

Scenario: Successful CSP roll out creates linked leg pair
  Given the trader enters cost to close as $1.20, new premium as $2.80, new expiration as 2026-05-16
  When the trader confirms the roll
  Then the old CSP leg is closed with a ROLL_FROM leg (action: BUY, premium: $1.20)
  And a new CSP leg is opened with a ROLL_TO leg (action: SELL, strike: $180.00, expiration: 2026-05-16, premium: $2.80)
  And both legs share the same roll_chain_id
  And the position remains in phase CSP_OPEN
  And a new cost basis snapshot is created reflecting the roll's net credit
  And the trader is returned to the position detail page

Scenario: Roll form validates new expiration is later than current
  Given the trader enters a new expiration of 2026-04-11 (before the current 2026-04-18)
  When the trader attempts to confirm the roll
  Then a validation error appears: "New expiration must be after the current expiration"
  And the roll is not executed

Scenario: Roll form validates positive cost to close
  Given the trader enters cost to close as $0.00
  When the trader attempts to confirm the roll
  Then a validation error appears: "Cost to close must be greater than zero"

Scenario: Roll form validates positive new premium
  Given the trader enters new premium as $0.00
  When the trader attempts to confirm the roll
  Then a validation error appears: "New premium must be greater than zero"
```

---

## Technical Notes

- **Lifecycle engine:** Add `rollCsp(input)` to `src/main/core/lifecycle.ts`. Validates current phase is `CSP_OPEN`, new expiration > current expiration, positive amounts. Returns `{ phase: 'CSP_OPEN' }` (phase does not change on roll).
- **Service layer:** Add `rollCspPosition(db, positionId, payload)` to `src/main/services/positions.ts`. This is a single DB transaction that: (1) inserts ROLL_FROM leg with action BUY, (2) inserts ROLL_TO leg with action SELL, (3) links both with a shared `roll_chain_id` (UUID), (4) creates a new cost basis snapshot.
- **IPC:** Register `positions:roll-csp` channel in `src/main/ipc/positions.ts`.
- **Schema:** Create `RollCspPayloadSchema` in `src/main/schemas.ts` with fields: `costToClosePerContract`, `newPremiumPerContract`, `newExpiration`, `fillDate`. The `newStrike` field is included but optional (defaults to current strike for roll-out; US-13 uses it for roll down).
- **Cost basis:** Net credit reduces effective basis, net debit increases it. Formula: `netCreditOrDebit = newPremium - costToClose`. Add to cost basis snapshot: `prevBasis - netCredit` (credit reduces basis) or `prevBasis + netDebit` (debit increases basis).
- **Existing infrastructure:** `roll_chain_id` column and `ROLL_FROM`/`ROLL_TO` leg roles already exist in schema and types.

---

## Out of Scope

- Changing the strike price (US-13: roll down and out)
- Rolling covered calls (US-14)
- Roll history display on position detail (US-15)
- Sequential roll cost basis tracking (US-16)
- Broker-executed rolls via Alpaca (Epic 10)
- Roll suggestions or automation (Epic 07)

---

## Dependencies

- US-1 through US-5: Core CSP lifecycle must be implemented (position creation, CSP open)

---

## Estimate

5 points
