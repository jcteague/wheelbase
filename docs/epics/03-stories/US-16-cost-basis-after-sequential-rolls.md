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
  And Roll #3: close $1.60, new premium $1.40 (net debit $0.20, basis: $46.70 — debit increases basis, net debit reduces total premium)
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

Scenario: Cost basis after CSP roll down to lower strike
  Given a CSP at $50.00 strike with $2.00/contract premium (1 contract)
  And the current cost basis is $48.00/share
  When the CSP is rolled down to $47.00 strike with cost to close $1.20 and new premium $1.50 (net credit $0.30)
  Then the cost basis updates to $44.70/share ($47.00 new strike − $2.30 net premium collected)
  And NOT $47.70 (the incorrect result if the strike change is ignored)
  And total premium collected updates to $230.00 ($200 original + $30 roll net credit)

Scenario: Cost basis after CC roll up to higher strike
  Given assignment cost basis is $47.30/share
  And a CC at $52.00 strike with $1.50/contract premium (basis: $45.80)
  When the CC is rolled up to $55.00 strike with cost to close $2.00 and new premium $2.80 (net credit $0.80)
  Then the cost basis updates to $45.00/share ($45.80 − $0.80)
  And the CC strike change does not affect the basis (only net premiums reduce share cost basis for CC)
```

---

## Technical Notes

- **Cost basis engine:** Extend `src/main/core/costbasis.ts` with a `calculateRollBasis(input)` function. Input: `prevBasisPerShare`, `prevTotalPremiumCollected`, `costToClosePerContract`, `newPremiumPerContract`, `contracts`, `legType: 'CSP' | 'CC'`, `prevStrike` (CSP only), `newStrike` (CSP only). Output: `{ basisPerShare, totalPremiumCollected }`.
- **Formula (CC rolls):** `netCredit = newPremium - costToClose`. `newBasis = prevBasis - netCredit`. CC strike changes do not affect share cost basis.
- **Formula (CSP same-strike rolls):** Same as CC: `newBasis = prevBasis - netCredit`.
- **Formula (CSP different-strike rolls):** `newBasis = prevBasis + (newStrike - prevStrike) - netCredit`. The strike delta must be included; ignoring it produces a materially wrong basis when rolling down. Example: roll $50→$47, net credit $0.30 → `$48.00 + (47-50) - 0.30 = $44.70`, not `$47.70`.
- **Total premium:** `newTotalPremium = prevTotalPremium + (netCredit × contracts × 100)` (applies to both CSP and CC).
- **Assignment basis:** The existing `calculateAssignmentBasis` must use the **assignment strike** (the strike of the final ROLL_TO leg, or the CSP_OPEN leg if never rolled) minus all net premiums (CSP_OPEN premium + all ROLL_TO premiums − all ROLL_FROM close costs). It must NOT use the original CSP_OPEN strike when the position was rolled to a different strike — that would produce an incorrect basis.
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
