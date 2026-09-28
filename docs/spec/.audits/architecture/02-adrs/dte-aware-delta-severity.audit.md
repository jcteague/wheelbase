---
page: docs/spec/architecture/02-adrs/dte-aware-delta-severity.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/architecture/02-adrs/dte-aware-delta-severity.md

## Verified (5)

- ✓ `deltaSeverity(absDelta, instrument, dte)` — `src/renderer/src/lib/verdict.ts:72-85`.
- ✓ Shift of 0.05 when `dte <= 7` — `tightDte: 7`, `tightDeltaShift: 0.05` (`verdict.ts:45,58`), applied at `verdict.ts:77`.
- ✓ Base thresholds CSP warning ≥ 0.30 / danger > 0.45; CC warning ≥ 0.35 / danger > 0.50 — `verdict.ts:50-55` with `>` danger and `>=` warning comparisons at `verdict.ts:82-83`.
- ✓ Worked example holds: CSP `|delta| = 0.41`, `dte = 5` → danger threshold 0.40 → `danger`.
- ✓ `DeltaGauge` label becomes `DELTA · TIGHT` when `tight` — `src/renderer/src/components/position-cockpit/DeltaGauge.tsx:44`, with `tight = dte <= MANAGEMENT_RULES.tightDte` computed in `RiskSnapshot.tsx:35`.

## Drift (0)

## Unverifiable (1)

- ? Gamma rationale and choice of 0.05 — domain reasoning.

## Missing files (2)

- ✗ Source `plans/us-34/data-model.md` does not exist (no `plans/us-34/` directory).
- ✗ Source `plans/us-34/plan.md` does not exist. `../../features/us-34-position-cockpit.md` exists.
