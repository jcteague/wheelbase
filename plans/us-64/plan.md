---
story: us-64
kind: feature
parent: null
topics: [market-data, screener]
status: planned
---

# Implementation Plan: US-64 — Pull option chains from Massive for watchlist tickers

## Summary

Add a backend batch job that, for every watchlist ticker, pulls the put side of the
option chain within a DTE window through the `MarketDataProvider` adapter and returns
per-strike bid/ask/mark/delta/OI/volume + quote timestamp. It extends the US-39
adapter so chain results carry per-strike identity and real OI/volume, adds pure
DTE/filter helpers, and orchestrates a failure-isolated fan-out that distinguishes
`provider_unavailable`, `no_options_listed`, and per-ticker `data_unavailable` from a
genuine zero-candidate result. Done = `pullWatchlistChains` returns the typed result
per `data-model.md`, all AC scenarios pass headlessly, and the full suite stays green.
No IPC or renderer work (US-65 consumes this; US-66 displays it).

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/08-stories/US-64-pull-option-chains-for-watchlist.md`
- **Research & Design Decisions:** `plans/us-64/research.md`
- **Data Model & Selection Logic:** `plans/us-64/data-model.md`
- **Adapter Contract:** `plans/us-64/contracts/option-chain-snapshot.md`
- **Quickstart & Verification:** `plans/us-64/quickstart.md`

## Prerequisites

- US-39 `MassiveMarketDataProvider` + `getOptionChainSnapshot` exist.
- US-63 `watchlist` table + `listWatchlist(db)` exist.
- `date-fns`, `decimal.js`, `better-sqlite3` present. No new migrations (transient data).

## Implementation Areas

### 1. Adapter enrichment — per-strike identity + OI/volume on chain results

**Files to create or modify:**

- `src/main/integrations/market-data-provider.ts` — add `OptionChainQuote` type;
  change `getOptionChainSnapshot` return to `Promise<OptionChainQuote[]>`.
- `src/main/integrations/massive-market-data.ts` — add `ChainSnapResult` (with
  `details`, `open_interest`, `day.volume`); add `mapChainResult`; type
  `ChainResponse.results` as `ChainSnapResult[]`; use `mapChainResult` in
  `getOptionChainSnapshot`. Leave `getOptionSnapshot`/`mapSnapResult` untouched.
- `src/main/integrations/fake-market-data.ts` — return `OptionChainQuote[]` from the
  mock map (identity fields sourced from mock entries), keep underlying/type/expiration
  filtering.

**Red — tests to write** (`massive-market-data.test.ts`, `fake-market-data.test.ts`):

- Given a Polygon-style chain response with `details.{strike_price, expiration_date,
contract_type, ticker}`, `open_interest`, `day.volume`, `mapChainResult` yields an
  `OptionChainQuote` with `contractId` (O: prefix stripped), `strike` 2dp, `expiration`,
  `contractType`, and `openInterest`/`volume` equal to the source values.
- Greeks-absent chain entry → `delta`/greeks omitted, no fabricated zeros (regression).
- `getOptionChainSnapshot` maps every page result through `mapChainResult` and preserves
  auto-pagination (existing `next_url` behavior unchanged).
- `getOptionSnapshot` (single) still returns the plain `OptionSnapshot` shape (no new
  required fields) — guards against widening the wrong method.
- Fake provider: `getOptionChainSnapshot({underlying:'AAPL', type:'put', expirationFrom,
expirationTo})` returns only AAPL puts within the window, each an `OptionChainQuote`.

**Green — implementation:**

- Add `OptionChainQuote = OptionSnapshot & { contractId, strike, expiration,
contractType }` in `market-data-provider.ts` per `data-model.md`.
- `mapChainResult(r)` = `{ ...mapSnapResult(r), openInterest: r.open_interest ?? null,
volume: r.day?.volume ?? null, contractId: r.details.ticker.replace(/^O:/,''),
strike: new Decimal(r.details.strike_price).toFixed(2),
expiration: r.details.expiration_date, contractType: r.details.contract_type }`.
- Extend fake provider mock entries to include the identity fields.

**Refactor — cleanup to consider:**

- Ensure `mapChainResult` reuses `computeMid`/`mapSnapResult` rather than duplicating
  money logic. Check `market-data:option-chain` IPC handler still typechecks (fields
  widen only).

**Acceptance criteria covered:** foundation for AC-1 (per-strike bid/ask/mark/delta/
OI/volume/timestamp).

### 2. Pure core helpers — DTE range, strike filter, failure classification

**Files to create or modify:**

- `src/main/core/candidate-chain.ts` — new pure module (no I/O, no logging).

**Red — tests to write** (`src/main/core/candidate-chain.test.ts`):

- `dteWindowToExpirationRange(new Date('2026-07-23'), {min:30,max:45})` → `{ from:
'2026-08-22', to: '2026-09-06' }` (addDays, `yyyy-MM-dd`).
- `isTradeableStrike('0.00','0.15')` → false; `isTradeableStrike('1.20','1.25')` → true;
  one-sided `('1.00','0.00')` → false.
- `toCandidateStrikes([...])` drops untradeable strikes and maps `mid→mark`,
  `greeks.delta→delta`, `delta=null` when greeks absent; preserves `openInterest`,
  `volume`, `timestamp`, `strike`, `expiration`, `contractId`.
- `classifyChainFailure('not_found')` → `'ticker'`; `'network_error'`/`'auth_failed'`/
  `'rate_limited'`/`'unknown'` → `'provider'`.

**Green — implementation:**

- Implement `DteWindow`, `DEFAULT_DTE_WINDOW`, `CandidateStrike`,
  `dteWindowToExpirationRange` (date-fns `addDays` + `format`), `isTradeableStrike`
  (`new Decimal(bid).gt(0) && new Decimal(ask).gt(0)`), `toCandidateStrikes`,
  `classifyChainFailure` exactly per `data-model.md`.

**Refactor — cleanup to consider:**

- Keep module import-light (type-only import of `OptionChainQuote`/`MarketDataErrorCode`
  from the provider _type_ module — no vendor coupling). No `logger` import in core.

**Acceptance criteria covered:** AC-1 (mark passthrough + delta/OI/volume mapping),
AC-5 (zero-bid/one-sided strikes dropped).

### 3. Service — `pullWatchlistChains` orchestration + failure isolation

**Files to create or modify:**

- `src/main/services/candidate-chains.ts` — new service; `TickerChainResult`,
  `WatchlistChainsResult`, `pullWatchlistChains(provider, db, opts?)`.

**Red — tests to write** (`src/main/services/candidate-chains.test.ts`, provider stubbed):

- Empty watchlist → `{ status:'ok', tickers:[] }` (provider never called).
- Two tickers, provider returns non-empty put chains → both `status:'ok'` with filtered
  strikes; provider called with `{type:'put', expirationFrom, expirationTo}` derived from
  the DTE window + `currentDate`.
- One ticker throws `MarketDataError('not_found')`, others succeed → failing ticker
  `data_unavailable`, others `ok`, overall `ok`; failure logged at **debug**.
- All tickers throw provider-level errors (`network_error`) → overall
  `provider_unavailable`; logged at warn.
- All tickers throw `not_found` → overall `ok` (provider reachable), each
  `data_unavailable` (guards the not_found ≠ outage rule).
- One ticker returns `[]` → `no_options_listed`; ticker remains (result still lists it).
- A non-`MarketDataError` throw is caught → `data_unavailable`, logged at error, batch
  continues (failure-isolation regression).
- `window`/`currentDate` from `opts` override defaults; default is `{min:30,max:45}`.

**Green — implementation:**

- `pullWatchlistChains`: `listWatchlist(db).map(e=>e.ticker)`; resolve
  `window = opts?.window ?? DEFAULT_DTE_WINDOW`, `currentDate = opts?.currentDate ?? new
