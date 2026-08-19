# US-65: Score wheel candidates against configurable screening criteria

<!-- generated:from us-65,us-70 -->

## Summary

US-65 turns US-64's raw put chains into a **ranked, explainable** candidate list. A pure
engine disqualifies strikes against seven ordered hard filters — each producing a
machine-readable code and a rendered reason — scores the survivors on premium yield, and
picks one representative strike per ticker ranked by **yield-per-delta** (annualized
return-if-flat ÷ |delta|), which answers "how much premium per unit of assignment
probability?" in a single explainable number.

Exclusions travel alongside survivors rather than being silently dropped, so the display
surface can show _why excluded_ separately from _why ranked #3_. A high score never
rescues an excluded candidate, and in an `ok` screen **every watchlist ticker appears in
exactly one of `ranked` / `excluded`** — no ticker ever vanishes without an explained row.

Backend-only. US-65 ships the engine, the service orchestration, the first **read** path
over the `ivr_snapshot` table, and the `screener:results` IPC channel plus preload
exposure. It persists nothing and adds no migration. The ranked table is
[us-66](us-66-screener-results.md); the criteria settings UI is US-67; the earnings
calendar is US-70. A post-implementation code-review hardening pass fixed ten verified
findings (results in `plans/us-65/code-review-fixes-results.md`); this page describes the
post-fix state.

## Acceptance criteria

- **Premium yield is computed on capital secured** — an AAPL 37-DTE put at the $180
  strike with a $2.70 mark yields a period yield of 1.5% (2.70 / 180), an annualized
  return-if-flat of 14.8% (1.5% × 365 / 37), and capital secured of $18,000 per contract
  (180 × 100).
- **Rank is annualized yield per unit of delta** — candidate A at 0.30 delta yielding
  30.0% annualized ranks _below_ candidate B at 0.20 delta yielding 24.0% annualized,
  because B shows the higher yield-per-delta score (1.20 vs 1.00).
- **Exclude a strike outside the delta band** — a 0.42-delta strike against a 0.20–0.30
  band is excluded with reason `delta 0.42 outside 0.20–0.30`, and a high yield does not
  rescue it into the ranked results.
- **Exclude an illiquid strike** — open interest of 120 against a 500 minimum is excluded
  with reason `open interest 120 below 500`.
- **Exclude a wide-spread strike** — bid 2.40 / ask 3.00 on a 2.70 mark against a 10%
  maximum is excluded with reason `spread 22.23% exceeds 10%` (percents render at up to
  2dp, rounded up).
- **Narrow absolute spread on a cheap option is not excluded** — bid 0.08 / ask 0.15 is
  not excluded for spread, because the $0.07 absolute spread is within tolerance.
- **Missing IV rank does not exclude a candidate** — with no IVR for a ticker, IV rank
  shows "n/a" and candidates are still ranked by yield-per-delta without an IVR
  contribution.
- **Best strike per ticker is selected** — given three AAPL strikes surviving the filters,
  the highest-scoring survivor represents AAPL in the results.

## What was built

**Pure engine.** `src/main/core/screener.ts` holds the whole screening decision with no
DB, provider, or `logger` import — only `decimal.js`, `date-fns`, and pure siblings
(`core/candidate-chain`, `core/dte`). It exports `ScreeningCriteria` and
`DEFAULT_SCREENING_CRITERIA` (delta band `0.20–0.30`, DTE `30–45`, minimum OI 500, max
spread 10% **or** $0.10, no price ceiling, earnings excluded), the ordered `FILTERS`
registry, `evaluateFilters`, `scoreCandidate`, `screenTicker`, and `rankCandidates`.
See [Pure core engines](../architecture/02-adrs/pure-core-engines.md).

The yield math, computed from one unrounded `Decimal` chain and rounded only when each
output field is written:

```
spreadAbsolute  = ask − bid                       (2dp)
spreadPercent   = (ask − bid) / mark × 100        (2dp)
capitalSecured  = strike × 100                    (2dp)
periodYield     = mark / strike                   (4dp)
annualizedYield = periodYield × 365 / dte         (4dp — calendar 365, never 252)
yieldPerDelta   = annualizedYield / |delta|       (4dp — the rank score)
```

