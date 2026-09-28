---
page: docs/spec/architecture/02-adrs/error-field-naming-convention.md
audited_at: 2026-09-28
findings: 7
---

# Audit: docs/spec/architecture/02-adrs/error-field-naming-convention.md

## Verified (6)

- ✓ `__root__` and `__phase__` field values in use — e.g. `src/main/core/lifecycle.ts` (`__phase__`, `invalid_phase`), `src/main/ipc/utils.ts` (`internal_error`).
- ✓ Every listed `code` value is present in non-test `src/`: `not_found`, `invalid_phase`, `must_be_positive`, `close_date_before_open`, `close_date_after_expiration`, `before_assignment`, `cannot_be_future`, `exceeds_shares`, `too_early`, `must_be_after_current` (`src/main/core/lifecycle.ts`), `no_active_leg` (`src/main/services/expire-csp-position.ts`), `internal_error` (`src/main/ipc/utils.ts`), `auth_failed`, `network_error`, `rate_limited` (`src/main/integrations/finnhub-earnings.ts`), `streaming_unsupported` (`src/main/integrations/alpaca-market-data-mappers.ts`).
- ✓ `IPC_TO_FORM_FIELD` maps camelCase IPC fields to snake_case form fields, incl. `fillDate` → `fill_date` — `src/renderer/src/api/positions.ts:78-87`.
- ✓ `mapIpcErrors(errors)` applies that mapping with pass-through fallback — `src/renderer/src/api/positions.ts:89-95`.
- ✓ `ErrorAlert` component used for root errors (e.g. `src/renderer/src/components/ExpirationSheet.tsx`).
- ✓ All linked extracts, features and `./renderer-snake-case-adapter.md` exist.

## Drift (0)

None.

## Unverifiable (1)

- ? "`__phase__` lets the renderer show it inline in the sheet body or banner rather than next to an input" — UI placement rationale, not mechanically checkable.

## Missing files (0)

None.
