# US-6: Record assignment on an open CSP and transition to HOLDING_SHARES

**As a** wheel trader managing an open cash-secured put,
**I want to** manually record when my CSP has been assigned,
**So that** my position accurately reflects that I now hold shares and my cost basis captures the premium already collected.

---

## Context

When a CSP expires in-the-money or is exercised early, the broker assigns 100 shares per contract at the strike price. Shares typically appear Monday morning after a Friday expiration; the trader records the assignment manually after seeing it in their brokerage. The assignment transitions the wheel from `CSP_OPEN` to `HOLDING_SHARES` and establishes a cost basis by subtracting all collected premiums from the strike — giving the trader their true break-even price before they begin selling covered calls.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has a CSP_OPEN position on AAPL

Scenario: Successfully record an assignment
  Given the CSP strike is $180.00, 1 contract, $3.50 premium per contract collected
  When the trader submits the assignment form with assignment date "2026-01-17"
  Then the position phase changes to HOLDING_SHARES
  And the position shows 100 shares held at assignment strike $180.00
  And the effective cost basis displays as $176.50 per share
  And a stock_assignment leg is recorded with fill_date "2026-01-17"

Scenario: Summary card shows the full premium waterfall
  Given the CSP was sold at $180.00 with $3.50 premium collected
  When the assignment form opens
  Then the summary card shows each line of the calculation:
    | Line                   | Value   |
    | Assignment strike      | $180.00 |
    | − CSP premium          | $3.50   |
    | = Effective cost basis | $176.50 |

Scenario: Cost basis accounts for all CSP premiums including rolls
  Given the position collected $2.00 on the initial CSP and $1.50 credit on a roll
  And the CSP strike is $175.00, 1 contract
  When the trader submits the assignment form with any valid assignment date
  Then the waterfall shows: $175.00 − $2.00 − $1.50 = $171.50 per share

Scenario: Future assignment date shows a soft warning but remains submittable
  Given the CSP was opened on "2026-01-03"
  When the trader enters assignment date "2026-12-19" (a future date)
  Then a warning appears: "This date is in the future — are you sure?"
  And the Confirm Assignment button remains enabled

Scenario: Reject submission when assignment date is missing
  Given the assignment form is open
  When the trader submits the form without an assignment date
  Then a validation error appears: "Assignment date is required"
  And no leg is created

Scenario: Reject assignment date before the CSP open date
  Given the CSP was opened on "2026-01-03"
  When the trader submits the form with assignment date "2026-01-02"
  Then a validation error appears: "Assignment date cannot be before the CSP open date"
  And no leg is created

Scenario: Reject assignment if position is not in CSP_OPEN phase
  Given the position is in HOLDING_SHARES phase
  When the trader attempts to record an assignment
  Then the action is rejected with message "Assignment can only be recorded on a CSP_OPEN position"
  And the position remains in HOLDING_SHARES

Scenario: Success state shows strategic nudge before CC CTA
  Given the assignment has been confirmed
  Then the success screen shows the message:
    "Many traders wait 1–3 days for a bounce before selling the first covered call —
     avoid locking in a low strike right after assignment."
  And the "Open Covered Call" CTA is visible below the nudge
```

---

## Technical Notes

- New lifecycle transition: `CSP_OPEN → HOLDING_SHARES` triggered by `assign` leg action
- New `LegAction`: `assign`; `LegRole`: `stock_assignment`; `option_type`: `stock`
- Shares held: `contracts × 100` — derived, not user-entered
- Cost basis snapshot after assignment: `assignment_strike − Σ(premium_per_contract × contracts)` for all CSP and roll legs — iterated per leg so the waterfall can render each line individually
- Assignment form visible in position detail header only when `phase = CSP_OPEN`
- IPC payload: `AssignCspPayload { positionId: string, assignmentDate: string (ISO date) }`
- Future-date warning is client-side only; the backend does not reject future dates
- Response: `{ ok: true, position: Position } | { ok: false, errors: string[] }`

---

## Out of Scope

- Automatic assignment detection via Alpaca polling (Epic 06)
- **Partial assignment** — multi-contract positions where only some contracts are assigned (requires a mixed-phase lifecycle model; deferred)
- Early assignment before expiration date (treated identically to expiration assignment; no special handling in Phase 1)
- Dividend tracking during the holding phase (future epic)
- PMCC short call assignment (Epic 09)

---

## Dependencies

- US-1 through US-5: position entity, CSP leg, and lifecycle engine from Epic 01 must exist

## Size

5 points

## Mockup

`mockups/us-6-record-csp-assignment.mdx`
