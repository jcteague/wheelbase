# Research — US-65: Score wheel candidates against configurable screening criteria

## Story recap

Turn the raw put chains pulled by US-64 into a **ranked, explainable** candidate list:
first **disqualify** untradeable/structurally-wrong strikes with a machine-readable
reason, then **rank** the survivors by **yield-per-delta** (annualized return-if-flat ÷
delta). One recommended strike per ticker. Exclusions travel alongside survivors so
US-66 can show _why excluded_ separately from _why ranked #3_.

### Scope decisions taken with the user before Phase 0

1. **Engine + service + IPC.** US-65 ships the pure `src/main/core/screener.ts`, the
   `src/main/services/screener.ts` orchestration (US-64 chains + IVR join + best-per-ticker),
   a new `ivr_snapshot` read path, and a thin `screener:results` IPC handler + preload
   exposure. US-66 becomes pure renderer work, matching its Technical Note
   ("Consume scored candidates from US-65 via `screener:results` IPC").
2. **All six hard filters now, sources deferred.** The engine implements delta band,
   DTE window, minimum OI, max spread, price ceiling, and earnings-in-window. Earnings
   date and underlying price are plain optional inputs (`null` = unknown); US-70 wires
   the earnings calendar and US-67 wires persisted criteria. The IV-rank floor and the
   premium-yield floor are **not** implemented here — US-65 explicitly classes IVR as a
   soft, rank-only input ("never a default hard exclude"), and both optional floors are
   US-67's ACs.

Out of scope: the ranked table (US-66), the criteria settings UI (US-67), earnings-date
fetching (US-70), multiplicative liquidity/IVR score factors, PMCC criteria (Epic 09).

## Current-state findings (verified against `src/`, not the spec)

