---
page: docs/spec/architecture/02-adrs/leg-history-in-cost-basis-drawer.md
audited_at: 2026-09-28
findings: 6
---

# Audit: docs/spec/architecture/02-adrs/leg-history-in-cost-basis-drawer.md

## Verified (4)

- ✓ `<LegHistoryTable>` rendered inside the "Cost basis & history" `CollapsedDrawer` — `src/renderer/src/components/position-cockpit/PositionCockpit.tsx:138,153-156`.
- ✓ `enrichedLegs = deriveRunningBasis(legs, allSnapshots ?? [])` computed once at the top of `PositionCockpit` — `PositionCockpit.tsx:43`.
- ✓ Table renders only when `enrichedLegs.length > 0` — `PositionCockpit.tsx:153`.
- ✓ Drawer `defaultOpen` in the no-active-leg branch (`:72`) and closed otherwise (`defaultOpen = false`, `:133`); feature page `us-34-position-cockpit.md` exists.

## Drift (0)

None.

## Unverifiable (0)

None.

## Missing files (2)

- ✗ `plans/us-34/plan.md` — `plans/us-34/` no longer exists (plan dirs retired; the extract is the durable source).
- ✗ `plans/us-34/research.md` — same.
