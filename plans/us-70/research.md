# Research: US-70 — Warn when a candidate has earnings within the DTE window

## What already exists

Reading `src/` rather than trusting the epic's "unowned dependency" line turned up
substantially more shipped groundwork than the story assumed.

| Concern                              | State                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Earnings data source                 | **Shipped** — `src/main/integrations/finnhub-earnings.ts`, added for US-56                                              |
| `earnings_in_window` hard filter     | **Shipped** — `FILTERS` registry entry in `src/main/core/screener.ts:222`                                               |
| Flag-mode survivor marking           | **Shipped** — `earningsFlagged` on `ScoredCandidate`, set in `judgeStrike` (`screener.ts:390`)                          |
| `earningsWithinHolding` date math    | **Shipped** — `date-fns` `compareAsc`/`parseISO`/`startOfDay`, correctly inclusive of expiry (`screener.ts:161`)        |
| Earnings-handling enum + persistence | **Shipped** — US-67, `ScreeningCriteria.earningsHandling`                                                               |
| Concurrency cap helper               | **Shipped** — `mapWithConcurrency` in `src/main/concurrency.ts`                                                         |
| Wiring the calendar into screening   | **Missing** — `src/main/services/screener.ts:150` hard-codes `earningsDate: null`                                       |
| Unknown vs unavailable distinction   | **Missing** — no representation anywhere in the stack                                                                   |
| Rank demotion for flagged/unknown    | **Missing** — `rankCandidates` sorts on `yieldPerDelta` alone (`screener.ts:432`)                                       |
| Badge rendering                      | **Missing** — `ScreenerResultsTable` never reads `earningsFlagged`; the API type comments it "not rendered until US-70" |
| Earnings persistence                 | **Missing** — no table in any of the 12 migrations; the feed caches in a process-local `Map` that dies on restart       |

The practical effect: the engine's exclude path is nearly done, and the real work
is the **feed → service → status model → ranking → badge** path.

---

## Architecture Decisions

### ADR: Reuse the Finnhub feed rather than introduce a screener-specific source

- **Decision:** US-70 consumes `src/main/integrations/finnhub-earnings.ts`, the
  auxiliary module shipped with US-56, widening it in place. No second provider,
  and earnings stays off `MarketDataProvider`.
- **Why:** The vendor decision was already made and documented in
  `docs/spec/domain/market-data.md` ("Auxiliary feed: Finnhub earnings calendar"):
  Massive gates earnings behind a paid Benzinga add-on and Alpaca does not serve
  it at all. Two consumers of one calendar with two different fetchers would drift
  on cache, quota, and date semantics. The adapter rules in that same page
  explicitly forbid adding a capability to `MarketDataProvider` that the primary
  vendor lacks — the Barchart IVR scraper set the same precedent.
- **Alternatives considered:** A paid Benzinga/Massive add-on (rejected: cost, and
  it does not remove the need for the outage path); a new `EarningsProvider`
  interface (rejected: one vendor, two call sites — a speculative abstraction the
  Simplicity-First rule bans).

### ADR: Persist earnings dates in SQLite; keep only failure backoff in memory

- **Decision:** Add an `earnings_date` table (one row per ticker) and a
  `src/main/services/earnings-dates.ts` read/upsert service. The DB becomes the
  cache: the integration module loses its 12-hour success `Map` and keeps only a
  short in-memory **failure** backoff. A fetch is issued only when the stored
  answer is absent, expired, or too shallow — see the refresh rule in
  `data-model.md` §2.
- **Why:** Three reasons, in order of weight.
  1. **Future work needs earnings outside the running process.** The watchlist
     already ships an unimplemented `post_earnings_only` entry condition
     (`migrations/012_create_watchlist.sql:6`) whose whole premise is "has this
     ticker already reported?" — unanswerable from a cache that dies on restart.
     US-96's watchlist earnings column is the same shape.
  2. **The process-local `Map` throws away the answer on every restart.** For a
     desktop app that is the common case, so the effective cache-hit rate is far
     below what the 12-hour TTL suggests, and every cold start re-issues one
     Finnhub call per watchlist ticker against a 60/min free-tier ceiling.
  3. **Earnings dates are the right shape to persist.** A date is a durable fact
     about a scheduled event, not a live quote — unlike a bid/ask, it does not
     decay between reads. The refresh trigger is a calendar event (the date
     passed) rather than a clock TTL, which is what makes "fetch only when we
     don't have it" correct rather than merely cheap.
