---
story: us-96
kind: feature
parent: null
topics: [market-data, ipc-handlers, zod-schemas]
status: planned
---

# Implementation Plan: US-96 — One live bench (watchlist + screener on a single page)

## Summary

Fold the Screener page into the Watchlist page per mockup concept B: every watchlist entry
becomes a card carrying its live price and an aged IV rank with a freshness ring, the bench is
split into **Meets criteria** (all saved conditions pass on a usable IV reading _and_ the
screener ranked a put) and **Stocks of interest** (everything else, with the reason), and a
sticky stock-detail panel shows the thesis, each condition's verdict, earnings, and the matching
put with a **Review trade** handoff into the pre-filled new-wheel form. Done means: one
`/watchlist` route and nav item, a new read-only `watchlist:snapshot` IPC feeding a pure verdict
engine, `IvrCell` drawing the US-98 ring + tooltip with an `expired` state that reaches the
renderer, the Screener page and its two table components deleted, the five screener e2e suites
re-pointed and green, and one new AC-driven e2e suite green.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** `docs/epics/08-stories/US-96-watchlist-live-snapshot.md`
- **Research & Design Decisions:** `plans/us-96/research.md`
- **Data Model & Selection Logic:** `plans/us-96/data-model.md`
- **API Contract(s):** `plans/us-96/contracts/watchlist-snapshot.md`, `plans/us-96/contracts/screener-results.md`
- **Quickstart & Verification:** `plans/us-96/quickstart.md`
- **Mockup:** `mockups/us-96-combined-watchlist-b-focus.mdx` (preview `mockups/previews/us-96-focus.png`)

## Prerequisites

None — all required schema and infrastructure already exists. Specifically: the `watchlist`
table and `watchlist:list/add/remove` (US-63); `screener:results`, `screener:get-criteria`,
`screener:save-criteria`, `ScreeningCriteriaSheet`, `ScreenerCriteriaStrip`, `ScreenerStateCard`
(US-65–67); the promote codec `lib/promote.ts` and promoted new-wheel form (US-68);
`getEarningsCalendar` with `last` print knowledge (US-70/US-98); IVR collection for watchlist
underlyings (US-97); the freshness engine `core/ivr-freshness.ts`, `getAssessedIvrByUnderlying`,
`readTradingCalendar`, and `IvrCell` (US-98); `fetchStockQuotes` / `MarketDataProvider.getStockQuotes`
(US-32/US-99); `MarketStatusPill` + `useMarketStatusDisplay`; the shared fake-IVR clock wired
into `screener:results`. One new dependency is installed in Area 2 (`@radix-ui/react-tooltip`
via `pnpm dlx shadcn@latest add tooltip`).

## Implementation Areas

### 1. `expired` becomes an assessed IV-rank state

**Files to create or modify:**

- `src/main/core/ivr-freshness.ts` — add `'expired'` to `IvRankState`; `assessIvRank` returns `{ status: 'assessed', reading }` with `state: 'expired'` for age > `STALE_MAX_AGE`; remove the `{ status: 'expired' }` variant from `IvRankAssessment`; `tierForAge` unchanged; `isUsableState` unchanged.
- `src/main/services/ivr-snapshots.ts` — `getAssessedIvrByUnderlying` maps only `unreadable` to `null`.
- `src/preload/index.d.ts` — `IpcIvRank.state` gains `'expired'`.
- `src/renderer/src/api/screener.ts` — `ScreenerIvRank.state` gains `'expired'`.
- `src/renderer/src/components/IvrCell.tsx` — minimal: treat `expired` like `stale` for tone and render `exp` as the value so typecheck passes; the ring lands in Area 2.

**Red — tests to write:**

- `src/main/core/ivr-freshness.test.ts`: a reading 12 sessions old returns `status: 'assessed'` with `state: 'expired'`, `ageTradingDays: 12`, and the original `value`/`observedAt`; `isUsableState('expired')` is `false`; a reading 11 sessions old is also `expired` while 10 is `stale` (boundary); a corrupt value still returns `unreadable`.
- `src/main/services/ivr-snapshots.test.ts`: an expired snapshot row appears in the returned map as an `expired` reading rather than `null`; an unreadable row still maps to `null` and logs `ivr_assessment_unreadable_snapshot`.
- `src/main/services/screener.test.ts`: with an `expired` assessed reading for KO, the engine receives `ivRank: null` for KO (floor not applied) while `RankedCandidate.ivRank` carries the `expired` reading.
- `src/renderer/src/components/IvrCell.test.tsx`: `state: 'expired'` renders text `exp`, `data-ivr-state="expired"`, muted class.

**Green — implementation:**

- Widen `IvRankState`; in `assessIvRank` replace `if (state === 'expired') return { status: 'expired' }` with falling through to the assessed return.
- Drop the `expired` branch in `getAssessedIvrByUnderlying`; keep the `unreadable` warn log.
- Update the two mirror types and `IvrCell`'s state handling per `contracts/screener-results.md`.

**Refactor — cleanup to consider:**

- `IvRankAssessment` now has two variants; confirm no dead `case 'expired'` branches remain in `ivr-freshness.test.ts` or the IVR collector.

**Acceptance criteria covered:**

- "An expired reading shows exp and a never-collected ticker shows n/a" (data half). Preserves US-98 "The IV-rank floor is not applied to an expired reading" and "A stale IV rank never blocks a candidate from ranking".

### 2. Freshness ring and tooltip in `IvrCell`

**Files to create or modify:**

- `src/renderer/src/components/ui/tooltip.tsx` — new shadcn primitive (`pnpm dlx shadcn@latest add tooltip`; installs `@radix-ui/react-tooltip`); style `TooltipContent` with `wb` tokens (`bg-wb-bg-elevated`, `border-wb-border`, `shadow-lg`, `z-50`) matching `popover.tsx`.
- `src/renderer/src/components/FreshnessRing.tsx` — new pure SVG component `FreshnessRing({ state, size = 14 })`.
- `src/renderer/src/lib/ivr-tooltip.ts` — new pure `ivrTooltipCopy(reading: ScreenerIvRank): { title: string; body: string }` and `observedSessionLabel(observedAt)` (ET, `Intl.DateTimeFormat`, `weekday short, month short, day`).
- `src/renderer/src/components/IvrCell.tsx` — compose numeral + ring inside a `Tooltip`.

