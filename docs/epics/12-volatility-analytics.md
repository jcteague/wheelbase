# Epic: Volatility Analytics and IV-Aware Management

## Phase

Phase 3

## Goal

A trader sees implied volatility _in context_ across every management surface. Implied Volatility Rank (IVR) and Implied Volatility Percentile (IVP) are computed from a local IV history store, surfaced on position cards, embedded in the roll dialog, and consumed by the candidate screener (Epic 08) and alert engine (Epic 07). Wheel traders no longer have to leave the app to ask "is this premium actually rich?" or "is now a good time to roll?"

## Success Criteria

- Daily IV snapshots are collected for every underlying with an active position or a watchlist entry
- IVR (current IV vs. 52-week range) and IVP (percentage of past year below current IV) compute per underlying with a data-completeness flag distinguishing full-year from partial-window readings
- Position dashboard cards show an IVR badge color-coded by zone (low <30, medium 30–60, high >60) plus a 90-day IV sparkline
- Roll dialog displays an IVR context panel ("IV conditions favor / disfavor rolling") alongside roll candidate selection
- Alert engine fires an "IV opportunity" alert when an underwater position's IVR crosses a configurable threshold within the rollable DTE window
- IVR display flags earnings proximity so traders don't anchor on event-driven richness
- Candidate screener (Epic 08) and PMCC features (Epic 09) consume IVR through the same service layer — no duplicate computation
- IVR computation handles regime shifts gracefully (52-week and 90-day rolling windows both available)

## Vertical Slice

| Layer       | What ships                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| Integration | `MarketDataProvider.getIVSnapshot()` extension; optional historical-IV backfill provider (data source TBD) |
| Database    | `iv_snapshot` table (underlying, date, iv_30d, source); migration adds index on (underlying, date)         |
| Core engine | `volatility.ts`: pure functions for IVR/IVP computation, regime-shift detection, completeness scoring      |
| Service     | `volatility-service.ts`: snapshot collection scheduler, IVR queries with caching, earnings-proximity join  |
| IPC         | `volatility:get-ivr`, `volatility:get-history`, `volatility:list-snapshot-status`                          |
| Renderer    | IVR badge + sparkline on position cards, IVR panel inside roll dialog, snapshot-status diagnostics page    |

## Stories

> ⚠ **Open decisions block several stories** — see [Open Decisions](#open-decisions) at the bottom. Each affected story is flagged inline below. Resolve decisions when the story comes up; do not draft acceptance criteria around an undecided answer.

### Foundation

- [ ] US-86: Snapshot store and daily IV collector for active-position ∪ watchlist underlyings
  - **Pending decision:** polling cadence (Decision #3) — daily-near-close vs. intraday
- [ ] US-87: Compute IVR (52-week) and IVP with data-completeness flag
  - **Pending decision:** backfill source (Decision #1) — affects whether full IVR ships day one or "partial data" UX is needed for ~252 trading days
  - **Pending decision:** normalization window (Decision #2) — 52-week, 90-day, or both

### Display Surfaces

- [ ] US-88: Display IVR badge + 90-day sparkline on position dashboard cards
  - **Pending decision:** normalization window (Decision #2) — affects badge content and whether one or two values render
- [ ] US-89: Show IVR context panel inside the roll dialog
- [ ] US-91: Flag earnings proximity on IVR display surfaces

### Alert Surface

- [ ] US-90: Fire "IV opportunity" alert when underwater position + IVR threshold crossed

### Service Surface

- [ ] US-92: Expose IVR via service layer for Epic 08 screener and Epic 09 PMCC consumption (no UI)

### Dependency Graph

```
US-86 (snapshot store) ── US-87 (IVR/IVP compute) ──┬── US-88 (card badge + sparkline)
                                                    ├── US-89 (roll dialog panel)
                                                    ├── US-90 (alert) ── depends on Epic 07 alert engine
                                                    ├── US-91 (earnings flag)
                                                    └── US-92 (service for screener / PMCC)
```

## Dependencies

- Epic 06: Live Market Data (`MarketDataProvider` interface; current IV available per underlying)
- Epic 04: Position Dashboard (cards exist to enrich)
- Epic 03: Roll Positions (roll dialog exists to enrich)
- Epic 07: Management Alerts (alert engine to register the IV-opportunity rule against)

## Strategy

Classic Wheel (PMCC IVR variants ship with Epic 09 — short-call roll timing, LEAPS entry timing, IV term-structure awareness)

## Out of Scope

- PMCC-specific IVR scenarios (Epic 09)
- Historical-IV backfill data source — **TBD**: choose between paid feed (ORATS, polygon.io, IVolatility) for immediate seeding versus accepting a "data incomplete" UI state for ~252 trading days while polling builds up the snapshot store. Decision blocks US-87 acceptance criteria around the completeness-flag UX.
- Volatility surface modeling (skew, term structure visualization beyond a single 30-day IV) — future
- IV-driven automated trade suggestions (future)
- Greeks-based alerts beyond IV (Epic 07)

## Open Decisions

These are unresolved as of epic creation and should be answered when the affected story comes up. Each story bullet above is flagged with the decision(s) that block it.

1. **Backfill source.** Pick a historical IV provider (ORATS, polygon.io, IVolatility) or commit to the polled-only path. **Affects:** US-87 (full IVR day one vs. multi-month "partial data" UX). **Resolve before:** drafting US-87 acceptance criteria.
2. **Normalization window.** Default to 52-week IVR, expose 90-day rolling as alternate, or ship both side-by-side? **Affects:** US-87 (computation), US-88 (badge density). **Resolve before:** drafting US-87 / US-88 acceptance criteria.
3. **Snapshot polling cadence.** Once daily near close is the standard; intraday snapshots add cost without much analytical value at the IVR level. **Affects:** US-86 (collector schedule). **Resolve before:** drafting US-86 acceptance criteria.
