---
page: docs/spec/architecture/02-adrs/no-active-leg-cockpit-branch.md
audited_at: 2026-06-27
findings: 1
---

# Audit: no-active-leg-cockpit-branch.md

## Verified (4)

- ✓ `PositionCockpit` branches on `!activeLeg` — `src/renderer/src/components/position-cockpit/PositionCockpit.tsx:46`. (File lives in `position-cockpit/`, not directly under `components/`.)
- ✓ In the no-active-leg branch it renders `<VerdictBlock pnl={null}>` with `SHARES_VERDICT` — `PositionCockpit.tsx:48,53-56`.
- ✓ The cost-basis history drawer ("Cost basis & history") is rendered with `defaultOpen` in that branch — `PositionCockpit.tsx:68-72`, drawer title at line 138.
- ✓ `RiskSnapshot`, `ContextStrip`, and the "Leg reference" drawer are NOT rendered in the no-active-leg branch — they appear only in the active-leg branch (`PositionCockpit.tsx:94,95,97`).

## Drift (1)

- ✗ Minor: Page (line 7) says the branch uses `SHARES_VERDICT`. The code selects `WHEEL_COMPLETE_VERDICT` when `position.phase === 'WHEEL_COMPLETE'`, else `SHARES_VERDICT` — `PositionCockpit.tsx:47-48`. Also, the page says it renders a bare `<CollapsedDrawer defaultOpen>`; the actual drawer is wrapped in a local `CostBasisDrawer` component (which renders a `CollapsedDrawer` titled "Cost basis & history") — `PositionCockpit.tsx:68,129-138`. Suggested fix: note the WHEEL_COMPLETE verdict variant and the `CostBasisDrawer` wrapper.

## Unverifiable (0)

(none)
