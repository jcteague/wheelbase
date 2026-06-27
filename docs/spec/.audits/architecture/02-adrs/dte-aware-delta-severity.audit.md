---
page: docs/spec/architecture/02-adrs/dte-aware-delta-severity.md
audited_at: 2026-06-27
findings: 0
---

# Audit: dte-aware-delta-severity.md

## Verified (6)

- ✓ `deltaSeverity(absDelta, instrument, dte)` exists with that signature: `src/renderer/src/lib/verdict.ts:67-71`.
- ✓ Thresholds shift down by 0.05 when `dte ≤ 7`: `tightDte: 7` and `tightDeltaShift: 0.05` (`verdict.ts:40,53`), applied as `shift = dte <= tightDte ? tightDeltaShift : 0` (`verdict.ts:72`).
- ✓ CSP thresholds: warning 0.30 (`cspWarningDelta: 0.3`), danger 0.45 (`cspDangerDelta: 0.45`): `verdict.ts:45-46`.
- ✓ CC thresholds: warning 0.35 (`ccWarningDelta: 0.35`), danger 0.50 (`ccDangerDelta: 0.5`): `verdict.ts:49-50`.
- ✓ The worked example "CSP |delta|=0.41 at dte=5 → danger" is asserted in test: `verdict.spec.ts:134` (`expect(deltaSeverity(0.41, 'PUT', 5)).toBe('danger')`).
- ✓ `DeltaGauge` label flips to `DELTA · TIGHT`: `DeltaGauge.tsx:44`, driven by `tight` (dte ≤ 7) per `RiskSnapshot.tsx:35`.

## Drift (0)

None. (Minor: the ADR phrases the label as `DELTA` → `DELTA · TIGHT`; code matches exactly.)

## Unverifiable (1)

- ? The gamma-risk justification for choosing a discrete 0.05 / 7-day shift is narrative.

## Missing files (0)

- ✓ Feature page `../../features/us-34-position-cockpit.md` exists. (`plans/us-34/...` outside scope.)