**Red — tests to write:**

- `src/renderer/src/components/FreshnessRing.test.tsx`: `data-testid="freshness-ring"` with `data-state`; the fill circle's `stroke-dasharray` first term equals `fraction × circumference` for `{ fresh: 1, aging: 0.75, stale: 0.5, expired: 0.25 }`; `predates_earnings` renders no fill circle, a gold track (`stroke="var(--wb-gold)"`) and a centre dot; `aria-hidden="true"`.
- `src/renderer/src/lib/ivr-tooltip.test.ts`: titles `Fresh | Aging | Stale | Expired | Predates earnings`; the stale body contains `6 trading days old`, the observed session (`Fri, Aug 28`), and "cannot satisfy an IV condition"; the expired body contains `exp` and "collection has been failing"; the aging body says "still counts"; `1 trading day` singular.
- `src/renderer/src/components/IvrCell.test.tsx`: keep the six existing cases (`38`, `38 · 2d`, muted stale, "predates earnings" caption retired → assert the gold ring `data-state="predates_earnings"` instead, `n/a` with `data-ivr-state="empty"` and **no** `freshness-ring`, ET date in `aria-label`); add: `expired` renders `exp` with a `freshness-ring[data-state="expired"]`; hovering the cell (`userEvent.hover`) shows `role="tooltip"` containing the tier title; focusing the trigger (`tabIndex=0`) also opens it.

**Green — implementation:**

- `FreshnessRing`: `stroke = 2.25`, `r = (size − stroke) / 2`, `c = 2πr`; track circle `stroke="var(--wb-border)"` (gold at 0.45 opacity for predates_earnings); fill circle `stroke` from `RING_COLOR = { fresh: 'var(--wb-green)', aging: 'var(--wb-text-secondary)', stale: 'var(--wb-text-muted)', expired: 'var(--wb-text-muted)' }`, `strokeDasharray="${frac·c} ${c}"`, `transform="rotate(-90 cx cy)"`; centre dot `r=1.6` gold for predates_earnings. Colours are SVG attributes bound to tokens, not inline `style`.
- `IvrCell`: `<TooltipProvider><Tooltip><TooltipTrigger asChild><span data-testid="ivr-cell" data-ivr-state tabIndex={0} aria-label=…><span>{expired ? 'exp' : formatIvrValue(value)}{showsAge && ` · ${age}d`}</span><FreshnessRing state /></span></TooltipTrigger><TooltipContent data-testid="ivr-tooltip"><FreshnessRing size={12}/> <span class="font-wb-mono uppercase tracking-widest {TIER_TEXT[state]}">{title}</span><p class="text-xs text-wb-text-secondary">{body}</p></TooltipContent></Tooltip></TooltipProvider>`. Tone: `isUsable(state) ? 'text-wb-text-primary' : 'text-wb-text-muted'`; `exp` in normal weight. `null` → `<span data-ivr-state="empty" class="text-wb-text-muted" title="No IV rank collected">n/a</span>`. Drop the `title` attribute on readings (tooltip replaces it); `aria-label` keeps `"IV rank 38, 6 trading days old; Observed Aug 28, 2026"`.
- Mockup reference: the ring, tooltip title row, and copy follow `FreshnessRing`, `tooltipCopy`, and `IvrReading` in `mockups/us-96-combined-watchlist-b-focus.mdx`; the legend row does not ship.

**Refactor — cleanup to consider:**

- `ScreenerResultsTable.test.tsx` may assert the retired "predates earnings" caption or `title`; fix minimally here (the table itself is deleted in Area 8).
- Move `easternDay` formatting from `IvrCell` into `lib/ivr-tooltip.ts` so the cell has one date formatter.

**Acceptance criteria covered:**

- "A fresh reading shows a full green ring"; "An aging reading still satisfies an IV condition" (ring half); "A stale reading is muted …" (ring half); "A reading that predates earnings …" (ring half); "An expired reading shows exp and a never-collected ticker shows n/a"; "Hovering the ring explains the reading".

### 3. Pure verdict engine `core/watchlist-signal.ts`

**Files to create or modify:**

- `src/main/core/watchlist-signal.ts` — new pure module exporting `evaluateEntry`, `reasonsFor`, `allGatesPass`, `earningsDisplay`, and the types in `data-model.md` (`Gate`, `GateVerdict`, `EntryVerdict`, `EntrySignalInput`, `EarningsDisplay`). Imports only `decimal.js`, `date-fns`, `./ivr-freshness` (`isUsableState`, `AssessedIvRank`), `./screener` (`EarningsLookup`), `./trading-calendar` (`etDateOf`). No logger.

**Red — tests to write (`src/main/core/watchlist-signal.test.ts`, one `it` per table row in `data-model.md`):**

- Price gate: no target → `none`; target set + `price: null` → `unknown` "Price unavailable"; `178.40` vs `185.0000` → `met`; `178.40` vs `170.0000` → `unmet` with label exactly `Price $178.40 above $170 target`; boundary `170.00` vs `170.0000` → `met`.
- IV gate: no trigger → `none`; `ivRank: null` → `unknown` "IV unavailable"; `expired` → `unknown` "IV unavailable"; `stale` → `unknown` "IV too old to judge"; `predates_earnings` → `unknown` "IV predates earnings"; `fresh` 58 vs 40 → `met`; `aging` 58 vs 40 → `met`; `fresh` 34 vs 50 → `unmet` "IV low"; boundary `fresh` 50 vs 50 → `met`.
- Earnings gate: `postEarningsOnly: false` → `none`; `found` 3 days out → `unmet` `Earnings in 3 days`; 1 day → `Earnings in 1 day`; same ET day → `Earnings today`; 8 days → `met`; 7 days → `unmet` (inclusive); `none` / `unavailable` / found-but-past → `unknown` "Earnings date unknown". Day count uses the ET calendar day: a `now` of `2026-09-09T03:30:00Z` (still Sep 8 in New York) against `2026-09-11` is 3 days, not 2.
- `reasonsFor`: earnings before price before IV; only unmet/unknown labels; empty array when all met/none.
- `allGatesPass`: true for all `met`/`none`; false if any `unmet` or `unknown`.
- `earningsDisplay`: found upcoming → `{ kind: 'date', date, daysUntil, withinWindow }` with `withinWindow` true at ≤ 7; found past / none / unavailable → `{ kind: 'unknown' }`.

