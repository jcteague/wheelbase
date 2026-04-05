# US-16: Update cost basis correctly after multiple sequential rolls

**As a** wheel trader who has rolled a position multiple times,
**I want** the effective cost basis to accurately reflect the cumulative impact of all roll credits and debits,
**So that** I can trust the cost basis number when making decisions about assignment, call-away, or closing the position.

---

## Context

Each roll produces a net credit or debit that adjusts the effective cost basis. After multiple rolls, the cumulative effect can be significant — three rolls with $1.50/contract net credit each reduces the basis by $4.50/share. The cost basis engine must handle this correctly through any sequence: CSP rolls followed by assignment, CC rolls after assignment, or interleaved rolls and leg events. The premium waterfall (from US-11) must include roll credits/debits as distinct line items so the trader can audit the full history.

This is primarily a core engine and service-layer story ensuring the math is correct. The display is handled by US-15.

---

## Acceptance Criteria

```gherkin
Scenario: Cost basis after single CSP roll with net credit
  Given a CSP was opened at $50.00 strike with $2.00/contract premium (1 contract)
  And the initial cost basis is $48.00/share
  When the CSP is rolled out with cost to close $0.80 and new premium $1.50 (net credit $0.70)
  Then the cost basis updates to $47.30/share ($48.00 - $0.70)
  And total premium collected updates to $270.00 ($200 original + $70 roll net credit)

Scenario: Cost basis after single CSP roll with net debit
  Given a CSP was opened at $50.00 strike with $2.00/contract premium (1 contract)
  And the initial cost basis is $48.00/share
  When the CSP is rolled with cost to close $2.50 and new premium $2.00 (net debit $0.50)
  Then the cost basis updates to $48.50/share ($48.00 + $0.50)
  And total premium collected updates to $150.00 ($200 original - $50 roll net debit)

Scenario: Cost basis after three sequential CSP rolls
  Given a CSP opened at $50.00 strike, $2.00 premium (basis: $48.00)
  And Roll #1: close $0.80, new premium $1.50 (net credit $0.70, basis: $47.30)
  And Roll #2: close $1.00, new premium $1.80 (net credit $0.80, basis: $46.50)
  And Roll #3: close $1.20, new premium $1.40 (net debit $0.20, basis: $46.70 — debit is subtracted, not added to premium)
  When the trader views the cost basis
  Then the effective cost basis is $46.70/share
  And total premium collected is $330.00 ($200 + $70 + $80 - $20)

Scenario: Cost basis after CSP rolls followed by assignment
  Given a CSP opened at $50.00 strike, $2.00 premium, then rolled with net credit $0.70
  And the post-roll cost basis is $47.30/share
  When the CSP is assigned
  Then the assignment cost basis is $47.30/share (incorporates all prior roll credits/debits)
  And the premium waterfall shows: "CSP Open: $2.00, Roll #1 credit: $0.70"

Scenario: Cost basis after CC roll with net credit
  Given assignment cost basis is $47.30/share
  And a CC was opened at $52.00 strike with $1.50 premium (basis: $45.80)
  When the CC is rolled up and out with cost to close $2.00 and new premium $2.80 (net credit $0.80)
  Then the cost basis updates to $45.00/share ($45.80 - $0.80)

Scenario: Cost basis snapshot chain is complete and auditable
  Given a position has gone through: CSP open, 2 CSP rolls, assignment, CC open, 1 CC roll
  When the trader views the cost basis snapshots
  Then there is a snapshot for each event (6 total)
  And each snapshot records: basis_per_share, total_premium_collected, and the triggering event
  And the snapshots are in chronological order

Scenario: Multi-contract roll applies net credit/debit per contract correctly
  Given a CSP with 3 contracts at $50.00 strike, $2.00/contract premium
  And initial cost basis is $48.00/share
  When the CSP is rolled with cost to close $0.80/contract and new premium $1.50/contract
  Then the net credit is $0.70/contract ($210.00 total for 3 contracts)
  And the cost basis updates to $47.30/share (same per-share impact regardless of contract count)
```

---

## Technical Notes

- **Cost basis engine:** Extend `src/main/core/costbasis.ts` with a `calculateRollBasis(input)` function. Input: `prevBasisPerShare`, `prevTotalPremiumCollected`, `costToClosePerContract`, `newPremiumPerContract`, `contracts`, `positionContracts`. Output: `{ basisPerShare, totalPremiumCollected }`.
- **Formula:** `netCreditPerContract = newPremium - costToClose`. `basisAdjustment = netCreditPerContract` (positive reduces basis, negative increases it). `newBasis = prevBasis - basisAdjustment`. `newTotalPremium = prevTotalPremium + (netCreditPerContract × contracts × 100)`.
- **Assignment basis:** The existing `calculateAssignmentBasis` already filters for ROLL_TO legs. Verify it correctly sums premiums from the original CSP_OPEN leg plus all ROLL_TO legs, minus all ROLL_FROM close costs.
- **Snapshot chain:** Each roll creates one snapshot. The service layer must pass the correct previous snapshot values to the cost basis calculation.
- **Decimal precision:** All calculations use `decimal.js` with `ROUND_HALF_UP` to 4 decimal places, matching existing engine conventions.

---

## Out of Scope

- Cost basis impact display in the UI (US-15 handles this)
- PMCC cost basis with rolls (Epic 09)
- Tax lot tracking or wash sale handling
- Annualized return recalculation after rolls (Epic 05)

---

## Dependencies

- US-12: CSP roll service (creates the leg pairs and snapshots this story validates)
- US-14: CC roll service (same)

---

## Estimate

5 points
