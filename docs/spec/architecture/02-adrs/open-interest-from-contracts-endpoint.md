# ADR: Open interest from `/v2/options/contracts`, joined by symbol, degrading to `null`

<!-- generated:from us-99 -->

## Decision

Alpaca's option snapshots carry no open interest. After a non-empty chain page set, `getOptionChainSnapshot` calls `GET {tradingHost}/v2/options/contracts` with the same underlying / type / expiration / strike filters, `limit=10000`, paginating on `page_token`, and builds `Map<symbol, number | null>` from the **string** `open_interest` (`parseOpenInterest`). `tradingHost` follows `credentials.environment` via `ALPACA_TRADING_BASE_URLS` (`paper` → `https://paper-api.alpaca.markets`, `live` → `https://api.alpaca.markets`) in `src/main/integrations/alpaca-hosts.ts`, shared with the settings probes. The contracts call runs inside its own `try/catch`: on any failure it logs `warn` `alpaca_open_interest_unavailable { underlying, err }`, every quote gets `openInterest: null`, and the quotes are still returned. Chain first; an empty chain returns `[]` without a contracts request. Single-contract snapshots set `openInterest: null` and skip the contracts call.

## Context / Why

- The screener's `open_interest` rule **skips** when `openInterest === null`, so a source without OI would silently disable the liquidity floor. One extra request per ticker keeps the criterion honest.
- Degrading rather than failing follows CLAUDE.md's batch failure-isolation rule and mirrors how `pullWatchlistChains` treats per-ticker failures.
- Integrations must not import services, so the host map that `settings-connections.ts` already needed was hoisted to `alpaca-hosts.ts` instead of duplicated.

## Alternatives considered

- **Skip OI entirely** — the liquidity filter would be silently off.
- **`close_price` from contracts as a fallback mark** — out of scope.

## Consequences

- Per screener refresh the budget is 2 requests per watchlist ticker (chain + contracts) at `CHAIN_FETCH_CONCURRENCY = 4`.
- Paper keys on the live trading host return 401; only the OI host depends on the environment — paper and live serve identical market data.
- `info` `Alpaca chain snapshot mapped { underlying, contracts, twoSided, withGreeks, oiResolved }` once per pull records how many strikes resolved OI.

## Sources

- [extract: us-99](../../.extracts/us-99.md) — ADR "Open interest from `/v2/options/contracts`, joined by symbol, degrading to `null`"
- [feature: us-99-alpaca-market-data-provider](../../features/us-99-alpaca-market-data-provider.md)
<!-- /generated -->