- **Alternatives considered:** Keeping the in-memory cache alone (rejected: the
  user's stated requirement, and it cannot serve `post_earnings_only`); persisting
  a full per-event history table keyed `(ticker, event_date)` like `ivr_snapshot`
  (rejected: it cannot express "we checked and there is nothing scheduled" — an
  absent row and a genuinely empty calendar are indistinguishable, and this story
  turns on exactly that difference); caching in both places (rejected: two caches
  with different TTLs over one fact is the drift the reuse ADR already argues
  against).

**Why this is a different call than the Barchart IVR feed makes.** `ivr_snapshot`
is a time series with a composite `(underlying, observed_at)` key because IVR's
history _is_ the product — US-98 exists to age a reading. Earnings is a
point-in-time lookup where a stale value is simply wrong, so it stores one current
row per ticker and overwrites. Both feeds persist; they persist differently
because the data has different semantics.

**Failures are never persisted.** A 429 or an auth error writes no row — it is not
knowledge about the ticker. Short-term backoff for a failing ticker stays in the
existing in-memory failure cache (`EARNINGS_FAILURE_TTL_MS`), so a rate-limited
symbol is not re-hammered every 60 s by the alert scheduler, and a restart
correctly retries it.

### ADR: Make the calendar lookahead a caller-supplied parameter

- **Decision:** Replace the module-level `EARNINGS_LOOKAHEAD_DAYS = 30` constant
  with a `lookaheadDays` option. US-56 keeps passing its current 30-day horizon;
  the screener passes `criteria.dteMax + LOOKAHEAD_BUFFER_DAYS`.
- **Why:** The constant was sized for US-56's ~7-day alert proximity rule. US-70's
  DTE window runs to 45, so an earnings print at day 31–45 currently returns no
  event and renders as "unknown" — precisely the silent pass this story exists to
  prevent. The story's own Background (today 2026-07-15, expiry 2026-08-21 at 37
  DTE) falls in that dead zone.
