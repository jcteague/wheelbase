# US-7: Open a covered call against held shares with cost basis guardrail

**As a** wheel trader holding shares after CSP assignment,
**I want to** sell a covered call against my shares and see whether the strike protects my cost basis,
**So that** I can collect additional premium and know upfront whether I'd profit or lock in a loss if the shares are called away.

---

## Context

After assignment the trader holds 100 shares per contract at their effective cost basis (strike minus CSP premiums collected). Their next move is to sell a covered call — ideally at a strike above cost basis so that if shares are called away they capture the full premium gain. Wheelbase must show the cost basis guardrail inline so the trader can evaluate the strike before confirming, without switching to another tool.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has a HOLDING_SHARES position on AAPL
  And the effective cost basis is $176.50 per share
  And the trader holds 100 shares (1 contract assigned)

Scenario: Successfully open a covered call above cost basis
  Given the trader enters strike $182.00, expiration "2026-02-21", premium $2.30, 1 contract
  When the trader submits the open CC form with fill date "2026-01-20"
  Then the position phase changes to CC_OPEN
  And a CC_OPEN leg is recorded with strike $182.00 and premium $2.30
  And the effective cost basis updates to $174.20 per share ($176.50 − $2.30)
  And the total premium collected increases by $230.00

Scenario: Strike above cost basis shows no warning
  Given the trader enters strike $182.00 (above the $176.50 cost basis)
  When the open CC form renders
  Then no warning is shown
  And a note reads "Shares called away at $182.00 → profit of $5.50/share"

Scenario: Strike at or below cost basis shows guardrail warning
  Given the trader enters strike $174.00 (below the $176.50 cost basis)
  When the open CC form renders
  Then a gold warning appears: "This strike is below your cost basis — you would lock in a loss of $2.50/share if called away"
  And the Confirm button remains enabled (warning is non-blocking)

Scenario: Strike exactly at cost basis shows guardrail warning
  Given the trader enters strike $176.50 (equal to the $176.50 cost basis)
  When the open CC form renders
  Then a gold warning appears: "This strike is at your cost basis — you would break even if called away"

Scenario: Reject open CC when not in HOLDING_SHARES phase
  Given the position is in CC_OPEN phase
  When the trader attempts to open a new covered call
  Then the action is rejected with message "A covered call is already open on this position"
  And the position remains in CC_OPEN

Scenario: Reject open CC with missing required fields
  Given the open CC form is submitted without a strike
  Then a validation error appears: "Strike is required"
  And no leg is created

Scenario: Reject CC with contracts exceeding shares held
  Given the trader holds 100 shares (1 contract)
  When the trader enters contracts as 2
  Then a validation error appears: "Contracts cannot exceed shares held (1)"
  And no leg is created

Scenario: Reject fill date before assignment date
  Given the position was assigned on "2026-01-17"
  When the trader enters fill date "2026-01-16"
  Then a validation error appears: "Fill date cannot be before the assignment date"
  And no leg is created
```

---

## Technical Notes

- New lifecycle transition: `HOLDING_SHARES → CC_OPEN` triggered by opening a CC leg
- `LegRole: CC_OPEN`, `LegAction: SELL`, `InstrumentType: CALL`
- Cost basis guardrail is client-side only: `strike < basisPerShare` → warning; `strike >= basisPerShare` → profit preview
- Profit preview (if called away at strike): `(strike − basisPerShare) × sharesHeld`
- After CC open, create new `cost_basis_snapshot`: `basisPerShare = prevBasisPerShare − ccPremiumPerContract`
- Contracts validation: `contracts ≤ position.contracts` (from assignment leg)
- Fill date must be ≤ today (no future fill dates)
- CC form appears in position detail header when `phase = HOLDING_SHARES`

---

## Out of Scope

- Selling CCs against shares acquired through purchase (not wheel assignment) — Phase 2+
- Live bid/ask price feed for the CC (Alpaca integration, Epic 06)
- Automatically suggesting strike/expiration based on Greeks (Epic 07)
- Rolling the CC (Epic 03, US-14)
- PMCC short call entry (Epic 09)

---

## Dependencies

- US-6: Assignment must be recorded; position must be in HOLDING_SHARES with a valid cost basis snapshot

## Size

5 points

## Mockup

`mockups/us-7-open-covered-call.mdx`
