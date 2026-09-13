# Epic: PMCC Strategy End-to-End

## Phase

Phase 4

## Goal

A trader can open, manage, and close Poor Man's Covered Call positions with the same quality of lifecycle tracking, cost basis math, alerts, and dashboard visibility as classic wheel positions. PMCC shares the outer position shell but has its own lifecycle, entry flow, cost basis formula, alert rules, and screening criteria.

## Success Criteria

- Trader opens a PMCC with a dual chain selector: deep ITM LEAPS call (delta 0.70-0.85, 180+ DTE) and OTM short call (delta 0.25-0.35, 20-45 DTE)
- Safety constraint enforced: long call DTE must exceed short call DTE (prevents naked call) — rule owned by US-102; US-101, US-104, US-105, and US-115 enforce it at their own boundaries rather than redefining it
- Net debit, max profit, breakeven, and debit-to-spread-width ratio display before confirmation
- PMCC cost basis tracks: initial LEAPS debit minus short call premiums collected plus/minus roll adjustments — formula, snapshot chain, and display owned by US-103; US-104, US-105, US-111, and US-115 trigger recalculation rather than redefining it
- Trader can roll the short call independently (routine, every 20-45 days)
- Trader can roll the LEAPS when it approaches low DTE (60-90 days)
- PMCC-specific alerts fire: short call assignment risk (within 2% of strike), LEAPS DTE < 60, short call would expire after LEAPS
- PMCC position card on dashboard shows: LEAPS details, short call details, net debit, credits collected, net P&L
- PMCC screening criteria available in the candidate screener (IV environment, long/short delta, spread efficiency)

## Vertical Slice

| Layer        | What ships                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Core engines | PMCC lifecycle transitions, PMCC cost basis formula, PMCC-specific alert rules, PMCC screening criteria                                 |
| Database     | strategy_type=PMCC on Position; multi-leg creation (two Legs simultaneously)                                                            |
| API          | POST /api/positions (PMCC variant), PMCC roll endpoints, PMCC alert rules                                                               |
| Frontend     | PMCC entry form with dual chain selector, PMCC position card variant, PMCC roll forms, PMCC alert configuration, PMCC screener criteria |

## Story Authoring Notes

Read before writing or generating any story in this epic. Each item here comes from a defect this epic actually produced.

- **Read the whole list below, plus the Out of Scope section of every sibling story already in `09-stories/`.** Stories authored in isolation re-derive shared rules: US-101 and US-102 independently wrote the same expiration rule with identical error strings.
- **One story owns each shared rule; the others link to it** instead of restating its acceptance criteria or messages. A rule named in Success Criteria without an owner gets claimed by every story generated from this epic.
- **When a story defers work, point at the story that picks it up — or add the bullet in the same pass.** US-115 was missing entirely because US-101 deferred "opening subsequent short calls" and nothing caught it.
- **Take the story ID from this list and confirm it is not already used by a shipped story** (check `docs/spec/features/` and `mockups/`). This epic's original US-59–US-68 placeholders collided with shipped Epic 07/08 stories; the list was renumbered to US-101+ on 2026-09-12.
- **Name the mockup after the story's real ID**, not the bullet you started from. The US-102 mockup shipped as `us-59-*` and collided with the shipped dismiss-alert mockup.

## Stories

- [ ] [US-101: Open a PMCC position with two linked opening legs](09-stories/US-101-open-pmcc-position.md) — dual contract selection, entry validation, debit preview, and minimal two-leg display
- [ ] [US-102: Enforce long DTE > short DTE constraint on all PMCC rolls and subsequent short calls](09-stories/US-102-enforce-long-dte-greater-than-short-dte.md) — defines the shared expiration comparator; US-104, US-105, and US-115 enforce it at their own service boundaries
- [ ] [US-103: Calculate and display PMCC cost basis](09-stories/US-103-pmcc-cost-basis.md) — owns the PMCC cost-basis formula, its labels, its snapshot chain, and the detail-page panel; the lifecycle stories below consume it
- [ ] US-104: Roll the PMCC short call with net credit/debit preview — recalculates cost basis through [US-103](09-stories/US-103-pmcc-cost-basis.md) as a roll-net contribution; enforces the [US-102](09-stories/US-102-enforce-long-dte-greater-than-short-dte.md) invariant at its service boundary: the replacement short expiration must be strictly before the open LEAPS expiration, rejecting equality
- [ ] US-105: Roll the PMCC LEAPS to a further expiration when DTE is low — recalculates cost basis through [US-103](09-stories/US-103-pmcc-cost-basis.md), which re-anchors the effective share cost to the new strike without a strike-delta adjustment; enforces the [US-102](09-stories/US-102-enforce-long-dte-greater-than-short-dte.md) invariant at its service boundary: the replacement LEAPS expiration must be strictly after the open short-call expiration, rejecting equality; skipped when no short call is open
- [ ] US-106: Fire alert when short call is within 2% of strike (assignment risk)
- [ ] US-107: Fire alert when LEAPS DTE drops below 60 days
- [ ] US-108: Display PMCC-specific position card on dashboard
- [ ] US-109: Display PMCC-specific leg timeline on position detail
- [ ] US-110: Add PMCC screening criteria to candidate screener
- [ ] US-111: Handle PMCC short call assignment (exercise LEAPS to cover) — closing event; settles against the cost basis owned by [US-103](09-stories/US-103-pmcc-cost-basis.md)
- [ ] US-112: Display IVR on PMCC position card for both LEAPS underlying and short call context (consumes Epic 12 service)
- [ ] US-113: Show IV term-structure context on PMCC entry form — favors low front-month IV when buying LEAPS, high front-month IV when selling the short call (diagonal efficiency signal)
- [ ] US-114: Surface IVR context inside PMCC short-call roll dialog (parallels US-89 for the wheel CC roll)
- [ ] US-115: Sell a subsequent short call against an open LEAPS once the previous short expires or is closed — lowers the cost basis owned by [US-103](09-stories/US-103-pmcc-cost-basis.md); the routine income leg of the PMCC cycle, deferred by US-101 and previously owned by no story; enforces the [US-102](09-stories/US-102-enforce-long-dte-greater-than-short-dte.md) invariant at its service boundary

## Dependencies

- Epic 01-03: Core wheel functionality (shared Position model, roll infrastructure)
- Epic 04: Position Dashboard (PMCC card variant)
- Epic 06: Live Market Data (option chains for dual selector)
- Epic 07: Management Alerts (PMCC alert rules extend the engine)
- Epic 08: Candidate Screener (PMCC criteria extend the screener)
- Epic 12: Volatility Analytics (IVR/IVP data feed for PMCC card and roll dialog)

## Strategy

PMCC only

## Out of Scope

- PMCC order execution as multi-leg diagonal spread (Epic 10)
- PMCC-specific analytics comparisons (Epic 11)
