---
story: us-66
kind: feature
parent: null
topics: [screener, market-data]
status: planned
---

# Implementation Plan: US-66 — Display ranked screener results with key metrics

## Summary

Build the Screener results page: a new `/screener` route rendering US-65's scored
candidates as a dense ranked table (one recommended put strike per ticker, ordered by
yield-per-delta), with a collapsed excluded section, three visually distinct body
states (ranked / no-candidates / market-data-unavailable), and a stale-snapshot badge
when the market is CLOSED. Pure renderer work — the `screener:results` IPC, preload
exposure, and all scoring already shipped in US-65. Done means all six AC scenarios
pass as named e2e tests and the page matches the mockup's ranked/excluded/unavailable/
empty/stale states.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** `docs/epics/08-stories/US-66-display-ranked-results.md`
- **Mockup (screens, states, visual treatment):** `mockups/us-66-screener-results.mdx`
- **Research & Design Decisions:** `plans/us-66/research.md`
- **Data Model & Display Derivations:** `plans/us-66/data-model.md`
- **API Contract (consumed, from US-65):** `plans/us-65/contracts/screener-results.md`
- **Quickstart & Verification:** `plans/us-66/quickstart.md`

No new `contracts/` were generated — this story adds no IPC surface.

## Prerequisites

All backend infrastructure exists from US-65 (merged to main):

- `screener:results` IPC handler (`src/main/ipc/screener.ts`) returning
  `{ ok, status, ranked, excluded, quoteTimestamp }`
- Preload exposure `window.api.screener.results()` + ambient types
  `IpcScoredCandidate` / `IpcScreenerExclusion` / `IpcScreenerResultsResult`
  (`src/preload/index.d.ts:396-451`)
- `MarketStatusPill` + `useMarketStatusDisplay` (US-32/US-37)
- `TablePrimitives`, `PageLayout`/`PageHeader`, `LoadingState`, `ErrorAlert`, `Badge`
- E2E seams: `FakeMarketDataProvider` chain endpoint, `FAKE_MARKET_STATUS`,
  `WHEELBASE_FAKE_IVR` + `_test:ivr-*` channels, `e2e/dates.ts`

## Implementation Areas

### 1. Screener display formatters

**Files to create or modify:**

- `src/renderer/src/lib/screener-format.ts` — new pure formatting helpers
- `src/renderer/src/lib/screener-format.test.ts` — unit tests

**Red — tests to write:**

In `screener-format.test.ts`, one `describe` per helper:

- `fmtYieldPercent`: `"0.0150"` → `"1.5%"` (trailing zero trimmed); `"0.0158"` →
  `"1.58%"`; `"0.1480"` → `"14.8%"`; `"0.1254"` → `"12.54%"`; whole percents drop the
  point entirely (`"0.0200"` → `"2%"`)
- `fmtScore`: `"0.5286"` → `"0.53"`; `"0.5018"` → `"0.50"` (fixed 2dp, zeros kept);
  `"0.7100"` → `"0.71"`
- `fmtSpread`: `("0.06", "2.22")` → `"$0.06 (2%)"`; `("0.30", "4.84")` →
  `"$0.30 (5%)"` (integer percent, rounded)
- `fmtDelta`: `"0.2800"` → `"0.28"`; `"0.2200"` → `"0.22"`
- `fmtIvr`: `{ value: '44.0', observedAt: … }` → `"44"`; `{ value: '38.5', … }` →
  `"38.5"`; `null` → `"n/a"`
- `fmtOpenInterest`: `4200` → `"4,200"`; `120` → `"120"`; `null` → `"—"`
- `fmtQuoteTime`: an ISO timestamp → local `HH:mm:ss` (assert with a fixed Date and
  `date-fns format`, not string slicing)

**Green — implementation:**

- Implement the seven helpers in `screener-format.ts` per the derivations table in
  `plans/us-66/data-model.md`; reuse `fmtMoney` and `fmtPct` from
  `src/renderer/src/lib/format.ts` inside `fmtSpread`; use `Decimal` (`decimal.js`)
  for the ×100 of `fmtYieldPercent` (never float math on money-adjacent strings) and
  `date-fns` `format(parseISO(...))` for `fmtQuoteTime` (project date-handling rule)

**Refactor — cleanup to consider:**

- Check `format.ts` for overlap — if `fmtYieldPercent`'s trim logic duplicates
  anything there, share it; keep helpers taking narrow string inputs, not whole
  candidate objects