`mark` is _copied_ from the strike (US-64's `computeMid`), never recomputed, so money
rounding lives in exactly one place. Calendar 365 is deliberate — the wheel is a
calendar-time trade; the 252 trading-day basis belongs to the Epic 12 volatility work.
See [Decimal money math](../architecture/02-adrs/decimal-money-math.md).

**The hard-filter funnel.** `FILTERS` is an ordered array of pure
`{ code, applies, test, reason }` objects, evaluated by a single `findIndex` that stops at
the first breach — so every candidate carries exactly one reason. `applies` returning
`false` means "cannot evaluate": the criterion is off or its input is unknown, and the
candidate passes untouched.

| #   | Code                 | Fires when                                               | Example reason                                  |
| --- | -------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| 1   | `price_ceiling`      | underlying price above the (optional) ceiling            | `underlying $412.00 above $75.00 ceiling`       |
| 2   | `earnings_in_window` | an earnings print lands between today and expiry (incl.) | `earnings 2026-08-12 falls on or before expiry` |
| 3   | `dte_window`         | DTE outside the window, `< 1`, or unparseable            | `DTE 52 outside 30–45`                          |
| 4   | `delta_unavailable`  | the strike has no delta                                  | `delta unavailable`                             |
| 5   | `delta_band`         | \|delta\| outside the band (bounds inclusive)            | `delta 0.42 outside 0.20–0.30`                  |
| 6   | `open_interest`      | OI below the floor (`null` passes; `0` does not)         | `open interest 120 below 500`                   |
| 7   | `spread`             | absolute **and** percent ceilings both breached          | `spread 22.23% exceeds 10%`                     |

The order is the funnel a trader would describe — whole-ticker disqualifiers, then
structural selection, then per-strike liquidity — and it is load-bearing: a ticker's
exclusions are sorted by filter index **descending**, so `excluded[0]` is the strike that
got furthest through the funnel and becomes that ticker's representative reason
downstream. The reason strings are rendered verbatim by US-66, which fixes the formatters
(2dp deltas, **en dash** `–` U+2013 in band strings, percents at up to 2dp **rounded up**
with trailing zeros trimmed — so an exclusion can never read as self-contradictory like
"spread 10% exceeds 10%" — and `$`-prefixed 2dp money). See
[Alert rule registry](../architecture/02-adrs/alert-rule-registry.md) for the registry
shape this follows.

**Earnings handling.** The earnings gate is bounded to the **holding window** — a print
on or after the trader's current calendar day and on or before expiry. A past earnings
date still present in a feed never excludes (that is precisely the post-earnings entry a
wheel trader wants). Two modes: `exclude` (default) drops the strike with the reason
above; `flag` lets it rank carrying an earnings verdict for US-66 to render as a warning.
Both were latent in production until [us-70](./us-70-earnings-in-window-warning.md) wired
the Finnhub calendar in — until then the service passed `earningsDate: null`. US-70 also
replaced the boolean flag with `ScoredCandidate.earnings: CandidateEarnings`, a four-state
verdict (`clear` / `flagged` / `unknown` / `unavailable`), so an unreadable calendar is
distinguishable from a genuinely empty one and neither can exclude. See
[earnings-four-state-lookup](../architecture/02-adrs/earnings-four-state-lookup.md).

**Selection and ranking.** `screenTicker` folds a chain into
`{ ticker, best, excluded }` — `best` is the highest-`yieldPerDelta` survivor (ties going
to the lower strike, the more conservative entry), and every other survivor is discarded:
one strike represents the ticker. `rankCandidates` then flattens the non-null bests and
sorts by `yieldPerDelta` descending, tie-broken by ticker ascending. Both use one shared
comparator, and both rank on the _emitted 4dp string_ so the displayed order can never
contradict the displayed numbers.

**IVR read path.** `src/main/services/ivr-snapshots.ts` adds `getLatestIvrByUnderlying`,
the first read over US-44's `ivr_snapshot` table — one prepared
`ORDER BY observed_at DESC LIMIT 1` per upper-cased underlying, misses skipped so callers
surface "unknown" rather than a fabricated zero. `ivr-collector.ts` stays write-only.
The reading travels as the engine's `IvRank = { value, observedAt }` — returned directly
by the read path (the structurally-identical `IvrSnapshot` type was deleted) — rather
than a bare number: IV can re-rate hard overnight, so a number alone gives a caller no
way to judge whether it is still worth acting on. IVR is a **soft** input — it colours
the row, never excludes.

**Service orchestration.** `src/main/services/screener.ts` exposes
`screenWatchlistCandidates(getProvider, db, opts?)` — the first parameter is a **thunk**
resolved inside the service, so a never-configured provider (no API key) surfaces as the
modelled `provider_unavailable` state rather than a generic error. It pulls chains with
the DTE window derived from the criteria, short-circuits a provider outage, joins IVR,
fetches underlying quotes **only** when a price ceiling is set (per ticker, isolated,
concurrency-capped at 4 via the shared `mapWithConcurrency` in `src/main/concurrency.ts`),
passes `earningsDate: null` (the US-70 seam), validates strikes through
`isWellFormedStrike` before the pure engine, screens each ticker, ranks, and reports the
newest quote timestamp. Every boundary is isolated per
[Alert evaluation failure isolation](../architecture/02-adrs/alert-evaluation-failure-isolation.md):

| Failure                          | Behaviour                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------ |
| provider not configured          | `status: 'provider_unavailable'` + `warn`; nothing else runs                   |
| chains `provider_unavailable`    | short-circuit; no IVR read, no quote fetch, empty `ranked`/`excluded`          |
| IVR read throws                  | degrade to an empty map + `warn`; every candidate ranks with `null`            |
| one ticker's quote fetch throws  | `warn`; only that ticker's ceiling goes unevaluated — the rest still fire      |
| a strike is malformed            | `warn`; that strike is dropped, the ticker's other strikes still screen        |
| every strike malformed           | one `excluded` row, `data_unavailable` — the ticker never vanishes             |
| `screenTicker` throws (backstop) | `error` log, that ticker drops to `data_unavailable`, others rank              |
| ticker `no_options_listed`       | one `excluded` row, `no puts quoted in the 30–45 DTE window` (criteria-driven) |
| ticker with zero survivors       | one `excluded` row carrying its representative reason                          |

A chain whose quotes are all untradeable classifies upstream as `no_options_listed` — an
`ok` chain always carries at least one tradeable strike — which is the other half of the
no-ticker-vanishes guarantee. Logging mirrors `candidate-chains.ts`: `debug` for the
request and per-ticker outcomes, exactly one `info` on completion with
`{ status, rankedCount, excludedCount }`.

**Delivery surface.** `src/main/ipc/screener.ts` registers `screener:results` — no Zod
request schema, because the channel takes no payload — as a single service call wrapped in
`handleIpcCall`; the provider thunk passes through untouched, keeping the handler thin.
The preload adds `screener: { results }` and the ambient renderer types mirror
`ScoredCandidate` field-for-field (including `earnings`, which replaced the original
`earningsFlagged` boolean in us-70). See
[IPC Handlers](../contracts/ipc-handlers.md).

**Tests.** `screener.integration.test.ts` runs the real `screenWatchlistCandidates`
against an in-memory SQLite DB (migrations applied, `watchlist` + `ivr_snapshot` seeded)
and a scripted provider, one `it()` per acceptance criterion. There is no Playwright spec
— US-65 has no renderer surface, the same rationale as US-64. Because that layer adds no
production code, its tests were green on arrival, so each was instead falsified against
deliberate engine mutations (365→360 annualization; en dash → hyphen, OI floor → `< 0`,
spread filter disabled; spread `&&` → `||`) to prove all eight fail under a mutation of
exactly the behaviour they assert. The review-fix pass added coverage for every fixed
finding (vanishing tickers, per-ticker quote isolation, malformed-strike drops, the
unconfigured-provider state, earnings window bounds, and flag mode).

## Architecture decisions

- **Hard filters as an ordered pure-predicate registry, first failure wins** — the
  established shape for rule evaluation here; it keeps every exclusion message next to the
  predicate that produces it, and US-67's IV-rank floor appends without touching the loop.
  Collecting _all_ failing reasons was rejected: US-66 shows one reason per row, and a
  candidate failing four gates is not four times as interesting. See
  [Alert rule registry](../architecture/02-adrs/alert-rule-registry.md).
- **Ticker-level filters run first so the representative reason is the right one** —
  ordering plus an index-descending exclusion sort makes `excluded[0]` the closest miss.
  Putting delta after liquidity would make a ticker whose in-band strikes fail on spread
  report a delta reason from some far-OTM strike instead.
- **No non-ranking ticker ever vanishes** — enforced at two layers: an `ok` chain always
  carries ≥ 1 tradeable strike (all-untradeable classifies as `no_options_listed`), and
  the service falls back to a `data_unavailable` row when every strike was dropped as
  malformed. Every failure mode produces an explained row.
- **Validate strikes before the pure engine — a catch is a backstop, not a filter** —
  `isWellFormedStrike` drops malformed quotes individually before `screenTicker`, per the
  [failure-isolation ADR](../architecture/02-adrs/alert-evaluation-failure-isolation.md)
  rule that callers of throwing pure helpers must validate rather than rely on a
  downstream catch that costs the item its other results.
- **Delta is absolutized at the engine boundary** — puts carry a negative delta from the
  provider, but every trader-facing artifact (the band, the exclusion message, the Δ
  column, yield-per-delta itself) is stated in absolute terms. A `-0.42` against a
  `0.20–0.30` band would silently exclude the entire chain, and a negative divisor would
  rank candidates upside-down. The adapter keeps returning the signed value, which the
  cockpit Greeks panel needs.
- **Round once, at the output boundary** — rounding intermediates compounds (`0.5285`
  computed once vs `0.5286` from a pre-rounded annualized), and ranking on the same
  rounded value the trader sees means the order can never contradict the numbers. See
  [Decimal money math](../architecture/02-adrs/decimal-money-math.md).
- **A hard filter never excludes on a missing input — except a missing delta** — mirrors
  the alert engine's `missingData` guards and stops an unowned upstream (US-70's earnings
  calendar) or a degraded quote fetch from silently emptying the screener. A missing delta
  is different in kind: the candidate cannot be ranked at all.
