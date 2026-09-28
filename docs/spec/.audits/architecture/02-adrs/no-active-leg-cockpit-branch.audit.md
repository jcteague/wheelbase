---
page: docs/spec/architecture/02-adrs/no-active-leg-cockpit-branch.md
audited_at: 2026-09-28
findings: 2
---

# Audit: no-active-leg-cockpit-branch.md

## Verified (5)

- ✓ `if (!activeLeg)` branch in `src/renderer/src/components/position-cockpit/PositionCockpit.tsx:46`.
- ✓ Verdict `WHEEL_COMPLETE_VERDICT` when `position.phase === 'WHEEL_COMPLETE'`, else `SHARES_VERDICT` — `PositionCockpit.tsx:47-48`.
- ✓ `<VerdictBlock … pnl={null}>` plus `<CostBasisDrawer … defaultOpen>` only — `PositionCockpit.tsx:53-72`; `RiskSnapshot` / `ContextStrip` / "Leg reference" drawer appear only in the active-leg path (`:94-97`).
- ✓ Local `CostBasisDrawer` wrapper renders `<CollapsedDrawer title="Cost basis & history" … defaultOpen={defaultOpen}>` — `PositionCockpit.tsx:129-138`.
- ✓ Feature page `../../features/us-34-position-cockpit.md` exists.

## Drift (0)

None.

## Unverifiable (1)

- ? Rationale (no greeks without an option leg; avoid empty cards) — design intent.

## Missing files (2)

- ✗ Source `plans/us-34/plan.md` — `plans/us-34/` no longer exists.
- ✗ Source `plans/us-34/data-model.md` — same.
