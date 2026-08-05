# US-64 — Pull option chains from Massive for watchlist tickers — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- This story is backend-only (no IPC, no renderer). The final "E2E" layer is a **headless AC-integration test** of the real service — Playwright does not apply (see `plan.md` Area 4).

> **Dependency note:** the areas form a single chain (Adapter → Core → Service → Integration) because each consumes a symbol the previous one creates (`OptionChainQuote` → core helpers → `pullWatchlistChains`). There is no cross-area parallelism; each layer holds one area.

---

## Layer 1 — Adapter enrichment (foundation, no dependencies)

> Start immediately.

### Area 1 — Adapter: per-strike identity + OI/volume on chain results

- [x] **[Red]** Write failing tests — `src/main/integrations/massive-market-data.test.ts` + `src/main/integrations/fake-market-data.test.ts`
  - Test cases:
    - `mapChainResult` on a Polygon-style entry with `details.{strike_price, expiration_date, contract_type, ticker}`, `open_interest`, `day.volume` → `OptionChainQuote` with `contractId` (`O:` prefix stripped), `strike` 2dp, `expiration`, `contractType`, and `openInterest`/`volume` equal to source values.
    - Greeks-absent chain entry → `greeks`/`delta` omitted, no fabricated zeros (regression).
    - `getOptionChainSnapshot` maps every page result through `mapChainResult` and preserves `next_url` auto-pagination.
    - `getOptionSnapshot` (single) still returns the plain `OptionSnapshot` shape — guards against widening the wrong method.
    - Fake provider: `getOptionChainSnapshot({ underlying:'AAPL', type:'put', expirationFrom, expirationTo })` returns only AAPL puts in-window, each an `OptionChainQuote`.
  - Run `pnpm test src/main/integrations/massive-market-data.test.ts src/main/integrations/fake-market-data.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/market-data-provider.ts`, `src/main/integrations/massive-market-data.ts`, `src/main/integrations/fake-market-data.ts` _(depends on: Area 1 Red ✓)_
  - Add `OptionChainQuote = OptionSnapshot & { contractId, strike, expiration, contractType }` in `market-data-provider.ts`; change `getOptionChainSnapshot` return to `Promise<OptionChainQuote[]>`.
  - In `massive-market-data.ts`: add `ChainSnapResult` (`SnapResult & { details, open_interest, day }`); type `ChainResponse.results` as `ChainSnapResult[]`; add `mapChainResult(r) = { ...mapSnapResult(r), openInterest: r.open_interest ?? null, volume: r.day?.volume ?? null, contractId: r.details.ticker.replace(/^O:/,''), strike: new Decimal(r.details.strike_price).toFixed(2), expiration: r.details.expiration_date, contractType: r.details.contract_type }`; use it in `getOptionChainSnapshot`. Leave `getOptionSnapshot`/`mapSnapResult` untouched.
  - Extend fake provider mock entries + `getOptionChainSnapshot` to return `OptionChainQuote[]`.
  - Run `pnpm test src/main/integrations/massive-market-data.test.ts src/main/integrations/fake-market-data.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — adapter files _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm `mapChainResult` reuses `computeMid`/`mapSnapResult` (no duplicated money logic); verify `market-data:option-chain` IPC handler still typechecks (fields widen only)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Pure core helpers (depends on Layer 1)

### Area 2 — Core: DTE range, strike filter, failure classification

**Requires:** Area 1 Green ✓ (imports the `OptionChainQuote` type)

- [x] **[Red]** Write failing tests — `src/main/core/candidate-chain.test.ts` _(depends on: Area 1 Green ✓)_
  - Test cases:
    - `dteWindowToExpirationRange(new Date('2026-07-23'), {min:30,max:45})` → `{ from:'2026-08-22', to:'2026-09-06' }` (addDays, `yyyy-MM-dd`).
    - `isTradeableStrike('0.00','0.15')` → false; `('1.20','1.25')` → true; one-sided `('1.00','0.00')` → false.
    - `toCandidateStrikes([...])` drops untradeable strikes; maps `mid→mark`, `greeks.delta→delta`, `delta=null` when greeks absent; preserves `openInterest`, `volume`, `timestamp`, `strike`, `expiration`, `contractId`.
    - `classifyChainFailure('not_found')` → `'ticker'`; `'network_error'`/`'auth_failed'`/`'rate_limited'`/`'unknown'` → `'provider'`.
  - Run `pnpm test src/main/core/candidate-chain.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/candidate-chain.ts` _(depends on: Area 2 Red ✓)_
  - Export `DteWindow`, `DEFAULT_DTE_WINDOW = {min:30,max:45}`, `CandidateStrike`, `dteWindowToExpirationRange` (date-fns `addDays` + `format`), `isTradeableStrike` (`new Decimal(bid).gt(0) && new Decimal(ask).gt(0)`), `toCandidateStrikes`, `classifyChainFailure` — exactly per `data-model.md`.
  - Type-only import of `OptionChainQuote`/`MarketDataErrorCode` from the provider type module; **no `logger` import** (pure core).
  - Run `pnpm test src/main/core/candidate-chain.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/candidate-chain.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify module stays import-light and pure (no I/O, no logging)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Service orchestration (depends on Layers 1–2)

