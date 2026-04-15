# Epic: Handle Assignment and Sell Covered Calls

## Phase

Phase 1

## Goal

A trader who has been assigned on a CSP can record the assignment, transition to holding shares, sell covered calls against those shares, and complete the wheel cycle when shares are called away. This delivers the complete wheel loop.

## Success Criteria

- Trader records assignment on an open CSP; position transitions to HOLDING_SHARES
- Cost basis updates to reflect the assignment strike adjusted by CSP premium collected
- Trader opens a CC against held shares; the form highlights strikes above cost basis
- CC strike below cost basis shows a warning (would lock in a loss if called away)
- Trader can record shares being called away; position completes the cycle with final P&L
- Trader can close a CC early (buy to close) and sell a new one
- Position detail shows the full chain: CSP -> assignment -> CC -> call-away with running cost basis at each step
- Lifecycle engine enforces: HOLDING_SHARES -> CC_OPEN, CC_OPEN -> HOLDING_SHARES (CC expired) or CLOSED (called away)

## Vertical Slice

| Layer        | What ships                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Core engines | lifecycle transitions for assignment/CC/call-away, costbasis updates through full cycle                                            |
| API          | POST /api/positions/:id/legs (assignment, CC open, CC close, call-away)                                                            |
| Frontend     | Assignment form, CC entry form (with strike-vs-basis indicator), call-away action, updated position detail with multi-leg timeline |

## Stories

- [ ] US-6: Record assignment on an open CSP and transition to HOLDING_SHARES
- [ ] US-7: Open a covered call against held shares with cost basis guardrail
- [ ] US-8: Close a covered call early (buy to close) and remain in HOLDING_SHARES
- [ ] US-9: Record a covered call expiring worthless and remain in HOLDING_SHARES
- [ ] US-10: Record shares called away and complete the wheel cycle with final P&L
- [ ] US-11: Display the full wheel leg chain with running cost basis on the position detail page

## Dependencies

- Epic 01: Open and Track a CSP (position and CSP must exist)

## Strategy

Classic Wheel

## Out of Scope

- Automatic assignment detection via Alpaca polling (Epic 06)
- Rolling covered calls (Epic 03)
- PMCC short call assignment (Epic 09)
