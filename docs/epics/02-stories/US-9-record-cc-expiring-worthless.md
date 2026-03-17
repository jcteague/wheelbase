# US-9: Record a covered call expiring worthless and remain in HOLDING_SHARES

**As a** wheel trader with an open covered call at expiration,
**I want to** record that my covered call expired worthless,
**So that** my position reflects that I still hold the shares and have collected the full CC premium, ready to sell the next covered call.

---

## Context

When the underlying stays below the CC strike at expiration, the option expires worthless and the trader keeps the entire premium. The trader then waits 1–3 days before selling the next CC (to avoid re-entering at a bad strike right after expiration). Unlike CSP expiry which closes the wheel, CC expiry keeps the position alive — the trader still holds shares and will sell another CC to continue the wheel.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has a CC_OPEN position on AAPL
  And the CC strike is $182.00 with $2.30 premium, expiration "2026-02-21", 1 contract
  And today is on or after "2026-02-21"

Scenario: Successfully record a CC expiring worthless
  Given the position is in CC_OPEN phase on expiration date "2026-02-21"
  When the trader clicks "Record Expiration →" and confirms
  Then the position phase changes back to HOLDING_SHARES
  And an EXPIRE leg is recorded with fill_date "2026-02-21" and premium $0.00
  And the success screen shows "+$230.00 premium captured (100%)"
  And a "Sell New Covered Call" CTA is visible

Scenario: Full premium kept in the success state
  Given the CC was sold at $2.30 premium, 1 contract
  When the expiration is recorded
  Then the success screen shows total premium collected including this CC: $230.00

Scenario: Reject expiration before the expiration date
  Given today is "2026-02-20" (one day before expiration "2026-02-21")
  When the trader attempts to record expiration
  Then the action is rejected with message "Cannot record expiration before the expiration date (2026-02-21)"
  And the position remains in CC_OPEN

Scenario: Reject expiration when not in CC_OPEN phase
  Given the position is in HOLDING_SHARES phase
  When the trader attempts to record CC expiration
  Then the action is rejected with message "No open covered call on this position"

Scenario: Success state shows strategic nudge before sell-next-CC CTA
  Given the CC expiration has been confirmed
  Then the success screen shows:
    "Many traders wait 1–3 days before selling the next covered call — avoid chasing premium right at expiration."
  And a "Sell New Covered Call on AAPL →" button is visible below the nudge
```

---

## Technical Notes

- Lifecycle transition: `CC_OPEN → HOLDING_SHARES`
- `LegRole: EXPIRE`, `LegAction: EXPIRE`, `InstrumentType: CALL`
- `fill_price: NULL`, `premium_per_contract: '0.0000'`, `fill_date: expiration date`
- Backend date validation: `referenceDate >= expirationDate` — same pattern as `expireCsp()`
- No cost basis snapshot update needed — the CC premium was already captured in the snapshot created when the CC was opened (US-7)
- The "Sell New Covered Call" CTA navigates to the CC entry form with ticker pre-filled (same pattern as CSP expiry → new wheel)
- "Record Expiration →" button visible in position detail header when `phase = CC_OPEN` and today ≥ CC expiration

---

## Out of Scope

- Automatic expiration detection via Alpaca polling — Epic 06
- Rolling the CC at expiration — Epic 03
- Partial expiration (some contracts in-the-money) — deferred

---

## Dependencies

- US-7: CC must be open; position must be in CC_OPEN

## Size

3 points

## Mockup

`mockups/us-9-record-cc-expiring-worthless.mdx`
