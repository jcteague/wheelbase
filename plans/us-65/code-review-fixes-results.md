# US-65 — Code-review fixes (post-implementation hardening pass)

Date: 2026-08-08. A high-effort workflow code review of the branch surfaced 10 verified
findings (silent-omission bugs, an ADR violation, misleading trader-facing wording, and
cross-layer type duplication). All 10 were fixed test-first in a single pass; this file
is authoritative over `plan.md` and the earlier phase-results where they disagree.
1930 tests, lint, typecheck green.

## Behavioural fixes

### 1. A non-ranking ticker can never vanish from the results

Two layers now enforce the "one row per non-ranking ticker" contract:

- **Chains (`services/candidate-chains.ts`):** a chain whose quotes are all untradeable
  (zero/one-sided bids) now classifies as `no_options_listed` instead of `ok` with zero
  strikes — an `ok` result always carries ≥ 1 tradeable strike.
- **Service (`services/screener.ts`):** `representativeExclusion` gained a fallback — a
  screened ticker with no survivor **and** no exclusions (every strike dropped as
  malformed) reports `data_unavailable` rather than contributing no row.

Previously an all-untradeable ticker appeared in neither `ranked` nor `excluded`.

### 2. Price-ceiling quote fetch is per-ticker isolated

`readUnderlyingPrices` now fetches each ticker's quote in its own
`provider.getStockQuotes([ticker])` call, bounded at `QUOTE_FETCH_CONCURRENCY = 4`, each
wrapped in its own try/catch (warn + skip on failure). One failed quote now costs only
that ticker its ceiling evaluation instead of silently disarming the ceiling for the
whole watchlist (previously one rejection emptied the entire price map).
`MassiveMarketDataProvider.getStockQuotes` is also bounded at
`STOCK_SNAPSHOT_CONCURRENCY = 4` (was an unbounded `Promise.all` burst — the same 429
hazard `CHAIN_FETCH_CONCURRENCY` already guards in the chain pull). The shared
`mapWithConcurrency` helper moved to `src/main/concurrency.ts`.

### 3. Malformed strikes are validated before the pure engine (ADR compliance)

Per the `alert-evaluation-failure-isolation` ADR rule ("callers of pure helpers that
throw must validate before calling"), the service now filters each chain through a new
pure guard `isWellFormedStrike` (`core/candidate-chain.ts`) — bid/ask/mark/strike must
parse to finite Decimals, delta must be null or finite. A malformed strike drops only
itself (logged `warn` `screener_malformed_strike_dropped`), never the ticker's other
strikes. Previously one bad quote string threw inside `screenTicker` and the ticker-level
catch discarded the whole ticker as `data_unavailable`. The per-ticker try/catch remains
as a last-resort backstop only. `isTradeableStrike` also no longer throws on malformed
input (returns false).

### 4. An unconfigured provider is the modelled outage state, not `internal_error`

`screenWatchlistCandidates` now takes a **thunk** — `getProvider: () =>
MarketDataProvider` — and resolves it inside the service. A construction throw (no
`MASSIVE_API_KEY` / `FAKE_MARKET_DATA`) is caught and returns
`{ status: 'provider_unavailable', ranked: [], excluded: [], quoteTimestamp: null }`
(logged `warn` `screener_provider_unavailable`). The IPC handler passes the thunk
through unchanged, staying thin. Previously `getProvider()` threw inside `handleIpcCall`
and the renderer received the generic `internal_error` envelope.

### 5. `no_options_listed` reason names the DTE window actually screened

The chain query is expiration-bounded, so an empty result only proves nothing is quoted
_in the window_. The exclusion reason is now
`no puts quoted in the ${dteMin}–${dteMax} DTE window` (en dash, built from the criteria)
instead of the misleading `no options listed` — a monthly-only underlying frequently has
zero expirations inside the default 30–45 window while plainly listing options.

### 6. Earnings filter is bounded by the current date

`earnings_in_window` now fires only for a print inside the holding window: **on or after
the trader's current calendar day and on or before expiry** (`earningsWithinHolding`,
using `startOfDay(currentDate)`). A past earnings date still present in the feed no
longer excludes every strike. `FilterInput` gained `currentDate: Date`. The reason
wording changed from `falls before expiry` to `falls on or before expiry` (the test
always included the on-expiry case; the wording now matches).

