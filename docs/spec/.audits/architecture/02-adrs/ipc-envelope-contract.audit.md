---
page: docs/spec/architecture/02-adrs/ipc-envelope-contract.md
audited_at: 2026-09-28
findings: 10
---

# Audit: docs/spec/architecture/02-adrs/ipc-envelope-contract.md

## Verified (8)

- ✓ `handleIpcCall(logLabel, fn)` returns `{ ok: true, ...result }` or `{ ok: false, errors: [{ field, code, message }] }` — `src/main/ipc/utils.ts:9-21`.
- ✓ `ValidationError`, `BrokerError`, `MarketDataError` and `ZodError` are caught and serialised — `src/main/ipc/utils.ts:25-62`.
- ✓ Unhandled exceptions become `{ field: '__root__', code: 'internal_error' }` — `src/main/ipc/utils.ts:63-69`.
- ✓ `registerParsedPositionHandler` exists — `src/main/ipc/positions.ts:35`.
- ✓ `deeplink` surfaced top-level from `BrokerError` — `src/main/ipc/utils.ts:38-42`.
- ✓ Top-level `code` (`'NOT_FOUND' | 'NOT_PENDING'`) for assignment handlers via `PendingAssignmentError` → `rootCauseEnvelope` — `src/main/ipc/utils.ts:14-16,28-30`, `src/main/services/pending-assignments.ts:7`.
- ✓ Renderer maps failures to `apiError(400, …)` (`src/renderer/src/api/error.ts:25`, `settings.ts:134`) and `apiError(502, …)` for market data (`src/renderer/src/api/market-data.ts:54,62,70`); `mapIpcErrors`/`IPC_TO_FORM_FIELD` in `src/renderer/src/api/positions.ts:78-95`.
- ✓ Linked ADRs/extracts/features exist (`deeplink-in-ipc-error-envelope.md`, `zod-payload-validation.md`, `renderer-snake-case-adapter.md`, …).

## Drift (1)

- ✗ Line 35 presents the top-level `code` as exclusive to `assignments:confirm` / `assignments:dismiss` ("precedent-limited deviation"). `AlertError` (`'NOT_FOUND' | 'NOT_OPEN'`, `src/main/services/alerts.ts:59-61`) is routed through the same `rootCauseEnvelope` (`src/main/ipc/utils.ts:31-33`), so `alerts:dismiss` also carries a top-level `code`. Suggested fix: add the alerts handler to the documented extension.

## Unverifiable (1)

- ? The renderer uses `apiError(404, …)` for a missing position (`src/renderer/src/api/positions.ts:246`) alongside the "typically 400" rule — consistent with "typically", not drift. Rationale bullets are narrative.

## Missing files (0)

None.