- **The earnings gate is bounded to the holding window, and `flag` mode really flags** —
  without the lower bound a feed reporting last quarter's (past) print would permanently
  exclude every strike; and `flag` was previously declared with no implementation, so
  survivors now carry an earnings verdict instead of the mode silently doing nothing.
- **The spread gate needs both thresholds breached** — a `0.08 / 0.15` quote is 58% of
  mark but only 7¢ wide, a real fillable market. A percent-only gate would delete every
  low-priced underlying from the screener.
- **New `ivr_snapshot` read module, not a widened collector** — the collector is a
  scheduled-job module (throttling, market-status guard, clock injection) and a
  synchronous screener read shares none of that; the read path returns the engine's
  `IvRank` shape so one domain concept has one type. See
  [us-44](us-44-ivr-snapshot-store-and-scheduler.md).
- **A provider outage — or a never-configured provider — short-circuits the screen** — an
  outage says nothing about any individual ticker, so reporting per-ticker exclusions
  would invent verdicts we do not have; and a missing API key is the same trader-facing
  state, so the service resolves the provider thunk itself and maps a construction throw
  to `provider_unavailable` instead of leaking a generic `internal_error`. See
  [Market Data](../domain/market-data.md).
- **IV rank travels with its observation time** — `{ value, observedAt }`, leaving what
  counts as too stale to the display surface.