Date()`; `range = dteWindowToExpirationRange(...)`.
- `Promise.all` over tickers, **each in its own try/catch** (never rejects): call
  `provider.getOptionChainSnapshot({ underlying: ticker, expirationFrom: range.from,
expirationTo: range.to, type:'put' })`; empty → `no_options_listed`; non-empty →
  `{ ok, strikes: toCandidateStrikes(quotes) }`; on throw → `data_unavailable`, log via
  `classifyChainFailure` (debug for `not_found`/ticker, warn for provider, error for
  non-`MarketDataError`), record the failure kind internally.
- Compute overall: `provider_unavailable` iff `tickers.length>0 && no 'ok' && every
failure provider-level`; else `ok`. Strip internal failure-kind before returning.
- `logger.debug` request + result summary; no logging in core.

**Refactor — cleanup to consider:**

- Factor the per-ticker fetch into a small local async helper for readability. Confirm
  the overall-status predicate reads cleanly (name the intermediate booleans).

**Acceptance criteria covered:** AC-2, AC-3, AC-4 (and AC-1 assembly).

### 4. E2e Tests (headless AC integration)

> No renderer surface exists for US-64 (display is US-66), so Playwright `_electron`
> does not apply. The AC-level end-to-end coverage runs the **real**
> `pullWatchlistChains` against an in-memory SQLite watchlist (migration 012 applied)
> and a stub `MarketDataProvider` scripted per scenario — one test per AC, named to
> mirror the AC language.

**Files to create or modify:**

- `src/main/services/candidate-chains.integration.test.ts` — seed watchlist rows in an
  in-memory DB; drive a scripted provider.

**Red — tests to write** (one per AC, names mirror the Gherkin):

- `"pulls put chains for each watchlist ticker"` — seed AAPL, MSFT; provider returns
  put chains; assert each in-window strike carries `bid, ask, mark, delta, openInterest,
