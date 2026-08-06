# US-64: Pull option chains from Massive for watchlist tickers

<!-- generated:from us-64 -->

## Summary

US-64 is the screener's data-acquisition layer. For every ticker on the US-63
watchlist, `pullWatchlistChains` fetches the **put** side of the option chain within a
DTE window (default 30–45) through the `MarketDataProvider` adapter, and returns each
in-window strike with `bid / ask / mark / delta / openInterest / volume` plus the quote
timestamp from the provider.

It is a failure-isolated batch job: one bad ticker never suppresses the others, and a
whole-provider outage is reported distinctly from a legitimately empty result, so the
UI can never render "no candidates found" during an outage.

Backend-only — US-64 adds no IPC handler and no renderer surface. US-65 consumes the
service to score and rank candidates; US-66 owns the trader-facing refresh and display.
Nothing is persisted: market data is transient, so there is no migration.

## Acceptance criteria

- **Pull put chains for each watchlist ticker** — each AAPL and MSFT put strike within
  30–45 DTE carries bid, ask, mark, delta, open interest, and volume; `mark` is
  `(bid + ask) / 2` with HALF_UP rounding to 2 dp; each strike carries the quote
  timestamp from Massive.
- **A single ticker failing does not suppress the others** — with a 404 for XYZ, AAPL
  and MSFT candidates are still produced, XYZ is marked "data unavailable", and the
  failure is logged at debug level.
- **Whole-provider outage is distinguished from zero results** — the screener reports
  "market data unavailable" and does not report "no candidates found".
- **A ticker with no listed options is skipped, not failed** — XYZ is marked "no options
  listed" and remains on the watchlist.
- **Zero-bid and one-sided strikes are dropped** — no reliable mark can be computed.

## What was built

**Adapter enrichment.** `src/main/integrations/market-data-provider.ts` adds
`OptionChainQuote` — an `OptionSnapshot` plus the per-strike identity the screener needs
(`contractId`, `strike`, `expiration`, `contractType`) — and `getOptionChainSnapshot`
now returns `Promise<OptionChainQuote[]>`. The single-contract `getOptionSnapshot` keeps
its plain `OptionSnapshot` return. In `massive-market-data.ts`, `mapChainResult` spreads
`mapSnapResult` (so `computeMid` and all money/greeks rounding stay in one place) and
layers on identity plus the real `open_interest` / `day.volume` that the single-contract
path leaves null. Every optional block in the provider payload is guarded: chain entries
for never-traded or thinly-quoted strikes omit `last_trade`, `last_quote`, or `greeks`
entirely, and a zero-match response omits `results` altogether — none of which may abort
the underlying's chain. `fake-market-data.ts` derives per-strike identity from the OCC
symbol the fixture is keyed by, so fixtures holding bare `OptionSnapshot` values (every
e2e spec predating the chain endpoint) still filter correctly. See
[Market Data](../domain/market-data.md).

**Pure core.** `src/main/core/candidate-chain.ts` holds the screener's pure helpers with
no I/O and no logging: `DEFAULT_DTE_WINDOW` (`{ min: 30, max: 45 }`),
`dteWindowToExpirationRange`, `isTradeableStrike` (`bid > 0 && ask > 0`),
`toCandidateStrikes` (drops untradeable strikes, maps `mid → mark` and
`greeks.delta → delta`, `null` when Greeks are absent), and `classifyChainFailure`
(`not_found → 'ticker'`, every other code → `'provider'`). The `CandidateStrike` row
copies the adapter's `mid` rather than recomputing a mark from a float.

**Service.** `src/main/services/candidate-chains.ts` exposes `pullWatchlistChains`,
which reads the watchlist via `listWatchlist(db)`, derives the expiration range from the
DTE window and `currentDate`, and fans out one chain pull per ticker through a bounded
worker pool. Each ticker is fetched in its own `try/catch`, so the batch never rejects.
Completion is logged at INFO with the status and ticker/ok/unavailable counts.

Per-ticker outcomes and overall status:

