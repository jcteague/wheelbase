# US-8: Close a covered call early (buy to close) and remain in HOLDING_SHARES

**As a** wheel trader with an open covered call,
**I want to** buy back my covered call before expiration,
**So that** I can lock in profit or cut a loss on the CC leg and free up the position to sell a new covered call.

---

## Context

Traders commonly close covered calls early at 50% of max profit rather than waiting for expiration. This captures most of the premium while reducing risk exposure and freeing capital sooner. After buying back the CC, the trader is back in HOLDING_SHARES — they still own the shares and can sell a new CC immediately. The position does not close; the wheel continues.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has a CC_OPEN position on AAPL
  And the CC was sold at $2.30 premium, strike $182.00, 1 contract
  And the effective cost basis is $174.20 per share

Scenario: Successfully close a covered call early at a profit
  Given the trader enters close price $1.10 with fill date "2026-02-01"
  When the trader submits the close CC form
  Then the position phase changes to HOLDING_SHARES
  And a CC_CLOSE leg is recorded with fill price $1.10 and fill date "2026-02-01"
  And the CC leg P&L shows +$120.00 (($2.30 − $1.10) × 1 × 100)
  And the position cost basis snapshot remains $174.20 per share (cost basis does not change on CC close)

Scenario: Close at a loss shows negative P&L
  Given the trader enters close price $3.50 (above the $2.30 open premium)
  When the trader submits the close CC form
  Then a CC_CLOSE leg is recorded with fill price $3.50
  And the CC leg P&L shows −$120.00 (($2.30 − $3.50) × 1 × 100)
  And the position remains in HOLDING_SHARES

Scenario: P&L preview shown on the form before submission
  Given the close price field shows $1.15
  When the trader views the close CC form
  Then a P&L preview shows "+$115.00 profit (50% of max)"
  And the preview updates as the trader changes the close price

Scenario: Reject close when not in CC_OPEN phase
  Given the position is in HOLDING_SHARES phase
  When the trader attempts to close a covered call
  Then the action is rejected with message "No open covered call on this position"

Scenario: Reject close price of zero or negative
  Given the close CC form is open
  When the trader enters close price "0"
  Then a validation error appears: "Close price must be greater than zero"
  And no leg is created

Scenario: Reject fill date before CC open date
  Given the CC was opened on "2026-01-20"
  When the trader enters fill date "2026-01-19"
  Then a validation error appears: "Fill date cannot be before the CC open date"
  And no leg is created
```

---

## Technical Notes

- Lifecycle transition: `CC_OPEN → HOLDING_SHARES`
- `LegRole: CC_CLOSE`, `LegAction: BUY`, `InstrumentType: CALL`
- P&L for the CC leg: `(openPremiumPerContract − closePricePerContract) × contracts × 100`
- Cost basis snapshot: **not updated** on CC close — the snapshot created when the CC was opened already reflects the CC premium reduction; closing the CC does not reverse that
- The "50% of max" label in the preview: `(openPremium − closePrice) / openPremium × 100` — show as a percentage alongside the dollar P&L
- Fill date must be ≤ today and ≥ CC open fill date
- Close button appears in position detail header when `phase = CC_OPEN`

---

## Out of Scope

- Rolling the CC (close + reopen in one atomic action) — Epic 03, US-14
- Automatic close at 50% profit alert — Epic 07
- Closing only a subset of contracts (partial close) — deferred

---

## Dependencies

- US-7: CC must be open; position must be in CC_OPEN with a CC_OPEN leg

## Size

3 points

## Mockup

`mockups/us-8-close-covered-call-early.mdx`
