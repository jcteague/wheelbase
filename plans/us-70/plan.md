---
story: us-70
kind: feature
parent: null
topics: [market-data, screener]
status: planned
---

# Implementation Plan: US-70 — Warn when a candidate has earnings within the DTE window

## Summary

Wire the existing Finnhub earnings calendar into the screener so a candidate whose
earnings print lands on or before expiry is either hard-excluded (default) or
flagged and demoted, and so a missing or unreadable earnings date surfaces as a
visible caution rather than a silent pass. Most of the engine-side gate already
shipped with US-65; the work is widening the feed's lookahead, **persisting dates
to SQLite so they survive a restart and are fetched only when missing or stale**,
teaching the stack to distinguish "no earnings" from "couldn't check", demoting
uncertain candidates in the rank, and rendering the badge the US-66 mockup already
specifies. Done means all ten ACs pass end to end and US-56's alert behaviour is
unchanged.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model,
and API contract:

- **User Story & Acceptance Criteria:** `docs/epics/08-stories/US-70-earnings-in-window-warning.md`
- **Research & Design Decisions:** `plans/us-70/research.md`
- **Data Model & Selection Logic:** `plans/us-70/data-model.md`
- **API Contract:** `plans/us-70/contracts/screener-results.md`
- **Quickstart & Verification:** `plans/us-70/quickstart.md`
- **Mockup:** `mockups/us-66-screener-results.mdx` — the `earnings` state and the
  `EarningsBadge` component (line 285)

## Prerequisites

Already shipped; this story builds on all of it:

- `src/main/integrations/finnhub-earnings.ts` — the Finnhub feed, with failure
  classification and per-ticker isolation (US-56)
- `src/main/services/ivr-snapshots.ts` — the read-service shape `earnings-dates.ts`
  should follow
- `src/main/core/screener.ts` — the `earnings_in_window` hard filter, the
  `earningsWithinHolding` date predicate, and `earningsFlagged` on survivors (US-65)
- `src/main/services/screening-criteria.ts` — the persisted `earningsHandling`
  enum (US-67)
- `src/main/concurrency.ts` — `mapWithConcurrency`
- `src/renderer/src/components/ScreenerResultsTable.tsx` — the results table (US-66)

**New:** one migration (`013_create_earnings_date.sql`) and one service
(`earnings-dates.ts`). No new dependencies.

## Implementation Areas

### 1. Earnings feed — parameterised lookahead and a four-state result

**Files to create or modify:**

