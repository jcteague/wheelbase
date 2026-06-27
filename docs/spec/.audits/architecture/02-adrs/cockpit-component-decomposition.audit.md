---
page: docs/spec/architecture/02-adrs/cockpit-component-decomposition.md
audited_at: 2026-06-27
findings: 0
---

# Audit: cockpit-component-decomposition.md

## Verified (8)

All eight claimed files exist under `src/renderer/src/components/position-cockpit/`, each with a paired `*.spec.tsx`:

- ✓ `PnlBar.tsx`
- ✓ `DeltaGauge.tsx` — `· TIGHT` suffix present at `DeltaGauge.tsx:44`, gated by `tight` prop documented as "label suffix when DTE <= 7" (`DeltaGauge.tsx:5-6`).
- ✓ `DistanceThermo.tsx`
- ✓ `CollapsedDrawer.tsx`
- ✓ `ContextStrip.tsx`
- ✓ `RiskSnapshot.tsx` — composes `DeltaGauge` + `DistanceThermo` (`RiskSnapshot.tsx:37`).
- ✓ `VerdictBlock.tsx`
- ✓ `PositionCockpit.tsx`

Per-piece `*.spec.tsx` files confirm the "testable in isolation" claim.

## Drift (0)

None.

## Unverifiable (2)

- ? "mirrors the handoff prototype's structure file-for-file" — references `plans/us-33/handoff/...`, outside the audited `src/`/`migrations/` scope.
- ? "enables parallel implementation / Layer 1 has no cross-dependencies" — design rationale, not mechanically checkable.

## Missing files (0)

- ✓ Feature page `../../features/us-34-position-cockpit.md` exists.
