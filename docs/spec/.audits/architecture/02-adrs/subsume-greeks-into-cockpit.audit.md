---
page: docs/spec/architecture/02-adrs/subsume-greeks-into-cockpit.md
audited_at: 2026-06-27
findings: 0
---

# Audit: subsume-greeks-into-cockpit.md

## Verified (4)

- ✓ `PositionCockpit` ships as a component at `src/renderer/src/components/position-cockpit/PositionCockpit.tsx`.
- ✓ No `GreeksPanel` standalone component exists — `find` and `grep -rn "GreeksPanel" src/renderer/src` both return nothing, matching "is not shipped".
- ✓ `RiskSnapshot` surface exists at `src/renderer/src/components/position-cockpit/RiskSnapshot.tsx` (delta gauge claim).
- ✓ `ContextStrip` surface exists at `src/renderer/src/components/position-cockpit/ContextStrip.tsx` (theta/IV/vega/gamma claim).

## Drift (0)

None.

## Unverifiable (2)

- ? "delta in the RiskSnapshot gauge, and theta / IV / vega / gamma in the ContextStrip" — component names verified, but the exact greek-to-surface mapping is a rendering detail not mechanically confirmed here.
- ? "Notes, the closed-position banner, and CloseCspForm remain below the cockpit" — layout/ordering narrative; flag for human review.

## Missing files (0)

- Note: linked Source paths (`plans/us-34/plan.md`, `docs/epics/06-stories/US-34-greeks-display.md`, `../../features/us-34-position-cockpit.md`) were not in audit scope (src/ + migrations/ verification only).
