# US-14: Roll an open covered call to a new expiration or strike

**As a** wheel trader with an open covered call approaching expiration or being challenged by a rising stock,
**I want to** roll the call to a higher strike and/or later expiration and see the net credit or debit before confirming,
**So that** I can avoid having shares called away prematurely or extend premium collection while managing my risk.

---

## Context

CC rolls are the mirror image of CSP rolls. The most common scenario: the stock has risen toward the CC strike and the trader wants to avoid call-away. Rolling the CC up and out — higher strike, later expiration — gives more room for the stock to move while collecting additional time value. Unlike CSP rolls where the trader lowers strike defensively, CC rolls typically raise strike offensively.

The critical constraint for CC rolls: the new CC strike should ideally remain at or above the position's effective cost basis. Selling a CC below cost basis locks in a guaranteed loss if called away. The roll form must display the cost basis alongside the new strike to make this visible.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has an open wheel on AAPL in phase CC_OPEN
  And the current CC has strike $185.00, expiration 2026-04-18, premium $2.50/contract, 1 contract
  And the position's effective cost basis is $176.50/share

Scenario: Roll form shows current CC details and cost basis context
  When the trader opens the roll form for this CC
  Then the form displays: current strike $185.00, expiration 2026-04-18, DTE remaining, premium collected
  And the form shows the effective cost basis: $176.50/share
  And the form has inputs for: new strike, new expiration, cost to close (per contract), new premium (per contract), fill date

Scenario: Net credit preview for CC roll up and out
  Given the trader enters: new strike $190.00, new expiration 2026-05-16, cost to close $3.50/contract, new premium $4.20/contract
  When the net credit/debit preview updates
  Then it shows "Net Credit: $0.70/contract ($70.00 total)"
  And a label indicates "Roll Up & Out: $185 → $190 strike, Apr → May expiration"

Scenario: Warning when new CC strike is below cost basis
  Given the effective cost basis is $176.50/share
  When the trader enters a new strike of $175.00
  Then a warning appears: "New strike ($175.00) is below your cost basis ($176.50). If called away, this guarantees a loss of $1.50/share."
  And the confirm button remains enabled (warning, not blocking)

Scenario: Successful CC roll creates linked leg pair
  Given the trader enters: new strike $190.00, new expiration 2026-05-16, cost to close $3.50, new premium $4.20, fill date 2026-04-10
  When the trader confirms the roll
  Then the ROLL_FROM leg has: action BUY, option_type CALL, strike $185.00, premium $3.50
  And the ROLL_TO leg has: action SELL, option_type CALL, strike $190.00, expiration 2026-05-16, premium $4.20
  And both legs share the same roll_chain_id
  And the position remains in phase CC_OPEN
  And the cost basis snapshot is updated with the roll's net credit ($0.70/contract)
  And the cost basis snapshot shows $175.80/share ($176.50 − $0.70 net credit per share)

Scenario: CC roll out (same strike, later expiration)
  Given the trader enters: new strike $185.00 (same), new expiration 2026-05-16, cost to close $1.80, new premium $3.10
  When the trader confirms the roll
  Then the roll is accepted
  And the label shows "Roll Out: same $185 strike, Apr → May expiration"

Scenario: CC roll down and out (lower strike — defensive)
  Given the stock has dropped and the trader enters: new strike $182.00, new expiration 2026-05-16
  When the trader confirms the roll
  Then the roll is accepted
  And the label shows "Roll Down & Out: $185 → $182 strike"

Scenario: CC roll up — same expiration, higher strike
  Given the trader enters: new strike $190.00, new expiration 2026-04-18 (unchanged), cost to close $2.00, new premium $3.50
  When the trader confirms the roll
  Then the roll is accepted
  And the label shows "Roll Up: $185 → $190 strike, same Apr expiration"

Scenario: Net debit roll — cost to close exceeds new premium
  Given the CC is deep ITM after a gap-up event
  And the trader enters: new strike $190.00, new expiration 2026-05-16, cost to close $5.00/contract, new premium $3.50/contract
  When the net credit/debit preview updates
  Then it shows "Net Debit: $1.50/contract ($150.00 total)"
  And the confirm button remains enabled (debit rolls are valid — traders may pay to move a deep ITM call)

Scenario: Validation — new expiration must not be before current expiration
  Given the current expiration is 2026-04-18
  When the trader enters new expiration 2026-03-21
  Then a validation error appears: "New expiration must be on or after the current expiration (Apr 18, 2026)"
  And the confirm button is disabled

Scenario: Validation — new expiration or strike must differ
  Given the trader enters strike $185.00 and expiration 2026-04-18 (both unchanged)
  When the trader attempts to confirm
  Then a validation error appears: "Roll must change the expiration, strike, or both"

Scenario: Validation — cost to close and new premium must be positive
  Given the trader enters cost to close as $0.00
  When the trader attempts to confirm
  Then a validation error appears: "Cost to close must be greater than zero"
```

---

## Technical Notes

- **Lifecycle engine:** Add `rollCc(input)` to `src/main/core/lifecycle.ts`. Validates current phase is `CC_OPEN`, similar validations to `rollCsp` but for calls. Returns `{ phase: 'CC_OPEN' }`.
- **Service layer:** Add `rollCcPosition(db, positionId, payload)` to services. Same atomic transaction pattern as CSP roll: ROLL_FROM (BUY CALL) + ROLL_TO (SELL CALL) + cost basis snapshot.
- **IPC:** Register `positions:roll-cc` channel.
- **Schema:** Create `RollCcPayloadSchema` — same fields as `RollCspPayloadSchema` but `instrumentType` is CALL.
- **Cost basis warning:** The below-cost-basis warning is a renderer-side calculation: compare `newStrike` against the _post-roll_ basis (`costBasisSnapshot.basisPerShare − netCreditPerShare`). The form should display both current basis and projected post-roll basis. This is a warning, not a validation error — experienced traders may intentionally sell below basis in specific scenarios.
- **Roll_chain_id:** Use the same UUID linking mechanism as CSP rolls. If a position has been rolled before (e.g., CSP was rolled, then assigned, now CC is being rolled), the CC roll gets its own new `roll_chain_id` — chains are per-roll-event, not per-position.

---

## Out of Scope

- Roll suggestions based on Greeks (Epic 07)
- Strike selection helpers showing delta/probability (Epic 03 — future enhancement)
- PMCC short call rolls (Epic 09)
- Broker-executed rolls (Epic 10)

---

## Dependencies

- US-7: Open covered call (CC_OPEN phase must exist)
- US-12: CSP roll infrastructure (shared patterns for lifecycle validation, service, and form)

---

## Estimate

5 points
