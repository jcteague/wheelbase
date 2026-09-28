---
page: docs/spec/architecture/02-adrs/open-interest-from-contracts-endpoint.md
audited_at: 2026-09-28
findings: 0
---

# Audit: open-interest-from-contracts-endpoint.md

## Verified (10)

- ✓ Contracts URL `{ALPACA_TRADING_BASE_URLS[environment]}/v2/options/contracts` with the chain filter bounds, `limit=CONTRACTS_PAGE_SIZE (10000)`, `page_token` — `src/main/integrations/alpaca-market-data-mappers.ts:31, 221-231`.
- ✓ Pagination follows `next_page_token` — `src/main/integrations/alpaca-market-data.ts:326-341`.
- ✓ `Map<symbol, number | null>` built from string `open_interest` via `parseOpenInterest` — `alpaca-market-data.ts:348-360`; row type `open_interest: string | null` — `alpaca-market-data-mappers.ts:105`.
- ✓ `ALPACA_TRADING_BASE_URLS` paper/live hosts in `src/main/integrations/alpaca-hosts.ts:4-7`, shared with `src/main/services/settings-connections.ts:2`.
- ✓ Own `try/catch`; failure logs `warn` `alpaca_open_interest_unavailable { underlying, err }` and returns an empty map → `openInterest: null` — `alpaca-market-data.ts:362-365, 202`.
- ✓ Empty chain returns `[]` before any contracts request — `alpaca-market-data.ts:196-198`.
- ✓ Single-contract snapshot sets `openInterest: null` — `mapOptionQuote`, `alpaca-market-data-mappers.ts:151`.
- ✓ `CHAIN_FETCH_CONCURRENCY = 4` — `src/main/services/candidate-chains.ts:37`.
- ✓ `info` `Alpaca chain snapshot mapped { underlying, contracts, twoSided, withGreeks, oiResolved }` — `alpaca-market-data.ts:210-219`.
- ✓ Screener `open_interest` rule skips when `openInterest === null` (`applies: ctx.strike.openInterest !== null`) — `src/main/core/screener.ts:328-334`.

## Drift (0)

None.

## Unverifiable (2)

- ? "Paper keys on the live trading host return 401 … identical market data" — external vendor behaviour.
- ? Budget "2 requests per watchlist ticker" per refresh — follows from code but not asserted mechanically.

## Missing files (0)

None.
