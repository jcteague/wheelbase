---
page: docs/spec/architecture/02-adrs/marketdataerror-structured-codes.md
audited_at: 2026-06-29
findings: 3
---

# Audit: docs/spec/architecture/02-adrs/marketdataerror-structured-codes.md

## Verified (9)

- ✓ 6-member `MarketDataErrorCode` union (`auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown`) matches `src/main/integrations/market-data-provider.ts:5-11` exactly — same members, same order.
- ✓ `MarketDataError extends Error` with a `readonly code` discriminant — `src/main/integrations/market-data-provider.ts:13-21`.
- ✓ HTTP `401`/`403` → `auth_failed` — `src/main/integrations/massive-market-data.ts:160-162`.
- ✓ HTTP `404` → `not_found` — `src/main/integrations/massive-market-data.ts:174-176`.
- ✓ HTTP `429` → `rate_limited`, retried up to `MAX_RETRIES` honouring `Retry-After` backoff before surfacing — `src/main/integrations/massive-market-data.ts:18` (`MAX_RETRIES = 2`), `164-172` (retry + Retry-After delay), `165-166` (throw after limit).
- ✓ Transport/connectivity failure → `network_error` — `src/main/integrations/massive-market-data.ts:150-156` (uses `isNetworkError`); WebSocket transport errors also map to `network_error` at `300-302`.
- ✓ Any other non-ok / unexpected response → `unknown` — `src/main/integrations/massive-market-data.ts:157` (non-network fetch throw) and `177-179` (`!response.ok`).
- ✓ Codes derived from HTTP status, no message-substring inspection — confirmed by reading the `apiFetch` branch ladder (`massive-market-data.ts:145-183`); all branches key on `response.status` / error type, none on message contents.
- ✓ IPC layer translates the thrown error into `{ ok, errors }` with `code` mapped onto the `__root__` field via `handleIpcCall` — `src/main/ipc/utils.ts:39-46` (`if (err instanceof MarketDataError) ... field: '__root__', code: err.code`).

## Drift (1)

- ✗ The code-mapping table row "Calling `stream()` for an unsupported feed → `streaming_unsupported`" does not apply to the Massive provider. `MassiveMarketDataProvider.supportsStreaming()` returns `true` and its `stream()` never throws `streaming_unsupported` (`massive-market-data.ts:252-263`). The only `streaming_unsupported` throw site in source is the fake provider, `src/main/integrations/fake-market-data.ts:83`. The ADR header for that table says "current state — Massive", which makes the row misleading: under Massive that branch is never reached. Suggested fix: move/footnote the `streaming_unsupported` row as a union-member capability not exercised by the Massive provider, or scope the table caption to "the provider interface" rather than "Massive".

## Unverifiable (2)

- ? "The provider **throws** these (rather than returning a `Result` tuple), consistent with the rest of the codebase." — partially verifiable (throws are confirmed at all sites above); the broader "consistent with the rest of the codebase" is a narrative claim, flagged for human review.
- ? The "Why" and "Alternatives considered" sections are rationale prose with no mechanical code assertions; not auditable.

## Missing files (2)

- ✗ Source list cites `plans/us-31/research.md` and `plans/us-31/data-model.md` — neither exists (`plans/us-31/` is gone). Consistent with the known "plan dirs deleted; extracts are the durable source" state. Remaining cited plan files DO exist: `plans/market-data-massive-migration/research.md` and `plans/market-data-massive-migration/contracts/market-data-provider.md`. Feature page `docs/spec/features/us-31-market-data-provider-adapter.md` exists. Suggested fix: drop the two dead `plans/us-31/*` references or repoint them to the durable extracts.
