# US-11: Display the full wheel leg chain with running cost basis on the position detail page

**As a** wheel trader reviewing an active or completed position,
**I want to** see every leg in the wheel in chronological order alongside the running cost basis at each step,
**So that** I can understand the complete history of the position and how each action contributed to my current or final cost basis.

---

## Context

As the wheel progresses through multiple legs — CSP open, assignment, CC open, CC close or expiry, possibly another CC cycle — the position detail page leg history becomes a meaningful record of the trade's evolution. Without a running cost basis column, the leg table is just a raw data dump. With it, the trader can see at a glance how each premium reduced their basis and whether the cycle was profitable at every step.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has a wheel position on AAPL that has progressed through multiple legs

Scenario: Leg chain displays all legs in chronological order
  Given the position has legs: CSP_OPEN, ASSIGN, CC_OPEN
  When the trader views the position detail page
  Then the leg history table shows all three legs in fill_date order (oldest first)
  And each row shows: leg role, action, instrument type, strike, expiration, contracts, premium, fill date

Scenario: Running cost basis column shows basis after each leg
  Given the position has:
    | Leg      | Strike  | Premium | Running basis |
    | CSP_OPEN | $180.00 | $3.50   | $176.50       |
    | ASSIGN   | $180.00 | —       | $176.50       |
    | CC_OPEN  | $182.00 | $2.30   | $174.20       |
  When the trader views the leg history table
  Then each row shows the cost basis at that point in the chain
  And the ASSIGN row shows "— " for premium (assignment has no premium)
  And the CC_OPEN row shows $174.20 as the running cost basis

Scenario: Completed wheel shows final P&L in the chain footer
  Given the position is in WHEEL_COMPLETE status
  And the final cost basis snapshot has final_pnl = "$780.00"
  When the trader views the leg history
  Then a summary row at the bottom of the table shows "Final P&L: +$780.00"
  And the P&L is shown in green for a profit or red for a loss

Scenario: ASSIGN leg displays shares received, not premium
  Given the position has an ASSIGN leg
  When the trader views that row in the leg history
  Then the premium column shows "— (assigned)"
  And the strike column shows the assignment strike
  And an indicator shows "100 shares received" (contracts × 100)

Scenario: Single-leg position (CSP still open) shows partial chain
  Given the position has only a CSP_OPEN leg
  When the trader views the leg history
  Then only the CSP_OPEN row is shown
  And the running cost basis shows the initial basis from the opening cost basis snapshot
```

---

## Technical Notes

- This story is primarily a **frontend display change** — no new backend data is required
- All needed data is already returned by `getPosition` (`legs: LegRecord[]` + `costBasisSnapshot[]`)
- Running cost basis per leg: derive from the ordered array of `cost_basis_snapshots` matched to leg `fill_date`; if no snapshot for a leg, carry forward the previous value
- The existing `LegHistoryTable` component (`src/renderer/src/components/LegHistoryTable.tsx`) should be extended to add the running basis column
- ASSIGN leg display: `premium_per_contract` is `'0.0000'` — render as "— (assigned)" rather than "$0.00"
- EXPIRE leg display: render as "expired worthless" in a muted style
- The table does not need to be interactive (no sorting, no pagination) in Phase 1
- Sizing: 100px min-width per column is acceptable; use existing `StatGrid` or `LegHistoryTable` primitives

---

## Out of Scope

- Charting or visual timeline with connectors between legs (future design epic)
- P&L per leg in percentage terms (Epic 05, analytics)
- Sorting or filtering the leg table
- Exporting leg history to CSV
- PMCC leg chain display (Epic 09)

---

## Dependencies

- US-6 through US-10: full lifecycle must be implemented so that all leg types exist to render
- The existing `LegHistoryTable` component must already exist (it does, from US-6)

## Size

3 points

## Mockup

`mockups/us-11-wheel-leg-chain-display.mdx`
