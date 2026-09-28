---
page: docs/spec/architecture/02-adrs/marketdataerror-structured-codes.md
audited_at: 2026-09-28
findings: 0
---

# Audit: marketdataerror-structured-codes.md

## Verified (15)

- ✓ `MarketDataErrorCode` = `auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown`; `MarketDataError extends Error` with `readonly code` — `src/main/integrations/market-data-provider.ts:6-19`.
- ✓ `handleIpcCall` maps `MarketDataError` to `__root__` with `code` — `src/main/ipc/utils.ts:44-51`.
- ✓ No credentials → `auth_failed`, `Alpaca credentials not configured` — `src/main/integrations/alpaca-market-data.ts:75-80`.
- ✓ 401/403 → `auth_failed`, `HTTP ${status}` — `alpaca-market-data.ts:107-109`.
- ✓ 404 → `not_found`, `HTTP 404: ${url}` — `alpaca-market-data.ts:124-126`.
- ✓ Missing contract → `not_found`, `Option contract ${contractId} not in snapshot` — `alpaca-market-data.ts:169`.
- ✓ 429 after `MAX_RETRIES = 2` honouring `Retry-After` → `rate_limited`, `rate limit exceeded` — `alpaca-market-data.ts:55, 111-122`.
- ✓ `isNetworkError(err)` → `network_error`; other fetch rejection → `unknown` — `alpaca-market-data.ts:97-105`.
- ✓ Other non-2xx → `unknown`, `HTTP ${status}` — `alpaca-market-data.ts:127-129`.
- ✓ `connectError`: 402 → `auth_failed`, 409 → `streaming_unsupported`/`insufficient subscription`, else `unknown` with frame msg — `alpaca-market-data-mappers.ts:439-445`.
- ✓ Socket `error` → `network_error` (err.message); auth timeout → `network_error`/`auth timeout` (10 s) — `alpaca-market-data.ts:57, 396, 439-440`.
- ✓ `classifyStreamError`: 405 → `symbol_limit`, 406 → `connection_limit`, else `unknown`; emitted as `StreamError` with `feed: 'stockQuotes'` — `alpaca-market-data-mappers.ts:433-437`, `alpaca-market-data.ts:484-485`.
- ✓ `connect()` rejections caught by `subscribeToStockQuotes`, logged, REST-only — `src/main/services/market-data.ts:106-113`.
- ✓ Contracts-endpoint failure → `openInterest: null` + `warn` — `alpaca-market-data.ts:344, 363`; `no_options_listed` classification — `src/main/services/candidate-chains.ts:57-58`.
- ✓ `classifyChainFailure(code: MarketDataErrorCode)` exists — `src/main/core/candidate-chain.ts:92`.

## Drift (0)

None.

## Unverifiable (2)

- ? Line 46 "the free plan on the `sip` socket" — the live socket is IEX (`alpaca-market-data.ts:56`); the 409 producer is verified, the plan/socket context is narrative.
- ? Evolution section (us-31 seven-member set, Massive changes) — history.

## Missing files (0)

None. (`plans/us-99/contracts/alpaca-market-data.md` and all extract/feature links exist.)
