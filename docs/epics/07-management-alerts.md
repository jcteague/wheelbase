# Epic: Management Alerts and Expiration Tracking

## Phase

Phase 3

## Goal

The app proactively tells the trader what needs attention. A prioritized management queue surfaces positions approaching expiration, hitting profit targets, entering roll windows, or facing earnings risk — so nothing falls through the cracks.

## Success Criteria

- Management queue appears at the top of the dashboard, ordered by urgency
- Each queue item shows: position identifier, what triggered the alert, and a quick-action button
- Built-in alert rules fire automatically: expiration imminent (DTE <= 5), management window (DTE <= 21), profit target hit (50% of max), assignment risk (underlying within 1% of strike), earnings proximity (within 10 days)
- Trader can configure global defaults for profit target % and DTE threshold
- Trader can override alert thresholds per position
- Alerts are suppressible (dismiss without acting) with a record of the dismissal
- Expiration calendar view shows all positions' expiration dates, color-coded by phase
- Positions expiring within 7 days are prominently flagged on both calendar and dashboard

## Vertical Slice

| Layer       | What ships                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| Core engine | alerts.py: evaluate rules against position + market state, return alert items                                              |
| Backend     | APScheduler job running alert engine on polling interval, alert persistence                                                |
| API         | GET /api/alerts (management queue), PATCH /api/alerts/:id (dismiss/act), GET /api/alerts/calendar                          |
| Frontend    | Management queue component on dashboard, alert configuration panel, expiration calendar page, per-position alert overrides |

## Stories

- [ ] US-38: Evaluate built-in alert rules against all active positions on a schedule
- [ ] US-39: Display management queue on dashboard ordered by urgency tier
- [ ] US-40: Fire expiration-imminent alert when DTE <= 5
- [ ] US-41: Fire management-window alert when DTE <= 21
- [ ] US-42: Fire profit-target alert when current premium <= 50% of open premium
- [ ] US-43: Fire assignment-risk alert when underlying is within 1% of CSP strike
- [ ] US-44: Fire earnings-proximity alert when earnings date is within 10 calendar days
- [ ] US-45: Configure global alert thresholds (profit target %, DTE threshold)
- [ ] US-46: Override alert thresholds on a per-position basis
- [ ] US-47: Dismiss an alert with a record of the dismissal
- [ ] US-48: Display expiration calendar view color-coded by phase
- [ ] US-49: Flag positions expiring within 7 days on dashboard and calendar

## Dependencies

- Epic 04: Position Dashboard (management queue renders on dashboard)
- Epic 06: Live Market Data (alerts need current prices and earnings dates)

## Strategy

Classic Wheel (PMCC-specific alert rules — short call assignment risk, LEAPS DTE — ship with Epic 09)

## Out of Scope

- Email or push notifications (future enhancement)
- PMCC-specific alert rules (Epic 09)
- AI-driven alert suggestions (future)
