# Epic: PMCC Strategy End-to-End

## Phase

Phase 4

## Goal

A trader can open, manage, and close Poor Man's Covered Call positions with the same quality of lifecycle tracking, cost basis math, alerts, and dashboard visibility as classic wheel positions. PMCC shares the outer position shell but has its own lifecycle, entry flow, cost basis formula, alert rules, and screening criteria.

## Success Criteria

- Trader opens a PMCC with a dual chain selector: deep ITM LEAPS call (delta 0.70-0.85, 180+ DTE) and OTM short call (delta 0.25-0.35, 20-45 DTE)
- Safety constraint enforced: long call DTE must exceed short call DTE (prevents naked call)
- Net debit, max profit, breakeven, and debit-to-spread-width ratio display before confirmation
- PMCC cost basis tracks: initial LEAPS debit minus short call premiums collected plus/minus roll adjustments
- Trader can roll the short call independently (routine, every 20-45 days)
- Trader can roll the LEAPS when it approaches low DTE (60-90 days)
- PMCC-specific alerts fire: short call assignment risk (within 2% of strike), LEAPS DTE < 60, short call would expire after LEAPS
- PMCC position card on dashboard shows: LEAPS details, short call details, net debit, credits collected, net P&L
- PMCC screening criteria available in the candidate screener (IV environment, long/short delta, spread efficiency)

## Vertical Slice

| Layer | What ships |
|---|---|
| Core engines | PMCC lifecycle transitions, PMCC cost basis formula, PMCC-specific alert rules, PMCC screening criteria |
| Database | strategy_type=PMCC on Position; multi-leg creation (two Legs simultaneously) |
| API | POST /api/positions (PMCC variant), PMCC roll endpoints, PMCC alert rules |
| Frontend | PMCC entry form with dual chain selector, PMCC position card variant, PMCC roll forms, PMCC alert configuration, PMCC screener criteria |

## Stories

- [ ] US-58: Open a PMCC position with dual chain selector and safety validation
- [ ] US-59: Enforce long DTE > short DTE constraint on entry and all rolls
- [ ] US-60: Calculate and display PMCC cost basis (LEAPS debit minus short call credits)
- [ ] US-61: Roll the PMCC short call with net credit/debit preview
- [ ] US-62: Roll the PMCC LEAPS to a further expiration when DTE is low
- [ ] US-63: Fire alert when short call is within 2% of strike (assignment risk)
- [ ] US-64: Fire alert when LEAPS DTE drops below 60 days
- [ ] US-65: Display PMCC-specific position card on dashboard
- [ ] US-66: Display PMCC-specific leg timeline on position detail
- [ ] US-67: Add PMCC screening criteria to candidate screener
- [ ] US-68: Handle PMCC short call assignment (exercise LEAPS to cover)

## Dependencies

- Epic 01-03: Core wheel functionality (shared Position model, roll infrastructure)
- Epic 04: Position Dashboard (PMCC card variant)
- Epic 06: Live Market Data (option chains for dual selector)
- Epic 07: Management Alerts (PMCC alert rules extend the engine)
- Epic 08: Candidate Screener (PMCC criteria extend the screener)

## Strategy

PMCC only

## Out of Scope

- PMCC order execution as multi-leg diagonal spread (Epic 10)
- PMCC-specific analytics comparisons (Epic 11)
