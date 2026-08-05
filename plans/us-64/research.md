# Research — US-64: Pull option chains from Massive for watchlist tickers

## Story recap

For each watchlist ticker, fetch the **put** side of the option chain within the
configured DTE window through the `MarketDataProvider` adapter (Massive, US-39).
Each in-window put strike must carry `bid`, `ask`, `mark`, `delta`, `open interest`,
and `volume` plus the quote `timestamp`. `mark = (bid + ask) / 2` HALF_UP 2dp.
This is a batch job over the watchlist and must isolate per-ticker failures and
distinguish three no-result states (`provider_unavailable`, `no_options_listed`,
`data_unavailable`) from a genuine "zero candidates" outcome.

Scoring/ranking (US-65), IV rank + earnings joins (US-45/US-65), display (US-66),
and call-side/PMCC (Epic 09) are **out of scope**.

## Current-state findings (verified against `src/`)

- **The adapter method already exists**:
  `getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionSnapshot[]>` in
  `src/main/integrations/market-data-provider.ts`. `OptionChainFilter` already has
  `underlying`, `expirationFrom/To`, `type: 'put' | 'call'`, `strikeFrom/To`,
  `limit`, `cursor`. Massive maps these to `expiration_date.gte/.lte`,
  `contract_type`, etc., and auto-paginates `next_url`.
- **GAP — the returned shape is insufficient for screening.** `OptionSnapshot`
  (and the internal Polygon `SnapResult` in `massive-market-data.ts`) carries only
  quote/trade/greeks/IV. It has **no per-strike identity** (`strike`, `expiration`,
  `contractId`) and `mapSnapResult` hard-codes `openInterest: null` and
  `volume: null`. US-64's ACs require all of these per strike. Polygon's chain
  snapshot _does_ return `details.{strike_price,expiration_date,contract_type,ticker}`,
  `open_interest`, and `day.volume` — they are simply not mapped today.
- **`mark` is already computed correctly.** `computeMid` in `massive-market-data.ts`
  does `(bid + ask) / 2` `toDecimalPlaces(2, ROUND_HALF_UP)`, surfaced as
  `OptionSnapshot.mid`. US-64's `mark` maps directly from `mid`.
- **Errors are thrown `MarketDataError`** with a fixed 6-code set: `auth_failed`,
  `network_error`, `not_found`, `rate_limited`, `streaming_unsupported`, `unknown`
  (`401/403→auth_failed`, `404→not_found`, `429→rate_limited`). This is the raw
  material for distinguishing per-ticker vs whole-provider failure.
- **Degrade precedent exists.** `fetchOptionSnapshots` in
  `src/main/services/market-data.ts` catches per-symbol `not_found`, drops it, and
  returns `{ snapshots: {}, unavailable: true }` when _everything_ resolves empty.
  US-64 generalizes this into three explicit states.
- **Failure-isolation is a hard rule** (alert-evaluation-failure-isolation ADR):
  per-item `try/catch`, one bad item never aborts the batch, boundary I/O degrades
  to empty + log.
- **Watchlist source**: `listWatchlist(db): WatchlistEntryRecord[]` in
  `src/main/services/watchlist.ts` (ordered `added_at DESC`); ticker is the PK.
- **No screener/candidate service or `screener:*` IPC namespace exists yet.**
- **Money math**: chain/quote money is 2dp HALF_UP (`computeMid`); `decimal.js`
  global default rounding is `ROUND_HALF_UP` (set in `core/costbasis.ts`).
- `date-fns` v4 is available for DTE→date conversion.
- Factory `marketDataFactory` is the only place a concrete provider is chosen;
  `FakeMarketDataProvider` drives chains from `WHEELBASE_MOCK_OPTION_SNAPSHOTS`.

## Architecture Decisions

### ADR: Extend the shared adapter to carry per-strike identity + OI/volume on chain results

- **Decision:** Add a new `OptionChainQuote` type = `OptionSnapshot & { contractId,
strike, expiration, contractType }` and change
  `getOptionChainSnapshot(filter): Promise<OptionChainQuote[]>`. In the Massive
  provider, extend the internal chain result type with `details`
  (`strike_price`, `expiration_date`, `contract_type`, `ticker`), `open_interest`,
  and `day.volume`, and add a `mapChainResult` that reuses `mapSnapResult`'s money
  logic while populating the identity fields and real OI/volume. Leave the
  single-contract `getOptionSnapshot` and its `OptionSnapshot` return unchanged.