**Acceptance criteria covered:**

- Feeds the exact strings pinned by "A row shows the metrics for its recommended
  strike" (`1.5% period`, `14.8%/yr`, `0.28`, `44`, `4,200 OI`, `$0.06 (2%)`, score
  `0.53`) and "IV rank unavailable is shown, not blank" (`n/a`)

### 2. Screener API adapter, query key, and hook

**Files to create or modify:**

- `src/renderer/src/api/screener.ts` — adapter over `window.api.screener.results()`
- `src/renderer/src/api/screener.test.ts` — adapter tests
- `src/renderer/src/hooks/screenerQueryKeys.ts` — `screenerQueryKeys.results`
- `src/renderer/src/hooks/useScreenerResults.ts` — TanStack Query hook

**Red — tests to write:**

In `api/screener.test.ts` (mirror `api/watchlist.test.ts` style, stub `window.api`):

- `getScreenerResults` returns the full payload (`status`, `ranked`, `excluded`,
  `quoteTimestamp`) when `ok: true` with `status: 'ok'`
- `getScreenerResults` returns — does **not** throw — when `ok: true` with
  `status: 'provider_unavailable'` (outage is data, not an error)
- `getScreenerResults` throws mapped `ApiError`s via `throwMappedIpcErrors` when
  `ok: false` (envelope `internal_error`)

**Green — implementation:**

- `api/screener.ts`: export `ScreenerCandidate`, `ScreenerExclusion`,
  `ScreenerResults` types (field-for-field per `data-model.md`, aliasing the ambient
  `Ipc*` shapes) and `getScreenerResults()` following the watchlist adapter pattern
- `hooks/screenerQueryKeys.ts`: `export const screenerQueryKeys = { results: ['screener', 'results'] as const }`
- `hooks/useScreenerResults.ts`: `useQuery<ScreenerResults, ApiError>({ queryKey: screenerQueryKeys.results, queryFn: getScreenerResults })` — no `refetchInterval`
  (per research ADR: refresh is a deliberate action via `refetch()`)

**Refactor — cleanup to consider:**

- Check for duplication with other adapters' envelope handling; naming consistency
  with `useWatchlist` / `watchlistQueryKeys`

**Acceptance criteria covered:**

- Transport for every scenario; specifically preserves the `provider_unavailable` vs
  empty-`ranked` distinction required by "Provider outage is distinguished from no
  results"

### 3. State cards (empty and unavailable)

**Files to create or modify:**

- `src/renderer/src/components/ScreenerStateCard.tsx` — centered card, `tone: 'error' | 'neutral'`
- `src/renderer/src/components/ScreenerStateCard.test.tsx`

**Red — tests to write:**

- error tone renders red treatment: `border-wb-red`-family classes on the card frame
  and `text-wb-red` icon chip (`⚠`), plus the action button when `action` provided
- neutral tone renders muted treatment (`border-wb-border`, muted `⌕` icon chip) —
  assert the two tones produce different `data-tone` attributes so distinctness is
  machine-checkable
- clicking the action button fires the `onAction` callback
- caption paragraph renders below the card when provided

**Green — implementation:**

- One `ScreenerStateCard({ tone, title, body, actionLabel?, onAction?, caption? })`
  component modeled on the mockup's `CenteredCard`: centered column, 40px round icon
  chip (`⚠` red-dim background for error, `⌕` elevated background for neutral),
  semibold title, secondary body copy max-w around 380–420px, optional bordered
  action button, optional mono muted caption; Tailwind `wb-*` tokens only, and
  `data-testid` passed through (`screener-unavailable` / `screener-empty` set by the
  page)

**Refactor — cleanup to consider:**

