# ADR: `MarketDataError` with a discriminating `code`

<!-- generated:from us-31,market-data-massive-migration -->

## Decision

`MarketDataError extends Error` carries a typed, discriminating `code` field. The vocabulary shipped in source is six members:

`auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown`

The provider **throws** these (rather than returning a `Result` tuple), consistent with the rest of the codebase. IPC handlers translate the thrown error into the standard `{ ok, errors }` envelope via `handleIpcCall`, mapping `code` onto the `__root__` field so the renderer can branch without parsing message strings.

## Code mapping (current state — Massive)

Codes are derived from the Massive REST HTTP status; no message-substring inspection:

| Source                                                       | `code`                  |
| ------------------------------------------------------------ | ----------------------- |
| `401` / `403`                                                | `auth_failed`           |
| `404`                                                        | `not_found`             |
| `429` (after `MAX_RETRIES`, honouring `Retry-After` backoff) | `rate_limited`          |
| Transport/connectivity failure                               | `network_error`         |
| Calling `stream()` for an unsupported feed†                  | `streaming_unsupported` |
| Any other non-ok / unexpected response                       | `unknown`               |

`429` is retried up to `MAX_RETRIES` with `Retry-After`-driven backoff before the `rate_limited` error is surfaced.

† The Massive provider **never** raises `streaming_unsupported` — `supportsStreaming()` returns `true` and its `stream()` never throws this code. `streaming_unsupported` is a union member exercised only by `FakeMarketDataProvider` (`src/main/integrations/fake-market-data.ts`); the row is retained here to document the interface-level capability, not a live Massive error path.

## Why

The story's acceptance criteria require structured errors that callers can pattern-match on without parsing message strings. A typed `code` discriminant lets the IPC layer (and downstream stories) branch on `auth_failed` vs `network_error` vs `streaming_unsupported` without `if (msg.includes('401'))` heuristics. Throwing matches the existing convention; `Result<T, E>` would be cleaner functionally but would be an outlier.

## Alternatives considered

- **`Result<T, E>` return tuples** — cleaner functional shape but inconsistent with the rest of the codebase.
- **Plain `Error` with substring matching** — fragile; couples callers to message wording.

## Evolution from the original Alpaca contract

The us-31 (Alpaca-era) plan defined a different set: `auth_failed | network_error | rate_limited | stream_disconnected | streaming_unsupported | subscription_failed | unknown`. The Massive migration **dropped** `stream_disconnected` and `subscription_failed` (there is no live option stream and no per-symbol subscribe failure path) and **added** `not_found` (HTTP `404`).

The `unknown` member ships in code as the catch-all for any other non-ok / unexpected response, but it was **not listed in the migration plan's contract file** — a documented drift between plan and source, not a regression.

## Source

- `docs/spec/.extracts/us-31.md`, `docs/spec/.extracts/market-data-massive-migration.md`
- `plans/market-data-massive-migration/research.md`, `plans/market-data-massive-migration/contracts/market-data-provider.md`
- Implementation: `src/main/integrations/market-data-provider.ts` (`MarketDataError`, `MarketDataErrorCode`), `src/main/integrations/massive-market-data.ts` (HTTP-status mapping)
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->
