# US-70: Warn when a candidate has earnings within the DTE window

<!-- generated:from us-70 -->

## Summary

The candidate screener judges earnings before it judges score. A candidate whose next
earnings print lands on or before its expiry is hard-excluded by default, or — when the
trader has set `earningsHandling: 'flag'` — kept with a warning badge and sorted below
every clean candidate. A missing or unreadable earnings date is never treated as safety:
it produces a visible caution and a ranking demotion, but never an exclusion.

Selling a cash-secured put into earnings is selling a binary event: a bad print can gap
the underlying 15–20% overnight, assigning the trader deep underwater with almost no
premium cushion. Worse, the premium looks fat _because_ pre-earnings IV is elevated —
which means [US-65](./us-65-score-wheel-candidates.md)'s yield-per-delta rank would
actively surface these as the best candidates unless earnings is handled first. That is
why earnings certainty is the outer sort key and score only orders within a tier.

The story also widened the shared Finnhub feed that
[US-56](./us-56-earnings-proximity-alert.md) depends on, and replaced that feed's
process-local success cache with the persisted
[`earnings_date`](../schema/tables.md#earnings_date) table.

## Acceptance criteria

Background: the DTE window is 30–45, and today is 2026-07-15.

- **Exclude a candidate with earnings before expiration (default).** AAPL earnings
  2026-07-31, put expires 2026-08-21 (37 DTE), handling "Exclude" → excluded with reason
  `earnings 2026-07-31 falls on or before expiry`.
- **Flag a candidate with earnings before expiration when flag mode is on.** Same data,
  handling "Flag only" → shown with a warning naming the date and the days before expiry.
- **Ranking demotes by earnings certainty, then score.** KO (clear, 0.71), MSFT (clear,
  0.50), NVDA (unknown, 0.69), AAPL (earnings before expiry, 0.53) → order is KO, MSFT,
  NVDA, AAPL; only KO and MSFT carry a rank number, NVDA and AAPL show `—`.
- **Earnings on the expiration date is in the window.** Earnings 2026-08-21, expiry
  2026-08-21, handling "Exclude" → excluded. The boundary is inclusive at both ends.
- **No warning when earnings fall after expiration.** Earnings 2026-09-05, expiry
  2026-08-21 → no earnings warning.
- **Earnings beyond the alert horizon are still found.** With the window's furthest expiry
  45 days out, the calendar is queried through at least that far, and a date 37 days out
  is returned rather than reported unknown.
- **Unknown earnings date surfaces a caution, not a silent pass.** No date for XYZ → the
  candidate shows "Earnings date unknown" and is not silently treated as having no
  earnings.
- **Unknown earnings never hard-excludes, even in exclude mode.** XYZ is still scored and
  ranked with the caution, is not excluded, and sorts below every candidate with a known
  clear date.
- **Earnings-calendar outage does not suppress other results.** Candidates are still
  scored and ranked, each showing an "Earnings date unavailable" caution, and none is
  excluded for earnings.
- **Outage is distinguishable from a genuinely empty calendar.** XYZ empty and ABC failed
  in one run → XYZ reads "Earnings date unknown", ABC reads "Earnings date unavailable".

Every AC has a named scenario in `e2e/screener-earnings.spec.ts`.

## What was built

**Four states, end to end.** The vendor feed answers `found` / `none` / `unavailable` per
ticker; the pure engine turns that plus the handling mode and the strike's expiry into
`clear` / `flagged` / `unknown` / `unavailable`. The two unions are the spine of the
feature — the previous shape (`Record<ticker, isoDate>` with the ticker simply omitted for
both a null date and a caught error) could not tell "there is no earnings risk" from "we
could not check", which on a free-tier vendor with real coverage gaps reads as a clean
bill of health.

**The engine owns the types and stays pure.** `EarningsLookup` and `CandidateEarnings` are
declared in `src/main/core/screener.ts`, which imports nothing from `integrations/`,
`db/`, or `logger`; the Finnhub module re-exports `EarningsLookup` so callers of the feed
can name its return shape. This mirrors how `IvRank` is declared in the engine and
`services/ivr-snapshots.ts` conforms to it.

**The hard filter only fires on a date we actually read.** `earnings_in_window`'s
`applies` guard requires `earningsHandling === 'exclude'` _and_ a `found` lookup, so
`unknown` and `unavailable` cannot reach an exclusion in either mode. The in-window test
is the pre-existing `earningsWithinHolding` predicate — `startOfDay(currentDate) ≤
earnings ≤ expiration`, inclusive at both ends, using `date-fns` rather than string
comparison.

**Earnings tier sorts ahead of yield-per-delta, in two places.** `rankCandidates` orders
by tier (0 clear, 1 unknown/unavailable, 2 flagged) then score then ticker. So does
`screenTicker`'s intra-ticker best-strike pick — a chain is pulled across the whole DTE
window, so it spans several expirations and a print falling between two of them leaves the
earlier strike clear and the later one flagged. Since the flagged strike carries the
richer premium (that is the IV inflation the story is about), sorting on score alone would
hand the ticker its riskiest expiry and hide the clean one.

**Persistence replaced the in-process cache.** The
[`earnings_date`](../schema/tables.md#earnings_date) table is now the cache; the feed
keeps only a short in-memory failure backoff. This is what lets the alert scheduler and
the screener share answers, survives the restart that a desktop app does constantly, and
gives the future `post_earnings_only` watchlist condition something to read.

**The read-through store distinguishes "stale" from "not an answer".** A merely
time-stale future date is the best knowledge available and is served through an outage.
But a date that has already passed says nothing about the _next_ print, and a stored NULL
shallower than the caller's horizon cannot speak for a window it never examined — both are
rejected and fall through to `unavailable`. The past-date test is one shared predicate
applied to the fetched value and the stored row alike, because gating only one path had
the two disagree on identical data.

**Rendering.** `EarningsBadge` sits under the ticker symbol in the same cell — gold
(`bg-wb-gold-dim` / `border-wb-gold-border` / `text-wb-gold`) for `flagged`, a neutral
muted treatment for `unknown` and `unavailable`, nothing at all for `clear`. Gold is
deliberately not red: an earnings-window candidate is a judgement call the trader may take
on purpose, not an error. A demoted row renders `—` in place of its rank number, matching
the US-66 mockup's `rank: null` rows; the score stays reachable through the cell's
tooltip. `daysBeforeExpiry` arrives on the payload so the renderer never redoes date math.

**Failure isolation.** No earnings failure suppresses anything else: a single ticker's
throw is caught inside the fan-out callback (which also owns the backoff write and the
classified failure log), a whole-store read failure degrades to per-candidate
`unavailable` with the run still `ok`, a DB write failure is swallowed so it cannot cost a
successful read, and a missing entry defaults to `unavailable` rather than to "no
earnings". See the
[alert-evaluation-failure-isolation ADR](../architecture/02-adrs/alert-evaluation-failure-isolation.md).

**US-56 was carried, not broken.** The alert path now reads through the same store, keeps
its 30-day horizon, and maps the union back to the nullable date its pure rule already
took — the union does not leak into `src/main/core/`.

## Architecture decisions

- [earnings-persisted-per-ticker](../architecture/02-adrs/earnings-persisted-per-ticker.md)
  — one current row per ticker in SQLite; only failure backoff stays in memory.
  **Supersedes** US-56's "earnings data is transient" decision.
- [earnings-four-state-lookup](../architecture/02-adrs/earnings-four-state-lookup.md) —
  `EarningsLookup` / `CandidateEarnings` unions replace a nullable date and a boolean flag.
- [earnings-tier-before-score](../architecture/02-adrs/earnings-tier-before-score.md) —
  three-tier ranking; score never rescues a tier.
- [unknown-earnings-never-excludes](../architecture/02-adrs/unknown-earnings-never-excludes.md)
  — a data gap is not a risk verdict, in either handling mode.
- **Reuse the Finnhub feed rather than add a screener-specific source.** Massive gates
  earnings behind a paid add-on and Alpaca does not serve it; two fetchers over one
  calendar would drift on cache, quota, and date semantics. See
  [Market Data](../domain/market-data.md).
- **Caller-supplied lookahead.** `EARNINGS_LOOKAHEAD_DAYS = 30` became a `lookaheadDays`
  option. The screener passes `criteria.dteMax + LOOKAHEAD_BUFFER_DAYS`, sized to a full
  quarterly cycle (~90 days on the defaults) — not merely past `dteMax`, because the
  buffer's job is telling `clear` from "we did not look far enough", and earnings are
  quarterly.
- **Cap the fan-out, but keep the `try/catch` inside it.** `mapWithConcurrency` joins with
  `Promise.all`, so it is _less_ forgiving than the bare `Promise.all` it replaced — the
  per-ticker `catch` is the only thing isolating a single 429.

## Contracts touched

- **`screener:results`** — `earningsFlagged: boolean` is **removed** and replaced by
  `earnings: IpcCandidateEarnings` on every ranked candidate. Breaking, not deprecated
  alongside: the old field had exactly one reader, which never rendered it. `ranked` order
  is authoritative — the renderer must not re-sort. An earnings outage surfaces as
  `earnings: { status: 'unavailable' }` per candidate, never as an envelope error and never
  as `status: 'provider_unavailable'`. The handler itself needed no change. See
  [IPC Handlers](../contracts/ipc-handlers.md).
- **`fetchNextEarnings`** (was `fetchNextEarningsDates`) — returns
  `Record<ticker, EarningsLookup>` with an entry for **every** requested ticker, and takes
  a `lookaheadDays` option.
- **`getEarnings(db, tickers, { horizon, now })`** — new read-through store. `horizon` is
  a date, not a day count; the DTE-window conversion happens once, in the screener service.

## Source files

- `src/main/core/screener.ts`
- `src/main/integrations/finnhub-earnings.ts`
- `src/main/integrations/fake-earnings.ts` — offline e2e seam; honours `lookaheadDays` like
  the live calendar so the lookahead-widening test is a real regression test
- `src/main/services/earnings-dates.ts`
- `src/main/services/screener.ts`
- `src/main/services/evaluate-alerts.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/api/screener.ts`
- `src/renderer/src/components/EarningsBadge.tsx`
- `src/renderer/src/components/ScreenerResultsTable.tsx`
- `migrations/013_create_earnings_date.sql`
- `e2e/screener-earnings.spec.ts` — 10 scenarios, one per AC
- `e2e/earnings-format.ts`, `e2e/screener-helpers.ts`

## Related

- [us-56 — Earnings Proximity Alert](./us-56-earnings-proximity-alert.md) — supplies the
  Finnhub feed this story widened; its alert behaviour is unchanged
- [us-65 — Score Wheel Candidates](./us-65-score-wheel-candidates.md) — the engine this
  story's filter and tier sort live in
- [us-66 — Screener Results](./us-66-screener-results.md) — the table that renders the
  badge and the demoted rank cell
- [us-67 — Configure Screening Criteria](./us-67-configure-screening-criteria.md) — the
  persisted `earningsHandling` enum this story reads
- [Market Data](../domain/market-data.md) · [Alerts](../domain/alerts.md) ·
  [`earnings_date`](../schema/tables.md#earnings_date)

## Out of scope

- **BMO/AMC timing and confirmed-vs-estimated flags.** Finnhub's rows carry an `hour`
  field (`bmo` / `amc` / `dmh`) the module strips, and the free tier exposes no
  confirmation flag. Judging an AMC print on expiration Friday as harmless is a real
  refinement but needs a verified live payload behind it.
- Ex-dividend and other corporate-event badges.
- Earnings warnings on already-open positions — that is US-56.
- Earnings badges on watchlist rows — US-96, same source, different surface.

## Known gaps

- **Free-tier forward coverage at ~90 days is unverified.** Finnhub documents no maximum
  `from`/`to` range but does not guarantee free-tier coverage that far out. The live smoke
  check in `plans/us-70/quickstart.md` has not been run (it needs a real API key). A wrong
  answer degrades to the `unknown` caution, which is the correct failure mode, but it
  determines how useful the feature is in practice.
- **A shallow-horizon caller can starve a deep one.** The 30-day alert path re-fetches a
  just-passed date on its short interval and rewrites `checked_at`, re-arming the floor
  before the ~90-day screener path can ask with its wider window. A ticker can therefore
  read "Earnings date unavailable" for up to a week after each print. Direction is
  over-caution only — never a false `clear`.
- **A shallow fetch can clobber a still-future stored date.** A found-past reply
  overwrites a future `next_earnings` while the same call answers from the pre-fetch row
  snapshot, so two consecutive calls over identical data can disagree. Same direction of
  safety.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