**Green — implementation:**

- Implement the rules exactly as tabulated in `data-model.md` § Gate rules; format the price label with `new Decimal(price).toFixed(2)` and the target trimmed like `watchlistConditionTags` (`parseFloat(target).toString()`).
- `daysUntil = differenceInCalendarDays(parseISO(date), parseISO(etDateOf(now)))`.

**Refactor — cleanup to consider:**

- Share the `≤ $170` target formatting with the renderer's `watchlistConditionTags` only if a shared leaf already exists under `src/shared/`; otherwise leave both (different processes).

**Acceptance criteria covered:**

- "An unmet price condition and an unmet IV condition are both reported"; "Only the IV condition is reported when the price condition is met"; "The post-earnings gate holds a stock while earnings is near"; "A stale reading … cannot satisfy an IV condition"; "An aging reading still satisfies an IV condition"; "A reading that predates earnings cannot satisfy an IV condition"; "An expired reading … IV unavailable"; "Earnings within the window is shown for any stock"; "No earnings caution when the report is outside the window"; "An unknown earnings date is a caution, not a silent pass" (engine half of each).

### 4. Shared isolated quote fetch

**Files to create or modify:**

- `src/main/services/underlying-quotes.ts` — new `fetchIsolatedStockQuotes(provider, tickers): Promise<Map<string, IpcStockQuote>>` (concurrency 4 via `mapWithConcurrency`, per-ticker `try/catch`, `logger.warn({ err, ticker }, 'underlying_quote_fetch_failed')`, flattened via `flattenStockQuote` from `services/market-data.ts` — export it).
- `src/main/services/screener.ts` — `readUnderlyingPrices` delegates to it and maps to `price`.

**Red — tests to write:**

- `src/main/services/underlying-quotes.test.ts`: three tickers where the second rejects → map has the other two and one warn log; empty ticker list → empty map without calling the provider.
- `src/main/services/screener.test.ts`: existing price-ceiling cases still pass (unchanged behaviour: ceiling off → no quote call; one failing ticker leaves only its ceiling unevaluated).

**Green — implementation:**

- Move the loop body out of `readUnderlyingPrices`; keep the `criteria.maxUnderlyingPrice === null` early return in the screener.

**Refactor — cleanup to consider:**

- Delete the now-unused `QUOTE_FETCH_CONCURRENCY` constant from `screener.ts` if it moved.

**Acceptance criteria covered:**

- "Market data unavailable degrades verdicts, not rows" (per-ticker price isolation); "Show last price with the day change" (data source).

### 5. `watchlist:snapshot` service, IPC, and preload

**Files to create or modify:**

- `src/main/services/watchlist-snapshot.ts` — new `buildWatchlistSnapshot(getProvider, db, { currentDate }): Promise<WatchlistSnapshot>` per `contracts/watchlist-snapshot.md`.
- `src/main/ipc/watchlist.ts` — `registerWatchlistIpc({ db, getProvider, getCurrentDate = () => new Date() })`; add `ipcMain.handle('watchlist:snapshot', …)` through `handleIpcCall('watchlist_snapshot_error', …)`.
- `src/main/index.ts` — move `createFakeIvrCollaborators()` above `registerWatchlistIpc` and pass `getProvider: () => marketDataFactory.create()` and `getCurrentDate: ivrCollaborators.clock?.now` to both watchlist and screener registration.
- `src/preload/index.ts` — `watchlist.snapshot: () => invoke('watchlist:snapshot')`.
- `src/preload/index.d.ts` — `IpcSnapshotQuote`, `IpcGate`, `IpcEntryVerdict`, `IpcEarningsDisplay`, `IpcWatchlistSnapshotRow`, `IpcWatchlistSnapshotResult`; `watchlist.snapshot()` on the API type.

**Red — tests to write:**

- `src/main/services/watchlist-snapshot.test.ts` (real sqlite via `src/main/test-utils.ts`, fake provider/earnings mocked as in `screener.test.ts`): rows come back in watchlist order with `entry`, `quote { price, prevClose, timestamp }`, `ivRank`, `earnings`, `verdict`, and `asOf === currentDate.toISOString()`; empty watchlist → `rows: []` and the provider is never constructed; `getProvider` throws → every `quote: null`, price gates `unknown`, IVR still assessed, resolves `ok`; one ticker's quote rejects → only that row `quote: null`; `getEarningsCalendar` rejects → every `earnings: { kind: 'unknown' }`, `lastEarnings` undefined in the IVR assessment; a stale reading yields `verdict.iv.label === 'IV too old to judge'`; the earnings horizon passed is `currentDate + dteMax + 45` days (same as the screener); logs `watchlist_snapshot_built` at info with row count.
- `src/main/ipc/watchlist.test.ts`: `watchlist:snapshot` registers, returns `{ ok: true, rows, asOf }` from the mocked service, and wraps a thrown error as `{ ok: false, errors: [{ field: '__root__', code: 'internal_error' }] }`; existing three-channel tests still pass with the widened deps.
- `src/main/index.test.ts`: `registerWatchlistIpc` receives a `getCurrentDate` (the shared clock) — mirror the existing assertion for `registerScreenerIpc`.

**Green — implementation:**

- Service: `listWatchlist(db)`; `criteria = getScreeningCriteria(db)`; `[quotes, earnings] = Promise.all([fetchIsolatedStockQuotes(provider, tickers) or empty map if getProvider throws (warn `watchlist_snapshot_provider_unavailable`), readEarnings-style wrapped getEarningsCalendar])`; `assessed = getAssessedIvrByUnderlying(db, tickers, { now, calendar: readTradingCalendar(db, now), lastEarnings })`; per entry build `EntrySignalInput` and call `evaluateEntry` + `earningsDisplay`. `logger.debug` inputs per ticker; `logger.info` the summary.
- Handler is thin: no payload parse, one service call.

**Refactor — cleanup to consider:**

- `readEarnings` in `screener.ts` and the snapshot's earnings read are the same wrapper — extract `readEarningsOrEmpty(db, tickers, criteria, now)` into `services/earnings-dates.ts` or a small shared helper and use it in both.