volume`; `mark === (bid+ask)/2` HALF_UP 2dp; each strike carries the Massive
  `timestamp`. (AC-1)
- `"a single ticker failing does not suppress the others"` — AAPL, MSFT return chains,
  XYZ throws `not_found`; assert AAPL/MSFT `ok`, XYZ `data_unavailable`, and a debug log
  was emitted for XYZ. (AC-2)
- `"whole-provider outage is distinguished from zero results"` — every ticker throws
  `network_error`; assert overall `status === 'provider_unavailable'` and the result is
  NOT an empty-but-ok "no candidates" shape. (AC-3)
- `"a ticker with no listed options is skipped, not failed"` — XYZ returns `[]`; assert
  `no_options_listed` and XYZ still present in the result (still on the watchlist). (AC-4)
- `"zero-bid and one-sided strikes are dropped"` — AAPL chain includes a strike
  bid 0.00 / ask 0.15; assert that strike is absent from `strikes`. (AC-5)

**Green — implementation:**

- No new production code beyond areas 1–3; wire the test harness (in-memory DB +
  scripted provider). Fix any gaps surfaced by full-scenario runs.

**Refactor — cleanup to consider:**

- Extract a small `seedWatchlist(db, tickers)` + `scriptProvider(scenario)` helper to
  keep each AC test to its arrange/act/assert essence.

**Acceptance criteria covered:** AC-1 through AC-5 (one test each).

## AC Audit

| #   | Acceptance criterion (from US-64)                                                                                          | Covered by e2e test in Area 4                                |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Pull put chains; each in-window strike carries bid/ask/mark/delta/OI/volume; mark=(bid+ask)/2 HALF_UP 2dp; quote timestamp | `"pulls put chains for each watchlist ticker"`               |
| 2   | A single ticker (404) failing does not suppress others; XYZ data unavailable; debug log                                    | `"a single ticker failing does not suppress the others"`     |
| 3   | Whole-provider outage → "market data unavailable", not "no candidates found"                                               | `"whole-provider outage is distinguished from zero results"` |
| 4   | Ticker with no listed options → "no options listed", stays on watchlist                                                    | `"a ticker with no listed options is skipped, not failed"`   |
| 5   | Zero-bid and one-sided strikes dropped                                                                                     | `"zero-bid and one-sided strikes are dropped"`               |

All five ACs map to exactly one named e2e test. No uncovered ACs.
