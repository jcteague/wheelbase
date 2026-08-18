# US-70 — Warn when a candidate has earnings within the DTE window — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- **Refactor tasks must be run in the main conversation** — subagents cannot invoke the `/refactor` skill

---

## Layer 1 — Feed (no dependencies)

> Start immediately. Everything else depends on `EarningsLookup` existing.

### Area 1 — Earnings feed: parameterised lookahead + four-state result

- [x] **[Red]** Write failing tests — `src/main/integrations/finnhub-earnings.test.ts`
  - Event in window → `{ status: 'found', date }`
  - Empty `earningsCalendar` → `{ status: 'none' }`, **not** a missing key
  - Rows with only null/malformed dates → `{ status: 'none' }`
  - HTTP 429 / HTTP 401 / thrown network error → `{ status: 'unavailable' }`, one case per failure class, `failureCode` logging still fires
  - Empty API key → `{ status: 'unavailable' }` for every requested ticker (today returns `{}`)
  - Every requested ticker present: `Object.keys(result).length === tickers.length` on a mixed found/none/failed batch
  - **Never rejects** — one ticker throwing resolves the batch with that ticker `unavailable` and all others intact (isolation guard: `mapWithConcurrency` joins with `Promise.all`)
  - Rate-limited ticker still writes its negative cache entry — immediate retry issues no HTTP call
  - `lookaheadDays: 50` puts `to` 50 days past `now` in the URL; default stays 30
  - No success caching — two successive calls for one ticker both issue an HTTP request
  - 5 min failure TTL holds inside the window, re-requests after it
  - Run `pnpm vitest run src/main/integrations/finnhub-earnings.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/finnhub-earnings.ts` _(depends on: Area 1 Red ✓)_
  - `export type EarningsLookup = { status: 'found'; date: string } | { status: 'none' } | { status: 'unavailable' }` (`data-model.md` §1)
  - Rename `fetchNextEarningsDates` → `fetchNextEarnings`, returning `Record<string, EarningsLookup>`
  - `resolveTicker` returns the union; `fetchCalendar`'s `null` → `{ status: 'none' }`; batch `catch` → `{ status: 'unavailable' }`
  - **Delete the 12 h success cache**; `CacheEntry` narrows to failure-backoff only
  - Add `lookaheadDays?: number` (default 30) threaded into `buildRequestUrl`
  - Return an entry for **every** requested ticker — stop filtering
  - Swap bare `Promise.all` → `mapWithConcurrency`, **keeping the per-ticker `try/catch` inside the callback** (it owns isolation, the negative-cache write, and the `failureCode` log)
  - Run `pnpm vitest run src/main/integrations/finnhub-earnings.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/finnhub-earnings.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: does `selectEventDate`'s `null` sentinel still earn its place, or should it return the union? Does `clearEarningsCache` still describe what it does now that it clears only failures?
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Persistence + Engine (parallel, after Area 1 Green)

> Area 2 needs `fetchNextEarnings`; Area 4 needs only the `EarningsLookup` type. They do not touch each other.

### Area 2 — Persist earnings dates: migration + store service

**Requires:** Area 1 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/earnings-dates.test.ts` _(depends on: Area 1 Green ✓)_
  - Write `migrations/013_create_earnings_date.sql` first — the test harness builds its schema from `migrations/`, so the table must exist for tests to reach their assertions. Schema per `data-model.md` §2 (`ticker` PK, nullable `next_earnings`, `checked_through`, `checked_at`, `source`)
  - No row → fetches, writes back; second call at the same horizon issues **no** further fetch
  - Row with future `next_earnings` inside `checked_through` → served from DB, no fetch
  - Row with `next_earnings` earlier than today → refetch (the print has happened)
  - Row with `next_earnings IS NULL` and `checked_through >= horizon` → `{ status: 'none' }`, no fetch
  - Row with `next_earnings IS NULL` and `checked_through < horizon` → refetch (a 30-day `NULL` must not answer a 50-day question)
  - Row with `checked_at` older than `STALE_AFTER_DAYS` (7) → refetch even with a future date (revision backstop)
  - Failed fetch writes **no** row (assert table unchanged) and returns `{ status: 'unavailable' }`
  - One ticker's failure does not block the others' successful writes
  - `{ status: 'none' }` **does** write a row — positive knowledge, and what stops the refetch loop
  - Upsert overwrites rather than accumulating — one row per ticker after two fetches
  - DB read failure degrades to fetching for every ticker and logs, rather than throwing the run away
  - Run `pnpm vitest run src/main/services/earnings-dates.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/earnings-dates.ts` _(depends on: Area 2 Red ✓)_
  - `getEarnings(db, tickers, { horizon, now }): Promise<Map<string, EarningsLookup>>` — read rows, partition fresh vs stale, fetch only the stale set, upsert `found`/`none` in one transaction, merge
  - `needsRefresh(row, horizon, now)` as a small named predicate implementing the four triggers from `data-model.md` §2, testable in isolation
  - `INSERT … ON CONFLICT (ticker) DO UPDATE`; tickers upper-cased on the way in, matching `getLatestIvrByUnderlying`
  - Follow the `ivr-snapshots.ts` shape: prepared statement at top, `logger.debug({ tickers, dbHits, fetched })`, absent rows mean unknown — never a fabricated value
  - Run `pnpm vitest run src/main/services/earnings-dates.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/earnings-dates.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: does read/fetch/write read as three steps? Is the horizon-date conversion kept out of this module (it belongs in Area 5)?
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 4 — Engine: `CandidateEarnings`, filter guard, tier ranking

**Requires:** Area 1 Green ✓ (for the `EarningsLookup` type only)

- [x] **[Red]** Write failing tests — `src/main/core/screener.test.ts` _(depends on: Area 1 Green ✓)_
  - `evaluateFilters` with in-window `{ status: 'found' }` + `exclude` → `earnings_in_window` failure, reason `earnings 2026-07-31 falls on or before expiry`
  - Earnings **on** the expiration date excludes (inclusive boundary)
  - Earnings dated before today does **not** exclude — history, not gap risk (guards the `startOfDay` lower bound)
  - `found` after expiry → `{ status: 'clear' }`, no exclusion
  - `{ status: 'none' }` never excludes under `exclude`; survivor carries `{ status: 'unknown' }`
  - `{ status: 'unavailable' }` never excludes under `exclude`; survivor carries `{ status: 'unavailable' }`
  - `flag` mode + in-window → `{ status: 'flagged', date, daysBeforeExpiry }`; assert `daysBeforeExpiry === 21` for Jul 31 → Aug 21
  - `rankCandidates` orders the four-candidate fixture KO, MSFT, NVDA, AAPL — tier beats score (NVDA 0.69 below MSFT 0.50)
  - `unknown` and `unavailable` share tier 1, sorted by `yieldPerDelta` between themselves
  - Within a tier, existing yield-per-delta and ticker tie-breaks unchanged
  - Run `pnpm vitest run src/main/core/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/screener.ts` _(depends on: Area 4 Red ✓)_
  - `export type CandidateEarnings` per `data-model.md` §3; replace `ScoredCandidate.earningsFlagged: boolean` with `earnings: CandidateEarnings`
  - Widen `TickerScreeningInput.earningsDate` and `FilterInput.earningsDate` → `earnings: EarningsLookup`
  - `earnings_in_window` `applies` becomes `criteria.earningsHandling === 'exclude' && ctx.earnings.status === 'found'`; leave its position in the `FILTERS` registry alone (order is load-bearing for US-66's representative reason)
  - `candidateEarnings(...)` helper deriving the union from lookup + handling + expiry + `currentDate`, reusing `earningsWithinHolding` and `differenceInCalendarDays`
  - `earningsTier(candidate): 0 | 1 | 2`, prepended to `rankCandidates`'s comparator before `compareYieldPerDelta`
  - `scoreCandidate`'s `earningsFlagged = false` default → `earnings: CandidateEarnings = { status: 'clear' }`
  - **Engine stays pure** — no imports from `integrations/`, `db/`, or `logger`
  - Run `pnpm vitest run src/main/core/screener.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/screener.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: is `earningsWithinHolding` called once and shared between the filter and the derivation helper, not computed twice? Does the `FILTERS` comment block still describe the funnel accurately?
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Consumers (parallel, after Layer 2)