**Acceptance criteria covered:**

- "Market data unavailable degrades verdicts, not rows"; "Market data not connected points at Settings" (snapshot still resolves); data path for every price, verdict, and earnings scenario.

### 6. Renderer data layer: adapter, hooks, bench join, day change

**Files to create or modify:**

- `src/renderer/src/api/watchlist.ts` — types `SnapshotQuote`, `Gate`, `EntryVerdict`, `EarningsDisplay`, `WatchlistSnapshotRow`, `WatchlistSnapshot`; `getWatchlistSnapshot()` mapping `ok:false` via `throwMappedIpcErrors`.
- `src/renderer/src/hooks/watchlistQueryKeys.ts` — `snapshot: ['watchlist', 'snapshot'] as const`.
- `src/renderer/src/hooks/useWatchlistSnapshot.ts` — `useQuery({ queryKey: watchlistQueryKeys.snapshot, queryFn: getWatchlistSnapshot, refetchOnWindowFocus: true })`.
- `src/renderer/src/hooks/useAddToWatchlist.ts`, `useRemoveFromWatchlist.ts` — also invalidate `watchlistQueryKeys.snapshot` and `screenerQueryKeys.results`.
- `src/renderer/src/lib/bench.ts` — `buildBench`, `defaultSelection`, `BenchStock`, `Bench`.
- `src/renderer/src/lib/day-change.ts` — `dayChange(quote)`.

**Red — tests to write:**

