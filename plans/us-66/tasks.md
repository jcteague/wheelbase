# US-66 — Display ranked screener results with key metrics — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Refactor tasks invoke the `/refactor` skill — this must happen in the **main conversation** (subagents cannot invoke skills)

---

## Layer 1 — Foundation (no cross-area dependencies)

> These areas can be started immediately and run in parallel.

### Screener Display Formatters

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/screener-format.test.ts`
  - One `describe` per helper:
    - `fmtYieldPercent`: `"0.0150"` → `"1.5%"` (trailing zero trimmed); `"0.0158"` → `"1.58%"`; `"0.1480"` → `"14.8%"`; `"0.1254"` → `"12.54%"`; `"0.0200"` → `"2%"` (whole percents drop the point)
    - `fmtScore`: `"0.5286"` → `"0.53"`; `"0.5018"` → `"0.50"` (fixed 2dp, zeros kept); `"0.7100"` → `"0.71"`
    - `fmtSpread`: `("0.06", "2.22")` → `"$0.06 (2%)"`; `("0.30", "4.84")` → `"$0.30 (5%)"` (integer percent, rounded)
    - `fmtDelta`: `"0.2800"` → `"0.28"`; `"0.2200"` → `"0.22"`
    - `fmtIvr`: `{ value: '44.0', observedAt: … }` → `"44"`; `{ value: '38.5', … }` → `"38.5"`; `null` → `"n/a"`
    - `fmtOpenInterest`: `4200` → `"4,200"`; `120` → `"120"`; `null` → `"—"`
    - `fmtQuoteTime`: ISO timestamp → local `HH:mm:ss` (assert with a fixed Date and `date-fns format`, not string slicing)
  - Run `pnpm test screener-format` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/screener-format.ts` _(depends on: Formatters Red ✓)_
  - Seven helpers per the derivations table in `plans/us-66/data-model.md`
  - Reuse `fmtMoney` and `fmtPct` from `src/renderer/src/lib/format.ts` inside `fmtSpread`
  - Use `Decimal` (`decimal.js`) for the ×100 in `fmtYieldPercent` — never float math on money-adjacent strings
  - Use `date-fns` `format(parseISO(...))` for `fmtQuoteTime` (project date-handling rule)
  - Run `pnpm test screener-format` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/lib/screener-format.ts` _(depends on: Formatters Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check `format.ts` for overlap — share trim logic if `fmtYieldPercent` duplicates anything there; keep helpers taking narrow string inputs, not whole candidate objects
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Screener API Adapter, Query Key, and Hook

- [x] **[Red]** Write failing tests — `src/renderer/src/api/screener.test.ts`
  - Mirror `api/watchlist.test.ts` style, stub `window.api`:
    - `getScreenerResults` returns the full payload (`status`, `ranked`, `excluded`, `quoteTimestamp`) when `ok: true` with `status: 'ok'`
    - `getScreenerResults` returns — does **not** throw — when `ok: true` with `status: 'provider_unavailable'` (outage is data, not an error)
    - `getScreenerResults` throws mapped `ApiError`s via `throwMappedIpcErrors` when `ok: false` (envelope `internal_error`)
  - Run `pnpm test api/screener` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/api/screener.ts`, `src/renderer/src/hooks/screenerQueryKeys.ts`, `src/renderer/src/hooks/useScreenerResults.ts` _(depends on: API Adapter Red ✓)_
  - `api/screener.ts`: export `ScreenerCandidate`, `ScreenerExclusion`, `ScreenerResults` types (field-for-field per `data-model.md`, aliasing the ambient `Ipc*` shapes) and `getScreenerResults()` following the watchlist adapter pattern
  - `hooks/screenerQueryKeys.ts`: `export const screenerQueryKeys = { results: ['screener', 'results'] as const }`
  - `hooks/useScreenerResults.ts`: `useQuery<ScreenerResults, ApiError>({ queryKey: screenerQueryKeys.results, queryFn: getScreenerResults })` — **no `refetchInterval`** (research ADR: refresh is a deliberate action via `refetch()`)
  - Run `pnpm test api/screener` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: API Adapter Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check for duplication with other adapters' envelope handling; naming consistency with `useWatchlist` / `watchlistQueryKeys`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Screener State Cards

