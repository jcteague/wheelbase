# ADR: Leg-history table lives inside the cost-basis drawer

<!-- generated:from us-34 -->

## Decision

`<LegHistoryTable>` is rendered inside the body of the cockpit's "Cost basis & history" `CollapsedDrawer`, not as a top-level section. `enrichedLegs = deriveRunningBasis(legs, allSnapshots ?? [])` is computed once at the top of `PositionCockpit`; the table only renders when `enrichedLegs.length > 0`. The drawer is collapsed by default when an active leg exists and `defaultOpen` when there is none.

## Why

AC-7 specifies the drawer "contains the leg history table when expanded." The cockpit's whole premise is "compress everything below the verdict into collapsible reference" — history is reference, not action, so it belongs inside a drawer. Opening the drawer by default in the no-active-leg branch keeps the only useful information visible when there is nothing else to render.

## Alternatives considered

- **Keep `LegHistoryTable` as its own top-level section card** — competes with the verdict for attention and breaks the "drawer everything below the fold" pattern.
- **Hide it entirely on the detail page** — loses audit trail visibility for closed/in-progress positions.

## Source

- `plans/us-34/plan.md` (Area 9)
- `plans/us-34/research.md`
- Feature page: `../../features/us-34-position-cockpit.md`
<!-- /generated -->
