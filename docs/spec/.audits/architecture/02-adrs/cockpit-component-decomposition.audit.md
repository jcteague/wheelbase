---
page: docs/spec/architecture/02-adrs/cockpit-component-decomposition.md
audited_at: 2026-09-28
findings: 4
---

# Audit: docs/spec/architecture/02-adrs/cockpit-component-decomposition.md

## Verified (8)

- ✓ All eight files exist under `src/renderer/src/components/position-cockpit/`: `PnlBar.tsx`, `DeltaGauge.tsx`, `DistanceThermo.tsx`, `CollapsedDrawer.tsx`, `ContextStrip.tsx`, `RiskSnapshot.tsx`, `VerdictBlock.tsx`, `PositionCockpit.tsx`, each with a `*.spec.tsx`.
- ✓ `DeltaGauge` — 108px default, stroke 6, ` · TIGHT` label when `tight` — `DeltaGauge.tsx:14,25,31,44`; `tight = dte <= MANAGEMENT_RULES.tightDte` (7) at `RiskSnapshot.tsx:35`, `src/renderer/src/lib/verdict.ts:45`.
- ✓ `DistanceThermo` — red→gold→green gradient with clamped marker — `DistanceThermo.tsx:12-13,20`.
- ✓ `CollapsedDrawer` shows a chevron, title and "N fields" label — `CollapsedDrawer.tsx:26-30`.
- ✓ `ContextStrip` — four columns Theta / IV / Vega / Gamma in `<SectionCard header="Context">` — `ContextStrip.tsx:54-64`.
- ✓ `RiskSnapshot` composes `DeltaGauge` + `DistanceThermo` in `<SectionCard header="Risk snapshot">` — `RiskSnapshot.tsx:5-6,44,49`.
- ✓ `VerdictBlock` has a `PnlSummary` sub-component built on `<PnlBar>` — `VerdictBlock.tsx:3,40,55`.
- ✓ `PositionCockpit` renders `<LegHistoryTable>` alongside `VerdictBlock`, `RiskSnapshot`, `ContextStrip`, `CollapsedDrawer` (`PositionCockpit.tsx`).

## Drift (1)

- ✗ Line 12 says `CollapsedDrawer.tsx` is a "shadcn-Collapsible wrapper". It is a hand-rolled `useState` toggle with a `<button aria-expanded>` and conditional children (`CollapsedDrawer.tsx:1,16-33`); no `Collapsible` component or import exists anywhere under `src/renderer/src/` (case-insensitive grep). Suggested fix: describe it as a local-state disclosure (the related `shadcn-collapsible-drawers` ADR likely needs the same check).

## Unverifiable (2)

- ? `PositionCockpit` "composes the seven above". It composes four of them directly; `DeltaGauge`, `DistanceThermo` and `PnlBar` arrive through `RiskSnapshot` / `VerdictBlock`. It also defines local `CostBasisDrawer` and `PositionStatsCard` (`PositionCockpit.tsx:129,171`). Loosely true; flag for wording review.
- ? Parallel-build / merge-conflict rationale — narrative.

## Missing files (3)

- ✗ Source `plans/us-34/plan.md` does not exist (no `plans/us-34/` directory).
- ✗ Source `plans/us-34/tasks.md` does not exist.
- ✗ Referenced handoff prototype `plans/us-33/handoff/src/components/position-cockpit/*` does not exist.