- `src/renderer/src/api/watchlist.test.ts`: `getWatchlistSnapshot` returns `{ rows, asOf }`; an `ok:false` envelope throws an `ApiError`.
- `src/renderer/src/hooks/useWatchlistSnapshot.test.ts`: uses the snapshot key; `useAddToWatchlist.test.ts` / `useRemoveFromWatchlist.test.ts`: success invalidates `['watchlist']`, `['watchlist','snapshot']`, and `['screener','results']`.
- `src/renderer/src/lib/bench.test.ts`: KO (all gates met/none, ranked #1) and XLF (all none, ranked #2) → `meets` in rank order with `rank` 1 and 2 and card copy `All conditions met` vs `Screening criteria met`; AAPL (price unmet, IV unmet) → waiting with reason `Price $178.40 above $170 target · IV low`; MSFT (earnings unmet) → `Earnings in 3 days` even though its candidate was excluded for earnings; PEP (IV unknown, ranked) → waiting `IV too old to judge`, `candidate` non-null; AMD (gates pass, excluded `spread 14% exceeds 10%`) → reason is the verbatim exclusion; XYZ (IV unknown, no candidate) → `IV unavailable`; `results.status === 'provider_unavailable'` → `meets` empty and every reason `Data unavailable · not evaluated`; `results` undefined → reasons `Not screened yet` for stocks with no gate reasons; `defaultSelection` prefers `meets[0]`, then `waiting[0]`, then `null`.
- `src/renderer/src/lib/day-change.test.ts`: `178.40` / `176.98` → `{ percent: '+0.8%', direction: 'up' }`; `505.10` / `511.24` → `{ percent: '−1.2%', direction: 'down' }`; equal → flat `0.0%`; `prevClose: null` or `quote: null` → `null`.

**Green — implementation:**

- Per `data-model.md` § Renderer shapes. `buildBench` never re-sorts `results.ranked`; `meets` order is the index of the ticker in `ranked`.

**Refactor — cleanup to consider:**

- `screenerQueryKeys` is imported by watchlist hooks now; consider a single `benchQueryKeys` re-export if the cross-import reads oddly.

**Acceptance criteria covered:**

- "Meets-criteria cards follow the screener's rank order"; "A stock with no personal conditions meets criteria on the screening defaults alone"; "A stock whose conditions pass but has no qualifying put shows the screener's reason"; "The first meets-criteria stock is selected by default"; "Show last price with the day change"; "A down day is shown in red"; "Add stock … after the re-screen"; "Refresh re-screens the bench" (invalidation half).

### 7. Bench components: card, section, detail panel

**Files to create or modify:**

- `src/renderer/src/components/BenchCard.tsx` — new.
- `src/renderer/src/components/BenchSection.tsx` — new (title, count badge, empty child, cards).
- `src/renderer/src/components/BenchDetail.tsx` — new, composed of `GateBadge`, `ReadingNote`, `MatchingPutCard`, `DayChange` (same file or siblings).
- `src/renderer/src/lib/watchlistConditionTags.ts` — unchanged; reused for the static tags (`post-earnings`, `core`).

**Red — tests to write:**

- `src/renderer/src/components/BenchCard.test.tsx`: a meets card renders `data-testid="watchlist-row-KO"`, `data-bench-section="meets"`, rank pill `#1`, ticker button `KO →` (`watchlist-ticker`), price `$62.00` (`watchlist-price`), line `$60.00 put · Oct 16 · 1.58% yield`, gate condition `IVR ≥ 40`, an `ivr-cell`, and `watchlist-remove-KO`; a demoted candidate (earnings `flagged`) renders `—` for rank and the `earnings-badge`; a waiting card renders `data-bench-section="waiting"`, the `watchlist-reason` text, the company/name slot falls back to nothing (no name source exists), and no rank; `quote: null` renders `—` for price; clicking the ticker calls `onSelect('KO')`; the selected card carries `ring-1 ring-wb-gold`; the ✕ calls `onRemove('KO')`.
- `src/renderer/src/components/BenchDetail.test.tsx`: header shows the ticker in `font-wb-mono text-wb-gold`, a green `Meets criteria` badge or a default `Watching` badge; the stat grid shows `Last price $178.40`, `Day change +0.8%` in `text-wb-green` (`data-testid="bench-day-change" data-direction="up"`), `−1.2%` in `text-wb-red`, and an `ivr-cell` for IV rank; `Your thesis` shows `entry.notes` or `No thesis yet.`; `Entry conditions` renders `bench-gate-price` / `bench-gate-iv` / `bench-gate-earnings` badges with `data-verdict` and text `≤ $170 · not met`, `IVR ≥ 50 · not met`, `IVR ≥ 40 · met` (green), `IVR ≥ 45 · unknown` (muted), `Post-earnings only · not met`, plus `watchlist-tag` chips for `core`; the `Earnings` line reads `Sep 14 · in 5 days` with `data-tone="caution"` when `withinWindow`, `Nov 3` plain otherwise, and `Unknown · needs verification` for `kind: 'unknown'`; `ReadingNote` renders the stale / expired / predates-earnings / never-collected `AlertBox` copy from the mockup and nothing for fresh/aging; a meets stock renders `bench-detail-put` with `$60.00 PUT`, `Oct 16 · 37 DTE`, a `dl` of Mark / share `$0.95`, Period yield `1.58%`, Annualized `15.62%/yr`, Delta `0.22`, Open interest `1,800`, Spread `$0.06 (6%)`, the caption `Cash to secure 1 contract: $6000.00. Yield uses mark ÷ strike, before fees.`, and a `bench-review-KO` button calling `onReview(candidate)`; a waiting stock renders a warning `AlertBox` `{reason}. This stock stays on your watchlist while you wait.` and, when a candidate exists, the held-back line `A qualifying put exists ($150.00 · Oct 16 · 1.19% yield) but is held back until the IV condition can be judged on a usable reading.`
- `src/renderer/src/components/BenchSection.test.tsx`: title + count badge (green for Meets criteria); renders the `empty` node when there are no stocks; `aria-label` equals the title.

**Green — implementation (per mockup B):**

- `BenchCard`: `SectionCard` wrapper; row 1 `Button variant="link"` ticker `→` left, mono price right; row 2 `text-xs text-wb-text-secondary` — meets: `{fmtMoney(strike)} put · {fmtDate(expiration)} · {fmtYieldPercent(periodYield)} yield`, waiting: `reason`; row 3 `text-[11px] text-wb-text-muted` — left: meets → gate condition text (`IVR ≥ 40`) or nothing, waiting → `EarningsBadge` if the candidate is flagged else empty; right: `IVR <IvrCell/>`. Rank pill (`RankCell` styling lifted from `ScreenerResultsTable`) before the ticker on meets cards. ✕ remove button top-right corner with `watchlist-remove-{t}`.
- `BenchDetail`: the `StockDetail` layout from the mockup — `STOCK DETAIL` eyebrow, ticker `font-wb-mono text-3xl text-wb-gold`, badge; 3-col stat grid in `bg-wb-bg-elevated`; `ReadingNote`; `YOUR THESIS`; `ENTRY CONDITIONS` (gate badges then tags); `Earnings` row; `MatchingPutCard` (`SectionCard header="Matching put · best score for this stock"`, gold `Review trade →` button) or the warning + held-back paragraph. Formatters: `fmtMoney`, `fmtDate`, `fmtYieldPercent`, `fmtDelta`, `fmtOpenInterest`, `fmtSpread` from `lib/screener-format.ts` and `lib/format.ts`; `dayChange` from `lib/day-change.ts`.
- `GateBadge` colours: met → `Badge color="var(--wb-green)"`, unmet → default gold `Badge`, unknown → `Badge color="var(--wb-text-muted)"`, none → omitted (with `No personal conditions` shown once if every gate is none and there are no tags).

**Refactor — cleanup to consider:**

- `RankCell` classes (`RANK_PILL`, `DEMOTED_RANK`) move from `ScreenerResultsTable` into `BenchCard` before the table is deleted in Area 8.
- Keep `BenchDetail` under ~200 lines by splitting `MatchingPutCard` and `ReadingNote` into their own files if it grows.

**Acceptance criteria covered:**

- "A stock that passes its conditions and has a qualifying put meets criteria"; "The detail panel shows the matching put and a Review trade action"; "Show last price with the day change"; "A down day is shown in red"; "The detail panel shows each entry condition with its verdict"; "Earnings within the window is shown for any stock"; "No earnings caution …"; "An unknown earnings date is a caution"; "A stale reading is muted … selecting PEP shows the held-back put"; "Removing a stock still works from its card" (button).

### 8. Combined `WatchlistPage`; retire the Screener page

**Files to create or modify:**

- `src/renderer/src/pages/WatchlistPage.tsx` — rewrite as the combined page.
- `src/renderer/src/pages/WatchlistPage.test.tsx` — rewrite.
- `src/renderer/src/App.tsx` — remove the `/screener` route, nav item, `SCREENER_PAGE_TITLE` import and `PAGE_TITLES['/screener']`.
- `src/renderer/src/App.test.tsx` — update.
- Delete: `src/renderer/src/pages/ScreenerPage.tsx` + `.test.tsx`, `src/renderer/src/components/ScreenerResultsTable.tsx` + `.test.tsx`, `src/renderer/src/components/ScreenerExcludedSection.tsx` + `.test.tsx`.
- Keep and reuse: `ScreenerCriteriaStrip`, `ScreenerStateCard`, `ScreeningCriteriaSheet`, `EarningsBadge`, `MarketStatusPill`, `WatchlistAddForm`, `buildPromoteSearch`, `fmtQuoteTime`.

**Red — tests to write (`WatchlistPage.test.tsx`, mocking `useWatchlistSnapshot`, `useScreenerResults`, `useScreeningCriteria`, `useMarketStatusDisplay`, `useSettingsStatus`, `useAddToWatchlist`, `useRemoveFromWatchlist`, `useLocation`):**

- Header: `h1` `Watchlist`, count badge from `rows.length`, `MarketStatusPill`, buttons `bench-criteria` ("Screening criteria"), `bench-refresh` ("↻ Refresh"), `bench-add-toggle` ("+ Add stock"); `Stale snapshot` badge + quoted-time caption when `display === 'CLOSED'` and `meets.length > 0`.
- `ScreenerCriteriaStrip` renders under the header and opens the sheet; `bench-criteria` opens the sheet; the sheet's `onSaved` shows `Screening criteria saved` and refetches the snapshot.
- `bench-add-toggle` toggles `WatchlistAddForm` (hidden by default when `rows.length > 0`; always visible with the empty-state guidance when `rows.length === 0`).
- `bench-refresh` calls both `refetch`s.
- Body: two `BenchSection`s (`Meets criteria`, `Stocks of interest`) in a grid `xl:grid-cols-[minmax(300px,0.85fr)_minmax(420px,1.15fr)]` with the sticky `BenchDetail`; the meets section's empty node is `ScreenerStateCard data-testid="screener-empty"` titled `No candidates match your criteria` with `Adjust criteria` (disabled when criteria are unloadable); `results.status === 'provider_unavailable'` renders `screener-unavailable` (`Market data unavailable` + `Retry refresh`, or `Market data not connected` + `Open Settings` when `credentialStatus.marketData === 'missing'`) above the sections while cards still render with `Data unavailable · not evaluated`.
- Selection: default from `defaultSelection`; clicking a card's ticker selects it; removing the selected ticker falls back to the default.
- `Review trade` navigates to `/new?${buildPromoteSearch(candidate, entry.notes)}`.
- Loading and error states: `LoadingState` while either query is pending with no data; `ErrorAlert` for a failed snapshot or screener query (existing copy).
- `App.test.tsx`: no `a[href="#/screener"]`; `PAGE_TITLES` has no `/screener`; `#/watchlist` renders the combined page.

**Green — implementation (per mockup B):**

- Header (`PageHeader`): left — `Watchlist` + `Badge` count + `Stale snapshot` badge; right — `bench-criteria` outline button, `bench-refresh` outline button, `bench-add-toggle` gold button, `MarketStatusPill`. Below: the criteria strip row (`ScreenerCriteriaStrip`) with the right-aligned mono caption `quoted HH:mm:ss` when stale.
- Body `flex flex-col gap-5 p-6`: `SavedBanner` (moved from `ScreenerPage`), `WatchlistAddForm` when toggled or empty, `ErrorAlert`s, `screener-unavailable` card, outage `AlertBox variant="warning"` (`Market data is unavailable. Saved stocks and theses are still here. Prices are last-known; IV ranks come from the local snapshot store and keep their own age. No stocks are marked as meeting criteria.`), then the grid: left column `BenchSection` × 2, right `xl:sticky xl:top-4` `SectionCard` with `BenchDetail` and the muted caption `Select a stock to see its thesis, condition checks, IV-reading status, and matching contract here.` Footer line: `Meets criteria = saved stock conditions pass on a usable IV reading + a qualifying put. Aging readings (2–3 sessions) still count; a stale, earnings-predating, or missing reading is unknown and never satisfies a condition. Stocks without personal conditions use screening defaults.`
- `ScreeningCriteriaSheet` mounted with `watchlistCount = rows.length`.
- `EmptyGuidance` retained for `rows.length === 0`.

**Refactor — cleanup to consider:**

- `CriteriaButton` and `SavedBanner` from `ScreenerPage` become small components in `src/renderer/src/components/` rather than page-local duplicates.
- Remove `WATCHLIST_PAGE_TITLE`/`SCREENER_PAGE_TITLE` asymmetry in `App.tsx`; grep for any remaining `ScreenerPage`/`screener-row-` references in renderer tests.

**Acceptance criteria covered:**

- "The screener lives on the Watchlist page"; "Screening criteria are edited from the Watchlist page"; "Saving criteria re-screens the bench in place"; "Refresh re-screens the bench"; "Add stock reveals the add form …"; "No stock meets criteria"; "Market data unavailable degrades verdicts, not rows"; "Market data not connected points at Settings"; "Stale marks are flagged when the market is closed"; "An empty watchlist explains itself"; "Review trade hands off to the pre-filled new-wheel form"; "The first meets-criteria stock is selected by default".

### 9. Re-point the existing screener e2e helpers and suites

**Files to create or modify:**

- `e2e/screener-helpers.ts` — `goToScreener` → `goToBench` (`location.hash = '#/watchlist'`, `waitForSelector('h1:has-text("Watchlist")')`); `reloadScreener` → `reloadBench`; new queries `meetsTickers`, `waitingTickers`, `cardReason`, `cardRank`, `selectCard`, `detailPutMetrics` (Map of `dt` → `dd`), `detailDayChange`, `detailEarnings`, `ivrCell` (moved from `ivr-staleness.spec.ts`, reading the numeral and `freshness-ring[data-state]`), `hoverIvrRing`; `rankedTickers` → alias of `meetsTickers`; `rowCells`/`rowRank` → `cardRank`; `excludedReason` → `cardReason`; `promoteRow` → `selectCard` then click `bench-review-{t}`; `ENTRY_POINT_SELECTOR.header` → `[data-testid="bench-criteria"]`, `.empty` → `[data-testid="screener-empty"] button`; `seedWatchlist` (in `e2e/ivr-helpers.ts`) gains an optional per-ticker `conditions` map `{ ownBelowPrice?, ivrTrigger?, postEarningsOnly? }` passed straight to `window.api.watchlist.add`; `launchScreener` gains `conditions` and always seeds `stockQuotes` (default flat quotes for every fixture so the price gate is `none`/`met`, never `unknown`, in specs that are not about price).
- `e2e/screener-results.spec.ts`, `e2e/screener-earnings.spec.ts`, `e2e/screening-criteria.spec.ts`, `e2e/promote-to-trade.spec.ts`, `e2e/ivr-staleness.spec.ts` — edit assertions to the bench surface; keep every `it` name and story id.
- `e2e/ivr-watchlist-collection.spec.ts`, `e2e/watchlist.spec.ts` — verify unchanged (US-63's add form is now behind `+ Add stock` when rows exist: `goToWatchlist` waits for `watchlist-add-submit`, so the helper must click `bench-add-toggle` first when the list is non-empty).

**Red — tests to write (existing names, new assertions):**

- `screener-results`: "results are ranked by yield-per-delta" → `meetsTickers` equals `['KO','AAPL','MSFT']` and `cardRank` reads `#1..#3`; "a row shows the metrics for its recommended strike" → `selectCard('AAPL')` then `detailPutMetrics` pins `$180.00 PUT`, `1.5%`, `14.8%/yr`, `0.28`, `4,200`, `$0.06 (2%)`; "IV rank unavailable is shown, not blank" → `ivrCell('MSFT').text === 'n/a'` and no ring; "excluded candidates are listed with a reason" → `cardReason('TSLA') === 'spread 22% exceeds 10%'` under waiting; outage / not-configured / stale cases keep their test ids.
- `screener-earnings`: badge assertions move to `[data-testid="watchlist-row-{t}"] [data-testid="earnings-badge"]`; "ranks by earnings certainty before score" → `meetsTickers` order and `cardRank` `—` for demoted; excluded-for-earnings reason via `cardReason`.
- `screening-criteria`: header/strip/empty entry points via the new selectors; "not navigated away" asserts `#/watchlist`; the sidebar-visible test clicks `a[href="#/"]` instead of the retired watchlist link and waits for `#/`.
- `promote-to-trade`: `promoteRow` flow unchanged from the spec's point of view.
- `ivr-staleness`: "An expired reading is indistinguishable from no reading" → renamed "An expired reading shows exp and behaves as no reading", asserting `text === 'exp'`, `state === 'expired'`, ring `data-state="expired"`, and `ivrCell('MSFT')` still `n/a` with no ring; other cases read the ring state instead of `title`.

**Green — implementation:**

- Helper edits as listed; no production code.

**Refactor — cleanup to consider:**

- Rename the file to `e2e/bench-helpers.ts` only if every import site is touched anyway; otherwise keep the name and add a header comment.

**Acceptance criteria covered:**

- Preserves US-66, US-67, US-68, US-70, US-98 ACs on the moved surface; directly covers "The screener lives on the Watchlist page" (navigation) and "An expired reading shows exp …".

### 10. E2e Tests

**Files to create or modify:**

- `e2e/watchlist-bench.spec.ts` — new, one `it` per AC, `describe('US-96: one live bench')`.
- `e2e/screener-helpers.ts` — add bench fixtures: `XLF_PUT` (strike 50, mid 0.65, delta −0.24, OI 8610, dte 37 → period 1.3%, score 0.53 < KO's 0.71), `AMD_PUT` (strike 150, bid 2.79, ask 3.21, mid 3.00, delta −0.25, OI 1000, dte 37 → `spread 14% exceeds 10%`), `DIS_PUT`, `ORCL_PUT`, `XYZ_PUT` (ordinary ranking puts so those tickers have chains); `BENCH_QUOTES` with `prevClose` set for AAPL (`178.40` / `176.98`) and MSFT (`505.10` / `511.24`); `BENCH_CONDITIONS` (KO `ivrTrigger 40`; AAPL `ownBelowPrice 170, ivrTrigger 50`; PEP `ivrTrigger 45`; ORCL `ivrTrigger 50`; DIS `ivrTrigger 40`; XYZ `ivrTrigger 40`; MSFT `postEarningsOnly`; AMD `ivrTrigger 50`); `BENCH_IVR` using `observedAt` offsets from `e2e/trading-day-fixtures.ts` (KO 58 fresh, XLF 46 fresh, AAPL 34 fresh, MSFT 41 two sessions old, PEP 58 six sessions old, ORCL 62 one session old with `earnings: { next: null, last: <day after observation> }`, DIS 47 twelve sessions old, AMD 52 fresh, XYZ omitted); `BENCH_EARNINGS` (MSFT `dayOffset 3`, AMD `dayOffset 5`, KO `dayOffset 40`, XYZ omitted from the record → unknown).

**Red — tests to write (each `it` mirrors one AC verbatim):**

1. `it('The screener lives on the Watchlist page')` — no `a[href="#/screener"]`; `bench-criteria`, `bench-refresh`, `bench-add-toggle`, and `market-status-pill` visible.
2. `it('A stock that passes its conditions and has a qualifying put meets criteria')` — KO under `[data-bench-section="meets"]`; card line `$60.00 put · <screenerDate(37) as MMM d> · 1.58% yield`.
3. `it("Meets-criteria cards follow the screener's rank order")` — `meetsTickers()` starts `['KO','XLF']`.
4. `it('A stock with no personal conditions meets criteria on the screening defaults alone')` — XLF in meets; `selectCard('XLF')` detail verdict copy `Screening criteria met`.
5. `it('The detail panel shows the matching put and a Review trade action')` — `selectCard('KO')`; `detailPutMetrics` pins `$60.00 PUT`, `· 37 DTE`, `$0.95`, `1.58%`, `15.62%/yr`, `0.22`, `1,800`, `$0.06 (6%)`, caption contains `$6000.00`; `bench-review-KO` visible.
6. `it('Review trade hands off to the pre-filled new-wheel form')` — seed KO note `Core wheel`; click review; `promote-provenance` visible; form fields ticker `KO`, strike `60`, premium `0.95`, contracts `1`, thesis `Core wheel`; positions list still empty.
7. `it('The first meets-criteria stock is selected by default')` — `bench-detail-ticker` reads `KO` on load.
8. `it('Show last price with the day change')` — AAPL card `watchlist-price` `$178.40`; `selectCard('AAPL')`; `bench-day-change` `+0.8%` with `data-direction="up"`.
9. `it('A down day is shown in red')` — MSFT detail `−1.2%`, `data-direction="down"`.
10. `it('An unmet price condition and an unmet IV condition are both reported')` — `cardReason('AAPL') === 'Price $178.40 above $170 target · IV low'`.
11. `it('Only the IV condition is reported when the price condition is met')` — AAPL seeded with `ownBelowPrice 185`; reason `IV low`.
12. `it('The detail panel shows each entry condition with its verdict')` — `bench-gate-price` text `≤ $170 · not met`, `bench-gate-iv` `IVR ≥ 50 · not met`; thesis text under `Your thesis`.
13. `it('The post-earnings gate holds a stock while earnings is near')` — `cardReason('MSFT') === 'Earnings in 3 days'`.
14. `it('Earnings within the window is shown for any stock, regardless of conditions')` — `selectCard('AMD')`; `bench-detail-earnings` reads `<screenerDate(5) as MMM d> · in 5 days`, `data-tone="caution"`.
15. `it('No earnings caution when the report is outside the window')` — KO earnings line has no `data-tone="caution"`.
16. `it('An unknown earnings date is a caution, not a silent pass')` — XYZ earnings line `Unknown · needs verification`.
17. `it("A stock whose conditions pass but has no qualifying put shows the screener's reason")` — `cardReason('AMD') === 'spread 14% exceeds 10%'`.
18. `it('A fresh reading shows a full green ring')` — `ivrCell('KO')` text `58`, ring `data-state="fresh"`.
19. `it('An aging reading still satisfies an IV condition')` — launch with KO observed two sessions earlier; KO in meets; `ivrCell('KO').text === '58 · 2d'`, ring `aging`.
20. `it('A stale reading is muted and cannot satisfy an IV condition')` — PEP in waiting with reason `IV too old to judge`; cell `58 · 6d` muted, ring `stale`; `selectCard('PEP')` detail contains `$150.00 · <date> · 1.19% yield`.
21. `it('A reading that predates earnings cannot satisfy an IV condition')` — ORCL reason `IV predates earnings`; ring `predates_earnings`; cell muted `62`.
22. `it('An expired reading shows exp and a never-collected ticker shows n/a')` — DIS `exp` + ring `expired`; XYZ `n/a`, no ring; both reasons `IV unavailable`.
23. `it('Hovering the ring explains the reading')` — `hoverIvrRing('PEP')`; `ivr-tooltip` visible, contains `Stale`, `6 trading days old`, `Aug` session label, `cannot satisfy an IV condition`.
24. `it('Screening criteria are edited from the Watchlist page')` — `openCriteriaSheet(page,'header')`; `criteriaValues` equal defaults; `criteriaChips` equal the default strip; hash still `#/watchlist`.
25. `it('Saving criteria re-screens the bench in place')` — set delta 0.15–0.20 via the sheet; `Screening criteria saved` visible; `meetsTickers` changes; hash `#/watchlist`.
26. `it('Refresh re-screens the bench')` — `setOptionSnapshotFixtures(app, [...])` to drop XLF's put; click `bench-refresh`; XLF moves to waiting.
27. `it('Add stock reveals the add form and the new stock joins the bench')` — click `bench-add-toggle`; `watchlist-add-submit` visible; add `NVDA`; NVDA card appears under waiting; header count +1.
28. `it('Removing a stock still works from its card')` — click `watchlist-remove-AAPL`; `watchlist-row-AAPL` gone; count −1.
29. `it('No stock meets criteria')` — fixtures `[TSLA_PUT]`; `screener-empty` inside the meets section with `Adjust criteria`; TSLA under waiting.
30. `it('Market data unavailable degrades verdicts, not rows')` — `marketDataError: 'network_error'`; `screener-unavailable` with `Retry refresh`; meets empty; every card reason `Data unavailable · not evaluated`; `watchlist-price` `—`; `ivrCell('KO')` still `58` with a ring.
31. `it('Market data not connected points at Settings')` — `withoutBrokerCredentials`; `screener-unavailable` reads `Market data not connected` with `Open Settings`.
32. `it('Stale marks are flagged when the market is closed')` — `marketStatus: closed`; `screener-stale-badge` visible; caption contains `quoted`.
33. `it('An empty watchlist explains itself')` — launch with no seeding; empty guidance text `No tickers yet` and `watchlist-add-submit` visible.

**Green — implementation:**

- Fixtures and helpers as listed; every rendered number is produced by the real engine over the fixtures (US-66 ADR), so recompute `XLF_PUT`/`AMD_PUT` outputs through `scoreCandidate` in a unit test before pinning.

**Refactor — cleanup to consider:**

- Fold `BENCH_*` fixtures into a `benchLaunch(dbPath, overrides)` helper so each `it` states only its delta from the canonical bench.

**Acceptance criteria covered:**

- All 33 scenarios in `docs/epics/08-stories/US-96-watchlist-live-snapshot.md`, one test each (AC audit below).

## AC Audit

| #   | Story scenario                                                                      | E2e test (Area 10) |
| --- | ----------------------------------------------------------------------------------- | ------------------ |
| 1   | The screener lives on the Watchlist page                                            | 1                  |
| 2   | A stock that passes its conditions and has a qualifying put meets criteria          | 2                  |
| 3   | Meets-criteria cards follow the screener's rank order                               | 3                  |
| 4   | A stock with no personal conditions meets criteria on the screening defaults alone  | 4                  |
| 5   | The detail panel shows the matching put and a Review trade action                   | 5                  |
| 6   | Review trade hands off to the pre-filled new-wheel form                             | 6                  |
| 7   | The first meets-criteria stock is selected by default                               | 7                  |
| 8   | Show last price with the day change                                                 | 8                  |
| 9   | A down day is shown in red                                                          | 9                  |
| 10  | An unmet price condition and an unmet IV condition are both reported                | 10                 |
| 11  | Only the IV condition is reported when the price condition is met                   | 11                 |
| 12  | The detail panel shows each entry condition with its verdict                        | 12                 |
| 13  | The post-earnings gate holds a stock while earnings is near                         | 13                 |
| 14  | Earnings within the window is shown for any stock, regardless of conditions         | 14                 |
| 15  | No earnings caution when the report is outside the window                           | 15                 |
| 16  | An unknown earnings date is a caution, not a silent pass                            | 16                 |
| 17  | A stock whose conditions pass but has no qualifying put shows the screener's reason | 17                 |
| 18  | A fresh reading shows a full green ring                                             | 18                 |
| 19  | An aging reading still satisfies an IV condition                                    | 19                 |
| 20  | A stale reading is muted and cannot satisfy an IV condition                         | 20                 |
| 21  | A reading that predates earnings cannot satisfy an IV condition                     | 21                 |
| 22  | An expired reading shows exp and a never-collected ticker shows n/a                 | 22                 |
| 23  | Hovering the ring explains the reading                                              | 23                 |
| 24  | Screening criteria are edited from the Watchlist page                               | 24                 |
| 25  | Saving criteria re-screens the bench in place                                       | 25                 |
| 26  | Refresh re-screens the bench                                                        | 26                 |
| 27  | Add stock reveals the add form and the new stock joins the bench                    | 27                 |
| 28  | Removing a stock still works from its card                                          | 28                 |
| 29  | No stock meets criteria                                                             | 29                 |
| 30  | Market data unavailable degrades verdicts, not rows                                 | 30                 |
| 31  | Market data not connected points at Settings                                        | 31                 |
| 32  | Stale marks are flagged when the market is closed                                   | 32                 |
| 33  | An empty watchlist explains itself                                                  | 33                 |

Every scenario has exactly one named e2e test. When the plan completes, run `/update-spec us-96`.
