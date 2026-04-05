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

Scenario: Running cost basis column shows basis after each leg, including CC_CLOSE carry-forward
  Given the position has:
    | Leg      | Strike  | Premium | Running basis |
    | CSP_OPEN | $180.00 | +$3.50  | $176.50       |
    | ASSIGN   | $180.00 | —       | $176.50       |
    | CC_OPEN  | $182.00 | +$2.30  | $174.20       |
    | CC_CLOSE | $182.00 | −$1.80  | $174.20       |
  When the trader views the leg history table
  Then each row shows the cost basis at that point in the chain
  And the ASSIGN row shows "— (assigned)" for premium (assignment has no premium)
  And the CC_OPEN row shows $174.20 as the running cost basis
  And the CC_CLOSE row shows $174.20 as the running cost basis (carried forward — no new snapshot is created at early close)
  And the CC_CLOSE premium column shows "−$1.80" in amber to indicate a buyback debit, not a credit

Scenario: Completed wheel shows final P&L in the chain footer
  Given the position is in WHEEL_COMPLETE status
  And the final cost basis snapshot has final_pnl = "$780.00"
  When the trader views the leg history
  Then a summary row at the bottom of the table shows "Final P&L: +$780.00"
  And the P&L is shown in green for a profit or red for a loss

Scenario: ASSIGN leg displays shares received, not premium
  Given the position has an ASSIGN leg with contracts = 1
  When the trader views that row in the leg history
  Then the premium column shows "— (assigned)"
  And the premium column shows a "100 shares received" annotation below it (contracts × 100)
  And the strike column shows the assignment strike

Scenario: CALLED_AWAY leg shows call-away strike and inherits running basis
  Given the position has a CALLED_AWAY leg at strike $182.00 with contracts = 1
  When the trader views that row in the leg history
  Then the premium column shows "— (assigned)" and a "100 shares called away" annotation
  And the strike column shows $182.00
  And the running cost basis column carries forward from the prior snapshot (the CC_OPEN basis)

Scenario: CC_EXPIRED leg displays expired worthless in muted style
  Given the position has a CC_EXPIRED leg
  When the trader views that row in the leg history
  Then the premium column shows "expired worthless" in muted text style
  And the running cost basis carries forward from the CC_OPEN snapshot

Scenario: Single-leg position (CSP still open) shows partial chain
  Given the position has only a CSP_OPEN leg
  When the trader views the leg history
  Then only the CSP_OPEN row is shown
  And the running cost basis shows the initial basis from the opening cost basis snapshot
```

---

## Technical Notes

- **Backend change required:** `getPosition` currently returns only the latest `cost_basis_snapshot`. This story requires `getPosition` to also return `allSnapshots: CostBasisSnapshotRecord[]` — all cost basis snapshots for the position ordered by `snapshot_at ASC`. The claim that "no new backend data is required" was incorrect; without historical snapshots the running basis per leg cannot be derived.
- **Running cost basis per leg:** derive from the ordered `allSnapshots` array by matching each snapshot's `snapshot_at` to the nearest leg `fill_date`. For legs with no matching snapshot, carry forward the last known basis value.
- **Snapshots are created at:** `CSP_OPEN`, `ASSIGN`, `CC_OPEN`, and terminal events (`CC_EXPIRED`, `CALLED_AWAY`, `WHEEL_COMPLETE`). `CC_CLOSE` does **not** create a new snapshot — its running basis always carries forward from the prior CC_OPEN snapshot. The final P&L is calculated from the terminal snapshot, not from the CC_CLOSE row data.
- **CC_CLOSE premium display:** `premiumPerContract` stores the buyback price paid (a debit). Render as "−$X.XX" in amber (`var(--wb-gold)`) to distinguish it from premium credits. Do not render green or with a `+` sign.
- **CC_CLOSE net contribution:** the net CC premium = `open_premium − close_price`. This can be negative if the CC was closed at a loss (close price > open premium). The running basis for the CC_CLOSE row carries forward; the net contribution is reflected in the terminal snapshot once the wheel completes.
- The existing `LegHistoryTable` component (`src/renderer/src/components/LegHistoryTable.tsx`) should be extended to add: the running basis column, the contracts column, and special premium rendering for ASSIGN, CALLED_AWAY, CC_CLOSE, and CC_EXPIRED leg roles.
- **ASSIGN leg display:** `premium_per_contract` is `'0.0000'` — render as "— (assigned)" with a small annotation on a second line: "{contracts × 100} shares received".
- **CALLED_AWAY leg display:** same "— (assigned)" treatment as ASSIGN with annotation "{contracts × 100} shares called away".
- **CC_EXPIRED leg display:** render premium as "expired worthless" in a muted italic style.
- **Roll legs (ROLL_FROM / ROLL_TO):** may appear in the leg history. Render with their role badge and carry forward the previous running basis. Do not crash if these roles are present — full roll display is deferred to a future story.
- Instrument type is conveyed implicitly through the role badge (CSP Open = PUT, CC Open/Close/Expired = CALL, Called Away = CALL) rather than a separate column, to keep the table width manageable.
- The table does not need to be interactive (no sorting, no pagination) in Phase 1.
- Sizing: 100px min-width per column is acceptable; use existing `StatGrid` or `LegHistoryTable` primitives.

---

## Out of Scope

- Charting or visual timeline with connectors between legs (future design epic)
- P&L per leg in percentage terms (Epic 05, analytics)
- Sorting or filtering the leg table
- Exporting leg history to CSV
- PMCC leg chain display (Epic 09)
- Full roll leg visualization (linked ROLL_FROM/ROLL_TO pair display)
- Per-cycle P&L breakdown for multi-cycle wheels (future analytics epic)

---

## Dependencies

- US-6 through US-10: full lifecycle must be implemented so that all leg types exist to render
- The existing `LegHistoryTable` component must already exist (it does, from US-6)

## Size

5 points

## Mockup

`mockups/us-11-wheel-leg-chain-display.mdx`
