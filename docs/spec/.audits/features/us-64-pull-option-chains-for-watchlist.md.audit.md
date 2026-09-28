---
page: docs/spec/features/us-64-pull-option-chains-for-watchlist.md
audited_at: 2026-09-28
findings: 5
---

# Audit: docs/spec/features/us-64-pull-option-chains-for-watchlist.md

## Verified (19)

- ✓ `src/main/core/candidate-chain.ts`, `src/main/services/candidate-chains.ts`, `src/main/integrations/market-data-provider.ts`, `src/main/integrations/fake-market-data.ts`, `src/preload/index.d.ts` exist.
- ✓ `OptionChainQuote = OptionSnapshot & {…identity}` (`market-data-provider.ts:57`); `getOptionChainSnapshot(filter): Promise<OptionChainQuote[]>` and `getOptionSnapshot(): Promise<OptionSnapshot>` (`market-data-provider.ts:132-133`).
- ✓ `DEFAULT_DTE_WINDOW = { min: 30, max: 45 }` (`candidate-chain.ts:10`).
- ✓ `dteWindowToExpirationRange` uses local `addDays` + `format('yyyy-MM-dd')`, with a comment tying it to `src/main/dates.ts` (`candidate-chain.ts:26-38`).
- ✓ `isTradeableStrike` requires bid > 0 and ask > 0 (`candidate-chain.ts:54-58`; also rejects non-finite values).
- ✓ `toCandidateStrikes` drops untradeable strikes, maps `mid → mark`, `greeks.delta → delta` (null when absent) (`candidate-chain.ts:73-88`); mark copies the adapter's `mid`.
- ✓ `classifyChainFailure`: `not_found → 'ticker'`, everything else → `'provider'` (`candidate-chain.ts:92-93`).
- ✓ `pullWatchlistChains(provider, db, opts)` reads `listWatchlist(db)` and derives range from window + `currentDate` (`candidate-chains.ts:98-106`).
- ✓ Bounded worker pool: `mapWithConcurrency(..., CHAIN_FETCH_CONCURRENCY = 4, ...)` (`candidate-chains.ts:37,108`; `src/main/concurrency.ts` exists).
- ✓ Per-ticker `try/catch`; log levels match the table: not_found → debug (`:73`), other `MarketDataError` → warn (`:75`), non-`MarketDataError` → error (`:79`); ok/empty → debug (`:62,66`).
- ✓ Overall `provider_unavailable` iff no ticker answered (`ok` / `no_options_listed`) and some provider-level failure (`candidate-chains.ts:116-122`).
- ✓ INFO completion log with status + counts (`candidate-chains.ts:125-128`).
- ✓ `TickerChainResult` statuses `ok | no_options_listed | data_unavailable`, `WatchlistChainsResult` status `ok | provider_unavailable` (`candidate-chains.ts:18-26`).
- ✓ Mark `(bid+ask)/2` HALF_UP to 2 dp: `computeMid` (`alpaca-market-data-mappers.ts:137-139`).
- ✓ Fake provider gets identity from the OCC key via `parseOccSymbol` (`fake-market-data.ts:16,180`).
- ✓ Strike strings are 4 dp: `parseOccSymbol` → `.toFixed(4)` (`src/shared/option-symbol.ts:94`).
- ✓ `market-data:option-chain` IPC exists (`src/main/ipc/market-data.ts:80`); preload has `IpcOptionChainQuote` (`index.d.ts:604`).
- ✓ `candidate-chains.integration.test.ts` exists with 5 `it()` cases (one per AC); no US-64 Playwright spec expected.
- ✓ Linked docs exist: `domain/market-data.md`, ADRs `market-data-provider-interface`, `alert-evaluation-failure-isolation`, `decimal-money-math`.

## Drift (5)

- ✗ Page describes the adapter in present tense as `massive-market-data.ts` with `mapChainResult` spreading `mapSnapResult` and reading Massive's `open_interest` / `day.volume`. Massive was retired (US-99): no `massive-market-data.ts` in `src/main/integrations/`, and grep finds no `mapChainResult`/`mapSnapResult`. The chain mapping is now `mapChainEntry` spreading `mapOptionQuote` (`src/main/integrations/alpaca-market-data-mappers.ts:143,175`), with volume from `dailyBar.v` (`:152`) and open interest passed in separately from the contracts endpoint (`:105,178`). Suggested fix: re-target to the Alpaca adapter or frame as history.
- ✗ Title and AC say chains come "from Massive" and "the quote timestamp from Massive". Present-tense vendor claim; the only chain provider is Alpaca (`alpaca-market-data.ts`).
- ✗ Per-ticker outcome table says "non-empty `OptionChainQuote[]` → `ok`" and "empty `[]` → `no_options_listed`". The code classifies on the _filtered_ strike count: a non-empty chain whose strikes are all untradeable also returns `no_options_listed` (`candidate-chains.ts:58-64`).
- ✗ The ADR bullet "raw-empty (no listed options) must stay distinguishable from filtered-empty (options exist but all untradeable)" contradicts the code. Both collapse to `no_options_listed`, and the comment says so on purpose: "An empty raw chain and a chain whose quotes are all untradeable both leave nothing to screen" (`candidate-chains.ts:55-58`).
- ✗ Source files list `src/main/integrations/massive-market-data.ts`; file does not exist (see Missing).

## Unverifiable (3)

- ? "Every optional block in the provider payload is guarded … none of which may abort the underlying's chain". Massive-specific, and the Massive adapter is gone. The Alpaca mapper does default a missing `latestQuote`/`latestTrade` (`alpaca-market-data-mappers.ts:144-155`), but the claim as written is not checkable.
- ? "DTE window is a parameter … so US-65/US-67 can pass persisted criteria later". Design intent.
- ? "An unbounded burst would earn a 429". Rationale; not verifiable.

## Missing files (1)

- ✗ `src/main/integrations/massive-market-data.ts` (listed in Source files) does not exist.
