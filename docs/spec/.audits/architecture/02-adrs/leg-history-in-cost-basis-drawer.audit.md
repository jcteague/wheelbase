---
page: docs/spec/architecture/02-adrs/leg-history-in-cost-basis-drawer.md
audited_at: 2026-06-27
findings: 0
---

# Audit: leg-history-in-cost-basis-drawer.md

## Verified (5)

- ✓ `<LegHistoryTable>` is rendered inside a `CollapsedDrawer` titled "Cost basis & history" (via `CostBasisDrawer`) — `src/renderer/src/components/position-cockpit/PositionCockpit.tsx:138,153-154`. Not a top-level section.
- ✓ `enrichedLegs = deriveRunningBasis(legs, allSnapshots ?? [])` computed once at the top of `PositionCockpit` (`:43`).
- ✓ Table renders only when `enrichedLegs.length > 0` (`:153`).
- ✓ Drawer is `defaultOpen` in the no-active-leg branch (`:72`) and collapsed by default (`defaultOpen = false`, `:133`) in the active-leg branch (`if (!activeLeg)` guard at `:46`).
- ✓ Components exist: `LegHistoryTable.tsx`, `CollapsedDrawer.tsx`, `deriveRunningBasis.ts`, `PositionCockpit.tsx`.

## Drift (0)

## Unverifiable (1)

- ? AC-7 wording ("the drawer contains the leg history table when expanded") is a story acceptance-criterion reference, not mechanically checkable here; the implementation satisfies it per the verified items above.

## Missing files (0)

- ✓ `../../features/us-34-position-cockpit.md` exists.

One-line: Audited leg-history-in-cost-basis-drawer.md: 5 verified, 0 drift, 1 unverifiable, 0 missing.