- **Why:** US-64's ACs cannot be satisfied without per-strike identity and real
  OI/volume, and the story mandates sourcing chains _through the adapter_ (no direct
  Massive calls in the screener). A dedicated `OptionChainQuote` keeps identity
  fields **required** (type-safe for screening) rather than optional-everywhere.
  This is the first consumer that needs chain identity, so the enrichment belongs
  here. Additive to the existing `market-data:option-chain` IPC handler (fields
  widen; nothing breaks).
- **Alternatives considered:** (a) Add optional `strike?/expiration?/contractId?`
  to `OptionSnapshot` — rejected: makes every screening consumer null-check fields
  that are always present for chains. (b) Build a screener-local type and re-parse
  OCC symbols in the service — rejected: duplicates parsing, bypasses the adapter
  seam, and still can't recover OI/volume the provider dropped.

### ADR: Screener chain-pull is a pure-core + service split; no new IPC in US-64

- **Decision:** Pure helpers (`dteWindowToExpirationRange`, `toCandidateStrikes`,
  strike-tradeability predicate) live in a pure module `src/main/core/candidate-chain.ts`
  (no I/O, no logging). Orchestration (`pullWatchlistChains`) lives in
  `src/main/services/candidate-chains.ts` and does the watchlist read + per-ticker
  provider fan-out + degrade. **No IPC handler or renderer surface is added.**
- **Why:** US-64 produces raw chain data consumed _in-process_ by the US-65 scorer;
  the trader-facing refresh/display is US-66 (no mockup for US-64). Adding IPC now
  would be speculative surface (Simplicity-First). The core/service split mirrors
  `costbasis.ts`/`lifecycle.ts` (pure) vs `watchlist.ts`/`market-data.ts` (I/O) and
  keeps the DTE math + filter unit-testable without a provider.
- **Alternatives considered:** (a) Add a `screener:pull-chains` IPC now — rejected as
  speculative; US-66 will own the trader-facing endpoint and will call US-65 which
  calls this service. (b) Put everything in one service function — rejected: the
  DTE-range and filter logic are pure and deserve isolated tests.

### ADR: Three no-result states classified from raw chain length + error code

- **Decision:** Per ticker, in its own `try/catch`:
  - fetch succeeds, provider returns a **non-empty** array → `status: 'ok'` with the
    filtered `strikes` (may be empty after dropping untradeable strikes — still `ok`).
  - fetch succeeds, provider returns an **empty** array → `status: 'no_options_listed'`.
  - fetch throws → `status: 'data_unavailable'`; log at **debug** for `not_found`,
    **warn** for provider-level codes.
    Overall `status: 'provider_unavailable'` **iff** the watchlist is non-empty, no
    ticker succeeded, **and every** failure was provider-level (`network_error`,
    `auth_failed`, `rate_limited`, `unknown`). A single `not_found` (404) proves the
    provider is reachable, so it never triggers `provider_unavailable`.
- **Why:** Directly satisfies the four failure/empty ACs and the ADR's
  "outage ≠ zero results" invariant. Classifying by error code is the only reliable
  signal available (`MarketDataError.code`). Distinguishing raw-empty (no listed
  options) from filtered-empty (options exist but all untradeable) matches the
  "no options listed" vs normal-screen semantics.
- **Alternatives considered:** Mirroring `fetchOptionSnapshots`'s single
  `unavailable` boolean — rejected: it conflates outage with legitimately-empty and
  can't express `no_options_listed`.

### ADR: DTE window is a parameter with a 30–45 default; not coupled to US-67 settings

- **Decision:** `pullWatchlistChains` accepts an optional `window: { min, max }`
  defaulting to `DEFAULT_DTE_WINDOW = { min: 30, max: 45 }`, and an optional
  `currentDate` (default `new Date()` at the service boundary; injected explicitly
  in tests and by callers). `dteWindowToExpirationRange` uses `date-fns` `addDays` +
  `format('yyyy-MM-dd')` to derive `expirationFrom/To`.
- **Why:** US-67 (persisted screening defaults) is **not** a listed dependency of
  US-64 (only US-63 and US-39 are). Parameterizing lets US-65/US-67 pass persisted
  criteria later without US-64 reaching into the settings store now. Injecting
  `currentDate` keeps the DTE math deterministic and testable (date-handling rule).
- **Alternatives considered:** Read the US-67 settings store directly — rejected:
  US-67 may not be implemented, and it couples this story to a non-dependency.

## Open Questions

None blocking. The adapter extension (first ADR) touches already-shipped US-39
files (`market-data-provider.ts`, `massive-market-data.ts`, `fake-market-data.ts`)
and widens the `getOptionChainSnapshot` contract — flagged here for visibility; it
is required by the ACs and additive to existing consumers.