- **Criteria are a parameter, not a settings read** — the service takes an optional
  override defaulting to `DEFAULT_SCREENING_CRITERIA`, which is the seam US-67 fills, so
  US-65 never reaches into a settings store that may not exist yet.

## Contracts touched

- `screener:results` — new IPC channel; no request payload, returns
  `{ ok, status, ranked, excluded, quoteTimestamp }`. `ScoredCandidate` carries
  `earnings: CandidateEarnings` (us-70; originally `earningsFlagged: boolean`). See
  [IPC Handlers](../contracts/ipc-handlers.md).
- `screenWatchlistCandidates(getProvider, db, opts?)` → `ScreenerResults` — in-process
  service contract; the provider argument is a thunk, and `opts` carries the `criteria`
  and `currentDate` seams.
- `screenTicker` / `rankCandidates` / `scoreCandidate` / `evaluateFilters` — pure engine
  contracts over `TickerScreeningInput`, `ScoredCandidate`, `ExcludedCandidate`
  (`FilterInput` includes `currentDate`).
- `getLatestIvrByUnderlying(db, underlyings)` → `Map<string, IvRank>` — read-only,
  misses absent from the map.
- `pullWatchlistChains` (from [us-64](us-64-pull-option-chains-for-watchlist.md); the
  review-fix pass tightened its `ok` status to imply ≥ 1 tradeable strike).

## Source files

- `src/main/core/screener.ts`
- `src/main/core/candidate-chain.ts` (US-64 module — gained `isWellFormedStrike`)
- `src/main/services/screener.ts`
- `src/main/services/ivr-snapshots.ts`
- `src/main/services/candidate-chains.ts` (US-64 module — `ok` ⇒ ≥ 1 tradeable strike)
- `src/main/ipc/screener.ts`
- `src/main/concurrency.ts`
- `src/main/integrations/massive-market-data.ts` (bounded stock-snapshot fan-out)
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/main/test-utils.ts`

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
