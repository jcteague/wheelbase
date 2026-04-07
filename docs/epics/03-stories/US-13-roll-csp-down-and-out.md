# US-13: Roll an open CSP to a different strike and expiration (roll down and out)

**As a** wheel trader with an open CSP where the underlying has moved against me,
**I want to** roll the put to a different strike and/or later expiration,
**So that** I can reduce my assignment risk while still collecting premium, and see the net credit or debit before committing.

---

## Context

When the underlying drops toward or below the CSP strike, the trader faces assignment risk. Rolling down and out — moving to a lower strike with a later expiration — reduces the probability of assignment. The lower strike means less premium, but the additional time value from the later expiration partially offsets this. This is the defensive roll: the trader is accepting a worse strike in exchange for a better probability of profit.

Rolling down frequently produces a **net debit** because the lower-strike put has less premium, especially when the underlying has dropped significantly. The app must make debits clearly visible since they increase cost basis — new wheel traders often don't realize they're digging deeper.

This story extends the roll form from US-12 to allow strike changes. The same `positions:roll-csp` IPC channel is used — the only difference is that `newStrike` is provided and may differ from the current strike.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has an open wheel on AAPL in phase CSP_OPEN
  And the current CSP has strike $180.00, expiration 2026-04-18, premium $3.50/contract, 1 contract

Scenario: Roll form allows strike change and shows roll count
  When the trader opens the roll form for this position
  Then the strike field is editable (not locked to current strike)
  And the strike field is pre-filled with $180.00
  And the trader can enter a new strike of $175.00
  And the trader can enter a new expiration of 2026-05-16
  And the form displays the current roll count for this position (e.g. "Roll #2")

Scenario: Net credit preview for roll down and out
  Given the trader enters: new strike $175.00, new expiration 2026-05-16, cost to close $2.80/contract, new premium $3.20/contract
  When the net credit/debit preview updates
  Then it shows "Net Credit: $0.40/contract ($40.00 total)"
  And the preview is displayed in green to indicate a credit
  And a label indicates "Roll Down & Out: $180 → $175 strike, Apr → May expiration"

Scenario: Net debit preview with warning for expensive roll down
  Given the trader enters: new strike $170.00, new expiration 2026-05-16, cost to close $5.20/contract, new premium $4.80/contract
  When the net credit/debit preview updates
  Then it shows "Net Debit: $0.40/contract ($40.00 total)"
  And the preview is displayed in amber/yellow with a warning icon
  And a note reads "This roll produces a net debit, which increases your cost basis"

Scenario: Successful roll down and out creates linked pair with new strike
  Given the trader enters: new strike $175.00, new expiration 2026-05-16, cost to close $2.80, new premium $3.20, fill date 2026-04-10
  When the trader confirms the roll
  Then the ROLL_FROM leg has: action BUY, strike $180.00, premium $2.80
  And the ROLL_TO leg has: action SELL, strike $175.00, expiration 2026-05-16, premium $3.20
  And both legs share the same roll_chain_id
  And the position remains in phase CSP_OPEN
  And the cost basis snapshot reflects the $0.40/contract net credit
  And the position card displays $175.00 as the active strike

Scenario: Roll to a higher strike is allowed (roll up and out — less common but valid)
  Given the trader enters a new strike of $185.00 and new expiration 2026-05-16
  When the trader confirms the roll
  Then the roll is accepted
  And a label indicates "Roll Up & Out: $180 → $185 strike, Apr → May expiration"

Scenario: Roll to same strike and same expiration is rejected
  Given the trader enters strike $180.00 and expiration 2026-04-18 (unchanged)
  When the trader attempts to confirm
  Then a validation error appears: "Roll must change the expiration, strike, or both"

Scenario: New expiration must not be earlier than current expiration
  Given the trader enters a new strike of $175.00 and new expiration of 2026-04-11
  When the trader attempts to confirm
  Then a validation error appears: "New expiration must be after the current expiration"

Scenario: Roll count warning at 3+ rolls
  Given this position has been rolled 2 times previously
  When the trader opens the roll form
  Then the form displays "Roll #3" with an informational note: "This position has been rolled multiple times — consider whether the capital is better deployed elsewhere"

Scenario Outline: Roll type label reflects strike and expiration changes
  Given the trader is on the roll form
  When the trader enters new strike <newStrike> and new expiration <newExpiration>
  Then the label shows "<rollType>"

  Examples:
    | newStrike | newExpiration | rollType        |
    | $175.00   | 2026-05-16   | Roll Down & Out |
    | $180.00   | 2026-05-16   | Roll Out        |
    | $185.00   | 2026-05-16   | Roll Up & Out   |
    | $175.00   | 2026-04-18   | Roll Down       |
    | $185.00   | 2026-04-18   | Roll Up         |
```

---

## Technical Notes

- **Reuses US-12 infrastructure.** The `rollCsp` lifecycle function, service, and IPC channel from US-12 already accept an optional `newStrike` field. This story enables the strike field in the form and adds the roll-type label logic.
- **Lifecycle validation:** New expiration must be >= current expiration (unless strike changes). If both strike and expiration are unchanged, reject. Same-expiration strike changes ("Roll Down", "Roll Up") are allowed but uncommon.
- **Roll type derivation** (pure function, renderer-side): Compare `newStrike` vs `currentStrike` and `newExpiration` vs `currentExpiration` to produce one of five labels: "Roll Out", "Roll Down & Out", "Roll Up & Out", "Roll Down", or "Roll Up".
- **Net debit warning:** Consistent with US-12 pattern — amber/yellow styling with warning icon when `costToClose > newPremium`.
- **Roll count:** Query the number of existing roll chain entries for this position. Display on the roll form. Show a soft warning at 3+ rolls — informational only, does not block the roll.
- **Position card strike update:** After a roll with a strike change, the position card must display the ROLL_TO leg's strike as the active strike, not the original.
- **Cost basis impact:** Same formula as US-12 — net credit reduces basis, net debit increases it. The strike change affects the *assignment strike* used in cost basis if the trader is later assigned. Worked example:

  ```
  Original CSP: strike $180, premium $3.50
  Roll to close: cost $2.80 (buy back original)
  Roll to open:  strike $175, premium $3.20, net credit $0.40

  Total premium collected: $3.50 + $0.40 = $3.90
  If later assigned at $175 (new strike):
    Cost basis = $175.00 − $3.90 = $171.10/share
  ```

  Note: assignment uses the *current* (rolled-to) strike, not the original.

---

## Out of Scope

- Rolling covered calls (US-14)
- Roll suggestions based on Greeks or probability (Epic 07)
- Automatic roll-type recommendation
- Multi-leg rolls (rolling multiple contracts to different strikes)
- Blocking rolls based on net debit or roll count (soft warnings only)

---

## Dependencies

- US-12: Roll out infrastructure (lifecycle function, service, IPC, form)

---

## Estimate

5 points