- Compare with `WatchlistPage`'s `EmptyGuidance` — if the shapes converge, note it
  (don't extract speculatively for two call sites with different chrome)

**Acceptance criteria covered:**

- "Provider outage is distinguished from no results" — the two tones are the visual
  distinction; empty card copy "No candidates match your criteria", outage card copy
  "Market data unavailable" with "Retry refresh" action (mockup `unavailable` /
  `empty` states; the mockup's "Open Screener settings" action is omitted — US-67)

### 4. Ranked results table and excluded section

**Files to create or modify:**

- `src/renderer/src/components/ScreenerResultsTable.tsx` — table + row + score legend
- `src/renderer/src/components/ScreenerResultsTable.test.tsx`
- `src/renderer/src/components/ScreenerExcludedSection.tsx` — collapsible exclusions
- `src/renderer/src/components/ScreenerExcludedSection.test.tsx`

**Red — tests to write:**

`ScreenerResultsTable.test.tsx` (render with 3 candidates mirroring the mockup's
KO/AAPL/MSFT fixtures):

- renders rows in given array order with rank badges `1`, `2`, `3` (no re-sorting:
  pass KO-first input, assert first `screener-row-*` testid is KO)
- header row shows exactly the mockup's column set: `#`, `Ticker`, `Strike`, `Exp`,
  `DTE`, `Mark`, `Yield`, `Ann.`, `Δ`, `IVR`, `OI`, `Spread`
- an AAPL row (strike `180.0000`, mark `2.70`, periodYield `0.0150`,
  annualizedYield `0.1480`, delta `0.2800`, ivRank value `44.0`, OI `4200`,
  spreadAbsolute `0.06`, spreadPercent `2.22`, dte 37) renders cells `$180.00`,
  `$2.70`, `1.5%`, `14.8%/yr`, `0.28`, `44`, `4,200`, `$0.06 (2%)`, `37d`
- the row carries `data-yield-per-delta="0.53"` (from `yieldPerDelta: '0.5286'`)
- `ivRank: null` renders `n/a` in the IVR cell (muted class), row still present with
  its rank badge
- yield cells carry `text-wb-green`; rank badge carries gold classes
  (`bg-wb-gold-dim`/`text-wb-gold` per mockup rank chip); ticker cell is gold mono
- score legend paragraph renders below the table naming yield-per-delta

`ScreenerExcludedSection.test.tsx`:

- collapsed by default: header button reads `Excluded (4)` for 4 exclusions, rows
  hidden
- clicking the header toggles rows visible; each row shows ticker + verbatim reason
  string (e.g. `spread 22% exceeds 10%`) in the red-dim reason chip
- no rank badge / rank number anywhere in excluded rows
- renders nothing when `exclusions` is empty

**Green — implementation:**

- `ScreenerResultsTable({ candidates })`: plain `<table>` on `TableHeader`/`TableCell`
  primitives, 12 columns per the mockup's `COLS` (minus the mockup's `promote`
  column — US-68, out of scope); right-aligned numeric columns; rank badge as a
  20×20 rounded gold chip (mockup `CandidateRow` rank chip); ticker in
  `font-bold text-wb-gold`; `Yield`/`Ann.` in `text-wb-green` (weight 500/600 per
  mockup); Exp/DTE/OI/Spread muted secondary; all values through area-1 formatters;
  row `data-testid={'screener-row-' + ticker}` and
  `data-yield-per-delta={fmtScore(...)}`, rank badge `title` showing the score;
  `ScoreLegend` (mockup component of the same name) as a mono muted caption under
  the table: "Ranked by yield-per-delta — annualized return-if-flat ÷ delta"
- `ScreenerExcludedSection({ exclusions })`: bordered surface card with a full-width
  toggle button header `Excluded (n)` + `▸`/`▾` chevron (mockup `ExcludedSection`),
  local `useState` collapsed default; expanded rows list ticker (mono, secondary,
  fixed width) beside the reason in a `bg-wb-red-dim` bordered chip; testids
  `screener-excluded-toggle`, `screener-excluded-row-<ticker>`; `earningsFlagged`
  and the mockup's earnings badges are **not** rendered (US-70)

**Refactor — cleanup to consider:**

- Row cell class strings will repeat — hoist shared cell-class constants; check
  column definitions don't drift between header and body (a single columns array if
  it reduces duplication, not otherwise)

**Acceptance criteria covered:**

- "Results are ranked by yield-per-delta" (order + full column set)
- "A row shows the metrics for its recommended strike" (exact cell strings + score
  data attribute)
- "IV rank unavailable is shown, not blank" (`n/a`, still ranked)
- "Excluded candidates are listed with a reason" (expandable section, verbatim
  reason, no rank)

### 5. ScreenerPage — composition, states, stale badge

**Files to create or modify:**

- `src/renderer/src/pages/ScreenerPage.tsx` — the page
- `src/renderer/src/pages/ScreenerPage.test.tsx`

**Red — tests to write:**

(Stub `window.api` per test; wrap in fresh `QueryClient`; stub the market-status
wiring the way `PositionsListPage.test.tsx` does.)

