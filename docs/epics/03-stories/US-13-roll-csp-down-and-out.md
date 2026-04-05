# US-13: Roll an open CSP to a different strike and expiration (roll down and out)

**As a** wheel trader with an open CSP where the underlying has moved against me,
**I want to** roll the put to a lower strike and later expiration,
**So that** I can reduce my assignment risk while still collecting premium, and see the net credit or debit before committing.

---

## Context

When the underlying drops toward or below the CSP strike, the trader faces assignment risk. Rolling down and out — moving to a lower strike with a later expiration — reduces the probability of assignment. The lower strike means less premium, but the additional time value from the later expiration partially offsets this. This is the defensive roll: the trader is accepting a worse strike in exchange for a better probability of profit.

This story extends the roll form from US-12 to allow strike changes. The same `positions:roll-csp` IPC channel is used — the only difference is that `newStrike` is provided and differs from the current strike.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has an open wheel on AAPL in phase CSP_OPEN
  And the current CSP has strike $180.00, expiration 2026-04-18, premium $3.50/contract, 1 contract

Scenario: Roll form allows strike change for roll down and out
  When the trader opens the roll form for this position
  Then the strike field is editable (not locked to current strike)
  And the trader can enter a new strike of $175.00
  And the trader can enter a new expiration of 2026-05-16

Scenario: Net credit preview for roll down and out
  Given the trader enters: new strike $175.00, new expiration 2026-05-16, cost to close $2.80/contract, new premium $3.20/contract
  When the net credit/debit preview updates
  Then it shows "Net Credit: $0.40/contract ($40.00 total)"
  And a label indicates "Roll Down & Out: $180 → $175 strike, Apr → May expiration"

Scenario: Successful roll down and out creates linked pair with new strike
  Given the trader enters: new strike $175.00, new expiration 2026-05-16, cost to close $2.80, new premium $3.20, fill date 2026-04-10
  When the trader confirms the roll
  Then the ROLL_FROM leg has: action BUY, strike $180.00, premium $2.80
  And the ROLL_TO leg has: action SELL, strike $175.00, expiration 2026-05-16, premium $3.20
  And both legs share the same roll_chain_id
  And the position remains in phase CSP_OPEN
  And the cost basis snapshot reflects the $0.40/contract net credit

Scenario: Roll to a higher strike is allowed (roll up — less common but valid)
  Given the trader enters a new strike of $185.00 and new expiration 2026-05-16
  When the trader confirms the roll
  Then the roll is accepted
  And a label indicates "Roll Up & Out: $180 → $185 strike"

Scenario: Roll to same strike and same expiration is rejected
  Given the trader enters strike $180.00 and expiration 2026-04-18 (unchanged)
  When the trader attempts to confirm
  Then a validation error appears: "Roll must change the expiration, strike, or both"

Scenario: Roll type label reflects the direction of the strike change
  Given the trader is on the roll form
  When the new strike is lower than the current strike
  Then the label shows "Roll Down & Out"
  When the new strike equals the current strike
  Then the label shows "Roll Out"
  When the new strike is higher than the current strike
  Then the label shows "Roll Up & Out"
```

---

## Technical Notes

- **Reuses US-12 infrastructure.** The `rollCsp` lifecycle function, service, and IPC channel from US-12 already accept an optional `newStrike` field. This story enables the strike field in the form and adds the roll-type label logic.
- **Lifecycle validation:** If `newStrike` differs from current strike but `newExpiration` equals current expiration, this is a same-expiration strike change — allow it but note it's uncommon. If both strike and expiration are unchanged, reject.
- **Roll type derivation** (pure function, renderer-side): Compare `newStrike` vs `currentStrike` and `newExpiration` vs `currentExpiration` to label as "Roll Out", "Roll Down & Out", "Roll Up & Out", "Roll Down", or "Roll Up".
- **Cost basis impact:** Same formula as US-12 — net credit reduces basis, net debit increases it. The strike change doesn't affect the cost basis calculation directly; only the net credit/debit matters.

---

## Out of Scope

- Rolling covered calls (US-14)
- Roll suggestions based on Greeks or probability (Epic 07)
- Automatic roll-type recommendation
- Multi-leg rolls (rolling multiple contracts to different strikes)

---

## Dependencies

- US-12: Roll out infrastructure (lifecycle function, service, IPC, form)

---

## Estimate

3 points