| Provider outcome                       | `TickerChainResult.status` | Log level |
| -------------------------------------- | -------------------------- | --------- |
| non-empty `OptionChainQuote[]`         | `ok` (+ filtered strikes)  | debug     |
| empty `[]`                             | `no_options_listed`        | debug     |
| throws `MarketDataError('not_found')`  | `data_unavailable`         | debug     |
| throws `MarketDataError` (other codes) | `data_unavailable`         | warn      |
| throws non-`MarketDataError`           | `data_unavailable`         | error     |

Overall status is `provider_unavailable` **iff** no ticker answered (none `ok`, none
`no_options_listed`) **and** at least one failure was provider-level. Any ticker the
provider actually answered for — with strikes or a legitimately empty chain — proves the
provider is reachable and keeps the overall status `ok`; a delisted ticker's 404 is a
ticker-level failure that must not mask a real outage behind it. An empty watchlist is
`{ status: 'ok', tickers: [] }` and never calls the provider.

**Tests.** `candidate-chains.integration.test.ts` runs the real `pullWatchlistChains`
against an in-memory SQLite watchlist (migration 012) and a scripted provider, one
`it()` per acceptance criterion. There is no Playwright spec — US-64 has no renderer
surface.

## Architecture decisions

- **Extend the shared adapter rather than re-parse OCC in the screener** — chain results
  carry required identity fields via a dedicated `OptionChainQuote`, so screening
  consumers never null-check fields that are always present for chains, and OI/volume
  the provider returns is not dropped. See
  [Market data provider interface](../architecture/02-adrs/market-data-provider-interface.md).
- **Pure-core + service split, no IPC in US-64** — DTE math and filtering are pure and
  unit-testable without a provider; the trader-facing endpoint belongs to US-66, so
  adding IPC now would be speculative surface.
- **Three no-result states, classified from chain length + error code** — `MarketDataError.code`
  is the only reliable signal, and raw-empty (no listed options) must stay
  distinguishable from filtered-empty (options exist but all untradeable).
- **Single local-timezone basis for the DTE window** — day arithmetic and `yyyy-MM-dd`
  formatting both run local, matching `src/main/dates.ts`. DTE counts from the trader's
  own calendar day; a mixed local/UTC basis shifts the whole window by a day whenever
  the run falls outside UTC's calendar day.
- **DTE window is a parameter, not a settings read** — `{ min, max }` and `currentDate`
  are injectable so US-65/US-67 can pass persisted criteria later without US-64 coupling
  to a non-dependency.
- **Bounded fan-out** — each ticker's chain is a fully-paginated walk, so the pull runs
  through a concurrency-capped worker pool; an unbounded burst would earn a 429, which
  classifies as provider-level and would surface as a fake outage.
- **Failure isolation per the batch-job rule** — see
  [Alert evaluation failure isolation](../architecture/02-adrs/alert-evaluation-failure-isolation.md).
- **4 dp strike strings** — matches the codebase-wide TEXT money convention
  (`legs.strike`, `watchlist.own_below_price`) so chain strikes compare directly against
  persisted ones. See [Decimal money math](../architecture/02-adrs/decimal-money-math.md).

## Contracts touched

- `MarketDataProvider.getOptionChainSnapshot(filter)` — return type widened from
  `OptionSnapshot[]` to `OptionChainQuote[]`; `OptionChainFilter` unchanged. An empty
  array is a normal response, not an error.
- `market-data:option-chain` (pre-existing IPC) — response fields widen only; the
  preload contract gains `IpcOptionChainQuote`. See
  [IPC Handlers](../contracts/ipc-handlers.md).
- `pullWatchlistChains(provider, db, opts?)` → `WatchlistChainsResult` — in-process
  service contract consumed by US-65.

## Source files

- `src/main/core/candidate-chain.ts`
- `src/main/services/candidate-chains.ts`
- `src/main/integrations/market-data-provider.ts`
- `src/main/integrations/massive-market-data.ts`
- `src/main/integrations/fake-market-data.ts`
- `src/preload/index.d.ts`

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