> Area 3 needs the store; Area 5 needs store + engine; Area 6 needs the engine's output type.

### Area 3 — Keep US-56 green against the new feed shape

**Requires:** Area 2 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/evaluate-alerts.test.ts`, `evaluate-alerts.e2e.test.ts` _(depends on: Area 2 Green ✓)_
  - Existing earnings-proximity assertions pass with the mock returning `{ status: 'found', date }` instead of a bare string
  - A date already in `earnings_date` satisfies the alert run with **no** HTTP call — the cross-consumer win from persistence
  - `{ status: 'unavailable' }` behaves as a missing ticker did: `EARNINGS_PROXIMITY` skips, every other rule still evaluates (failure-isolation ADR)
  - `{ status: 'none' }` likewise skips the rule without error
  - Run `pnpm vitest run src/main/services/evaluate-alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/evaluate-alerts.ts` _(depends on: Area 3 Red ✓)_
  - Point `EvaluateAlertsInput.fetchEarnings` at `getEarnings(db, tickers, { horizon, now })`; widen `earningsDateByTicker: Record<string, string>` to the lookup record. US-56 keeps its 30-day horizon
  - At the single read site (`evaluate-alerts.ts:127`) map to the nullable date the pure rule takes: `lookup?.status === 'found' ? lookup.date : null`
  - `fetchOrDegrade`'s fallback stays `{}` — the alert path already treats missing as skip
  - Run `pnpm vitest run src/main/services/evaluate-alerts.test.ts src/main/services/evaluate-alerts.e2e.test.ts` — all tests must pass, **with no assertions weakened**
- [x] **[Refactor]** `/refactor` — `src/main/services/evaluate-alerts.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: name the mapped local `earningsDateFor(ticker)` so the union does not leak into `src/main/core/`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 5 — Screener service: read through the store, degrade per ticker