- loading: renders `LoadingState` while the query is pending
- envelope failure (`ok: false`): renders `ErrorAlert`
- `status: 'ok'` with ranked rows: renders the table, the count line
  `3 candidates · 4 excluded` (mockup `TitleBar`), the `MarketStatusPill`, and the
  collapsed excluded section; no state card testids present
- `status: 'ok'`, `ranked: []`, `excluded` non-empty: renders `screener-empty` card
  (neutral tone) **and** the excluded section below it (research ADR: exclusions
  stay visible under the empty state); no table
- `status: 'provider_unavailable'`: renders `screener-unavailable` card (error
  tone); no excluded section, no table, no `screener-empty`
- outage card's "Retry refresh" click re-invokes `window.api.screener.results`
  (assert the stub's call count)
- market display CLOSED + ranked rows: header shows the `Stale snapshot` badge
  (`data-testid="screener-stale-badge"`, gold treatment) and the caption line
  `Quoted 16:00:02 · after-hours option marks are unreliable` derived from
  `quoteTimestamp`; count line switches to `3 candidates · quoted 16:00:02`
  (mockup `stale` state)
- market display LIVE: no stale badge, count line `3 candidates · 4 excluded`

**Green — implementation:**

- `ScreenerPage` (export `SCREENER_PAGE_TITLE = 'Screener'`): `PageLayout` +
  `PageHeader` — left: title, candidate-count `Badge`, stale badge when
  `useMarketStatusDisplay().display === 'CLOSED'` and ranked results exist; right:
  `MarketStatusPill state={display}` (mockup header: section label left, pill
  right; the mockup's PAPER chip already comes from the app shell)
- Body per the state machine in `data-model.md`: `useScreenerResults()` →
  `LoadingState` / `ErrorAlert` / `ScreenerStateCard` (outage: tone `error`, title
  "Market data unavailable", body per mockup copy, action "Retry refresh" →
  `refetch()`; empty: tone neutral, title "No candidates match your criteria",
  body per mockup copy without the settings action) / `ScreenerResultsTable` +
  `ScoreLegend`; `ScreenerExcludedSection` rendered under both `ok` branches when
  `excluded.length > 0`
- Stale caption line (mono, `text-wb-gold`) above the table when CLOSED, using
  `fmtQuoteTime(quoteTimestamp)`
- Tailwind `wb-*` tokens throughout; no inline styles

**Refactor — cleanup to consider:**

- Header-with-pill wiring now exists on Positions and Screener — check whether the
  `useMarketStatusDisplay` + pill arrangement reads identically; extract only if the
  markup is genuinely the same shape

**Acceptance criteria covered:**

- Background ("market status pill reads LIVE" on the results header)
- "Provider outage is distinguished from no results" (state switching + distinct
  cards)
- "Stale marks are flagged" (CLOSED ⇒ badge + quote time)

### 6. Route and navigation

**Files to create or modify:**

- `src/renderer/src/App.tsx` — nav item + route

**Red — tests to write:**

- Extend the existing app-shell coverage pattern: in `ScreenerPage.test.tsx` (or
  `App` test if one exists — verify at implementation time; there is no `App.test.tsx`
  today, so cover via e2e in area 7): navigation is primarily e2e-verified; add a
  minimal Vitest case only if an App-level test file already exists — otherwise the
  Red step for this area is the failing e2e navigation step in area 7

**Green — implementation:**

- `App.tsx`: `<NavItem href="/screener" label={SCREENER_PAGE_TITLE} icon="⌕" active={location === '/screener'} />` in the Trading group directly after Watchlist
  (mockup sidebar shows `⌕ Screener` beside Watchlist), and
  `<Route path="/screener" component={ScreenerPage} />` in the `Switch`

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency (page-title constants pattern:
  `SCREENER_PAGE_TITLE` mirrors `WATCHLIST_PAGE_TITLE` / `CALENDAR_PAGE_TITLE`)

**Acceptance criteria covered:**

- Background "When the trader opens the Screener results" — the entry point every
  scenario walks through

### 7. E2e Tests

**Files to create or modify:**

- `e2e/screener-helpers.ts` — OCC fixture builder + launch/seed helpers
- `e2e/screener-results.spec.ts` — one test per AC scenario

**Red — tests to write** (AC-driven; names mirror the Gherkin):

Helpers first: `buildPutFixture({ ticker, strike, bid, ask, delta, oi, dteOffset })`
composes the OCC symbol from `localDate(dteOffset)` (strike ×1000 zero-padded to 8
digits, `P` type) and the snapshot body (negative signed delta, ISO timestamp);
`launchScreener(prefix, opts)` wraps `buildLaunchEnv` with
`WHEELBASE_MOCK_OPTION_SNAPSHOTS`, seeds watchlist tickers via
`window.api.watchlist.add` in `page.evaluate`, optionally seeds IVR via the
`e2e/ivr-helpers.ts` offline path (KO 38, AAPL 44), and navigates to `#/screener`.
Canonical fixtures per `plans/us-66/research.md` "E2E fixtures" ADR: KO 60 @ 0.92/0.98
Δ−0.22 OI 1800 +37d; AAPL 180 @ 2.67/2.73 Δ−0.28 OI 4200 +37d; MSFT 410 @ 6.05/6.35
Δ−0.25 OI 2600 +44d (no IVR); TSLA 240 @ 2.67/3.33 Δ−0.25 OI 1000 +37d.

- `it('results are ranked by yield-per-delta')` — seed KO+AAPL+MSFT (+IVR for
  KO/AAPL); assert pill reads LIVE (Background); assert `screener-row-*` order is
  KO, AAPL, MSFT (scores 0.71 / 0.53 / 0.50); assert one KO row exposes every AC
  column value (strike, exp, DTE, mark, period yield, annualized yield, delta, IVR,
  OI, spread all non-empty)
- `it('a row shows the metrics for its recommended strike')` — same launch; assert
  the AAPL row's cells contain `1.5%`, `14.8%/yr`, `0.28`, `44`, `4,200`,
  `$0.06 (2%)` and the row's `data-yield-per-delta` equals `0.53`
- `it('IV rank unavailable is shown, not blank')` — same launch (MSFT has no IVR
  outcome); assert MSFT row's IVR cell text is exactly `n/a` and MSFT still carries
  rank badge `3`
- `it('excluded candidates are listed with a reason')` — launch with TSLA added to
  the fixtures + watchlist; click `screener-excluded-toggle` (reads `Excluded (1)`);
  assert `screener-excluded-row-TSLA` shows the verbatim reason
  `spread 22% exceeds 10%` and contains no rank badge
- `it('provider outage is distinguished from no results')` — launch with
  `FAKE_MARKET_DATA_ERROR: 'network_error'`; assert `screener-unavailable` card with
  "Market data unavailable" copy and its Retry button; assert `screener-empty` and
  the results table are absent
- `it('stale marks are flagged')` — launch ranked fixtures with
  `FAKE_MARKET_STATUS` session `closed`; assert pill reads CLOSED,
  `screener-stale-badge` is visible, and the stale caption shows the quote time
  derived from the fixtures' timestamp

**Green — implementation:**

- No production code — this area verifies areas 1–6 end-to-end. Fix whatever the
  failing specs expose (selector/testid mismatches, formatter gaps)

**Refactor — cleanup to consider:**

- Share launch/seed plumbing with `assignment-helpers.ts` conventions rather than
  copying; keep fixture math comments pointing at the research ADR so the numbers
  stay explicable

**Acceptance criteria covered:**

- All six scenarios, one named test each (audit below)

## AC Audit

| AC scenario (Gherkin)                                                           | E2e test (area 7)                                          | Also covered by   |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------- |
| Background: screened watchlist, pill reads LIVE                                 | asserted inside `results are ranked by yield-per-delta`    | area 5 page tests |
| Results are ranked by yield-per-delta (order + all row fields)                  | `it('results are ranked by yield-per-delta')`              | areas 1, 4        |
| A row shows the metrics for its recommended strike (exact strings + score 0.53) | `it('a row shows the metrics for its recommended strike')` | areas 1, 4        |
| IV rank unavailable is shown, not blank (`n/a`, still ranked)                   | `it('IV rank unavailable is shown, not blank')`            | areas 1, 4        |
| Excluded candidates are listed with a reason (verbatim, no rank)                | `it('excluded candidates are listed with a reason')`       | area 4            |
| Provider outage is distinguished from no results                                | `it('provider outage is distinguished from no results')`   | areas 2, 3, 5     |
| Stale marks are flagged (CLOSED ⇒ badge + quote time)                           | `it('stale marks are flagged')`                            | areas 1, 5        |

Every AC bullet maps to exactly one named e2e test; no uncovered ACs remain.