### 7. `earningsHandling: 'flag'` is implemented

`ScoredCandidate` gained `earningsFlagged: boolean` (mirrored in preload
`IpcScoredCandidate`). In `'flag'` mode a survivor whose expiry straddles an in-window
earnings print ranks normally but carries `earningsFlagged: true` for US-66 to render as
a warning. In `'exclude'` mode (default) it is always `false` — the strike is excluded
instead. `scoreCandidate` takes `earningsFlagged` as a trailing parameter defaulting to
`false`. Previously `'flag'` was declared but behaved identically to no earnings
handling. (Still latent in production until US-70 supplies earnings dates.)

### 8. Spread-reason percents can no longer self-contradict

`formatPercent` renders at up to 2dp **rounded up** with trailing zeros trimmed (was
0dp half-up). A 10.05% spread now reads `spread 10.05% exceeds 10%` instead of the
self-contradictory `spread 10% exceeds 10%`. Canonical example strings changed:
`spread 22% exceeds 10%` → `spread 22.23% exceeds 10%` (0.60 on a 2.70 mark = 22.22…%,
up-rounded). US-66 renders these verbatim; the load-bearing format is now "2dp deltas,
en-dash bands, trimmed round-up percents (≤ 2dp), $-prefixed 2dp money".

### 9. `IvrSnapshot` deleted — the IVR read path returns the engine's `IvRank`

`getLatestIvrByUnderlying` now returns `Map<string, IvRank>` (`{ value, observedAt }`
from `core/screener.ts`) directly. The structurally-identical `IvrSnapshot`
(`{ ivr, observedAt }`) type and the field-renaming layer in the screener service's
`readIvRanks` are gone; `readIvRanks` is now just the try/catch degrade wrapper.

## Contract deltas (vs `contracts/screener-results.md`)

- `ScoredCandidate` (+ preload mirror): new field `earningsFlagged: boolean`.
- `status: 'provider_unavailable'` now also covers the never-configured provider, not
  just a mid-flight outage.
- `ScreenerExclusion.reason` examples: `spread 22.23% exceeds 10%`,
  `no puts quoted in the 30–45 DTE window`, `earnings <date> falls on or before expiry`.
- `screenWatchlistCandidates(getProvider: () => MarketDataProvider, db, opts?)` —
  first parameter is now a thunk.
- `getLatestIvrByUnderlying(db, underlyings): Map<string, IvRank>` — `IvrSnapshot` no
  longer exists.

## Files touched

- `src/main/concurrency.ts` (new — shared `mapWithConcurrency`)
- `src/main/core/candidate-chain.ts` (safe `isTradeableStrike`, new `isWellFormedStrike`)
- `src/main/core/screener.ts` (earnings window bounds + wording, `earningsFlagged`,
  `FilterInput.currentDate`, `formatPercent`)
- `src/main/services/candidate-chains.ts` (`ok` ⇒ ≥ 1 strike; helper extracted)
- `src/main/services/screener.ts` (thunk signature, per-ticker quote isolation, strike
  validation, exclusion fallback, window-aware reason, `readIvRanks` simplified)
- `src/main/services/ivr-snapshots.ts` (returns `IvRank`; `IvrSnapshot` deleted)
- `src/main/integrations/massive-market-data.ts` (bounded stock-snapshot fan-out)
- `src/main/ipc/screener.ts` (passes the thunk)
- `src/preload/index.d.ts` (`IpcScoredCandidate.earningsFlagged`)

## Known remaining (verified, below report cap — deliberately not fixed)

- Ticker-level filters (price ceiling, earnings) re-evaluate per strike.
- `computeStrikeMetrics` runs twice per surviving strike (filters + scorer).
- IVR read issues one query per underlying (fine at watchlist cardinality — by design,
  see the ivr-snapshots ADR).
- `yieldPerDelta` renders `'Infinity'` if a zero-delta strike ever survives
  (`delta_unavailable`/`delta_band` currently prevent it).
