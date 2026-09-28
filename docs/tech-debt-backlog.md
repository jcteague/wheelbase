# Tech Debt Backlog

Consolidated from refactor-phase-results.md files. Verified against codebase 2026-03-14.

## Priority 1 — Fix during next related work

### Duplicate `fmt()` / `formatPremium()` helpers

- **Status:** Still exists — `PositionCard.tsx:8` and `PositionDetailPage.tsx:56` both define `fmt(value)` doing `parseFloat(value).toFixed(2)`. `ExpirationSheet.tsx:7` has `formatPremium()`. Three copies.
- **Fix:** Extract to `lib/format.ts`. Already planned in `plans/frontend-perf-reuse/plan.md`.
- **When:** Next time any component touches currency formatting.

### `ClosedSnapshotData` mixed casing

- **Status:** Still exists — `api/positions.ts:167`. `ClosedSnapshotData` extends `CostBasisSnapshotData` (snake_case: `basis_per_share`) but adds camelCase fields (`positionId`, `snapshotAt`, `finalPnl`). Mixed conventions in a single type.
- **Fix:** Pick one casing for the renderer API types. Since IPC returns camelCase, convert `CostBasisSnapshotData` to camelCase too.
- **When:** Next time the API types are touched.

### Re-export in `services/positions.ts`

- **Status:** Still exists — `services/positions.ts:12` re-exports `listPositions` from `./list-positions`. The only consumer (`ipc/positions.ts:12`) imports from `../services/positions`.
- **Fix:** Change `ipc/positions.ts` to import from `../services/list-positions` directly, then remove the re-export.
- **When:** Next time either file is modified.

## Priority 2 — Address in a visual polish pass

### ExpirationSheet inline styles (portal issue)

- **Status:** Still exists — entire component (378 lines) uses `React.CSSProperties` objects because Tailwind classes don't apply inside `createPortal(…, document.body)`.
- **Fix:** Separate plan exists at `plans/fix-sheet-portal-styles/plan.md`. Reinstall shadcn Sheet, fix portal target, rewrite to Tailwind.
- **When:** Before building the next sheet-based UI (close CSP sheet, roll sheet, etc.).

### PositionCard / PositionRow inline styles

- **Status:** Still exists — `PositionCard.tsx` (now `PositionRow`) uses inline style objects for all layout, borders, and colors. Same portal-independent issue: dynamic color values (`${color}18`) can't be Tailwind classes.
- **Fix:** Move dynamic colors to CSS custom properties set via `style`, keep layout in Tailwind. Part of visual polish.
- **When:** Visual polish pass or design system extraction.

## Priority 3 — Low urgency, fix when convenient

### `ExpireCspResponse.leg` carries unused fields

- **Status:** Still exists — `api/positions.ts:186-196`. The `leg` type includes `positionId`, `legRole`, `action`, `optionType`, `premiumPerContract`, `fillDate`, `createdAt`, `updatedAt` — none read by ExpirationSheet.
- **Fix:** Narrow the type to only what the component uses, or leave as-is since it matches the IPC shape (no runtime cost).
- **When:** Optional. No functional impact.

### Electron window dimensions are magic numbers

- **Status:** Still exists — `src/main/index.ts:11-12` has `width: 900, height: 670`.
- **Fix:** Extract to a config constant. Very low priority.
- **When:** When window management gets more sophisticated.

## US-121 — IV history open items (from code review, 2026-09-27)

Advisories from the two fresh-context reviews of US-121 (`plans/us-121/refactor-phase-results.md`)
that were not applied. None blocks an acceptance criterion.

### Stale "needs credentials" card copy after credentials are added — decision pending

- **Status:** The `no_market_data` run-state entry is cleared only by a later settle. Saving credentials in Settings triggers no run, so cards keep saying "IV rank needs Alpaca market-data credentials" until the next scheduled or manual run.
- **Options:**
  - Drop the per-card reason and rely on the bench-wide "Market data not connected → Open Settings" notice (`MarketDataOutage`), which follows live state. This means editing AC-20 in Linear (OPT-27).
  - Clear `no_market_data` entries and re-run collection when credentials are saved.
  - A one-off startup check.
- **When:** Before the next Settings/credentials work. Priority 1.

### Ticker left on "Computing IV history" after a rethrown DB error

- **Status:** The batch calls `markPending(ticker)`. When `collectIvHistory` throws a `SqliteError`, the error is rethrown before `settle`. The `finally` notification then shows the ticker pulsing until the next run.
- **Fix:** `runState.settle(ticker, { status: 'failed' })` before the rethrow in `ivr-collector.ts`, with a test.
- **When:** Next touch of the collector. Priority 1, small.

### Alpaca 403 read as "no credentials" aborts the whole batch

- **Status:** `apiFetch` maps both 401 and 403 to `auth_failed`. `collectIvHistory` turns that into `no_market_data`, and the batch then marks every remaining ticker "needs credentials" and stops.
- **Why it matters:** An entitlement 403 has the same shape. `research.md` records "OPRA agreement is not signed" for an `end` on the current day, and recent-SIP limits are the same class.
- **Fix:** A distinct code for an entitlement 403 (inspect the body), treated as a per-ticker `failed`.
- **When:** Priority 1 if an entitlement 403 is ever seen in logs; otherwise Priority 2.

### Strike probe loses its neighbour fallback on on-grid prices and wide-spaced names

