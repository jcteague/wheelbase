---
page: docs/spec/architecture/02-adrs/named-lifecycle-functions.md
audited_at: 2026-09-28
findings: 0
---

# Audit: named-lifecycle-functions.md

## Verified (6)

- ✓ Named transitions `closeCsp`, `expireCsp`, `recordAssignment`, `openCoveredCall`, `closeCoveredCall`, `expireCc`, `rollCsp` exported from `src/main/core/lifecycle.ts:112, 149, 273, 181, 331, 303, 365` (also `openWheel` `:67`, `recordCallAway` `:243`, `rollCc` `:398` — consistent with the pattern).
- ✓ Transitions throw `ValidationError` — class at `lifecycle.ts:7-14`, thrown e.g. `:114, :151`.
- ✓ Cost-basis functions `calculateInitialCspBasis`, `calculateCspClose`, `calculateCspExpiration`, `calculateAssignmentBasis`, `calculateCcOpenBasis`, `calculateCcClose`, `calculateRollBasis` — `src/main/core/costbasis.ts:37, 71, 173, 115, 155, 195, 235`.
- ✓ Private shared validators `requirePositiveStrike`, `requirePositivePremium`, `requirePositiveClosePrice` (non-exported) — `lifecycle.ts:35, 47, 51`.
- ✓ IPC channels `positions:close-csp`, `expire-csp`, `assign-csp`, `open-cc`, `close-cc-early`, `expire-cc`, `roll-csp` — `src/main/ipc/positions.ts:75, 91, 83, 99, 107, 121, 130`.
- ✓ Linked ADR `ipc-channel-naming.md` and all cited extracts/feature pages exist.

## Drift (0)

None.

## Unverifiable (2)

- ? Rationale against a single `transition()` dispatcher — design intent.
- ? "Helpers extracted only when ≥ 2 callers" — policy, not mechanically checkable.

## Missing files (0)

None.