**Requires:** Area 2 Green ✓ **and** Area 4 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/screener.test.ts` _(depends on: Area 2 Green ✓, Area 4 Green ✓)_
  - Against a real in-memory DB with the feed stubbed
  - Screened candidate carries the status the store returned, replacing always-`null`
  - Store asked for a horizon `>= criteria.dteMax` days out, for the default 30–45 window and a custom one
  - A second screen run with dates already stored issues **no** HTTP call and produces identical results
  - A store call that rejects wholesale leaves every candidate `{ status: 'unavailable' }`; run still returns `status: 'ok'` with the full ranked list — nothing excluded, nothing suppressed
  - A store returning only some tickers defaults the rest to `{ status: 'unavailable' }`
  - A failed ticker and an empty-calendar ticker produce `unavailable` and `unknown` in the same run
  - Earnings queried only for tickers whose chain pull succeeded (`screenable`), not every watchlist row
  - Existing exclusion, ranking, and `provider_unavailable` tests unaffected
  - Run `pnpm vitest run src/main/services/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/screener.ts` _(depends on: Area 5 Red ✓)_
  - Replace the `earningsDate: null` stub at line 150 with a store read
  - `readEarnings(db, tickers, criteria, currentDate)` beside `readIvRanks` / `readUnderlyingPrices`, wrapping `getEarnings` in `try/catch`, degrading to an empty map with a `screener_earnings_read_failed` warn
  - Convert the DTE window to a horizon **date** here — `addDays(currentDate, criteria.dteMax + LOOKAHEAD_BUFFER_DAYS)`; this is the one place the conversion happens
  - Add `earnings: Map<string, EarningsLookup>` to `ScreenContext`; `screenChain` passes `ctx.earnings.get(chain.ticker) ?? { status: 'unavailable' }`
  - DEBUG log of per-ticker earnings status alongside `screen_ticker_outcome`
  - Run `pnpm vitest run src/main/services/screener.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/screener.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: `readIvRanks` / `readUnderlyingPrices` / `readEarnings` now share a degrade-and-log shape — is that one concept worth naming, or three failure semantics that only look alike? Verify no boundary read can reject the run
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 6 — IPC and renderer type surface

**Requires:** Area 4 Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/screener.test.ts`, `src/renderer/src/api/screener.test.ts` _(depends on: Area 4 Green ✓)_
  - `screener:results` success payload carries `earnings` on each ranked candidate and **no** `earningsFlagged` key
  - The renderer adapter passes each earnings status through unchanged and preserves the service's array order
  - Run `pnpm vitest run src/main/ipc/screener.test.ts src/renderer/src/api/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/preload/index.d.ts`, `src/renderer/src/api/screener.ts` _(depends on: Area 6 Red ✓)_
  - Add `IpcCandidateEarnings` per `contracts/screener-results.md`, replacing the `earningsFlagged` line and its "not rendered until US-70" comment
  - Mirror as `ScreenerCandidateEarnings` in the renderer API adapter
  - `src/main/ipc/screener.ts` needs **no change** — the handler stays a thin `handleIpcCall` over one service call
  - Run `pnpm vitest run src/main/ipc/screener.test.ts src/renderer/src/api/screener.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Grep for any remaining `earningsFlagged` in `src/` — must be zero
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Renderer (after Area 6)

### Area 7 — Earnings badge and demoted rank cell

