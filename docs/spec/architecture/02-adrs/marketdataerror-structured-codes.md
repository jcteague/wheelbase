# ADR: `MarketDataError` with a discriminating `code`

<!-- generated:from us-31,market-data-massive-migration -->

## Decision

`MarketDataError extends Error` with a typed `code` field. The vocabulary is fixed: `auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown`. The provider throws these (rather than returning a `Result` tuple), consistent with the rest of the codebase. IPC handlers translate the thrown error into the standard envelope, mapping `code` onto the `__root__` field.

## Why

The story's acceptance criteria require structured errors that callers can pattern-match on — without parsing message strings. A typed `code` discriminant lets the IPC layer (and downstream stories) branch on `auth_failed` vs `network_error` vs `streaming_unsupported` without `if (msg.includes('401'))` heuristics. Throwing matches the existing convention; `Result<T, E>` would be cleaner functionally but would be an outlier.

## Alternatives considered

- **`Result<T, E>` return tuples** — cleaner functional shape but inconsistent with the rest of the codebase.
- **Plain `Error` with substring matching** — fragile; couples callers to message wording.

## Source

- `plans/us-31/research.md`
- `plans/us-31/data-model.md`
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->