- **Alternatives considered:** Raising the constant globally to 60 (rejected: it
  silently widens US-56's request for no benefit and hides the coupling); a second
  fetch function with its own window (rejected: duplicate cache, duplicate quota).

### ADR: Model the earnings lookup as a four-state union, not a nullable date

- **Decision:** The feed returns a per-ticker `EarningsLookup`
  (`found` / `none` / `unavailable`), and the engine emits a per-candidate
  `CandidateEarnings` (`clear` / `flagged` / `unknown` / `unavailable`).
  `ScoredCandidate.earningsFlagged: boolean` is replaced by
  `ScoredCandidate.earnings: CandidateEarnings`.
- **Why:** `fetchNextEarningsDates` currently returns `Record<string, string>` and
  omits the ticker for _both_ a null date and a caught error
  (`finnhub-earnings.ts:159`), collapsing the two states the story must render
  differently. A boolean flag on the candidate cannot carry the third and fourth
  states at all. The four states map one-to-one onto the ACs, which is the
  strongest signal the shape is right.
- **Alternatives considered:** A parallel `unavailableTickers: Set<string>` beside
  the record (rejected: two sources of truth for one fact, easy to read one and
  forget the other); keeping the boolean and passing status separately through the
  service (rejected: the badge and the sort both need the status on the row).

### ADR: Three-tier ranking — clear, then unknown/unavailable, then in-window

- **Decision:** `rankCandidates` sorts by earnings tier first (0 clear, 1
  unknown/unavailable, 2 flagged-in-window), then by `yieldPerDelta` within a tier.
  Demoted rows render `—` instead of a rank number.
- **Why:** This is what the approved US-66 mockup already shows in its `earnings`
  state (`mockups/us-66-screener-results.mdx:58`): NVDA at score 0.69 with an
  unknown date sits _below_ MSFT at 0.50, and both demoted rows carry `rank: null`.
  The reasoning holds up independently — pre-earnings IV inflation is exactly what
  pushes these to the top of a yield-per-delta sort, so score must not rescue a
  tier. Demoting `unavailable` is harmless during a full outage because every row
  lands in the same tier and relative order is unchanged.
- **Alternatives considered:** Demoting only flagged candidates and ranking unknown
  normally (rejected: contradicts the mockup, and an unknown date is precisely the
  case where the elevated premium might be unexplained earnings IV); a score
  penalty multiplier (rejected: unexplainable to the trader, and a large enough
  score still jumps the tier).

### ADR: Unknown and unavailable never exclude, in either handling mode

- **Decision:** The `earnings_in_window` hard filter fires only on a `found` date
  that lands in the holding window. `unknown` and `unavailable` produce a caution
  and a tier-1 demotion, never an exclusion — including in `exclude` mode.
- **Why:** Excluding on unknown means one free-tier coverage gap, an exhausted
  quota, or an expired API key silently empties the results table with no
  indication that the screener is broken rather than the market. The existing
  `iv_rank_floor` filter already encodes the same principle in its `applies`
  guard: "An unknown IV rank is a gap in the data, not a low reading, so it
  passes" (`screener.ts:216`). This keeps the two consistent.
- **Alternatives considered:** Excluding on unknown in `exclude` mode as the
  "safe" reading (rejected: it fails closed on the vendor, not on the risk, and
  the failure is invisible).

### ADR: Cap earnings fetch concurrency at the service boundary

- **Decision:** Route the per-ticker fan-out through the existing
  `mapWithConcurrency` helper (`src/main/concurrency.ts`) at the same limit the
  screener already uses for quotes. **The existing per-ticker `try/catch` must stay
  inside the mapped callback** — it is the failure-isolation mechanism, and
  `mapWithConcurrency` does not provide one.
- **Why:** `fetchNextEarningsDates` fans out with a bare `Promise.all` over every
  ticker. Finnhub's free tier allows 60 calls/minute, and a cold screener run over
  a large watchlist issues one request per ticker with no cache to absorb it. The
  screener's chain and quote reads already cap for exactly this 429 hazard
  (`QUOTE_FETCH_CONCURRENCY`), so this closes the last uncapped fan-out.
- **Alternatives considered:** Relying on the 12-hour cache alone (rejected: a cold
  start or a cache-clearing restart is the common case for a desktop app).

**Concurrency capping is not failure isolation — the two are independent, and only
the `try/catch` provides the second.**

`mapWithConcurrency` awaits `fn(item)` inside a `while` loop and joins its workers
with `Promise.all`. A throw from `fn` therefore breaks that worker's loop and
rejects the whole batch — it is _less_ forgiving than the bare `Promise.all` it
replaces, whose callbacks each swallow their own error. The helper's contract is
implicitly "`fn` must not throw", which is why the existing caller
`readUnderlyingPrices` wraps its provider call in `try/catch` _inside_ the callback
(`services/screener.ts:92`). Dropping the earnings `try/catch` while adopting the
helper would silently convert a single 429 into a total earnings outage — a direct
violation of the failure-isolation ADR.

### Rejected: `Promise.allSettled` in place of the per-ticker `try/catch`

`allSettled` and the `try/catch` solve the same problem, and the `try/catch` solves
it better here:

- **It is already redundant.** Every callback in the current `Promise.all` has its
  own `try/catch` (`finnhub-earnings.ts:148-156`), so no element promise can
  reject and the `Promise.all` can never reject. Swapping in `allSettled` would
  change nothing observable.
- **It loses domain information.** `allSettled` yields
  `{ status: 'rejected', reason }`, which the caller must translate back into
  `{ status: 'unavailable' }` anyway. The `catch` produces the domain value
  directly, and on the way does two things `allSettled` cannot: write the negative
  cache entry that stops a rate-limited ticker being re-hammered every 60 s
  (`EARNINGS_FAILURE_TTL_MS`), and log the classified `failureCode`
  (`auth_failed` / `rate_limited` / `network_error`). Both are per-ticker recovery
  behaviour that belongs at the throw site.
- **It would not survive the helper anyway.** Inside `mapWithConcurrency` there is
  no `Promise.all` for the caller to swap — the join is internal to the helper. The
  only place isolation can live is inside `fn`.

Hardening `mapWithConcurrency` itself to `allSettled` was also considered and
rejected: it is shared infrastructure with other callers, "`fn` must not throw" is
a reasonable contract that every current caller already honours, and making the
helper swallow errors would hide genuine bugs in callers that have no `catch`.

---

## External API findings

Finnhub `GET /api/v1/calendar/earnings`:

- `from` / `to` are optional `YYYY-MM-DD` params with **no documented maximum
  range**; they default to a short window (a few days) when omitted, which is why
  the module passes them explicitly. Widening `to` to ~50 days is within the
  documented contract.
- Free tier allows **60 API calls/minute**.
- Rows carry a time-of-day field (`hour`, values `bmo` / `amc` / `dmh`) alongside
  `date`, `symbol`, and the EPS/revenue estimate fields. The module consumes only
  `date`; BMO/AMC handling is explicitly Out of Scope for this story.

Sources: [Finnhub earnings-calendar docs](https://finnhub.io/docs/api/earnings-calendar), [Finnhub pricing](https://finnhub.io/pricing)

**Residual risk (accepted, not blocking):** Finnhub documents no maximum range but
does not contractually guarantee free-tier forward coverage at 45–50 days. This is
a data-coverage question, not a design question — a wrong answer degrades to the
`unknown` caution the story already specifies, which is the correct failure mode.
Verification is a quickstart step (`quickstart.md`, "Live smoke check"), not a gate
on the design.

## Open Questions

None — no `NEEDS CLARIFICATION` items remain.

Two story ACs were reconciled against shipped reality during research rather than
left as questions:

1. The exclusion reason string was written as `"earnings … falls before expiry"`;
   the shipped engine emits `"earnings … falls on or before expiry"`
   (`screener.ts:228`), which is the more accurate wording. The story was corrected
   to match the code — no code change.
2. The story initially said an unknown earnings date ranks normally. The approved
   US-66 mockup demotes it. The mockup won; the story's ranking AC was rewritten as
   the three-tier rule above.