- `src/main/integrations/finnhub-earnings.ts` — export `EarningsLookup`; rename
  `fetchNextEarningsDates` → `fetchNextEarnings` returning
  `Record<string, EarningsLookup>`; accept `lookaheadDays`; **drop** the 12-hour
  success cache (area 2's table replaces it), keep the failure backoff
- `src/main/integrations/finnhub-earnings.test.ts` — extend

**Red — tests to write** (all in `finnhub-earnings.test.ts`):

- A ticker with an event in the window returns `{ status: 'found', date }`
- An empty `earningsCalendar` array returns `{ status: 'none' }`, **not** a missing key
- A payload whose only rows have null/malformed dates returns `{ status: 'none' }`
- HTTP 429, HTTP 401, and a thrown network error each return
  `{ status: 'unavailable' }` — one case per failure class, asserting the existing
  `failureCode` logging still fires
- An empty API key returns `{ status: 'unavailable' }` for every requested ticker
  (today it returns `{}`)
- Every requested ticker appears in the result map — assert
  `Object.keys(result).length === tickers.length` for a mixed found/none/failed batch
- **`fetchNextEarnings` never rejects** — a batch where one ticker's fetch throws
  resolves, with that ticker `unavailable` and every other ticker's real result
  intact. This is the isolation guard: `mapWithConcurrency` joins with
  `Promise.all`, so a throw escaping the callback would reject the whole batch
  (see the concurrency ADR in `research.md`)
- A rate-limited ticker in a capped batch still writes its negative cache entry —
  an immediate retry does not re-issue the HTTP call
- `lookaheadDays: 50` puts `to` 50 days past `now` in the request URL; the default
  remains 30 when the option is omitted
- The module no longer caches successes — two successive calls for the same ticker
  both issue an HTTP request (freshness is the store's job now, per area 2)
- The 5 min failure TTL still holds: a failed ticker is not re-requested inside the
  window, and **is** re-requested after it

**Green — implementation:**

- Add `export type EarningsLookup` exactly as specified in `data-model.md` §1
- Change `resolveTicker` to return `EarningsLookup`; `fetchCalendar`'s `null`
  becomes `{ status: 'none' }` and the `catch` in the batch wrapper returns
  `{ status: 'unavailable' }`
- Remove the success half of the module cache and its 12-hour TTL; `CacheEntry`
  narrows to failure-backoff only. The `earnings_date` table is now the single
  cache, and its `checked_through` column — not a composite cache key — is what
  keeps US-56's 30-day answer from satisfying a 50-day question
  (`data-model.md` §2)
- Add `lookaheadDays?: number` to the options bag, defaulting to the current
  `EARNINGS_LOOKAHEAD_DAYS = 30`; thread it into `buildRequestUrl`
- Stop filtering the result — return an entry for **every** requested ticker
- Swap the bare `Promise.all` for `mapWithConcurrency`, **keeping the existing
  per-ticker `try/catch` inside the callback**. The helper joins its workers with
  `Promise.all`, so an escaping throw rejects the entire batch — the `catch` is the
  only thing isolating a single 429, and it also owns the negative-cache write and
  the classified `failureCode` log
- Rename the export to `fetchNextEarnings`; the old name returned dates, the new
  one returns verdicts

**Refactor — cleanup to consider:**

- `selectEventDate` now has one caller and returns into a union — check whether the
  `null` sentinel inside it still earns its place or should return the union directly
- `clearEarningsCache` now clears only failure entries — confirm the name still
  describes what it does, or rename it

**Acceptance criteria covered:** "Earnings beyond the alert horizon are still
found"; the feed half of "Outage is distinguishable from a genuinely empty calendar".

---

### 2. Persist earnings dates — migration and store service

**Files to create or modify:**

- `migrations/013_create_earnings_date.sql` — new, per `data-model.md` §2
- `src/main/services/earnings-dates.ts` — new: `getEarnings` (read-through) and
  the private upsert
- `src/main/services/earnings-dates.test.ts` — new

**Red — tests to write:**

- A ticker with no row triggers a fetch, and the successful result is written back
  — a second call with the same horizon issues **no** further fetch
- A row whose `next_earnings` is in the future and inside `checked_through` is
  served from the DB with no fetch
- A row whose `next_earnings` is **earlier than today** triggers a refetch (the
  print has happened)
- A row with `next_earnings IS NULL` and `checked_through >= horizon` is served as
  `{ status: 'none' }` with no fetch
- A row with `next_earnings IS NULL` and `checked_through < horizon` triggers a
  refetch — the 30-day `NULL` must not answer the 50-day question
- A row with `checked_at` older than `STALE_AFTER_DAYS` triggers a refetch even
  when its date is still in the future (the revision backstop)
- A **failed** fetch writes no row — assert the table is unchanged — and returns
  `{ status: 'unavailable' }`
- A failed fetch for one ticker does not prevent the other tickers' successful
  results being written
- `{ status: 'none' }` **does** write a row (`next_earnings` NULL) — that is
  positive knowledge and is what stops the refetch loop
- Upsert overwrites the prior row rather than accumulating (assert one row per
  ticker after two fetches)
- A DB read failure degrades to fetching for every ticker and logs, rather than
  throwing the run away

**Green — implementation:**

- Write the migration exactly as `data-model.md` §2 specifies — `ticker` primary
  key, nullable `next_earnings`, `checked_through`, `checked_at`, `source`
- `getEarnings(db, tickers, { horizon, now })` returns
  `Map<string, EarningsLookup>`: read all rows for the requested tickers, partition
  into fresh (serve from DB) and stale (fetch), call `fetchNextEarnings` for the
  stale set only, upsert the `found`/`none` results in one transaction, and merge
- Implement the four refresh triggers from `data-model.md` §2 as one small named
  predicate — `needsRefresh(row, horizon, now)` — so the rule is testable in
  isolation and readable as a list
- `INSERT … ON CONFLICT (ticker) DO UPDATE` for the upsert; tickers upper-cased on
  the way in, matching `getLatestIvrByUnderlying`
- Follow the `ivr-snapshots.ts` shape: prepared statement at the top, `logger.debug`
  with `{ tickers, dbHits, fetched }`, absent rows meaning "unknown" rather than a
  fabricated value

**Refactor — cleanup to consider:**

- Check the read/fetch/write split reads as three steps, not one long function
- The horizon is a date, not a day count, at this boundary — confirm the conversion
  from `criteria.dteMax` happens once, in the screener service, not here

**Acceptance criteria covered:** None directly — this is the store the service in
area 5 reads through. Its own correctness is covered by the unit tests above.

---

### 3. Keep US-56 green against the new feed shape

**Files to create or modify:**

- `src/main/services/evaluate-alerts.ts` — read through `getEarnings` (the store)
  rather than calling the feed directly
- `src/main/services/evaluate-alerts.test.ts`, `evaluate-alerts.e2e.test.ts` —
  update the `vi.mock` fixtures

**Red — tests to write:**

- Existing earnings-proximity assertions still pass with the mock returning
  `{ status: 'found', date }` instead of a bare string
- A date already in the `earnings_date` table satisfies the alert run with **no**
  HTTP call — the cross-consumer win from persistence, and the case the old
  process-local cache lost on every restart
- A `{ status: 'unavailable' }` entry behaves exactly as a missing ticker did —
  the `EARNINGS_PROXIMITY` rule skips, and every other rule still evaluates
  (the failure-isolation guarantee from the ADR)
- A `{ status: 'none' }` entry likewise skips the rule without error

**Green — implementation:**

- Point `EvaluateAlertsInput.fetchEarnings` at `getEarnings(db, tickers, { horizon,
now })` and widen `earningsDateByTicker: Record<string, string>` to the lookup
  record. US-56 keeps its 30-day horizon — persistence changes where the answer
  comes from, not how far ahead the alert looks
- At the single read site (`evaluate-alerts.ts:127`), map to the nullable date the
  pure rule already takes:
  `lookup?.status === 'found' ? lookup.date : null`
- `fetchOrDegrade`'s fallback stays `{}` — the screener defaults a missing key to
  `unavailable`, and the alert path already treats missing as skip

**Refactor — cleanup to consider:**

- Consider naming the mapped local `earningsDateFor(ticker)` so the alert rule's
  input stays a plain nullable date and the union does not leak into
  `src/main/core/`

**Acceptance criteria covered:** None directly — this is the regression guard that
keeps US-56 whole while its dependency changes.

---

### 4. Engine — `CandidateEarnings`, the filter guard, and tier ranking

**Files to create or modify:**

- `src/main/core/screener.ts` — `CandidateEarnings`; `TickerScreeningInput.earnings`
  and `FilterInput.earnings`; the `earnings_in_window` `applies` guard;
  `earningsTier`; `rankCandidates`
- `src/main/core/screener.test.ts` — extend

**Red — tests to write** (all in `src/main/core/screener.test.ts`):

- `evaluateFilters` with `{ status: 'found' }` in-window and
  `earningsHandling: 'exclude'` returns the `earnings_in_window` failure with reason
  `earnings 2026-07-31 falls on or before expiry`
- Earnings **on** the expiration date excludes (boundary, inclusive)
- Earnings dated **before today** does not exclude — it is history, not gap risk
  (guards the existing `startOfDay` lower bound)
- `{ status: 'found' }` after expiry yields `{ status: 'clear' }` and no exclusion
- `{ status: 'none' }` never excludes under `exclude` mode and yields
  `{ status: 'unknown' }` on the survivor
- `{ status: 'unavailable' }` never excludes under `exclude` mode and yields
  `{ status: 'unavailable' }` on the survivor
- `flag` mode with an in-window date yields
  `{ status: 'flagged', date, daysBeforeExpiry }` and no exclusion; assert
  `daysBeforeExpiry === 21` for the story's Jul 31 → Aug 21 case
- `rankCandidates` orders the story's four-candidate fixture as KO, MSFT, NVDA,
  AAPL — proving tier beats score (NVDA's 0.69 sits below MSFT's 0.50)
- `rankCandidates` orders `unknown` and `unavailable` into the same tier, sorted
  by `yieldPerDelta` between themselves
- Within one tier, the existing yield-per-delta and ticker tie-breaks are unchanged

**Green — implementation:**

- Add `export type CandidateEarnings` per `data-model.md` §2; replace
  `ScoredCandidate.earningsFlagged: boolean` with `earnings: CandidateEarnings`
- Widen `TickerScreeningInput.earningsDate` and `FilterInput.earningsDate` to
  `earnings: EarningsLookup`
- Change the `earnings_in_window` entry's `applies` to
  `criteria.earningsHandling === 'exclude' && ctx.earnings.status === 'found'`;
  `test` and `reason` read `ctx.earnings.date`. Leave the filter's position in the
  `FILTERS` registry alone — its order is load-bearing for US-66's representative
  reason
- Add a `candidateEarnings(...)` helper deriving `CandidateEarnings` from the
  lookup, the handling mode, the expiry, and `currentDate`, using the existing
  `earningsWithinHolding` predicate and `differenceInCalendarDays` from `date-fns`
- Add `earningsTier(candidate): 0 | 1 | 2` and prepend it to `rankCandidates`'s
  comparator chain, before `compareYieldPerDelta`
- `scoreCandidate`'s `earningsFlagged = false` default parameter becomes
  `earnings: CandidateEarnings = { status: 'clear' }`
- The engine keeps importing nothing from `integrations/`, `db/`, or `logger`

**Refactor — cleanup to consider:**

- `earningsWithinHolding` is now called from both the filter and the derivation
  helper — confirm one shared call site rather than two parallel date computations
- Check the `FILTERS` comment block still describes the funnel accurately

**Acceptance criteria covered:** "Exclude a candidate with earnings before
expiration"; "Earnings on the expiration date is in the window"; "Flag a candidate
… when flag mode is on"; "No warning when earnings fall after expiration";
"Ranking demotes by earnings certainty, then score"; "Unknown earnings never
hard-excludes, even in exclude mode".

---

### 5. Service — read earnings through the store and degrade per ticker

**Files to create or modify:**

- `src/main/services/screener.ts` — replace the `earningsDate: null` stub at
  line 150 with a `getEarnings` read; add `readEarnings`
- `src/main/services/screener.test.ts` — extend

**Red — tests to write** (all in `src/main/services/screener.test.ts`, against a
real in-memory DB with the feed stubbed):

- The screened candidate carries the earnings status the store returned, replacing
  the current always-`null` behaviour
- The store is asked for a horizon `>= criteria.dteMax` days out, for both the
  default 30–45 window and a custom one
- A second screen run with dates already stored issues **no** HTTP call and
  produces identical results — the persistence payoff, asserted end to end
- A store call that **rejects** wholesale leaves every candidate
  `{ status: 'unavailable' }`, and the run still returns `status: 'ok'` with the
  full ranked list — no candidate excluded, nothing suppressed
- A store returning entries for only some tickers defaults the rest to
  `{ status: 'unavailable' }`
- A ticker whose fetch failed and a ticker with an empty calendar produce
  `unavailable` and `unknown` respectively in the same run
- The earnings feed is queried only for tickers whose chain pull succeeded
  (`screenable`), not for every watchlist row
- Existing exclusion, ranking, and `provider_unavailable` tests are unaffected

**Green — implementation:**

- Add `readEarnings(db, tickers, criteria, currentDate)` beside the existing
  `readIvRanks` / `readUnderlyingPrices` boundary helpers, wrapping `getEarnings`
  in `try/catch` and degrading to an empty map with a
  `screener_earnings_read_failed` warn — the same shape `readIvRanks` already uses
- Convert the DTE window to a horizon **date** here (`addDays(currentDate,
criteria.dteMax + LOOKAHEAD_BUFFER_DAYS)`) — the store takes a date, not a day
  count, and this is the one place the conversion happens
- Add `earnings: Map<string, EarningsLookup>` to `ScreenContext`; in `screenChain`
  pass `ctx.earnings.get(chain.ticker) ?? { status: 'unavailable' }`
- Add a DEBUG log of the per-ticker earnings status alongside the existing
  `screen_ticker_outcome` line
- Add the earnings fetch to the boundary reads already awaited for `ctx`

**Refactor — cleanup to consider:**

- `readIvRanks`, `readUnderlyingPrices`, and `readEarnings` now share a
  degrade-and-log shape — check whether that is genuinely one concept worth naming
  or three different failure semantics that only look alike
- Verify the ADR's failure-isolation rule end to end: no boundary read can reject
  the run

**Acceptance criteria covered:** "Earnings-calendar outage does not suppress other
results"; "Outage is distinguishable from a genuinely empty calendar"; "Unknown
earnings date surfaces a caution".

---

### 6. IPC and renderer type surface

**Files to create or modify:**

- `src/preload/index.d.ts` — `IpcCandidateEarnings`; replace `earningsFlagged` on
  `IpcScoredCandidate`
- `src/renderer/src/api/screener.ts` — mirror as `ScreenerCandidateEarnings`
- `src/main/ipc/screener.test.ts`, `src/renderer/src/api/screener.test.ts` — extend

**Red — tests to write:**

- `src/main/ipc/screener.test.ts`: the `screener:results` success payload carries
  `earnings` on each ranked candidate and no `earningsFlagged` key
- `src/renderer/src/api/screener.test.ts`: the adapter passes each earnings status
  through unchanged and preserves the service's array order

**Green — implementation:**

- Add `IpcCandidateEarnings` to `src/preload/index.d.ts` per
  `contracts/screener-results.md`, replacing the `earningsFlagged` line and its
  "not rendered until US-70" comment
- Mirror it in `src/renderer/src/api/screener.ts` as `ScreenerCandidateEarnings`
- `src/main/ipc/screener.ts` needs **no change** — the handler stays a thin
  `handleIpcCall` over one service call, per the architecture rule

**Refactor — cleanup to consider:**

- Grep for any remaining `earningsFlagged` in `src/` — the quickstart's passing
  criteria require zero occurrences

**Acceptance criteria covered:** None directly — this is the transport for areas 5
and 7.

---

### 7. Renderer — earnings badge and demoted rank cell

**Files to create or modify:**

- `src/renderer/src/components/EarningsBadge.tsx` — new
- `src/renderer/src/components/EarningsBadge.test.tsx` — new
- `src/renderer/src/components/ScreenerResultsTable.tsx` — render the badge, and
  `—` in the rank cell for demoted rows
- `src/renderer/src/components/ScreenerResultsTable.test.tsx` — extend

**Red — tests to write:**

- `EarningsBadge.test.tsx`: `flagged` renders `⚠ Earnings Jul 31 · 21d before expiry`
  from `{ date: '2026-07-31', daysBeforeExpiry: 21 }`, using gold tokens
- `EarningsBadge.test.tsx`: `unknown` renders `? Earnings date unknown` in the
  neutral treatment; `unavailable` renders `? Earnings date unavailable` in the
  same treatment
- `EarningsBadge.test.tsx`: `clear` renders nothing
- `ScreenerResultsTable.test.tsx`: a `clear` row shows its numeric rank; `flagged`,
  `unknown`, and `unavailable` rows show `—` instead
- `ScreenerResultsTable.test.tsx`: the badge appears under the ticker cell, in the
  same cell as the ticker symbol, not as its own column
- `ScreenerResultsTable.test.tsx`: rows render in the order given — the table never
  re-sorts

**Green — implementation:**

- Build `EarningsBadge` from `mockups/us-66-screener-results.mdx:285`: a pill
  (`inline-flex`, `rounded-full`, mono, ~0.58rem, bold, `whitespace-nowrap`),
  gold for `flagged` (`bg-wb-gold-dim`, `border-wb-gold-border`, `text-wb-gold`)
  and neutral for `unknown`/`unavailable` (muted surface and border,
  `text-wb-text-secondary`). Tailwind `wb-*` tokens only — no inline styles for
  colour or spacing
- Format the date with the existing `fmtDate` (`MMM d`) from
  `src/renderer/src/lib/format.ts`, the same helper the Exp column uses — do not
  recompute `daysBeforeExpiry` in the renderer, it arrives on the payload
- In `ScreenerResultsTable`'s `CandidateRow`, render the badge beneath the ticker
  symbol in a `flex flex-col gap-1` cell, matching the mockup's ticker cell
- Replace the unconditional rank pill with `—` (`text-wb-text-muted`) when
  `candidate.earnings.status !== 'clear'`, mirroring the mockup's `rank: null` rows
- Keep the existing `data-testid={'screener-row-' + ticker}` hooks intact for e2e

**Refactor — cleanup to consider:**

- The `title={score}` tooltip currently hangs off the rank pill — decide where it
  goes on a demoted row rather than dropping it silently
- Check the badge's status→presentation mapping reads as a table, not a chain of
  ternaries

**Acceptance criteria covered:** "Flag a candidate … warning"; "Unknown earnings
date surfaces a caution"; the rendering half of "Earnings-calendar outage does not
suppress other results" and "Ranking demotes by earnings certainty".

---

### 8. E2e Tests

**Files to create or modify:**

- `e2e/screener-earnings.spec.ts` — new

**Red — tests to write** — one test per AC, named to mirror the scenario:

1. `excludes a candidate with earnings before expiration by default` — AAPL
   earnings 2026-07-31, expiry 2026-08-21, handling `exclude`; AAPL appears in the
   Excluded section with reason `earnings 2026-07-31 falls on or before expiry`
2. `flags a candidate with earnings before expiration when flag mode is on` — same
   data, handling `flag`; the AAPL row is present and shows
   `⚠ Earnings Jul 31 · 21d before expiry`
3. `ranks by earnings certainty before score` — the four-candidate fixture renders
   in order KO, MSFT, NVDA, AAPL; KO and MSFT show ranks 1 and 2, NVDA and AAPL
   show `—`
4. `treats earnings on the expiration date as in the window` — earnings 2026-08-21,
   expiry 2026-08-21, handling `exclude`; candidate is excluded
5. `shows no earnings warning when earnings fall after expiration` — earnings
   2026-09-05, expiry 2026-08-21; the row has no earnings badge
6. `finds earnings beyond the alert horizon` — earnings 37 days out with a 30–45
   DTE window; the candidate is flagged, **not** reported unknown (the regression
   test for the 30-day lookahead defect)
7. `shows a caution when the earnings date is unknown` — empty calendar for XYZ;
   the row renders `? Earnings date unknown`
8. `does not exclude an unknown earnings date in exclude mode` — empty calendar,
   handling `exclude`; XYZ is still ranked, absent from Excluded, and demoted below
   every clear candidate
9. `keeps scoring and ranking when the earnings calendar is unreachable` — the feed
   rejects; all candidates still render, each with `? Earnings date unavailable`,
   none excluded
10. `distinguishes an outage from a genuinely empty calendar` — XYZ empty, ABC
    failed, in one run; XYZ reads `? Earnings date unknown` and ABC reads
    `? Earnings date unavailable`

**Green — implementation:**

- Stub the Finnhub HTTP call at the main-process boundary for the packaged app,
  following the fake-provider pattern the existing screener e2e specs use for
  Massive; do not hit the live API from e2e
- Seed the watchlist and the persisted `earningsHandling` criterion per scenario
- Drive through the Screener page as a trader would — no direct IPC calls

**Refactor — cleanup to consider:**

- Factor the per-scenario fixture (watchlist + chain + earnings stub) into one
  builder so each test states only what it varies

**Acceptance criteria covered:** All ten.

---

## AC Audit

| #   | Scenario                                                      | E2e test |
| --- | ------------------------------------------------------------- | -------- |
| 1   | Exclude a candidate with earnings before expiration (default) | 8.1      |
| 2   | Flag a candidate with earnings before expiration in flag mode | 8.2      |
| 3   | Ranking demotes by earnings certainty, then score             | 8.3      |
| 4   | Earnings on the expiration date is in the window              | 8.4      |
| 5   | No warning when earnings fall after expiration                | 8.5      |
| 6   | Earnings beyond the alert horizon are still found             | 8.6      |
| 7   | Unknown earnings date surfaces a caution, not a silent pass   | 8.7      |
| 8   | Unknown earnings never hard-excludes, even in exclude mode    | 8.8      |
| 9   | Earnings-calendar outage does not suppress other results      | 8.9      |
| 10  | Outage is distinguishable from a genuinely empty calendar     | 8.10     |

All ten ACs covered; no gaps.
