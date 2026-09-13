# US-96 — One live bench (watchlist + screener on a single page) — Tasks

Plan: `plans/us-96/plan.md` · Story: `docs/epics/08-stories/US-96-watchlist-live-snapshot.md`
Supporting: `research.md`, `data-model.md`, `contracts/watchlist-snapshot.md`, `contracts/screener-results.md`, `quickstart.md`
Mockup: `mockups/us-96-combined-watchlist-b-focus.mdx`

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Every Refactor task **invokes the `/refactor` skill** in the main conversation (subagents cannot invoke it)

---

## Layer 1 — Foundation (no dependencies)

> These areas can be started immediately and run in parallel.

### Area 1 — `expired` becomes an assessed IV-rank state

- [x] **[Red]** Write failing tests — `src/main/core/ivr-freshness.test.ts`, `src/main/services/ivr-snapshots.test.ts`, `src/main/services/screener.test.ts`, `src/renderer/src/components/IvrCell.test.tsx`
  - `ivr-freshness`: 12 sessions old → `status: 'assessed'`, `state: 'expired'`, `ageTradingDays: 12`, original `value`/`observedAt`; `isUsableState('expired') === false`; boundary 11 → `expired`, 10 → `stale`; corrupt value still `unreadable`
  - `ivr-snapshots`: expired row appears in the map as an `expired` reading (not `null`); unreadable row → `null` + logs `ivr_assessment_unreadable_snapshot`
  - `screener`: KO with `expired` reading → engine receives `ivRank: null` (floor not applied) while `RankedCandidate.ivRank` carries the `expired` reading
  - `IvrCell`: `state: 'expired'` renders `exp`, `data-ivr-state="expired"`, muted class
  - Run `pnpm test ivr-freshness ivr-snapshots screener IvrCell` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/ivr-freshness.ts`, `src/main/services/ivr-snapshots.ts`, `src/preload/index.d.ts`, `src/renderer/src/api/screener.ts`, `src/renderer/src/components/IvrCell.tsx` _(depends on: Area 1 Red ✓)_
  - Widen `IvRankState` with `'expired'`; in `assessIvRank` replace the `{ status: 'expired' }` early return with fall-through to the assessed return; remove the `expired` variant from `IvRankAssessment`
  - `getAssessedIvrByUnderlying` maps only `unreadable` → `null` (keep the warn log)
  - `IpcIvRank.state` and `ScreenerIvRank.state` gain `'expired'`
  - `IvrCell`: treat `expired` like `stale` for tone, render `exp` as the value (ring lands in Area 2)
  - Run `pnpm test ivr-freshness ivr-snapshots screener IvrCell` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/ivr-freshness.ts`, `src/main/services/ivr-snapshots.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm no dead `case 'expired'` branches remain in `ivr-freshness.test.ts` or the IVR collector
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 4 — Shared isolated quote fetch

- [x] **[Red]** Write failing tests — `src/main/services/underlying-quotes.test.ts`, `src/main/services/screener.test.ts`
  - `underlying-quotes`: three tickers where the second rejects → map has the other two + one `underlying_quote_fetch_failed` warn log; empty ticker list → empty map without calling the provider
  - `screener`: existing price-ceiling cases still pass (ceiling off → no quote call; one failing ticker leaves only its ceiling unevaluated)
  - Run `pnpm test underlying-quotes screener` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/underlying-quotes.ts`, `src/main/services/screener.ts`, `src/main/services/market-data.ts` _(depends on: Area 4 Red ✓)_
  - `fetchIsolatedStockQuotes(provider, tickers): Promise<Map<string, IpcStockQuote>>` — concurrency 4 via `mapWithConcurrency`, per-ticker `try/catch`, `logger.warn({ err, ticker }, 'underlying_quote_fetch_failed')`, flatten via `flattenStockQuote` (export it from `market-data.ts`)
  - `readUnderlyingPrices` in `screener.ts` delegates to it and maps to `price`; keep the `criteria.maxUnderlyingPrice === null` early return
  - Run `pnpm test underlying-quotes screener` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/underlying-quotes.ts`, `src/main/services/screener.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Delete the now-unused `QUOTE_FETCH_CONCURRENCY` constant from `screener.ts` if it moved
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Ring UI + verdict engine (depends on Layer 1)

> These areas can run in parallel with each other **after** Area 1 Green is complete.

### Area 2 — Freshness ring and tooltip in `IvrCell`

**Requires:** Area 1 Green ✓ (`expired` in `ScreenerIvRank.state`)

