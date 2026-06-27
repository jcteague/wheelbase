---
page: docs/spec/architecture/02-adrs/marketdataerror-structured-codes.md
audited_at: 2026-06-27
findings: 1
---

# Audit: marketdataerror-structured-codes.md

## Verified (2)

- ✓ `MarketDataError extends Error` with a typed `code` field — `src/main/integrations/market-data-provider.ts:13-20`.
- ✓ The provider throws these errors (rather than returning a Result tuple) — e.g. `throw new MarketDataError('not_found', ...)` / `throw new MarketDataError('unknown', ...)` in `src/main/integrations/massive-market-data.ts:175,178`.

## Drift (1)

- ✗ Page (line 7) claims the code vocabulary is `auth_failed | network_error | rate_limited | stream_disconnected | streaming_unsupported | subscription_failed | unknown`. Actual `MarketDataErrorCode` is `auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown` — `src/main/integrations/market-data-provider.ts:5-11`. Differences: `not_found` is present in code but missing from the page; `stream_disconnected` and `subscription_failed` are in the page but absent from code. Suggested fix: sync the page vocabulary to the six actual codes.

## Unverifiable (1)

- ? "IPC handlers translate the thrown error into the standard envelope, mapping `code` onto the `__root__` field." — envelope-mapping narrative; the page also says `__root__` but the codebase's error-field convention is documented elsewhere (`error-field-naming-convention.md`). Not traced to a specific handler here; flag for human review.
