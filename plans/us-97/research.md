# Research: US-97 — Collect IVR snapshots for watchlist underlyings

## Story

`docs/epics/08-stories/US-97-collect-ivr-for-watchlist-underlyings.md`

## Current state (verified against `src/`, 2026-08-29)

- `src/main/services/ivr-collector.ts` derives its batch from `ACTIVE_UNDERLYINGS_QUERY`
  (`SELECT ticker FROM positions WHERE status != 'CLOSED'`), then `listActiveUnderlyings`
  upper-cases, de-duplicates via `Set`, and sorts with `localeCompare`. Everything after the
  target list (1s spacing, `not_available` → skipped + INFO, other statuses → error + WARN,
  same-UTC-day overwrite in `persistSnapshot`) is target-agnostic.
- `watchlist.ticker` is `TEXT PRIMARY KEY` (`migrations/012_create_watchlist.sql`);
  `addWatchlistEntry` in `src/main/services/watchlist.ts` normalises with
  `ticker.trim().toUpperCase()` before insert.
- `ivr:collect-now` (`src/main/ipc/ivr.ts`) calls `scheduler.runNow(IVR_COLLECT_JOB_NAME)`,
  so the manual and scheduled paths share one code path — the manual-trigger AC needs no
  separate change.
- Read side: `getLatestIvrByUnderlying` (`src/main/services/ivr-snapshots.ts`) returns the
  newest row per ticker regardless of age; the screener service joins it onto watchlist
  candidates (`readIvRanks` in `src/main/services/screener.ts`).
- `iv_rank_floor` (`src/main/core/screener.ts`, US-67) applies only when `ctx.ivRank !== null`.
  Today a watchlist-only ticker always has `null`, so the floor can never exclude it. After this
  story a thin-IVR bench name **will** be excluded when the floor is on. Deliberate; covered by
  a new AC.
- The e2e screener harness (`seedIvr` in `e2e/screener-helpers.ts`) works around the gap by
  seeding a **throwaway active CSP per ticker** so the collector will pick it up. That
  workaround becomes dead weight once this story lands.
- `SettingsPage.tsx` "Refresh IVR now" button has **no pending state** — it is not disabled
  while `collectIvrNow` is in flight, and `scheduler.runNow` has no overlap guard. Two clicks
  during a long run start two concurrent collections. Pre-existing, but the run gets ~1s longer
  per watchlist name, so it becomes materially easier to hit.
- Unit test `selects distinct active-position tickers only and spaces requests by at least 1
second` (`ivr-collector.test.ts:102`) asserts the old target rule by name.
- `src/main/test-utils.ts` already exports `makeTestDb` (runs all migrations, so `watchlist`
  exists), `seedWatchlist(db, tickers)`, and `seedIvr(db, rows)`.

## Unknowns

None requiring external research — no new dependency, migration, provider, or library. All
questions were answered by reading the source above.

## Architecture Decisions

### ADR: IVR collection targets are the union of open positions and the watchlist

- **Decision:** Replace `ACTIVE_UNDERLYINGS_QUERY` with
  `SELECT ticker FROM positions WHERE status != 'CLOSED' UNION SELECT ticker FROM watchlist`.
  The existing `Set`/`toUpperCase()`/sort normalisation stays and is what guarantees a ticker
  that is both held and watchlisted is fetched exactly once (SQL `UNION` de-duplicates
  case-sensitively; the `Set` after upper-casing closes the `spy`/`SPY` gap).
  This **supersedes** the US-44 ADR "IVR collection targets come from active positions"
  (`docs/spec/architecture/02-adrs/active-ivr-targets-from-positions.md`) — mark that ADR
  superseded when the spec is updated.
- **Why:** One query, one loop, one set of counters. The collector's rate limiting, failure
  isolation, and overwrite semantics are all downstream of the target list, so widening the
  list is the entire change. `UNION` (not `UNION ALL`) keeps the row set small before the
  in-memory `Set`.
- **Alternatives considered:**
  - _Second collection pass over the watchlist_ — rejected: doubles the loop, splits the
    counters, and needs its own dedupe against the first pass.
  - _Reuse `listWatchlist()` + `listPositions()` in TypeScript and merge_ — rejected for the
    same reason US-44 rejected `listPositions()`: those compute renderer-facing fields the
    collector does not need, and a single SQL statement is simpler to test.

### ADR: Minimal pending state on "Refresh IVR now"

- **Decision:** Disable the Settings "Refresh IVR now" button while `collectIvrNow.isPending`
  and swap its label to `Refreshing IVR…`. Nothing else — no progress bar, no per-ticker
  feedback.
- **Why:** The story's Technical Notes ask to _confirm_ the existing affordance shows a pending
  state; it does not. A watchlist-length run is now the case where a human is waiting, and
  `scheduler.runNow` does not guard against overlapping runs, so a double-click launches two
  concurrent Barchart batches. Disabling the button is the smallest change that closes both
  gaps and is the existing shadcn/TanStack idiom elsewhere in the page.
- **Alternatives considered:**
  - _Do nothing (out of scope: "no renderer surface")_ — rejected: the story explicitly names
    the manual-trigger wait as a thing to check, and the check found a gap. Flagged in the plan
    report so the user can strike this area if they disagree.
  - _Add an in-flight guard to `scheduler.runNow`_ — rejected: broader than the story; a
    scheduler-level change affects every job and deserves its own story.

### ADR: E2E harness drops the throwaway-position workaround

- **Decision:** `seedIvr` in `e2e/screener-helpers.ts` stops calling `seedActivePosition`;
  the tickers it seeds are already on the watchlist via `seedWatchlist`, so the collector now
  reaches them directly. Export a shared watchlist-seeding helper (move `seedWatchlist` to
  `e2e/ivr-helpers.ts` or export it from `screener-helpers.ts`) so the new US-97 spec reuses
  it instead of duplicating the IPC loop.
- **Why:** The workaround exists only because of the gap this story closes. Leaving it in would
  make the screener e2e suite silently depend on positions while claiming to test the bench,
  and would hide a regression of this story.
- **Alternatives considered:** _Leave the workaround_ — rejected; it is exactly the kind of
  "why is this here" code the next reader trips over.

## Behavioural notes for the implementer

- With the fake IVR seam, any watchlisted ticker without a programmed outcome resolves
  `not_available` → `skippedCount++`. Existing `e2e/ivr-collector.spec.ts` seeds no watchlist
  rows, so its exact `skippedCount` assertions are unaffected. The screener suite's `seedIvr`
  deliberately omits MSFT from `RANKED_IVR`; after this story MSFT is still attempted (it is on
  the watchlist) and skipped — still `n/a` on screen, so `IV rank unavailable is shown, not
blank` keeps passing.
- The `iv_rank_floor` exclusion reason is
  `IV rank 22.0 (Aug 28) below 30` — it embeds the observation date via `formatObservedOn`.
  E2E assertions should match `IV rank 22.0` and `below 30` separately, not the whole string.
- `persistSnapshot` overwrites same-UTC-day rows, so "exactly one AAPL snapshot for the day"
  holds even after a double fetch. The discriminating assertion for collect-once is the
  `fetchIvr` call count.
- Spec drift to fix at `/update-spec us-97` time (not in code here): the `readIvRanks` doc
  comment in `src/main/services/screener.ts` still says "IVR is display-only and never a hard
  filter"; US-98's Out of Scope says the same. Both predate US-67. The story's Out of Scope
  lists this as a separate docs pass.

## Open Questions

None.