- **Status:** `strikeCandidates(price)` takes the floor/ceil at 0.5 / 1 / 2.5 / 5 increments. A price exactly on the grid (e.g. 200.0000) yields only `[200]`. For names whose at-the-money strikes are $10+ apart, usually only one probed strike is listed. Either way the "untraded strike → neighbour" fallback has nothing to fall back to, and the session drops to the monthly tier or a gap.
- **Fix:** Also probe the next grid step on each side, and add a $10 increment for high-priced names.
- **When:** Priority 2. Check the gap counts for high-priced names first.

### Permanent gaps and repeated recompute warnings

- **Status:**
  - A `no_underlying_bar` gap is never re-probed, by ADR. A transient empty stock-bar response gaps that session permanently.
  - Rows that stay behind `IV30_ENGINE_VERSION` because their inputs no longer invert are re-selected on every collect and log a WARN each time.
- **Fix:** A gap TTL, or re-probe `no_underlying_bar` once. Stamp unrecomputable rows so they are attempted once per engine version.
- **When:** Priority 2.

### Absence reason only visible on hover

- **Status:** On a bench card the absence reason is a `title` on a non-focusable span. Keyboard and touch users see only `n/a` or `…`; the visible explanation is only in BenchDetail's `ReadingNote`.
- **Fix:** `tabIndex={0}` plus `aria-label`, or an `sr-only` span carrying the reason.
- **When:** Next accessibility or visual-polish pass. Priority 2.

### `requests` count in `iv_history_collected` is wrong

- **Status:** The field logs 1–2 (provider method calls), not HTTP requests. A backfill makes ⌈symbols/100⌉ option calls plus pages, about 25–35.
- **Fix:** Drop the field, or have the adapter report its request count.
- **When:** Priority 3.

### Fake market-data provider blind spots

- **Status:** `FakeMarketDataProvider` never returns a partial (still-forming) bar or an entitlement 403. It holds spot constant for a whole series and "lists" every strike and every Friday. E2e can therefore pass while the real Alpaca path has one of these defects; the settle-margin bug was hidden this way until review.
- **Fix:** Add fixture options for partial bars, 403 bodies, per-session spot, and unlisted strikes and expirations, when a test needs them.
- **When:** Priority 3, alongside any fix above that the fake cannot currently exercise.

### Spec drift left by US-121

- **Status:** These still describe Barchart, `ivr_snapshot`, `market_closed` or the old collector as current:
  - `docs/spec/features/us-43-*`, `us-44-*` (rerun "overwrites the existing row"), `us-97-*`, `us-98-*` (120-day refresh), `us-100-*` (weekend guard), `us-116-*`
  - minor: `us-56-*`, `us-65-*`, `us-117-*`
  - `architecture/02-adrs/ivr-collector-throttle-boundary.md`, which should get a superseded note
  - `ivr-assessment-three-state-result.md`, `earnings-persisted-per-ticker.md`, `fill-migration-gap-with-007.md`
  - the watchlist block and "See also" in `schema/tables.md`

  Unrelated older drift from US-116: `domain/market-data.md` still puts the clock and calendar on `BrokerProvider`.

- **Fix:** `/audit-spec`, then reconcile. Also decide whether to add a dedicated `docs/spec/domain/iv-history.md` page. IV-history domain content (IV30 method, gates, rank/percentile formulas) currently lives on the us-121 feature page and in `domain/market-data.md`.
- **When:** Priority 2.

### Known and accepted: IV rank vs vendor numbers

- **Status:** Validated 2026-09-27 against Unusual Whales and Barchart:
  - The 52-week IV low and high match to within ~0.5 vol pt.
  - Ranks fall within the vendors' own disagreement: AAPL 35 vs UW 36 / BC 40; MSFT 34 vs BC 37 / UW 25; KO 56 vs UW 50 / BC 66; NVDA and AVGO 0, at genuine 52-week lows, vs UW 2 / 4.
  - Calendar-day time (DTE / 365) is kept deliberately. It causes a Friday dip of −0.30 vol pt vs neighbours, but the vendors share the convention, and a trading- or weighted-time switch would move every rank away from them.
- **Open idea (not debt):** pricing _today's_ reading from a closing quote would close the remaining ~1-pt gap near 52-week extremes. It conflicts with the story's "same engine for today and history" rule, so it needs its own decision.

## Resolved — No longer applicable

### ~~Remaining `fetch()` calls in renderer~~

- **Resolved.** `src/renderer/src/api/positions.ts` now uses `window.api.*()` IPC calls exclusively. No `fetch()` calls remain.

### ~~`WheelStatus` casing inconsistency (legacy lowercase)~~

- **Resolved.** `WheelStatus` in `api/positions.ts:15` is now `'ACTIVE' | 'CLOSED'` only. No legacy lowercase values remain.

### ~~ExpirationSheet `useEffect` eslint-disable~~

- **Resolved.** No `eslint-disable` comments exist in `ExpirationSheet.tsx`. The component uses conditional rendering (`if (!open) return null`) instead of effect-based state reset.

### ~~PositionCard phase label/color mismatch (10 legacy phases vs 4)~~

- **Resolved.** `WheelPhase` in `core/types.ts` defines 10 phases. Both `PHASE_LABEL` in `PositionCard.tsx` and `PHASE_COLOR` in `lib/phase.ts` cover all 10. The "4 canonical phases" note was wrong — the Electron app kept the full phase set.

### ~~API codegen for WheelPhase/WheelStatus~~

- **Not applicable.** This is an Electron app with no HTTP API. The renderer types in `api/positions.ts` and the Zod enums in `core/types.ts` are both hand-maintained, but they're in the same repo and change together. Codegen adds no value here.
