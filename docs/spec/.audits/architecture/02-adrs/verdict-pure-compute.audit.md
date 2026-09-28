---
page: docs/spec/architecture/02-adrs/verdict-pure-compute.md
audited_at: 2026-09-28
findings: 1
---

# Audit: verdict-pure-compute.md

## Verified (4)

- ✓ `src/renderer/src/lib/verdict.ts` exists and exports pure functions over `CockpitInput` (`verdict.ts:19`).
- ✓ Exports `computeVerdict` (143), `computePnl` (123), `computeDistance` (108), `computeThetaYield` (133), `deltaSeverity` (72), `SEVERITY_COLOR` (93), `SHARES_VERDICT` (218), `MANAGEMENT_RULES` (43).
- ✓ Component layer calls `computeVerdict(input)` and renders — `src/renderer/src/components/position-cockpit/PositionCockpit.tsx:79`.
- ✓ Feature link `../../features/us-34-position-cockpit.md` exists; no `useVerdict` hook exists.

## Drift (0)

None.

## Unverifiable (1)

- ? "14 verdict tests cover every branch" — `src/renderer/src/lib/verdict.spec.ts` currently has ~20 `it(` cases across all exports; the specific count is historical and not load-bearing.

## Missing files (0)

None.
