---
page: docs/spec/architecture/02-adrs/named-lifecycle-functions.md
audited_at: 2026-06-27
findings: 0
---

# Audit: named-lifecycle-functions.md

## Verified (17)

- ✓ All 7 named lifecycle transitions exist in `src/main/core/lifecycle.ts`: `closeCsp` (line 112), `expireCsp` (149), `openCoveredCall` (181), `recordAssignment` (273), `expireCc` (303), `closeCoveredCall` (331), `rollCsp` (365).
- ✓ All 7 named cost-basis functions exist in `src/main/core/costbasis.ts`: `calculateInitialCspBasis` (37), `calculateCspClose` (71), `calculateAssignmentBasis` (115), `calculateCcOpenBasis` (155), `calculateCspExpiration` (173), `calculateCcClose` (195), `calculateRollBasis` (235).
- ✓ Shared private validators extracted as the page describes: `requirePositiveStrike` (lifecycle.ts:35), `requirePositivePremium` (47), `requirePositiveClosePrice` (51); each reused by ≥2 transitions (e.g. requirePositiveStrike at 72,198; requirePositivePremium at 82,199; requirePositiveClosePrice at 117,334).

## Drift (0)

(none)

## Unverifiable (1)

- ? IPC channel-naming consequence (`positions:close-csp` etc.) is delegated to ADR `ipc-channel-naming.md` and not re-verified here. The lifecycle/costbasis claims — the substance of this ADR — all check out.
