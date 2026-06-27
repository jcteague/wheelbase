---
page: docs/spec/architecture/02-adrs/ipc-envelope-contract.md
audited_at: 2026-06-27
findings: 1
---

# Audit: ipc-envelope-contract.md

## Verified (7)

- ✓ Envelope shape `({ ok: true } & T) | { ok: false; code?; deeplink?; errors: IpcFieldError[] }` in `src/main/ipc/utils.ts:14`.
- ✓ `IpcFieldError = { field: string; code: string; message: string }` at `src/main/ipc/utils.ts:8`.
- ✓ `handleIpcCall(logLabel, fn)` catches and serializes `ValidationError`, `BrokerError`, `MarketDataError`, `ZodError`, and unknown errors; never re-throws (`src/main/ipc/utils.ts:10-67`).
- ✓ Unhandled exceptions surface as `{ ok: false, errors: [{ field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }] }` (`utils.ts:60-63`).
- ✓ `registerParsedPositionHandler` helper exists (`src/main/ipc/positions.ts:32`).
- ✓ Renderer adapter maps to `apiError(400, …)` for positions (`src/renderer/src/api/positions.ts:103`) and `apiError(502, …)` for market-data/broker/settings (`src/renderer/src/api/market-data.ts:43`, `broker.ts:21`).
- ✓ `mapIpcErrors` + `IPC_TO_FORM_FIELD` map exist (`src/renderer/src/api/positions.ts:83,94`).
- ✓ deeplink extension (US-47): `handleIpcCall` spreads `...(err.deeplink ? { deeplink } : {})` for `BrokerError` (`utils.ts:35`); `BrokerError.deeplink` defined (`src/main/integrations/broker-provider.ts:11-16`); `requireCredentials` populates it in `src/main/integrations/alpaca-broker.ts`.

## Drift (1)

- ✗ The US-35 "top-level `code` on assignment handlers" extension claims the code set is `'NOT_FOUND' | 'NOT_PENDING' | 'TRANSITION_REJECTED'`. Actual `PendingAssignmentError.code` is only `'NOT_PENDING' | 'NOT_FOUND'` (`src/main/services/pending-assignments.ts:7-8`); `TRANSITION_REJECTED` does **not** exist anywhere in `src/` (grep empty). The top-level `code` mechanism itself IS real (`utils.ts:22-27` attaches `code: err.code` for `PendingAssignmentError`), so the pattern is correct but the documented value set is wrong. Suggested fix: drop `TRANSITION_REJECTED` from the page, leaving `'NOT_FOUND' | 'NOT_PENDING'`.

## Unverifiable (0)

## Missing files (0)

- ✓ `../../features/us-4-close-csp.md` and `us-32-live-position-prices.md` exist. Cross-referenced ADRs (deeplink-in-ipc-error-envelope, zod-payload-validation, renderer-snake-case-adapter, error-field-naming-convention) are siblings not in this audit batch — not verified here.

One-line: Audited ipc-envelope-contract.md: 7 verified, 1 drift, 0 unverifiable, 0 missing.