- **US-64 has landed.** `src/main/core/candidate-chain.ts` exports `CandidateStrike`
  (`contractId, strike, expiration, bid, ask, mark, delta, openInterest, volume,
timestamp`), `DteWindow`, `DEFAULT_DTE_WINDOW = {min:30,max:45}`,
  `dteWindowToExpirationRange`, `isTradeableStrike`, `toCandidateStrikes`,
  `classifyChainFailure`. `src/main/services/candidate-chains.ts` exports
  `pullWatchlistChains(provider, db, opts?) → { status: 'ok' | 'provider_unavailable',
tickers: TickerChainResult[] }` with per-ticker `ok | no_options_listed |
data_unavailable`. This is US-65's input; **no changes to it are needed**.
- **Precision, as actually implemented** (the US-64 plan doc says 2dp for strike; the
  code ships 4dp — trust the code):
  - `strike` — 4dp TEXT (`massive-market-data.ts` `mapChainResult`, and the fake
    provider's OCC decoder), matching `legs.strike`.
  - `mark` — 2dp TEXT, `computeMid` = `(bid+ask)/2` HALF_UP 2dp. `bid`/`ask` 2dp.
  - `delta` — 4dp TEXT, **signed, passed through raw**. Massive/Polygon returns a
    **negative** delta for puts; nothing in the codebase absolutizes it today.
  - `decimal.js` global rounding is `ROUND_HALF_UP`, set once in `core/costbasis.ts`.
- **IVR store exists; there is no read path.** `migrations/007_create_ivr_snapshot.sql`
  defines `ivr_snapshot(underlying, observed_at, ivr TEXT, ivp, iv30, source)` with PK
  `(underlying, observed_at)` and index `(underlying, observed_at DESC)`. `ivr` is
  stored as TEXT 1dp. `services/ivr-collector.ts` only **writes**; nothing reads the
  table. A `getLatestIvrByUnderlying` read helper must be added.
- **Underlying prices** are available via `provider.getStockQuotes(tickers): Promise<Map<string, StockQuote>>` (`StockQuote.price`, 2dp TEXT).
- **No `screener:*` IPC namespace exists.** `src/main/ipc/` has alerts, assignments,
  broker, ivr, market-data, ping, positions, settings, watchlist. Registration happens
  in `src/main/index.ts` (`registerWatchlistIpc({ db })`,
  `registerMarketDataHandlers(getProvider, getWindow)`); the preload surface is a flat
  namespace map in `src/preload/index.ts` (`watchlist: { list: () => invoke(...) }`).
- **`handleIpcCall`** (`src/main/ipc/utils.ts`) is the only envelope producer; it already
  special-cases `ValidationError`, `MarketDataError`, `ZodError`, and falls back to
  `__root__ / internal_error`.
- **Rule-registry precedent**: `src/main/core/alerts.ts` models rules as an ordered
  array of `{ code, missingData, test, summary }` pure objects with named summary
  helpers, evaluated by a single loop. The hard filters are the same shape and must
  follow it (project convention, `alert-rule-registry` ADR).
- **Failure-isolation is a hard rule** (`alert-evaluation-failure-isolation` ADR):
  per-item `try/catch`, boundary I/O degrades to empty + log, one bad item never
  suppresses the rest.
- **AC arithmetic checks out** against the US-66 mockup (`mockups/us-66-screener-results.mdx`),
  which is the display surface for these numbers:
  | ticker | mark / strike | period | × 365/DTE | annualized | ÷ delta | score |
  | ------ | ------------- | ------ | --------- | ---------- | ------- | ----- |
  | KO | 0.95 / 60 | 1.58% | 37 DTE | 15.6% | 0.22 | 0.71 |
  | AAPL | 2.70 / 180 | 1.50% | 37 DTE | 14.8% | 0.28 | 0.53 |
  | MSFT | 6.20 / 410 | 1.51% | 44 DTE | 12.5% | 0.25 | 0.50 |
  AC-2's worked example (`0.30/0.30 = 1.00` vs `0.24/0.20 = 1.20`) confirms the score
  divides the annualized yield **as a decimal fraction** by the **absolute** delta.

## Architecture Decisions

### ADR: Hard filters as an ordered pure-predicate registry, first failure wins

- **Decision:** Model the six hard filters as an ordered `FILTERS` array of
  `{ code, applies?, test, reason }` pure objects in `src/main/core/screener.ts`,
  evaluated in a single loop that stops at the **first** failing filter and attaches
  that filter's `code` + rendered `reason` to the candidate. Order is
  `price_ceiling → earnings_in_window → dte_window → delta_unavailable → delta_band →
open_interest → spread`.
- **Why:** It is the established shape for rule evaluation in this codebase
  (`core/alerts.ts` `RULES`, the `alert-rule-registry` ADR), it keeps every exclusion
  message next to the predicate that produces it, and new filters (IV-rank floor in
  US-67) append without touching the loop. First-failure-wins gives each candidate
  exactly one reason, which is what US-66 renders.
- **Alternatives considered:** an if/return chain (rejected — the registry ADR bans it);
  collecting **all** failing reasons per candidate (rejected — US-66 shows one reason
  per row and a candidate failing four gates is not four times as interesting).

### ADR: Ticker-level filters run first so the representative exclusion reason is the right one

- **Decision:** Order the registry so ticker-wide gates (price ceiling, earnings) run
  before structural selection (DTE, delta) and structural selection before per-strike
  liquidity (OI, spread). Sort a ticker's exclusions by **filter index descending**
  (latest stage reached first), tie-broken by chain order, so `excluded[0]` is the
  candidate that got furthest through the funnel.
- **Why:** US-66's excluded section shows **one row per ticker**. With this order the
  representative reason matches the mockup exactly: TSLA (in-band strikes failing the
  spread gate) reads `spread 22% exceeds 10%` rather than `delta 0.42 outside 0.20–0.30`
  from some far-OTM strike; AMD, whose whole chain misses the band, reads the delta
  reason; F reads the OI reason. Putting delta after liquidity would invert all three.
- **Alternatives considered:** returning an unsorted list and letting the renderer pick
  (rejected — the renderer would show a meaningless first-in-chain reason and the choice
  belongs to the engine, which knows the funnel); computing a separate "closest miss"
  score (rejected — the filter index already encodes it for free).

### ADR: Delta is absolutized at the engine boundary

- **Decision:** The engine compares and scores on `|delta|`, and the `ScoredCandidate`
  it emits carries the **absolute** 4dp delta. The adapter keeps returning the raw
  signed value.
- **Why:** Puts carry a negative delta from Massive, but every trader-facing artifact —
  the criteria band `0.20–0.30`, the exclusion message `delta 0.42 outside 0.20–0.30`,
  the mockup's `Δ 0.28` column, and yield-per-delta itself — is stated in absolute
  terms. A `-0.42` compared against a `0.20–0.30` band would silently exclude the entire
  chain, and a negative divisor would rank candidates upside-down.
- **Alternatives considered:** absolutizing in the adapter (rejected — it would corrupt
  the signed value the cockpit Greeks panel displays); requiring criteria to be signed
  (rejected — nonsense for a trader, and calls would then need the opposite sign).

### ADR: Round once, at the output boundary

- **Decision:** Compute `periodYield`, `annualizedYield`, and `yieldPerDelta` from a
  single unrounded `Decimal` chain and round each to 4dp only when writing the output
  field. Rank on the emitted 4dp `yieldPerDelta` string, tie-broken by ticker ascending.
- **Why:** Rounding intermediates compounds — AAPL's score is `0.5285` computed once
  versus `0.5286` computed from a pre-rounded `0.1480` annualized. Ranking on the same
  rounded value the trader sees means the displayed order can never contradict the
  displayed numbers, and the alphabetical tie-break keeps runs deterministic.
- **Alternatives considered:** ranking on full precision (rejected — two rows showing
  `0.53` could then sort in an order the trader cannot explain); rounding to 2dp
  (rejected — 2dp collides too often across a real watchlist).

### ADR: A hard filter never excludes on a missing input — except a missing delta

- **Decision:** Each filter declares an `applies` guard; when its input is `null` (no
  earnings date, no underlying price, ceiling disabled) the filter does not fire and
  the candidate passes it. The single exception is a **missing delta**, which excludes
  with code `delta_unavailable` because the rank is undefined without it.
- **Why:** Mirrors the alert engine's `missingData` guards, and prevents an unowned
  upstream (the earnings calendar, US-70) or a degraded quote fetch from silently
  emptying the screener. A missing delta is different in kind: the candidate cannot be
  ranked at all, so keeping it would put an unscoreable row in a ranked table.
- **Alternatives considered:** excluding on unknown earnings (rejected — US-70's AC
  requires a _caution_, not an exclusion, and US-65 has no earnings source yet, so every
  candidate would vanish); excluding on unknown price when the ceiling is enabled
  (rejected — a degraded quote fetch would empty the results; the service logs a warn
  instead).

### ADR: The spread gate needs both thresholds breached

- **Decision:** Exclude for spread only when `spreadAbsolute > maxSpreadAbsolute`
  **and** `spreadPercent > maxSpreadPercent`. Defaults `10%` / `$0.10`. The rendered
  reason quotes the percent (`spread 22% exceeds 10%`) per the AC.
- **Why:** AC "Narrow absolute spread on a cheap option is not excluded" — a
  `0.08 / 0.15` quote is 58% of mark but only 7¢ wide, which is a real, fillable market.
  A percent-only gate would delete every low-priced underlying from the screener.
- **Alternatives considered:** percent-only with a lower bound on mark (rejected —
  an extra magic price threshold that says the same thing less directly).

### ADR: New `ivr_snapshot` read module, not a widened collector

- **Decision:** Add `src/main/services/ivr-snapshots.ts` exporting
  `getLatestIvrByUnderlying(db, underlyings): Map<string, string>` — one prepared
  `ORDER BY observed_at DESC LIMIT 1` per underlying. `services/ivr-collector.ts` stays
  write-only.
- **Why:** The collector is a scheduled-job module (throttling, market-status guard,
  clock injection); a synchronous read path for the screener shares none of that.
  Watchlists are small (tens of tickers) and the `(underlying, observed_at DESC)` index
  makes each lookup a single index seek, so the loop is simpler and faster to read than
  a row-value `IN` subquery.
- **Alternatives considered:** one `GROUP BY`/window-function query (rejected — more
  SQL for no measurable gain at this cardinality); exporting from `ivr-collector.ts`
  (rejected — mixes read and write responsibilities on a job module).

### ADR: A provider outage short-circuits the screen

- **Decision:** When `pullWatchlistChains` reports `provider_unavailable`, the service
  returns `{ status: 'provider_unavailable', ranked: [], excluded: [], quoteTimestamp:
null }` without joining IVR or scoring. Per-ticker `no_options_listed` and
  `data_unavailable` are folded into the same `excluded` list the engine's exclusions
  use, with codes of the same name.
- **Why:** US-66's AC requires "market data unavailable" to be visually distinct from
  "no candidates match your criteria", and the mockup's Excluded section already mixes
  `no options listed` (XYZ) with engine reasons — one list keyed by ticker is exactly
  what it renders.
- **Alternatives considered:** scoring whatever partial data arrived during an outage
  (rejected — by US-64's definition an outage means no ticker answered).

## Open Questions

None. Both scope ambiguities (engine-only vs engine+service+IPC; which hard filters
belong to US-65) were resolved with the user before Phase 0 and are recorded above.

Deliberately **not** decided here, and noted for their owning stories:

- **IVR staleness.** The screener uses the latest `ivr_snapshot` row regardless of age;
  the collector runs daily so this is fresh in practice. A staleness cutoff belongs with
  the IVR surface, not the scorer.
- **Where criteria are persisted.** US-65 exports `DEFAULT_SCREENING_CRITERIA` and the
  service takes an optional `criteria` override, which is the seam US-67 fills.
  </content>
  </invoke>