**Requires:** Area 6 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/EarningsBadge.test.tsx`, `ScreenerResultsTable.test.tsx` _(depends on: Area 6 Green ✓)_
  - `flagged` renders `⚠ Earnings Jul 31 · 21d before expiry` from `{ date: '2026-07-31', daysBeforeExpiry: 21 }`, gold tokens
  - `unknown` renders `? Earnings date unknown`, neutral treatment
  - `unavailable` renders `? Earnings date unavailable`, same neutral treatment
  - `clear` renders nothing
  - Table: a `clear` row shows its numeric rank; `flagged` / `unknown` / `unavailable` rows show `—`
  - Badge appears under the ticker symbol in the same cell, not as its own column
  - Rows render in the order given — the table never re-sorts
  - Run `pnpm vitest run src/renderer/src/components/EarningsBadge.test.tsx src/renderer/src/components/ScreenerResultsTable.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/EarningsBadge.tsx`, `ScreenerResultsTable.tsx` _(depends on: Area 7 Red ✓)_
  - `EarningsBadge` from `mockups/us-66-screener-results.mdx:285`: pill (`inline-flex`, `rounded-full`, mono, ~0.58rem, bold, `whitespace-nowrap`), gold for `flagged` (`bg-wb-gold-dim`, `border-wb-gold-border`, `text-wb-gold`), neutral for `unknown`/`unavailable` (muted surface/border, `text-wb-text-secondary`)
  - **Tailwind `wb-*` tokens only** — no inline styles for colour or spacing
  - Format the date with the existing `fmtDate` (`MMM d`); do **not** recompute `daysBeforeExpiry` — it arrives on the payload
  - In `CandidateRow`, render the badge beneath the ticker in a `flex flex-col gap-1` cell
  - Rank pill → `—` (`text-wb-text-muted`) when `candidate.earnings.status !== 'clear'`
  - Keep the `data-testid={'screener-row-' + ticker}` hooks intact for e2e
  - Run `pnpm vitest run src/renderer/src/components/` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/EarningsBadge.tsx` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: where does the `title={score}` tooltip go on a demoted row? Does the status→presentation mapping read as a table rather than a ternary chain?
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — E2E Tests

**Requires:** All Green tasks from Layers 1–4 ✓

### Area 8 — E2E

- [x] **[Red]** Write failing e2e tests — `e2e/screener-earnings.spec.ts` _(depends on: all Green tasks ✓)_
  - Stub the Finnhub HTTP call at the main-process boundary, following the fake-provider pattern the existing screener e2e specs use for Massive — **do not hit the live API**
  - Seed the watchlist and the persisted `earningsHandling` criterion per scenario
  - Drive through the Screener page as a trader would — no direct IPC calls
  - AC coverage — one `it()` per AC, names mirroring the scenario:
    - AC-1: Exclude a candidate with earnings before expiration (default) → `it('excludes a candidate with earnings before expiration by default')`
    - AC-2: Flag a candidate with earnings before expiration when flag mode is on → `it('flags a candidate with earnings before expiration when flag mode is on')`
    - AC-3: Ranking demotes by earnings certainty, then score → `it('ranks by earnings certainty before score')`
    - AC-4: Earnings on the expiration date is in the window → `it('treats earnings on the expiration date as in the window')`
    - AC-5: No warning when earnings fall after expiration → `it('shows no earnings warning when earnings fall after expiration')`
    - AC-6: Earnings beyond the alert horizon are still found → `it('finds earnings beyond the alert horizon')`
    - AC-7: Unknown earnings date surfaces a caution, not a silent pass → `it('shows a caution when the earnings date is unknown')`
    - AC-8: Unknown earnings never hard-excludes, even in exclude mode → `it('does not exclude an unknown earnings date in exclude mode')`
    - AC-9: Earnings-calendar outage does not suppress other results → `it('keeps scoring and ranking when the earnings calendar is unreachable')`
    - AC-10: Outage is distinguishable from a genuinely empty calendar → `it('distinguishes an outage from a genuinely empty calendar')`
  - Run `pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: Area 8 Red ✓)_
  - Run `pnpm test:e2e` — all tests must pass
  - If Electron hangs on `waiting for event 'window'`, the native module is on the wrong ABI: `npx electron-rebuild -f -w better-sqlite3`, then retry
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: factor the per-scenario fixture (watchlist + chain + earnings stub) into one builder so each test states only what it varies

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover all ten ACs
- [x] No occurrence of `earningsFlagged` remains anywhere in `src/`
- [x] `src/main/core/screener.ts` still imports nothing from `integrations/`, `db/`, or `logger`
- [x] US-56 alert tests pass with no assertions weakened
- [ ] Live smoke check run once (`quickstart.md`) — confirm Finnhub free tier returns events ~50 days out
- [x] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
