# Epic: Management Alerts and Expiration Tracking

## Phase

Phase 3

## Goal

The app proactively tells the trader what needs attention. A prioritized management queue surfaces positions approaching expiration, hitting profit targets, entering roll windows, or facing earnings risk — so nothing falls through the cracks.

## Success Criteria

- Management queue appears at the top of the dashboard, ordered by urgency
- Each queue item shows: position identifier, what triggered the alert, and a quick-action button
- Built-in alert rules fire automatically: expiration imminent (DTE <= 5), management window (DTE <= 21), profit target hit (50% of max), strike proximity (CSP underlying within 1% of strike), covered-call breach (underlying rises above the short-call strike), earnings proximity (within 10 days)
- Trader can configure global defaults for profit target % and DTE threshold
- Trader can override alert thresholds per position
- Alerts are suppressible (dismiss without acting) with a record of the dismissal
- Expiration calendar view shows all positions' expiration dates, color-coded by phase
- Positions expiring within 7 days are prominently flagged on both calendar and dashboard

## Vertical Slice

| Layer        | What ships                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Core engine  | `src/main/core/alerts.ts`: pure rule evaluation against position + market state, returns alert matches (no DB/broker imports) |
| Main process | Scheduler job reusing the US-46 polling cadence to run the alert engine; alert persistence in SQLite via the service layer    |
| IPC          | `alerts:list` (open management queue), `alerts:dismiss` (dismiss/act), `alerts:calendar` (expirations grouped by date)        |
| Renderer     | Management queue component on dashboard, alert configuration panel, expiration calendar page, per-position alert overrides    |

## Stories

> Story IDs are renumbered to `US-50` and above because `US-38` through `US-49` are already assigned in `docs/epics/06-stories/`.

- [ ] US-50: Evaluate built-in alert rules against all active positions on a schedule
- [ ] US-51: Display management queue on dashboard ordered by urgency tier
- [ ] US-52: Fire expiration-imminent alert when DTE <= 5
- [ ] US-53: Fire management-window alert when DTE is between 6 and 21
- [ ] US-54: Fire profit-target alert when unrealized profit reaches the configured target
- [ ] US-55: Fire strike-proximity alert when a CSP underlying is within 1% of strike
- [ ] US-56: Fire earnings-proximity alert when earnings occur within 10 calendar days from today and on or before expiration
- [ ] US-57: Configure global alert thresholds (profit target %, management-window DTE)
- [ ] US-58: Override alert thresholds on a per-position basis
- [ ] US-59: Dismiss an alert with a record of the dismissal
- [ ] US-60: Display expiration calendar view color-coded by phase
- [ ] US-61: Flag positions expiring within 7 days on dashboard and calendar
- [ ] US-62: Fire covered-call breach alert when the underlying rises above the short-call strike

## Dependencies

- Epic 04: Position Dashboard (management queue renders on dashboard)
- Epic 06: Live Market Data (alerts need current prices and earnings dates)

## Strategy

Classic Wheel (PMCC-specific alert rules — short call assignment risk, LEAPS DTE — ship with Epic 09)

## Out of Scope

- Email or push notifications (future enhancement)
- PMCC-specific alert rules — short-call assignment against a LEAPS, LEAPS DTE decay (Epic 09)
- Ex-dividend early-assignment risk on short calls (future — needs a dividend-date feed)
- Impaired / underwater "salvage" alerts based on unrealized loss below cost basis (future)
- Pin-risk copy variants for expiration day (future)
- Liquidity / bid-ask spread-width warnings when rolling (future)
- AI-driven alert suggestions (future)
