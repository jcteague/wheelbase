---
page: docs/spec/features/us-65-score-wheel-candidates.md
audited_at: 2026-09-28
findings: 9
---

# Audit: docs/spec/features/us-65-score-wheel-candidates.md

## Verified (18)

- ✓ `src/main/core/screener.ts` imports only `decimal.js`, `date-fns`, `./candidate-chain`, `./dte`; no DB, provider or logger (`screener.ts:5-8`).
- ✓ Calendar-365 annualization: `DAYS_PER_YEAR = 365` (`screener.ts:12`).
- ✓ `DEFAULT_SCREENING_CRITERIA`: delta 0.20–0.30, DTE 30–45, OI 500, spread 10% / $0.10, no price ceiling, earnings `exclude` (`screener.ts:31-42`).
- ✓ Exports `evaluateFilters` (`:353`), `scoreCandidate` (`:372`), `screenTicker` (`:495`), `rankCandidates` (`:532`), `ScreeningCriteria` (`:18`), `TickerScreeningInput` (`:86`), `ScoredCandidate` (`:95`), `ExcludedCandidate` (`:130`), `FilterInput` (`:236`).
- ✓ First-failure-wins evaluation via `FILTERS.findIndex` (`screener.ts:358`).
- ✓ Filter codes `price_ceiling`, `earnings_in_window`, `dte_window`, `delta_unavailable`, `delta_band`, `open_interest`, `spread` all present (`screener.ts:275-336`).
- ✓ The spread filter fires only when both the absolute and the percent ceilings are breached (`screener.ts:340-342`).
- ✓ Exclusions sorted by filter index descending (`screener.ts:522`).
- ✓ Four-state `CandidateEarnings` (`screener.ts:79`) and `EarningsHandling = 'exclude' | 'flag'` (`:16`).
- ✓ `IvRank = { value, observedAt }` (`screener.ts:51-54`).
- ✓ `screenWatchlistCandidates(getProvider, db, opts)` resolves the provider thunk in a `try/catch` and maps a throw to `provider_unavailable` + `warn` (`src/main/services/screener.ts:235-251`).
- ✓ Chains `provider_unavailable` short-circuit (`services/screener.ts:260-262`); the DTE window comes from criteria (`:253-256`).
- ✓ `isWellFormedStrike` is imported into the service (`services/screener.ts:8`) and exported from `core/candidate-chain.ts:64`.
- ✓ `screenTicker` backstop logs `error` `screen_ticker_failed` (`services/screener.ts:190`); one `info` on completion (`:217`).
- ✓ Per-ticker isolated quote fetches, concurrency 4 via `mapWithConcurrency` (`src/main/services/underlying-quotes.ts:9,20-28`).
- ✓ `screener:results` registered through `handleIpcCall` with no payload (`src/main/ipc/screener.ts:29-32`); preload `screener.results` (`src/preload/index.ts:82`).
- ✓ `screener.integration.test.ts` exists with 8 `it()` cases (one per AC); `src/main/test-utils.ts`, `src/main/concurrency.ts`, `src/main/index.ts` exist.
- ✓ Linked docs exist: ADRs `pure-core-engines`, `decimal-money-math`, `alert-rule-registry`, `earnings-four-state-lookup`, `alert-evaluation-failure-isolation`; features `us-44`, `us-66`, `us-70`, `us-64`; `domain/market-data.md`, `contracts/ipc-handlers.md`.

## Drift (9)

- ✗ **IVR read path is gone.** The page says `src/main/services/ivr-snapshots.ts` adds `getLatestIvrByUnderlying` over US-44's `ivr_snapshot` table (`ORDER BY observed_at DESC LIMIT 1`), and lists it in Contracts and Source files. The file does not exist, grep finds no `getLatestIvrByUnderlying` in `src/`, and `migrations/016_create_iv30_history.sql:55` runs `DROP TABLE ivr_snapshot`. IV rank now comes from `readIvRankLookup` / `lookupOf` in `src/main/services/iv-rank-lookup.ts` (imported at `services/screener.ts:27`), which computes from IV30 history (US-121). Suggested fix: mark as US-65-era history and point to US-121.
- ✗ Page says "seven ordered hard filters", and the table lists 7 with `earnings_in_window` at #2. `FILTERS` now has 8 entries, with `iv_rank_floor` inserted at #2 (`screener.ts:283`), before `earnings_in_window` (`:291`). It was inserted, not "appended" as the ADR bullet says. Criteria also carry `minIvRank` (`screener.ts:40`).
- ✗ Page says `rankCandidates` sorts "by `yieldPerDelta` descending, tie-broken by ticker ascending", and that `best` is the highest-`yieldPerDelta` survivor. Both comparators now sort on `earningsTier` first (clear < unknown/unavailable < flagged) and only then on yield-per-delta (`screener.ts:424-432,515,540-544`; see ADR `earnings-tier-before-score`).
- ✗ Page says the service "passes `earningsDate: null` (the US-70 seam)" in the present tense. The service now reads earnings via `readEarningsOrEmpty(...)` (`services/screener.ts:23,270`). The same page acknowledges elsewhere that US-70 wired this in, so the orchestration paragraph contradicts it.
- ✗ Page says criteria default to `DEFAULT_SCREENING_CRITERIA` and "US-65 never reaches into a settings store". The service defaults to `getScreeningCriteria(db)` (`services/screener.ts:240`, US-67). The seam has since been filled.
- ✗ Page gives the signature `screenWatchlistCandidates(getProvider, db, opts?)` with `opts` optional. It is now required (`opts: ScreenOptions`, `services/screener.ts:238`), and callers pass `runState` (`ipc/screener.ts:31`).
- ✗ Page says the engine "exports … the ordered `FILTERS` registry". `FILTERS` is module-private (`const FILTERS`, `screener.ts:273`).
- ✗ Failure table row "IVR read throws → degrade to an empty map + `warn`" refers to the removed `ivr_snapshot` read. It is not verifiable against the current `readIvRanks` / `iv-rank-lookup` path in the form described.
- ✗ Source files list `src/main/integrations/massive-market-data.ts` ("bounded stock-snapshot fan-out"). The file is gone (Massive retired, US-99). The bounded fan-out now lives in `src/main/services/underlying-quotes.ts:9`.

## Unverifiable (4)

- ? Mutation-falsification narrative (365→360, en dash → hyphen, etc.). Process history.
- ? "Ten verified findings" fixed in `plans/us-65/code-review-fixes-results.md`. Plan artifact; not a code claim.
- ? Delta absolutized at the engine boundary. Plausible, but the exact site was not traced.
- ? Percent formatter "rounded up, trailing zeros trimmed". `formatPercent` was not inspected in detail.

## Missing files (2)

- ✗ `src/main/services/ivr-snapshots.ts` does not exist.
- ✗ `src/main/integrations/massive-market-data.ts` does not exist.
