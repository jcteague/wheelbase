---
page: docs/spec/architecture/02-adrs/error-field-naming-convention.md
audited_at: 2026-06-27
findings: 0
---

# Audit: error-field-naming-convention.md

## Verified (5)

- ✓ `__root__` used for call-level/lookup/internal errors: `src/main/ipc/utils.ts:26,36,46` (BrokerError, MarketDataError, etc. all emit `field: '__root__'`).
- ✓ `__phase__` / `invalid_phase` used for phase-mismatch failures: `src/main/core/lifecycle.ts:57,114,151,184,192,276,305,367`.
- ✓ Renderer `IPC_TO_FORM_FIELD` mapping exists: `src/renderer/src/api/positions.ts:83`.
- ✓ `mapIpcErrors(errors)` translates IPC field names via that map: `src/renderer/src/api/positions.ts:94-96`, applied at multiple call sites (lines 103, 265, 276, 287, 334, 577).
- ✓ Literal camelCase input field names used for validation errors (consistent with `ValidationError(field, code, message)` usage throughout `lifecycle.ts` and services).

## Drift (0)

None observed for the spot-checked codes (`invalid_phase`, `not_found`, `internal_error`). The full `code` vocabulary list (e.g. `must_be_positive`, `exceeds_shares`, `streaming_unsupported`) was not each individually grepped.

## Unverifiable (1)

- ? Exhaustiveness of the documented `code` vocabulary and the complete `IPC_TO_FORM_FIELD` field list — too broad to mechanically confirm completeness in a page-scoped audit; the convention itself is verified.

## Missing files (0)

- ✓ All seven linked feature pages (us-4, us-5, us-6, us-7, us-8, us-9, us-12) and the `renderer-snake-case-adapter.md` ADR exist.