- [x] **[Setup]** Install the shadcn tooltip primitive — `src/renderer/src/components/ui/tooltip.tsx`
  - `pnpm dlx shadcn@latest add tooltip` (installs `@radix-ui/react-tooltip`); style `TooltipContent` with `wb` tokens (`bg-wb-bg-elevated`, `border-wb-border`, `shadow-lg`, `z-50`) matching `popover.tsx`
- [x] **[Red]** Write failing tests — `src/renderer/src/components/FreshnessRing.test.tsx`, `src/renderer/src/lib/ivr-tooltip.test.ts`, `src/renderer/src/components/IvrCell.test.tsx` _(depends on: Area 1 Green ✓)_
  - `FreshnessRing`: `data-testid="freshness-ring"` with `data-state`; fill circle `stroke-dasharray` first term = `fraction × circumference` for `{ fresh: 1, aging: 0.75, stale: 0.5, expired: 0.25 }`; `predates_earnings` → no fill circle, gold track (`stroke="var(--wb-gold)"`), centre dot; `aria-hidden="true"`
  - `ivr-tooltip`: titles `Fresh | Aging | Stale | Expired | Predates earnings`; stale body has `6 trading days old`, session `Fri, Aug 28`, "cannot satisfy an IV condition"; expired body has `exp` + "collection has been failing"; aging body "still counts"; `1 trading day` singular
  - `IvrCell`: keep six existing cases (retire the "predates earnings" caption → assert gold ring `data-state="predates_earnings"`; `n/a` with `data-ivr-state="empty"` and **no** ring; ET date in `aria-label`); add `expired` → `exp` + `freshness-ring[data-state="expired"]`; `userEvent.hover` shows `role="tooltip"` with the tier title; focusing the trigger (`tabIndex=0`) opens it
  - Run `pnpm test FreshnessRing ivr-tooltip IvrCell` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/FreshnessRing.tsx`, `src/renderer/src/lib/ivr-tooltip.ts`, `src/renderer/src/components/IvrCell.tsx` _(depends on: Area 2 Red ✓)_
  - `FreshnessRing({ state, size = 14 })`: `stroke = 2.25`, `r = (size − stroke) / 2`, `c = 2πr`; track `stroke="var(--wb-border)"` (gold at 0.45 opacity for predates_earnings); fill stroke from `RING_COLOR`, `strokeDasharray="${frac·c} ${c}"`, `transform="rotate(-90 cx cy)"`; centre dot `r=1.6` gold for predates_earnings. SVG attributes bound to tokens, not inline `style`
  - `ivrTooltipCopy(reading): { title, body }` and `observedSessionLabel(observedAt)` (ET, `Intl.DateTimeFormat`, weekday short / month short / day)
  - `IvrCell`: `TooltipProvider > Tooltip > TooltipTrigger asChild > span[data-testid="ivr-cell"][data-ivr-state][tabIndex=0][aria-label]` with numeral (+ ` · {age}d`) and `FreshnessRing`; `TooltipContent data-testid="ivr-tooltip"` with 12px ring, mono uppercase title (`TIER_TEXT[state]`), body `text-xs text-wb-text-secondary`. Drop `title` on readings; `null` → `n/a` span with `title="No IV rank collected"`
  - Run `pnpm test FreshnessRing ivr-tooltip IvrCell` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/IvrCell.tsx`, `src/renderer/src/lib/ivr-tooltip.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Move `easternDay` formatting from `IvrCell` into `lib/ivr-tooltip.ts` (one date formatter)
  - `ScreenerResultsTable.test.tsx` may assert the retired caption/`title` — fix minimally (table is deleted in Area 8)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 3 — Pure verdict engine `core/watchlist-signal.ts`

**Requires:** Area 1 Green ✓ (`expired` in `IvRankState`)

- [x] **[Red]** Write failing tests — `src/main/core/watchlist-signal.test.ts` (one `it` per table row in `data-model.md` § Gate rules) _(depends on: Area 1 Green ✓)_
  - Price gate: no target → `none`; target + `price: null` → `unknown` "Price unavailable"; `178.40` vs `185.0000` → `met`; `178.40` vs `170.0000` → `unmet` label exactly `Price $178.40 above $170 target`; boundary `170.00` vs `170.0000` → `met`
  - IV gate: no trigger → `none`; `ivRank: null` → `unknown` "IV unavailable"; `expired` → "IV unavailable"; `stale` → "IV too old to judge"; `predates_earnings` → "IV predates earnings"; `fresh` 58/40 → `met`; `aging` 58/40 → `met`; `fresh` 34/50 → `unmet` "IV low"; boundary 50/50 → `met`
  - Earnings gate: `postEarningsOnly: false` → `none`; found 3 days → `unmet` `Earnings in 3 days`; 1 day → `Earnings in 1 day`; same ET day → `Earnings today`; 8 days → `met`; 7 days → `unmet` (inclusive); `none`/`unavailable`/past → `unknown` "Earnings date unknown"; `now = 2026-09-09T03:30:00Z` vs `2026-09-11` is 3 days (ET calendar day)
  - `reasonsFor`: earnings → price → IV order; only unmet/unknown labels; `[]` when all met/none
  - `allGatesPass`: true for all `met`/`none`; false on any `unmet`/`unknown`
  - `earningsDisplay`: found upcoming → `{ kind: 'date', date, daysUntil, withinWindow }` (`withinWindow` true at ≤ 7); past/none/unavailable → `{ kind: 'unknown' }`
  - Run `pnpm test watchlist-signal` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/watchlist-signal.ts` _(depends on: Area 3 Red ✓)_
  - Export `evaluateEntry`, `reasonsFor`, `allGatesPass`, `earningsDisplay` and types `Gate`, `GateVerdict`, `EntryVerdict`, `EntrySignalInput`, `EarningsDisplay` per `data-model.md`
  - Imports only `decimal.js`, `date-fns`, `./ivr-freshness` (`isUsableState`, `AssessedIvRank`), `./screener` (`EarningsLookup`), `./trading-calendar` (`etDateOf`). **No logger** (core rule)
  - Price label: `new Decimal(price).toFixed(2)`; target trimmed like `watchlistConditionTags` (`parseFloat(target).toString()`)
  - `daysUntil = differenceInCalendarDays(parseISO(date), parseISO(etDateOf(now)))`
  - Run `pnpm test watchlist-signal` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/watchlist-signal.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Share `≤ $170` target formatting with `watchlistConditionTags` only if a shared leaf already exists under `src/shared/`; otherwise leave both
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — `watchlist:snapshot` service, IPC, preload (depends on Layers 1–2)

