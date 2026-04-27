# US-19: Show portfolio summary bar with capital deployed, premium MTD/YTD, and active count

**As a** wheel trader reviewing my overall portfolio,
**I want to** see aggregate metrics at the top of the dashboard — total capital deployed, premium collected this month and year-to-date, and how many positions are active,
**So that** I can gauge my portfolio's health and income trajectory without manually summing individual positions.

---

## Context

Individual position cards tell the trader what each wheel is doing, but they don't answer portfolio-level questions: "How much capital am I tying up?", "How much premium have I collected this month?", "Am I on pace for my annual income target?" The summary bar sits at the top of the dashboard and answers these questions with four key metrics. Capital deployed is `contracts × strike × 100` summed across all active positions with an open option leg — this represents the cash the trader must keep reserved.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has 3 active positions:
    | ticker | phase    | strike | contracts | premium_collected |
    | AAPL   | CSP_OPEN | 180.00 | 1         | 3.50              |
    | MSFT   | CC_OPEN  | 420.00 | 2         | 5.20              |
    | TSLA   | HOLDING  | —      | 1         | 8.00              |

Scenario: Summary bar displays total capital deployed
  When the trader views the dashboard
  Then the summary bar shows "Capital Deployed"
  And the value is $102,000.00 (AAPL: 1×180×100 = $18,000 + MSFT: 2×420×100 = $84,000)
  And TSLA is excluded because HOLDING_SHARES does not have an active option leg tying up collateral

Scenario: Summary bar displays premium collected MTD
  Given today is 2026-04-21
  And AAPL's CSP was opened on 2026-04-05 with $3.50 premium
  And MSFT's CC was opened on 2026-03-15 with $5.20 premium
  When the trader views the dashboard
  Then "Premium MTD" shows $3.50 (only AAPL's leg opened in April)

Scenario: Summary bar displays premium collected YTD
  When the trader views the dashboard
  Then "Premium YTD" shows the total premium from all legs opened in 2026
  And the value sums premium_per_contract × contracts for each qualifying leg

Scenario: Summary bar displays active position count
  When the trader views the dashboard
  Then "Active Positions" shows 3

Scenario: Summary bar updates when a position is created or closed
  Given the dashboard is visible
  When the trader opens a new wheel on NVDA
  And returns to the dashboard
  Then all four summary metrics reflect the new position

Scenario: Summary bar shows zero state when no active positions exist
  Given the trader has no active positions
  When the trader views the dashboard
  Then "Capital Deployed" shows $0.00
  And "Premium MTD" shows $0.00
  And "Premium YTD" shows $0.00
  And "Active Positions" shows 0
```

---

## Technical Notes

- **New IPC endpoint:** `dashboard:summary` returning `DashboardSummary`:
  ```typescript
  interface DashboardSummary {
    capitalDeployed: string // decimal — sum of (contracts × strike × 100) for positions with active option legs
    premiumMtd: string // decimal — sum of premium from legs opened in current month
    premiumYtd: string // decimal — sum of premium from legs opened in current year
    activePositionCount: number // count of positions where status = 'ACTIVE'
  }
  ```
- **New service:** `src/main/services/dashboard-summary.ts` — performs the aggregation queries against the legs and positions tables.
- **Capital deployed logic:** Only count positions where `phase IN ('CSP_OPEN', 'CC_OPEN')` — these phases have an active option leg requiring collateral. HOLDING_SHARES positions have shares (not options) so the capital is in stock, not reserved as collateral.
- **Premium MTD/YTD:** Sum `premium_per_contract × contracts` from all legs where `action = 'SELL'` (premiums received) and `fill_date` falls within the date range. Exclude `action = 'BUY'` legs (those are costs to close/roll).
- **Renderer component:** `SummaryBar` using `StatGrid` with 4 `Stat` items, placed above the position card grid in `DashboardPage`.
- **Query hook:** `useDashboardSummary()` with query key `['dashboard', 'summary']`, invalidated alongside `['positions']`.
- **Money formatting:** Use existing `fmtMoney()` for all values.

---

## Out of Scope

- Breakdown by phase (e.g., "2 CSPs, 1 CC") — could be added later
- Premium broken down by ticker
- Realized vs. unrealized P&L
- Historical trend or sparkline
- Capital deployed as a percentage of total account value (requires account balance — Epic 06)

---

## Dependencies

- US-18: Dashboard page and card grid must exist (summary bar sits above it)

---

## Estimate

3 points

## Mockup

`mockups/us-19-portfolio-summary-bar.mdx`