- [x] **[Red]** Write failing tests — `src/renderer/src/components/ScreenerStateCard.test.tsx`
  - Test cases:
    - error tone renders red treatment: `border-wb-red`-family classes on the card frame and `text-wb-red` icon chip (`⚠`), plus the action button when `action` provided
    - neutral tone renders muted treatment (`border-wb-border`, muted `⌕` icon chip) — assert the two tones produce different `data-tone` attributes so distinctness is machine-checkable
    - clicking the action button fires the `onAction` callback
    - caption paragraph renders below the card when provided
  - Run `pnpm test ScreenerStateCard` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/ScreenerStateCard.tsx` _(depends on: State Cards Red ✓)_
  - `ScreenerStateCard({ tone, title, body, actionLabel?, onAction?, caption? })` with `tone: 'error' | 'neutral'`, modeled on the mockup's `CenteredCard`: centered column, 40px round icon chip (`⚠` red-dim background for error, `⌕` elevated background for neutral), semibold title, secondary body copy max-w ~380–420px, optional bordered action button, optional mono muted caption
  - Tailwind `wb-*` tokens only; `data-testid` passed through (`screener-unavailable` / `screener-empty` set by the page)
  - Run `pnpm test ScreenerStateCard` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: State Cards Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Compare with `WatchlistPage`'s `EmptyGuidance` — if the shapes converge, note it (don't extract speculatively for two call sites with different chrome)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Table + Excluded Section (depends on Layer 1 Formatters)

> Start after the Formatters Green task is checked off.

### Ranked Results Table and Excluded Section

**Requires:** Screener Display Formatters Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/ScreenerResultsTable.test.tsx`, `src/renderer/src/components/ScreenerExcludedSection.test.tsx` _(depends on: Formatters Green ✓)_
  - `ScreenerResultsTable.test.tsx` (render with 3 candidates mirroring the mockup's KO/AAPL/MSFT fixtures):
    - renders rows in given array order with rank badges `1`, `2`, `3` (no re-sorting: pass KO-first input, assert first `screener-row-*` testid is KO)
    - header row shows exactly: `#`, `Ticker`, `Strike`, `Exp`, `DTE`, `Mark`, `Yield`, `Ann.`, `Δ`, `IVR`, `OI`, `Spread`
    - an AAPL row (strike `180.0000`, mark `2.70`, periodYield `0.0150`, annualizedYield `0.1480`, delta `0.2800`, ivRank value `44.0`, OI `4200`, spreadAbsolute `0.06`, spreadPercent `2.22`, dte 37) renders cells `$180.00`, `$2.70`, `1.5%`, `14.8%/yr`, `0.28`, `44`, `4,200`, `$0.06 (2%)`, `37d`
    - the row carries `data-yield-per-delta="0.53"` (from `yieldPerDelta: '0.5286'`)
    - `ivRank: null` renders `n/a` in the IVR cell (muted class), row still present with its rank badge
    - yield cells carry `text-wb-green`; rank badge carries gold classes (`bg-wb-gold-dim`/`text-wb-gold`); ticker cell is gold mono
    - score legend paragraph renders below the table naming yield-per-delta
  - `ScreenerExcludedSection.test.tsx`:
    - collapsed by default: header button reads `Excluded (4)` for 4 exclusions, rows hidden
    - clicking the header toggles rows visible; each row shows ticker + verbatim reason string (e.g. `spread 22% exceeds 10%`) in the red-dim reason chip
    - no rank badge / rank number anywhere in excluded rows
    - renders nothing when `exclusions` is empty
  - Run `pnpm test ScreenerResultsTable ScreenerExcludedSection` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/ScreenerResultsTable.tsx`, `src/renderer/src/components/ScreenerExcludedSection.tsx` _(depends on: Table Red ✓)_
  - `ScreenerResultsTable({ candidates })`: plain `<table>` on `TableHeader`/`TableCell` primitives, 12 columns (mockup's `COLS` minus `promote` — US-68 out of scope); right-aligned numeric columns; rank badge as 20×20 rounded gold chip; ticker `font-bold text-wb-gold`; `Yield`/`Ann.` in `text-wb-green` (weight 500/600); Exp/DTE/OI/Spread muted secondary; all values through the area-1 formatters; row `data-testid={'screener-row-' + ticker}` and `data-yield-per-delta={fmtScore(...)}`, rank badge `title` showing the score; `ScoreLegend` mono muted caption under the table: "Ranked by yield-per-delta — annualized return-if-flat ÷ delta"
  - `ScreenerExcludedSection({ exclusions })`: bordered surface card with full-width toggle button header `Excluded (n)` + `▸`/`▾` chevron, local `useState` collapsed default; expanded rows list ticker (mono, secondary, fixed width) beside the reason in a `bg-wb-red-dim` bordered chip; testids `screener-excluded-toggle`, `screener-excluded-row-<ticker>`
  - `earningsFlagged` and the mockup's earnings badges are **not** rendered (US-70)
  - Run `pnpm test ScreenerResultsTable ScreenerExcludedSection` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Table Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Hoist shared cell-class constants where row cell class strings repeat; check column definitions don't drift between header and body (single columns array only if it reduces duplication)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Page Composition (depends on Layers 1–2)

### ScreenerPage — Composition, States, Stale Badge

**Requires:** API Adapter Green ✓, State Cards Green ✓, Table Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/ScreenerPage.test.tsx` _(depends on: API Adapter Green ✓, State Cards Green ✓, Table Green ✓)_
  - Stub `window.api` per test; wrap in fresh `QueryClient`; stub the market-status wiring the way `PositionsListPage.test.tsx` does:
    - loading: renders `LoadingState` while the query is pending
    - envelope failure (`ok: false`): renders `ErrorAlert`
    - `status: 'ok'` with ranked rows: renders the table, count line `3 candidates · 4 excluded`, the `MarketStatusPill`, and the collapsed excluded section; no state card testids present
    - `status: 'ok'`, `ranked: []`, `excluded` non-empty: renders `screener-empty` card (neutral tone) **and** the excluded section below it (research ADR: exclusions stay visible under the empty state); no table
    - `status: 'provider_unavailable'`: renders `screener-unavailable` card (error tone); no excluded section, no table, no `screener-empty`
    - outage card's "Retry refresh" click re-invokes `window.api.screener.results` (assert the stub's call count)
    - market display CLOSED + ranked rows: header shows the `Stale snapshot` badge (`data-testid="screener-stale-badge"`, gold treatment) and caption `Quoted 16:00:02 · after-hours option marks are unreliable` derived from `quoteTimestamp`; count line switches to `3 candidates · quoted 16:00:02`
    - market display LIVE: no stale badge, count line `3 candidates · 4 excluded`
  - Run `pnpm test ScreenerPage` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/ScreenerPage.tsx` _(depends on: ScreenerPage Red ✓)_
  - Export `SCREENER_PAGE_TITLE = 'Screener'`; `PageLayout` + `PageHeader` — left: title, candidate-count `Badge`, stale badge when `useMarketStatusDisplay().display === 'CLOSED'` and ranked results exist; right: `MarketStatusPill state={display}`
  - Body per the state machine in `data-model.md`: `useScreenerResults()` → `LoadingState` / `ErrorAlert` / `ScreenerStateCard` (outage: tone `error`, title "Market data unavailable", action "Retry refresh" → `refetch()`; empty: tone neutral, title "No candidates match your criteria", no settings action) / `ScreenerResultsTable` + `ScoreLegend`; `ScreenerExcludedSection` under both `ok` branches when `excluded.length > 0`
  - Stale caption line (mono, `text-wb-gold`) above the table when CLOSED, using `fmtQuoteTime(quoteTimestamp)`
  - Tailwind `wb-*` tokens throughout; no inline styles
  - Run `pnpm test ScreenerPage` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: ScreenerPage Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Header-with-pill wiring now exists on Positions and Screener — check whether the `useMarketStatusDisplay` + pill arrangement reads identically; extract only if the markup is genuinely the same shape
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Route and Navigation (depends on Layer 3)

### Route and Navigation

**Requires:** ScreenerPage Green ✓

> No unit-level Red task: there is no `App.test.tsx` today — the failing e2e navigation step in Layer 5 is this area's Red.

- [x] **[Green]** Implement — `src/renderer/src/App.tsx` _(depends on: ScreenerPage Green ✓)_
  - `<NavItem href="/screener" label={SCREENER_PAGE_TITLE} icon="⌕" active={location === '/screener'} />` in the Trading group directly after Watchlist
  - `<Route path="/screener" component={ScreenerPage} />` in the `Switch`
  - Run `pnpm test` — no regressions
- [x] **[Refactor]** `/refactor` _(depends on: Route Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Naming consistency: `SCREENER_PAGE_TITLE` mirrors `WATCHLIST_PAGE_TITLE` / `CALENDAR_PAGE_TITLE`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/screener-helpers.ts`, `e2e/screener-results.spec.ts` _(depends on: all Green tasks ✓)_
  - Helpers first: `buildPutFixture({ ticker, strike, bid, ask, delta, oi, dteOffset })` composes the OCC symbol from `localDate(dteOffset)` (strike ×1000 zero-padded to 8 digits, `P` type) and the snapshot body (negative signed delta, ISO timestamp); `launchScreener(prefix, opts)` wraps `buildLaunchEnv` with `WHEELBASE_MOCK_OPTION_SNAPSHOTS`, seeds watchlist tickers via `window.api.watchlist.add` in `page.evaluate`, optionally seeds IVR via the `e2e/ivr-helpers.ts` offline path (KO 38, AAPL 44), navigates to `#/screener`
  - Canonical fixtures (research "E2E fixtures" ADR): KO 60 @ 0.92/0.98 Δ−0.22 OI 1800 +37d; AAPL 180 @ 2.67/2.73 Δ−0.28 OI 4200 +37d; MSFT 410 @ 6.05/6.35 Δ−0.25 OI 2600 +44d (no IVR); TSLA 240 @ 2.67/3.33 Δ−0.25 OI 1000 +37d
  - One `it()` per AC bullet — names mirror the Gherkin:
    - AC-1 (ranked by yield-per-delta + Background LIVE pill) → `it('results are ranked by yield-per-delta')` — seed KO+AAPL+MSFT (+IVR for KO/AAPL); assert pill reads LIVE; row order KO, AAPL, MSFT (scores 0.71 / 0.53 / 0.50); one KO row exposes every AC column value non-empty
    - AC-2 (row metrics for recommended strike) → `it('a row shows the metrics for its recommended strike')` — AAPL row cells contain `1.5%`, `14.8%/yr`, `0.28`, `44`, `4,200`, `$0.06 (2%)`; `data-yield-per-delta` equals `0.53`
    - AC-3 (IV rank unavailable) → `it('IV rank unavailable is shown, not blank')` — MSFT IVR cell text exactly `n/a`, MSFT still carries rank badge `3`
    - AC-4 (excluded with reason) → `it('excluded candidates are listed with a reason')` — TSLA in fixtures + watchlist; click `screener-excluded-toggle` (reads `Excluded (1)`); `screener-excluded-row-TSLA` shows verbatim `spread 22% exceeds 10%`, no rank badge
    - AC-5 (outage vs no results) → `it('provider outage is distinguished from no results')` — launch with `FAKE_MARKET_DATA_ERROR: 'network_error'`; assert `screener-unavailable` card with "Market data unavailable" copy + Retry button; `screener-empty` and the table absent
    - AC-6 (stale marks) → `it('stale marks are flagged')` — ranked fixtures with `FAKE_MARKET_STATUS` session `closed`; pill reads CLOSED, `screener-stale-badge` visible, stale caption shows quote time from the fixtures' timestamp
  - Run `pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - No production code expected — fix whatever the failing specs expose (selector/testid mismatches, formatter gaps)
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Share launch/seed plumbing with `assignment-helpers.ts` conventions rather than copying; keep fixture math comments pointing at the research ADR so the numbers stay explicable
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason — except
      Layer 5, which verifies Layers 1–4 end-to-end and so had no missing implementation
      to fail against; its assertions were proved live by a negative check instead, see
      `red-phase-results.md`)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (six named tests per the plan's AC Audit)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
