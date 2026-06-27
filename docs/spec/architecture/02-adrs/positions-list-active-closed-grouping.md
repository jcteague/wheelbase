# ADR: Positions list splits into Active / Closed sections

<!-- generated:from us-5 -->

## Decision

The positions list page renders two visually distinct sections: **Active** positions and **Closed** positions. Closed positions render at lowered opacity (~0.55) and suppress live-price/snapshot columns. No separate route is introduced — both groups are on the same page.

> **Current state:** `PositionCard` was restructured from a card into a table-row layout (`PriceCell`, `OptMidCell`, `UnrealizedPnlCell`, `TargetBadge`). The closed state is now surfaced as a plain status text label (`{item.status}`), not a `WHEEL_COMPLETE` badge or a "Final P&L" label as originally designed. The opacity nudge and the `data-testid="position-card-closed"` marker remain.

`PositionCard` auto-detects closed state via `closed = isClosed ?? item.status === 'CLOSED'`, controlling the `data-testid="position-card-closed"` marker and the de-emphasis styling.

## Context / Why

- A flat list mixing active and closed positions buries the wheels the trader actively manages among historical wheels.
- Separating into a dedicated `/closed` route would be over-engineered: closed wheels are still informative (cost basis, final P&L, audit trail) and traders want them visible.
- The opacity treatment is a visual nudge that the row is no longer actionable without losing the data.

## Alternatives considered

- **Single flat list with no grouping** — rejected; buries active wheels.
- **Separate `/closed` route** — rejected as over-engineering for Phase 1; closed wheels are first-class history.
- **Tab navigation between Active and Closed** — rejected; adds clicks for a comparison that's natural to see at once.

## Consequences

- `PositionsListPage` derives `activePositions` and `closedPositions` from the unsorted positions array (memoised via `useMemo` to keep `tickers` dependencies stable).
- `PositionCard` receives an explicit `isClosed` prop or auto-derives from status; rendering branches on the closed state for opacity and label changes.
- The market-status pill (see ADR [market-status-pill](./market-status-pill.md)) and live-price column apply only to active positions; closed positions show static historical values.

## Sources

- [extract: us-5](../../.extracts/us-5.md) — ADR "Positions list splits into Active / Closed sections"
- [feature: us-5-expire-csp](../../features/us-5-expire-csp.md)
<!-- /generated -->