### Area 3 — Service: `pullWatchlistChains` + failure isolation

**Requires:** Area 1 Green ✓ (`OptionChainQuote`, provider interface) · Area 2 Green ✓ (core helpers)

- [x] **[Red]** Write failing tests — `src/main/services/candidate-chains.test.ts` _(depends on: Area 1 Green ✓, Area 2 Green ✓)_
  - Test cases (provider stubbed, watchlist stubbed/in-memory):
    - Empty watchlist → `{ status:'ok', tickers:[] }`; provider never called.
    - Two tickers with non-empty put chains → both `status:'ok'` with filtered strikes; provider called with `{ type:'put', expirationFrom, expirationTo }` derived from DTE window + `currentDate`.
    - One ticker throws `MarketDataError('not_found')`, others succeed → failing ticker `data_unavailable`, others `ok`, overall `ok`; failure logged at **debug**.
    - All tickers throw `network_error` → overall `provider_unavailable`; logged at warn.
    - All tickers throw `not_found` → overall `ok` (provider reachable), each `data_unavailable`.
    - One ticker returns `[]` → `no_options_listed`; ticker still present in result.
    - Non-`MarketDataError` throw → `data_unavailable`, logged at error, batch continues.
    - `window`/`currentDate` from `opts` override defaults; default `{min:30,max:45}`.
  - Run `pnpm test src/main/services/candidate-chains.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/candidate-chains.ts` _(depends on: Area 3 Red ✓)_
  - Export `TickerChainResult`, `WatchlistChainsResult`, `pullWatchlistChains(provider, db, opts?)`.
  - `listWatchlist(db).map(e=>e.ticker)`; `window = opts?.window ?? DEFAULT_DTE_WINDOW`; `currentDate = opts?.currentDate ?? new Date()`; `range = dteWindowToExpirationRange(...)`.
  - `Promise.all` over tickers, **each in its own try/catch** (never rejects): call `provider.getOptionChainSnapshot({ underlying: ticker, expirationFrom: range.from, expirationTo: range.to, type:'put' })`; `[]` → `no_options_listed`; non-empty → `{ status:'ok', strikes: toCandidateStrikes(quotes) }`; on throw → `data_unavailable`, log via `classifyChainFailure` (debug for `not_found`, warn for provider, error for non-`MarketDataError`), record failure kind internally.
  - Overall `provider_unavailable` iff `tickers.length>0 && no 'ok' && every failure provider-level`; else `ok`. Strip internal failure-kind before returning. `logger.debug` request + result summary.
  - Run `pnpm test src/main/services/candidate-chains.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/candidate-chains.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Factor per-ticker fetch into a small local async helper; name the intermediate booleans in the overall-status predicate
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — E2E Tests (headless AC integration)

**Requires:** All Green tasks from Layers 1–3 ✓

### E2E Tests — `pullWatchlistChains` against in-memory SQLite + scripted provider

- [x] **[Red]** Write failing integration tests — `src/main/services/candidate-chains.integration.test.ts` _(depends on: all Green tasks ✓)_
  - Real `pullWatchlistChains`, in-memory SQLite watchlist (migration `012` applied), scripted `MarketDataProvider`. One `it()` per AC, names mirror the Gherkin:
    - AC-1: Pull put chains for each watchlist ticker → `it('pulls put chains for each watchlist ticker')` — each in-window strike carries `bid, ask, mark, delta, openInterest, volume`; `mark === (bid+ask)/2` HALF_UP 2dp; each strike carries the Massive `timestamp`.
    - AC-2: A single ticker failing does not suppress the others → `it('a single ticker failing does not suppress the others')` — AAPL/MSFT `ok`, XYZ `not_found`→`data_unavailable`, debug log emitted for XYZ.
    - AC-3: Whole-provider outage distinguished from zero results → `it('whole-provider outage is distinguished from zero results')` — all throw `network_error`; overall `provider_unavailable`, not an empty-but-ok "no candidates" shape.
    - AC-4: Ticker with no listed options is skipped, not failed → `it('a ticker with no listed options is skipped, not failed')` — XYZ returns `[]` → `no_options_listed`, XYZ still present.
    - AC-5: Zero-bid and one-sided strikes are dropped → `it('zero-bid and one-sided strikes are dropped')` — AAPL strike bid 0.00 / ask 0.15 excluded from `strikes`.
  - Run `pnpm test src/main/services/candidate-chains.integration.test.ts` — all new tests must fail
- [x] **[Green]** Make integration tests pass _(depends on: E2E Red ✓)_
  - No new production code beyond Areas 1–3; wire the test harness (`seedWatchlist(db, tickers)` + scripted provider). Fix any gaps surfaced by full-scenario runs.
  - Run `pnpm test src/main/services/candidate-chains.integration.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — integration test _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract `seedWatchlist` / `scriptProvider(scenario)` helpers to keep each AC test to arrange/act/assert
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] Integration tests cover every AC (AC-1 … AC-5, one `it()` each)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
- [x] `pnpm format`
