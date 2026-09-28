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
- [ ] US-106: Fire alert when short call is within 2% of strike (assignment risk) — a floor, not a band: opens 2% below the short strike and stays open at any price at or above it; medium urgency; makes a PMCC with an open short call evaluable by the Epic 07 engine with the short call as its leg (never the LEAPS), which US-107 builds on
- [ ] US-107: Fire alert when LEAPS DTE drops below 60 days — a time rule with MANAGEMENT_WINDOW's shape: opens at 60 DTE inclusive, refreshes as the days count down, resolves only on a LEAPS roll (US-105) or close; medium urgency, fixed threshold; makes a PMCC evaluable whenever its LEAPS is open, widening US-106, with the short-leg rules inapplicable (not skipped) on a LEAPS-only PMCC
- [ ] US-108: Display PMCC-specific position card on dashboard
- [ ] US-109: Display PMCC-specific leg timeline on position detail
- [ ] US-110: Add PMCC screening criteria to candidate screener — a `Wheel | PMCC` lens on the US-96 bench with its own criteria document and pure engine; ships the matching-diagonal card without a promote action, which US-122 adds
- [ ] US-111: Handle PMCC short call assignment (exercise LEAPS to cover) — closing event; settles against the cost basis owned by [US-103](09-stories/US-103-pmcc-cost-basis.md)
- [ ] US-112: Display IVR on PMCC position card for both LEAPS underlying and short call context — reads the per-underlying assessed IV rank US-97 collects and US-98 grades (US-121 reshapes it); no Epic 12 service exists or is needed
- [ ] US-113: Show IV term-structure context on PMCC entry form — a read-only block in US-101's PMCC form comparing the selected short call's IV with the selected LEAPS's IV (spread, ratio, BACKWARDATION · FRONT RICH / CONTANGO · FRONT THIN / FLAT at 1.10 / 0.90); reads per-contract chain IV already on the quotes, consumes no Epic 12 service, never gates recording; depends on US-101
- [ ] US-114: Surface IVR context inside PMCC short-call roll dialog — the first IVR-in-a-roll-sheet surface: a read-only IV context section in the US-104 sheet reusing the bench's IvrCell and US-112's short-call registry, with the event-driven qualifier re-judged live against the replacement expiration (US-70's rule); advisory only, never touches the net preview or validation; adds ivRank/nextEarnings to positions:get; US-89 (wheel CC roll, unrefined) later follows this pattern
- [ ] US-115: Sell a subsequent short call against an open LEAPS once the previous short expires or is closed — lowers the cost basis owned by [US-103](09-stories/US-103-pmcc-cost-basis.md); the routine income leg of the PMCC cycle, deferred by US-101 and previously owned by no story; enforces the [US-102](09-stories/US-102-enforce-long-dte-greater-than-short-dte.md) invariant at its service boundary
- [ ] US-118: PMCC detail cockpit — two-lane status, guardrails, and header actions — replaces the wheel's single VerdictBlock on a PMCC with a SHORT CALL lane and a LEAPS lane that may legitimately disagree, a Net P&L line, a guardrails strip (effective share cost, coverage, premium recovered, cycles) and the pure header action map every sibling's button is placed by; shares US-106 / US-107 / US-108 predicates, adds no rule; depends on US-101 and US-103
- [ ] US-119: Retire the PMCC short call — record expiration or close early — the PMCC analogues of US-9 and US-8: the two cycle endings that are not assignment, returning the position to LEAPS-only so US-115 can sell the next short; expiration flips the credit to realized without moving basis, a buyback is a US-103 debit contribution; depends on US-101 and US-103
- [ ] US-120: Close a PMCC by selling the LEAPS — the voluntary, no-assignment exit from the LEAPS-only state (US-119 retires the short first; never under an open short); one terminal SELL on the LEAPS, status CLOSED, terminal US-103 snapshot with final_pnl = proceeds − fees − cost basis; placed by US-118's action map, mirrors US-4 / US-10 in shape and US-111's closing paths in accounting
- [ ] US-122: Review a PMCC screener match in the PMCC entry form — Review trade → on the US-110 matching-diagonal card opens the US-101 sheet in PMCC mode pre-filled from the diagonal, mirroring US-68: one-shot query-string codec, both legs re-quoted on open, one non-blocking banner (outage, missing contract, stale session, per-leg drift with net debit at fresh marks, edit, match), never auto-submits; depends on US-110 and US-101

## Dependencies

- Epic 01-03: Core wheel functionality (shared Position model, roll infrastructure)
- Epic 04: Position Dashboard (PMCC card variant)
- Epic 06: Live Market Data (option chains for dual selector)
- Epic 07: Management Alerts (PMCC alert rules extend the engine)
- Epic 08: Candidate Screener (PMCC criteria extend the screener)
- Epic 12: Volatility Analytics — no longer a dependency: US-112 / US-114 read the shipped IV-rank store (US-97, US-98, US-121) and US-113 reads per-contract chain IV; Epic 12 has no Linear project and its stories (US-86–US-92, incl. US-89) are unrefined

## Strategy

PMCC only

## Out of Scope

- PMCC order execution as multi-leg diagonal spread (Epic 10)
- PMCC-specific analytics comparisons (Epic 11)