### Area 5 — `watchlist:snapshot` service, IPC, and preload

**Requires:** Area 1 Green ✓, Area 3 Green ✓, Area 4 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/watchlist-snapshot.test.ts`, `src/main/ipc/watchlist.test.ts`, `src/main/index.test.ts` _(depends on: Area 3 Green ✓, Area 4 Green ✓)_
  - Service (real sqlite via `src/main/test-utils.ts`; fake provider/earnings mocked as in `screener.test.ts`): rows in watchlist order with `entry`, `quote { price, prevClose, timestamp }`, `ivRank`, `earnings`, `verdict`, `asOf === currentDate.toISOString()`; empty watchlist → `rows: []`, provider never constructed; `getProvider` throws → every `quote: null`, price gates `unknown`, IVR still assessed, resolves ok; one ticker rejects → only that row `quote: null`; `getEarningsCalendar` rejects → every `earnings: { kind: 'unknown' }`, `lastEarnings` undefined; stale reading → `verdict.iv.label === 'IV too old to judge'`; horizon = `currentDate + dteMax + 45` days; logs `watchlist_snapshot_built` at info with row count
  - IPC: `watchlist:snapshot` registers, returns `{ ok: true, rows, asOf }` from the mocked service, wraps a throw as `{ ok: false, errors: [{ field: '__root__', code: 'internal_error' }] }`; existing three-channel tests still pass with widened deps
  - `index.test.ts`: `registerWatchlistIpc` receives `getCurrentDate` (shared clock) — mirror the `registerScreenerIpc` assertion
  - Run `pnpm test watchlist-snapshot ipc/watchlist index` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/watchlist-snapshot.ts`, `src/main/ipc/watchlist.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/preload/index.d.ts` _(depends on: Area 5 Red ✓)_
  - `buildWatchlistSnapshot(getProvider, db, { currentDate })` per `contracts/watchlist-snapshot.md`: `listWatchlist` → `getScreeningCriteria` → `Promise.all([fetchIsolatedStockQuotes or empty map (warn watchlist_snapshot_provider_unavailable), wrapped getEarningsCalendar])` → `getAssessedIvrByUnderlying(db, tickers, { now, calendar: readTradingCalendar(db, now), lastEarnings })` → per entry `evaluateEntry` + `earningsDisplay`. `logger.debug` per-ticker inputs; `logger.info` summary
  - `registerWatchlistIpc({ db, getProvider, getCurrentDate = () => new Date() })`; `ipcMain.handle('watchlist:snapshot', …)` via `handleIpcCall('watchlist_snapshot_error', …)` — thin: no payload parse, one service call
  - `index.ts`: move `createFakeIvrCollaborators()` above `registerWatchlistIpc`; pass `getProvider: () => marketDataFactory.create()` and `getCurrentDate: ivrCollaborators.clock?.now` to both watchlist and screener registration
  - Preload: `watchlist.snapshot: () => invoke('watchlist:snapshot')`; types `IpcSnapshotQuote`, `IpcGate`, `IpcEntryVerdict`, `IpcEarningsDisplay`, `IpcWatchlistSnapshotRow`, `IpcWatchlistSnapshotResult`
  - Run `pnpm test watchlist-snapshot ipc/watchlist index` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/watchlist-snapshot.ts`, `src/main/services/screener.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract the shared earnings wrapper (`readEarnings` in `screener.ts` + snapshot's read) into `readEarningsOrEmpty(db, tickers, criteria, now)` in `services/earnings-dates.ts` or a small shared helper
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Renderer data layer (depends on Layer 3)

### Area 6 — Renderer adapter, hooks, bench join, day change

**Requires:** Area 5 Green ✓ (preload types + `watchlist.snapshot()`)

- [x] **[Red]** Write failing tests — `src/renderer/src/api/watchlist.test.ts`, `src/renderer/src/hooks/useWatchlistSnapshot.test.ts`, `src/renderer/src/hooks/useAddToWatchlist.test.ts`, `src/renderer/src/hooks/useRemoveFromWatchlist.test.ts`, `src/renderer/src/lib/bench.test.ts`, `src/renderer/src/lib/day-change.test.ts` _(depends on: Area 5 Green ✓)_
  - `api/watchlist`: `getWatchlistSnapshot` returns `{ rows, asOf }`; `ok:false` envelope throws `ApiError`
  - Hooks: `useWatchlistSnapshot` uses the snapshot key; add/remove success invalidates `['watchlist']`, `['watchlist','snapshot']`, `['screener','results']`
  - `bench`: KO (gates met/none, ranked #1) + XLF (all none, ranked #2) → `meets` in rank order, `rank` 1/2, copy `All conditions met` vs `Screening criteria met`; AAPL (price + IV unmet) → waiting `Price $178.40 above $170 target · IV low`; MSFT (earnings unmet) → `Earnings in 3 days` despite excluded candidate; PEP (IV unknown, ranked) → waiting `IV too old to judge`, `candidate` non-null; AMD (gates pass, excluded `spread 14% exceeds 10%`) → verbatim exclusion reason; XYZ (IV unknown, no candidate) → `IV unavailable`; `results.status === 'provider_unavailable'` → `meets` empty, every reason `Data unavailable · not evaluated`; `results` undefined → `Not screened yet` for stocks with no gate reasons; `defaultSelection` prefers `meets[0]`, then `waiting[0]`, then `null`
  - `day-change`: `178.40`/`176.98` → `{ percent: '+0.8%', direction: 'up' }`; `505.10`/`511.24` → `{ percent: '−1.2%', direction: 'down' }`; equal → flat `0.0%`; `prevClose: null` or `quote: null` → `null`
  - Run `pnpm test api/watchlist useWatchlistSnapshot useAddToWatchlist useRemoveFromWatchlist bench day-change` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/api/watchlist.ts`, `src/renderer/src/hooks/watchlistQueryKeys.ts`, `src/renderer/src/hooks/useWatchlistSnapshot.ts`, `src/renderer/src/hooks/useAddToWatchlist.ts`, `src/renderer/src/hooks/useRemoveFromWatchlist.ts`, `src/renderer/src/lib/bench.ts`, `src/renderer/src/lib/day-change.ts` _(depends on: Area 6 Red ✓)_
  - Types `SnapshotQuote`, `Gate`, `EntryVerdict`, `EarningsDisplay`, `WatchlistSnapshotRow`, `WatchlistSnapshot`; `getWatchlistSnapshot()` mapping `ok:false` via `throwMappedIpcErrors`
  - `watchlistQueryKeys.snapshot = ['watchlist', 'snapshot'] as const`; `useQuery({ queryKey, queryFn: getWatchlistSnapshot, refetchOnWindowFocus: true })`
  - `buildBench`, `defaultSelection`, `BenchStock`, `Bench` per `data-model.md` § Renderer shapes — never re-sort `results.ranked`; `meets` order = index in `ranked`
  - `dayChange(quote)`
  - Run `pnpm test api/watchlist useWatchlistSnapshot useAddToWatchlist useRemoveFromWatchlist bench day-change` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/lib/bench.ts`, `src/renderer/src/hooks/` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider a single `benchQueryKeys` re-export if the `screenerQueryKeys` cross-import reads oddly
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Bench components (depends on Layers 2 + 4)

### Area 7 — `BenchCard`, `BenchSection`, `BenchDetail`

**Requires:** Area 2 Green ✓ (`IvrCell` with ring), Area 6 Green ✓ (`BenchStock`, `dayChange`)

- [x] **[Red]** Write failing tests — `src/renderer/src/components/BenchCard.test.tsx`, `src/renderer/src/components/BenchDetail.test.tsx`, `src/renderer/src/components/BenchSection.test.tsx` _(depends on: Area 2 Green ✓, Area 6 Green ✓)_
  - `BenchCard`: meets card → `watchlist-row-KO`, `data-bench-section="meets"`, rank pill `#1`, ticker button `KO →` (`watchlist-ticker`), `watchlist-price` `$62.00`, line `$60.00 put · Oct 16 · 1.58% yield`, gate text `IVR ≥ 40`, an `ivr-cell`, `watchlist-remove-KO`; demoted (earnings `flagged`) → `—` rank + `earnings-badge`; waiting card → `data-bench-section="waiting"`, `watchlist-reason`, no rank; `quote: null` → `—` price; ticker click → `onSelect('KO')`; selected → `ring-1 ring-wb-gold`; ✕ → `onRemove('KO')`
  - `BenchDetail`: header ticker `font-wb-mono text-wb-gold`, green `Meets criteria` or default `Watching` badge; stat grid `Last price $178.40`, `bench-day-change` `+0.8%` `text-wb-green` `data-direction="up"`, `−1.2%` `text-wb-red`, `ivr-cell`; `Your thesis` = `entry.notes` or `No thesis yet.`; `bench-gate-price`/`bench-gate-iv`/`bench-gate-earnings` with `data-verdict` and texts `≤ $170 · not met`, `IVR ≥ 50 · not met`, `IVR ≥ 40 · met`, `IVR ≥ 45 · unknown`, `Post-earnings only · not met`; `watchlist-tag` chips for `core`; `Earnings` line `Sep 14 · in 5 days` `data-tone="caution"`, `Nov 3` plain, `Unknown · needs verification`; `ReadingNote` stale/expired/predates/never-collected `AlertBox` copy, nothing for fresh/aging; meets → `bench-detail-put` with `$60.00 PUT`, `Oct 16 · 37 DTE`, `dl` Mark `$0.95`, Period yield `1.58%`, Annualized `15.62%/yr`, Delta `0.22`, OI `1,800`, Spread `$0.06 (6%)`, caption `Cash to secure 1 contract: $6000.00. Yield uses mark ÷ strike, before fees.`, `bench-review-KO` → `onReview(candidate)`; waiting → warning `AlertBox` `{reason}. This stock stays on your watchlist while you wait.` and held-back line when a candidate exists
  - `BenchSection`: title + count badge (green for Meets criteria); `empty` node when no stocks; `aria-label` = title
  - Run `pnpm test BenchCard BenchDetail BenchSection` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/BenchCard.tsx`, `src/renderer/src/components/BenchSection.tsx`, `src/renderer/src/components/BenchDetail.tsx` (+ `GateBadge`, `ReadingNote`, `MatchingPutCard`, `DayChange`) _(depends on: Area 7 Red ✓)_
  - `BenchCard` per mockup B: `SectionCard`; row 1 link-button ticker `→` + mono price; row 2 meets line / waiting reason; row 3 gate text or `EarningsBadge` left, `IVR <IvrCell/>` right; rank pill (lift `RankCell` styling from `ScreenerResultsTable`); ✕ top-right
  - `BenchDetail` = mockup `StockDetail`: eyebrow, `text-3xl` gold ticker, badge; 3-col stat grid `bg-wb-bg-elevated`; `ReadingNote`; thesis; gate badges + tags; earnings row; `MatchingPutCard` (`SectionCard header="Matching put · best score for this stock"`, gold `Review trade →`) or warning + held-back paragraph. Formatters from `lib/screener-format.ts` / `lib/format.ts`; `dayChange` from `lib/day-change.ts`
  - `GateBadge`: met → `Badge color="var(--wb-green)"`, unmet → default gold, unknown → `color="var(--wb-text-muted)"`, none → omitted (`No personal conditions` once if all none and no tags)
  - Tailwind + `wb-*` tokens only — no inline color/spacing styles
  - Run `pnpm test BenchCard BenchDetail BenchSection` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/BenchDetail.tsx`, `src/renderer/src/components/BenchCard.tsx` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Move `RANK_PILL`/`DEMOTED_RANK` from `ScreenerResultsTable` into `BenchCard` before the table is deleted in Area 8
  - Split `MatchingPutCard` / `ReadingNote` into their own files if `BenchDetail` exceeds ~200 lines
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — Combined page (depends on Layer 5)

### Area 8 — Combined `WatchlistPage`; retire the Screener page

**Requires:** Area 6 Green ✓, Area 7 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/WatchlistPage.test.tsx` (rewrite), `src/renderer/src/App.test.tsx` _(depends on: Area 7 Green ✓)_
  - Mock `useWatchlistSnapshot`, `useScreenerResults`, `useScreeningCriteria`, `useMarketStatusDisplay`, `useSettingsStatus`, `useAddToWatchlist`, `useRemoveFromWatchlist`, `useLocation`
  - Header: `h1` `Watchlist`, count badge from `rows.length`, `MarketStatusPill`, `bench-criteria`, `bench-refresh`, `bench-add-toggle`; `Stale snapshot` badge + quoted-time caption when `display === 'CLOSED'` and `meets.length > 0`
  - `ScreenerCriteriaStrip` under the header opens the sheet; `bench-criteria` opens the sheet; `onSaved` shows `Screening criteria saved` and refetches the snapshot
  - `bench-add-toggle` toggles `WatchlistAddForm` (hidden by default when rows exist; always visible with empty-state guidance when `rows.length === 0`)
  - `bench-refresh` calls both `refetch`s
  - Body: two `BenchSection`s (`Meets criteria`, `Stocks of interest`) in grid `xl:grid-cols-[minmax(300px,0.85fr)_minmax(420px,1.15fr)]` with sticky `BenchDetail`; meets empty node = `ScreenerStateCard data-testid="screener-empty"` `No candidates match your criteria` + `Adjust criteria` (disabled when criteria unloadable); `provider_unavailable` → `screener-unavailable` (`Market data unavailable` + `Retry refresh`, or `Market data not connected` + `Open Settings` when `credentialStatus.marketData === 'missing'`) while cards still render `Data unavailable · not evaluated`
  - Selection: default from `defaultSelection`; ticker click selects; removing the selected ticker falls back to default
  - `Review trade` navigates to `/new?${buildPromoteSearch(candidate, entry.notes)}`
  - `LoadingState` while either query pending with no data; `ErrorAlert` for failed snapshot or screener query
  - `App.test.tsx`: no `a[href="#/screener"]`; `PAGE_TITLES` has no `/screener`; `#/watchlist` renders the combined page
  - Run `pnpm test WatchlistPage App` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/WatchlistPage.tsx` (rewrite), `src/renderer/src/App.tsx`; **delete** `pages/ScreenerPage.tsx` + `.test.tsx`, `components/ScreenerResultsTable.tsx` + `.test.tsx`, `components/ScreenerExcludedSection.tsx` + `.test.tsx` _(depends on: Area 8 Red ✓)_
  - `PageHeader`: left `Watchlist` + count `Badge` + `Stale snapshot` badge; right `bench-criteria` outline, `bench-refresh` outline, `bench-add-toggle` gold, `MarketStatusPill`; below: `ScreenerCriteriaStrip` row + right-aligned mono `quoted HH:mm:ss` caption when stale
  - Body `flex flex-col gap-5 p-6`: `SavedBanner` (moved from `ScreenerPage`), `WatchlistAddForm` when toggled or empty, `ErrorAlert`s, `screener-unavailable` card, outage `AlertBox variant="warning"` (copy in plan Area 8), grid with `BenchSection` × 2 left and `xl:sticky xl:top-4` `SectionCard > BenchDetail` right with the select-a-stock caption; footer legend line (copy in plan Area 8)
  - `ScreeningCriteriaSheet` mounted with `watchlistCount = rows.length`; `EmptyGuidance` retained for `rows.length === 0`
  - `App.tsx`: remove `/screener` route, nav item, `SCREENER_PAGE_TITLE` import, `PAGE_TITLES['/screener']`
  - Reuse: `ScreenerCriteriaStrip`, `ScreenerStateCard`, `ScreeningCriteriaSheet`, `EarningsBadge`, `MarketStatusPill`, `WatchlistAddForm`, `buildPromoteSearch`, `fmtQuoteTime`
  - Run `pnpm test WatchlistPage App` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/WatchlistPage.tsx`, `src/renderer/src/App.tsx` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `CriteriaButton` and `SavedBanner` become small components under `src/renderer/src/components/`
  - Remove the `WATCHLIST_PAGE_TITLE`/`SCREENER_PAGE_TITLE` asymmetry; grep renderer tests for stray `ScreenerPage` / `screener-row-` references
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 7 — Re-point existing e2e suites (depends on Layer 6)

### Area 9 — Re-point the screener e2e helpers and suites

**Requires:** Area 8 Green ✓

- [x] **[Red]** Rewrite assertions (keep every `it` name and story id) — `e2e/screener-results.spec.ts`, `e2e/screener-earnings.spec.ts`, `e2e/screening-criteria.spec.ts`, `e2e/promote-to-trade.spec.ts`, `e2e/ivr-staleness.spec.ts` _(depends on: Area 8 Green ✓)_
  - `screener-results`: ranked → `meetsTickers === ['KO','AAPL','MSFT']` + `cardRank` `#1..#3`; strike metrics → `selectCard('AAPL')` + `detailPutMetrics` pins `$180.00 PUT`, `1.5%`, `14.8%/yr`, `0.28`, `4,200`, `$0.06 (2%)`; IV unavailable → `ivrCell('MSFT').text === 'n/a'`, no ring; excluded → `cardReason('TSLA') === 'spread 22% exceeds 10%'` under waiting; outage/not-configured/stale keep their test ids
  - `screener-earnings`: badge selector `[data-testid="watchlist-row-{t}"] [data-testid="earnings-badge"]`; certainty ranking via `meetsTickers` + `cardRank` `—` for demoted; excluded-for-earnings via `cardReason`
  - `screening-criteria`: new entry-point selectors; "not navigated away" asserts `#/watchlist`; sidebar-visible test clicks `a[href="#/"]` and waits for `#/`
  - `promote-to-trade`: `promoteRow` flow unchanged from the spec's view
  - `ivr-staleness`: rename "An expired reading is indistinguishable from no reading" → "An expired reading shows exp and behaves as no reading" (`text === 'exp'`, `state === 'expired'`, ring `expired`; `ivrCell('MSFT')` still `n/a`, no ring); other cases read ring state instead of `title`
  - Run `pnpm test:e2e` — re-pointed suites must fail against the old helpers
- [x] **[Green]** Update helpers — `e2e/screener-helpers.ts`, `e2e/ivr-helpers.ts` (no production code) _(depends on: Area 9 Red ✓)_
  - `goToScreener` → `goToBench` (`#/watchlist`, wait `h1:has-text("Watchlist")`); `reloadScreener` → `reloadBench`
  - New queries: `meetsTickers`, `waitingTickers`, `cardReason`, `cardRank`, `selectCard`, `detailPutMetrics` (Map `dt` → `dd`), `detailDayChange`, `detailEarnings`, `ivrCell` (moved from `ivr-staleness.spec.ts`; reads numeral + `freshness-ring[data-state]`), `hoverIvrRing`
  - Aliases: `rankedTickers` → `meetsTickers`; `rowCells`/`rowRank` → `cardRank`; `excludedReason` → `cardReason`; `promoteRow` → `selectCard` + click `bench-review-{t}`; `ENTRY_POINT_SELECTOR.header` → `[data-testid="bench-criteria"]`, `.empty` → `[data-testid="screener-empty"] button`
  - `seedWatchlist` gains optional per-ticker `conditions` `{ ownBelowPrice?, ivrTrigger?, postEarningsOnly? }` → `window.api.watchlist.add`; `launchScreener` gains `conditions` and always seeds default flat `stockQuotes`
  - `goToWatchlist` clicks `bench-add-toggle` first when the list is non-empty (so `e2e/watchlist.spec.ts` and `e2e/ivr-watchlist-collection.spec.ts` stay green)
  - Run `pnpm test:e2e` — all suites must pass
- [x] **[Refactor]** `/refactor` — `e2e/screener-helpers.ts` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Rename to `e2e/bench-helpers.ts` only if every import site is touched anyway; otherwise add a header comment
  - Run `pnpm test:e2e`

---

## Layer 8 — New AC-driven e2e suite (depends on Layer 7)

**Requires:** All Green tasks from previous layers ✓ (Area 9 Green in particular — shares `e2e/screener-helpers.ts`)

### Area 10 — `e2e/watchlist-bench.spec.ts`

- [x] **[Pre-Red]** Pin fixture outputs through the real engine — unit test `XLF_PUT` / `AMD_PUT` via `scoreCandidate` (US-66 ADR: every rendered number comes from the engine over the fixtures)
  - Expect XLF period yield `1.3%`, score `0.53` (< KO's `0.71`); AMD `spread 14% exceeds 10%`
- [x] **[Red]** Write failing e2e tests — `e2e/watchlist-bench.spec.ts`, `describe('US-96: one live bench')`, one `it` per AC (names verbatim) _(depends on: Area 9 Green ✓)_
  - Fixtures in `e2e/screener-helpers.ts`: `XLF_PUT` (strike 50, mid 0.65, delta −0.24, OI 8610, dte 37), `AMD_PUT` (strike 150, bid 2.79, ask 3.21, mid 3.00, delta −0.25, OI 1000, dte 37), `DIS_PUT`, `ORCL_PUT`, `XYZ_PUT`; `BENCH_QUOTES` (AAPL `178.40`/`176.98`, MSFT `505.10`/`511.24`); `BENCH_CONDITIONS` (KO ivr 40; AAPL below 170 + ivr 50; PEP ivr 45; ORCL ivr 50; DIS ivr 40; XYZ ivr 40; MSFT postEarningsOnly; AMD ivr 50); `BENCH_IVR` via `e2e/trading-day-fixtures.ts` offsets (KO 58 fresh, XLF 46 fresh, AAPL 34 fresh, MSFT 41 @2d, PEP 58 @6d, ORCL 62 @1d with `earnings.last` day after observation, DIS 47 @12d, AMD 52 fresh, XYZ omitted); `BENCH_EARNINGS` (MSFT +3, AMD +5, KO +40, XYZ omitted)
  - AC coverage (plan § Area 10 has the exact assertions for each):
    - AC-1 The screener lives on the Watchlist page → `it('The screener lives on the Watchlist page')`
    - AC-2 → `it('A stock that passes its conditions and has a qualifying put meets criteria')`
    - AC-3 → `it("Meets-criteria cards follow the screener's rank order")`
    - AC-4 → `it('A stock with no personal conditions meets criteria on the screening defaults alone')`
    - AC-5 → `it('The detail panel shows the matching put and a Review trade action')`
    - AC-6 → `it('Review trade hands off to the pre-filled new-wheel form')`
    - AC-7 → `it('The first meets-criteria stock is selected by default')`
    - AC-8 → `it('Show last price with the day change')`
    - AC-9 → `it('A down day is shown in red')`
    - AC-10 → `it('An unmet price condition and an unmet IV condition are both reported')`
    - AC-11 → `it('Only the IV condition is reported when the price condition is met')`
    - AC-12 → `it('The detail panel shows each entry condition with its verdict')`
    - AC-13 → `it('The post-earnings gate holds a stock while earnings is near')`
    - AC-14 → `it('Earnings within the window is shown for any stock, regardless of conditions')`
    - AC-15 → `it('No earnings caution when the report is outside the window')`
    - AC-16 → `it('An unknown earnings date is a caution, not a silent pass')`
    - AC-17 → `it("A stock whose conditions pass but has no qualifying put shows the screener's reason")`
    - AC-18 → `it('A fresh reading shows a full green ring')`
    - AC-19 → `it('An aging reading still satisfies an IV condition')`
    - AC-20 → `it('A stale reading is muted and cannot satisfy an IV condition')`
    - AC-21 → `it('A reading that predates earnings cannot satisfy an IV condition')`
    - AC-22 → `it('An expired reading shows exp and a never-collected ticker shows n/a')`
    - AC-23 → `it('Hovering the ring explains the reading')`
    - AC-24 → `it('Screening criteria are edited from the Watchlist page')`
    - AC-25 → `it('Saving criteria re-screens the bench in place')`
    - AC-26 → `it('Refresh re-screens the bench')`
    - AC-27 → `it('Add stock reveals the add form and the new stock joins the bench')`
    - AC-28 → `it('Removing a stock still works from its card')`
    - AC-29 → `it('No stock meets criteria')`
    - AC-30 → `it('Market data unavailable degrades verdicts, not rows')`
    - AC-31 → `it('Market data not connected points at Settings')`
    - AC-32 → `it('Stale marks are flagged when the market is closed')`
    - AC-33 → `it('An empty watchlist explains itself')`
  - Run `pnpm test:e2e` — all 33 new tests must fail (or fail for a fixture reason, never pass vacuously)
- [x] **[Green]** Make e2e tests pass _(depends on: Area 10 Red ✓)_
  - Fixtures and helpers only; any production fix found here goes back to the owning area's Green task
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests — `e2e/watchlist-bench.spec.ts`, `e2e/screener-helpers.ts` _(depends on: Area 10 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Fold `BENCH_*` fixtures into a `benchLaunch(dbPath, overrides)` helper so each `it` states only its delta from the canonical bench
  - Run `pnpm test:e2e`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (33/33 per the plan's AC Audit)
- [x] `ScreenerPage`, `ScreenerResultsTable`, `ScreenerExcludedSection` and their tests are deleted; no `/screener` route or nav item remains
- [x] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
- [x] `pnpm test:e2e` — all suites green (re-pointed + new)
- [x] Run `/update-spec us-96`
