---
story: us-68
kind: feature
parent: null
topics: [screener, market-data, wheel-lifecycle]
status: planned
---

# Implementation Plan: US-68 — Promote a screener result to the new wheel form with pre-filled fields

## Summary

Add a "Promote to trade" action to each ranked screener row that navigates to the
existing new-wheel form (`#/new`) with ticker, strike, expiration, premium, and
contracts=1 pre-filled via hash query params, plus a `quotedAt` provenance timestamp and
an optional thesis seeded from the watchlist note. On open, the form re-fetches a fresh
quote for the promoted contract through the existing option-snapshots IPC and shows one
non-blocking banner (offline > stale > moved > edited > match precedence); the re-fetch
never overwrites the editable premium default, and nothing is recorded until the trader
submits the unchanged US-1 mutation. Done means all nine acceptance scenarios pass as
e2e tests over the US-66 screener harness.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** `docs/epics/08-stories/US-68-promote-result-to-new-wheel.md`
- **Mockup (five states: prefilled / moved / stale / offline / edited):** `mockups/us-68-promote-to-trade.mdx`
- **Research & Design Decisions:** `plans/us-68/research.md`
- **Data Model & Selection Logic:** `plans/us-68/data-model.md`
- **API Contract(s):** `plans/us-68/contracts/promote-navigation.md` (query-string contract — no new IPC)
- **Quickstart & Verification:** `plans/us-68/quickstart.md`

## Prerequisites

All shipped — no schema or infrastructure work needed:

- `screener:results` IPC + `ScreenerResultsTable`/`ScreenerPage` (US-65/66) provide the row to promote (`ScreenerCandidate` in `src/renderer/src/api/screener.ts`).
- `newWheelSchema` + `NewWheelForm` + `useCreatePosition` (US-1) are the promote target; `NewWheelPage` already reads `useSearch()` for `?ticker=`.
- `market-data:optionSnapshots` IPC + `api/market-data.ts#getOptionSnapshots` (US-33/39, Massive adapter) serve the fresh quote; `src/shared/option-symbol.ts#buildOccSymbol` builds the OCC key renderer-side.
- `useMarketStatusDisplay()` yields `LIVE`/`EXT`/`CLOSED`; `useWatchlist()` exposes the `notes` column (US-63).
- `AlertBox` (gold `warning` / green `success`), `fmtQuoteTime`, `fmtYieldPercent`, `computeDte` are reused as-is.

## Implementation Areas

### 1. Promote helpers library (`lib/promote.ts`)

**Files to create or modify:**

- `src/renderer/src/lib/promote.ts` — new: `PromotedCandidate` type, `buildPromoteSearch`, `parsePromotedParams`, `markMovedMaterially`, `derivePromoteBanner` (all pure, `decimal.js` for money math, Zod for param validation)
- `src/renderer/src/lib/promote.test.ts` — new test suite

**Red — tests to write** (all in `src/renderer/src/lib/promote.test.ts`):

- `buildPromoteSearch` encodes a `ScreenerCandidate`-shaped input into `promoted=1&ticker=AAPL&strike=180&expiration=2026-08-21&premium=2.70&quotedAt=…` — asserting strike is Decimal-normalized (`'180.0000'` → `'180'`), premium carried verbatim, and `quotedAt` URL-encoded.
- `buildPromoteSearch` appends `thesis=<encoded>` when a note is passed and omits the param when the note is `undefined`/empty.
- `parsePromotedParams` round-trips `buildPromoteSearch` output back to the `PromotedCandidate`.
- `parsePromotedParams` returns `null` for: missing `promoted=1` (a bare `?ticker=AAPL`), missing required param, non-positive/non-numeric `strike` or `premium`, malformed `expiration`.
- `markMovedMaterially('2.70', '2.50')` → `true` (deviation 0.20 > max(0.05, 0.135)).
- `markMovedMaterially('2.70', '2.68')` → `false` (0.02 under the $0.05 floor).
- `markMovedMaterially('2.70', '2.835')` → `false` (exactly at threshold — strict `>`).
- Sub-$1 floor: `markMovedMaterially('0.60', '0.64')` → `false` (0.04 ≤ 0.05 floor even though > 5%); `('0.60', '0.66')` → `true`.
- `derivePromoteBanner` precedence table (one assertion per row of the data-model state machine): failed fetch → `offline` even when market CLOSED and price moved; `CLOSED` and `EXT` display → `stale` even when fresh mark moved; open + moved → `moved` even when the trader edited; open + unmoved + edited premium → `edited`; open + unmoved + unedited → `match` (with `fresh.mark` and `timestamp` carried in the result); pending fetch (market LIVE, unedited) → `none`.

**Green — implementation:**

- `PromotedCandidate` type and an internal Zod schema per `plans/us-68/data-model.md`; `buildPromoteSearch`/`parsePromotedParams` per `plans/us-68/contracts/promote-navigation.md` (use `URLSearchParams` both ways).
- `markMovedMaterially(promotedMark: string, freshMark: string): boolean` — `Decimal(fresh).minus(promoted).abs().gt(Decimal.max('0.05', Decimal(promoted).times('0.05')))`.
- `derivePromoteBanner(input: { quote: 'pending' | 'failed' | { mark: string; timestamp: string }; marketDisplay: MarketStatusDisplay; promotedPremium: string; currentPremium: string }): PromoteBanner` — returns a discriminated union `{ kind: 'offline' | 'stale' | 'moved' | 'edited' | 'match' | 'none', … }` carrying the values each banner's copy needs (promoted mark, fresh mark, fresh timestamp).

**Refactor — cleanup to consider:**

- Keep the module I/O-free (no hooks, no window.api) so every branch stays a table-driven unit test.
- Check whether strike normalization duplicates an existing Decimal helper; reuse if one exists.

**Acceptance criteria covered:**

- Underpins "Warn when the price has moved materially" (threshold math), "Promote pre-fills the new-wheel form" (param codec), and the banner scenarios — asserted end-to-end in Area 5.

### 2. One-shot fresh-quote hook (`usePromotedQuote`)

**Files to create or modify:**

- `src/renderer/src/hooks/usePromotedQuote.ts` — new hook
- `src/renderer/src/hooks/usePromotedQuote.test.ts` — new test suite
- `src/renderer/src/hooks/marketDataQueryKeys.ts` — add a `promotedQuote(symbol)` key (vendor-scoped-query-keys ADR)

**Red — tests to write** (in `src/renderer/src/hooks/usePromotedQuote.test.ts`, mocking `../api/market-data` like `useOptionSnapshots.test.ts` does):

- Given a `PromotedCandidate` (AAPL / 180 / 2026-08-21), the hook requests exactly one OCC symbol `AAPL260821P00180000` and resolves `quote` to `{ mark: <snapshot.mid>, timestamp: <snapshot.timestamp> }`.
- Resolves to `'failed'` when `getOptionSnapshots` rejects (ApiError 502).
- Resolves to `'failed'` when the result has `unavailable: true` or the symbol is absent from the snapshots map.
- Is disabled (no fetch, `'pending'` never flips) when called with `undefined` (non-promoted form).
- Performs a single fetch: no `refetchInterval`, `refetchOnWindowFocus: false`, `retry: false` (assert via the mocked query options or by advancing timers with no second call).

**Green — implementation:**

- `usePromotedQuote(promoted: PromotedCandidate | undefined): { quote: 'pending' | 'failed' | { mark: string; timestamp: string } }` — builds the symbol with `buildOccSymbol({ ticker, expiration, strike, instrumentType: 'PUT' })`, wraps `getOptionSnapshots([symbol])` in `useQuery` under `marketDataQueryKeys.promotedQuote(symbol)` with `enabled: Boolean(promoted)`, `staleTime: Infinity`, `retry: false`, `refetchInterval: false`, `refetchOnWindowFocus: false`; maps query error / `unavailable` / missing symbol to `'failed'` (degrade, never throw — boundary-I/O rule from the alert-evaluation-failure-isolation ADR).
- Guard `buildOccSymbol` throws (invalid promoted strike) by disabling the query instead of crashing the form.

**Refactor — cleanup to consider:**

- Check for overlap with `useOptionSnapshots`'s symbol-building; extract a tiny shared `occPutSymbol` helper only if the duplication is real (readability-extraction rule — don't abstract two call sites with different shapes).

**Acceptance criteria covered:**

- "A fresh quote is shown when the form opens", "Form still works when the fresh quote can't be fetched" (the degrade path), and the data feed for "Warn when the price has moved materially".

### 3. Promote chrome components

**Files to create or modify:**

- `src/renderer/src/components/PromoteProvenance.tsx` — new: the gold "⊞ Promoted from Screener · Quoted HH:mm:ss" strip from the mockup's `Provenance` element
- `src/renderer/src/components/PromotedQuoteNotice.tsx` — new: renders one `derivePromoteBanner` result as an `AlertBox`
- `src/renderer/src/components/NewWheelDerivedRow.tsx` — new: the mockup's `DerivedRow` (capital required + yield-if-flat)
- Matching `.test.tsx` files for all three

**Red — tests to write:**

- `PromoteProvenance.test.tsx`: renders "Promoted from Screener" and `Quoted 10:42:15` from a `quotedAt` ISO string via `fmtQuoteTime`; when given a fresh timestamp it shows the fresh time instead (the AC's "snapshot time updates to the fresh quote's time").
- `PromotedQuoteNotice.test.tsx`, one case per banner kind, asserting exact copy and AlertBox tone: `moved` → gold, text `Price moved: quoted $2.70 → now $2.50 — review before submitting.`; `offline` → gold, `Couldn't refresh quote — showing screener snapshot from 10:42:15. Verify before recording.`; `stale` → gold, market-closed copy with the quoted time; `edited` → green, `Recording your entered price ($2.65), not the screener snapshot ($2.70).`; `match` → green, `Fresh quote matches the promoted mark — $2.70.` when equal and `Fresh quote $2.68 — no material move from the promoted $2.70.` otherwise; `none` → renders nothing.
- `NewWheelDerivedRow.test.tsx`: strike 180 / 1 contract → `$18,000` and caption `180 × 100 × 1 contract`; premium 2.70 / 37 DTE → `1.5% period · 14.8%/yr`; premium edited to 2.65 → `1.47% period · 14.5%/yr` plus the `recomputed from your price` note while capital stays `$18,000`; unparseable strike/contracts → `—` placeholders, no NaN.

**Green — implementation:**

- `PromoteProvenance({ quotedAt })` — gold-bordered strip (`border-wb-gold-border bg-wb-gold-subtle`, `font-wb-mono` uppercase label) exactly per the mockup's Provenance layout; Tailwind `wb-*` tokens only, no inline color styles.
- `PromotedQuoteNotice({ banner })` — maps `PromoteBanner` to `AlertBox variant="warning" | "success"` with the copy pinned above; `data-testid="promote-banner"` + `data-kind={banner.kind}` as the e2e/DOM contract.
- `NewWheelDerivedRow({ strike, contracts, premium, expiration })` — two-column row per the mockup (`Capital required` left with the `strike × 100 × N contract` caption; `Yield if flat` right in `text-wb-green`, `edited` note when flagged); `decimal.js` math, capital formatted `en-US` grouped 0dp, yields via `fmtYieldPercent`, DTE via `computeDte`.

**Refactor — cleanup to consider:**

- Banner copy strings live once (in the component or exported constants) so Area 5's e2e asserts the same literals.
- Check `NewWheelDerivedRow` for duplication with any existing capital/yield display; naming consistency with mockup terms (`Capital required`, `Yield if flat`).

**Acceptance criteria covered:**

- Visual halves of "Promote pre-fills… capital required shows $18,000", "A fresh quote is shown when the form opens", "Warn when the price has moved materially", "Warn when the market is not open", "Form still works when the fresh quote can't be fetched".

### 4. Promoted mode in `NewWheelForm` + `NewWheelPage` wiring

**Files to create or modify:**

- `src/renderer/src/components/NewWheelForm.tsx` — add optional `promoted?: PromotedCandidate` prop: promoted defaultValues, provenance strip, banner slot, derived row, DTE hint
- `src/renderer/src/pages/NewWheelPage.tsx` — parse `useSearch()` with `parsePromotedParams`, pass the result to `NewWheelForm`
- `src/renderer/src/components/NewWheelForm.test.tsx` — extend

**Red — tests to write** (extend `NewWheelForm.test.tsx`, mocking `usePromotedQuote` alongside the existing `useCreatePosition` mock; keep the DatePicker mock):

- Promoted render pre-fills inputs: Ticker `AAPL`, Strike `180`, Expiration `2026-08-21`, Contracts `1`, Premium `2.70`; thesis input holds the promoted note (AC 1 — the Advanced section must expose it, opened by default or the note surfaced when promoted).
- Derived row shows `$18,000` capital for the promoted values (AC 1).
- Premium is editable: `userEvent.clear` + type `2.65` → input accepts the value, no error rendered (AC 2).
- Submitting after the premium edit calls `mutation.mutate` with `premium_per_contract: 2.65` — not 2.70 (AC 3, unit level).
- Fresh quote success (`usePromotedQuote` mocked to `{ mark: '2.68', timestamp: <fresh ISO> }`): provenance shows the fresh time, premium input still reads `2.70`, banner kind `match` (AC 4).
- Fresh mark `2.50` → banner kind `moved` with the pinned copy; premium still `2.70`; submit button enabled (AC 5).
- `usePromotedQuote` → `'failed'` → banner kind `offline` naming the promoted `10:42:15` time; form still submits (AC — fetch failure).
- Market display `CLOSED` and `EXT` (mock `useMarketStatusDisplay`) → banner kind `stale` in both (AC — scenario outline).
- Non-promoted render (no `promoted` prop): no provenance strip, no banner, no derived row; existing `defaultTicker` behavior intact (regression guard).
- Mounting promoted does **not** call `mutation.mutate` (AC — never auto-submits, unit level).

**Green — implementation:**

- `NewWheelForm`: when `promoted` is set, build `defaultValues` per the data-model mapping (contracts `'1'`, premium = promoted mark, thesis = promoted note); call `usePromotedQuote(promoted)` and `useMarketStatusDisplay()`; watch `premiumPerContract`, `strike`, `contracts`, `expiration` with `useWatch`; compute the banner via `derivePromoteBanner({ quote, marketDisplay, promotedPremium, currentPremium })`; render, per the mockup's layout order: `PromoteProvenance` (fresh timestamp when the fetch succeeded, else `quotedAt`) → `PromotedQuoteNotice` → field grid (add hint texts from the mockup: `from screener — editable` on Ticker, `editable — override with the price you'll work` on Premium, `{computeDte(expiration)} DTE` on Expiration) → `NewWheelDerivedRow`. Open the Advanced section by default in promoted mode so the seeded thesis is visible. The re-fetch result never writes into form state — no `setValue`/`reset` (research ADR).
- `NewWheelPage`: `const promoted = parsePromotedParams(search)`; pass `promoted ?? undefined` to the form; keep `defaultTicker` for the legacy `?ticker=` flow (parse returns `null` there).
- Submit path, success card, and error mapping stay byte-identical — promote records via the trader's explicit submit only.

**Refactor — cleanup to consider:**

- `NewWheelForm` is growing: consider extracting the promoted chrome into a small `PromotedFormHeader` composition if the JSX passes ~2 screens; only if it names a real concept.
- Verify no orphaned props/imports from the `defaultTicker` path.

**Acceptance criteria covered:**

- "Promote pre-fills the new-wheel form", "Pre-filled premium is editable, not locked", "Submitting records the edited premium", "A fresh quote is shown when the form opens", "Warn when the price has moved materially", "Warn when the market is not open (CLOSED/EXT)", "Form still works when the fresh quote can't be fetched", "Promote never auto-submits" — all at unit level; e2e in Area 6.

### 5. Screener promote entry point

**Files to create or modify:**

- `src/renderer/src/components/ScreenerResultsTable.tsx` — add a trailing action column with a per-row `Promote to trade` button and an `onPromote(candidate)` callback prop
- `src/renderer/src/pages/ScreenerPage.tsx` — wire `onPromote`: look up the ticker's watchlist note via `useWatchlist()`, `navigate('/new?' + buildPromoteSearch(candidate, note))`
- `src/renderer/src/components/ScreenerResultsTable.test.tsx`, `src/renderer/src/pages/ScreenerPage.test.tsx` — extend (create the table test file if it doesn't exist)

**Red — tests to write:**

- `ScreenerResultsTable`: each ranked row renders a button accessible as `Promote to trade` (aria-label; `data-testid="screener-promote-<ticker>"`); clicking AAPL's calls `onPromote` with AAPL's full `ScreenerCandidate`.
- `ScreenerResultsTable`: header gains the action column without disturbing the existing 12 data columns (rank chip still column 1 — regression for US-66's `rowCells` ordering: action column goes **last**).
- `ScreenerPage`: with a watchlist entry `{ ticker: 'AAPL', notes: 'Would own below $170…' }` (mock `useWatchlist`), clicking promote navigates to a `/new?promoted=1&…` URL whose params round-trip via `parsePromotedParams` to the candidate + thesis.
- `ScreenerPage`: with no note (or watchlist still loading), the navigation URL omits `thesis` — promote is never blocked on the watchlist query.
- `ScreenerPage`: clicking promote does not call any create-position API (never auto-submits, source side).

**Green — implementation:**

- Compact gold-tinted button in a new last `TableCell` per row (styling consistent with `CriteriaButton`'s `border-wb-gold-border bg-wb-gold-dim text-wb-gold` treatment; `wb-*` tokens only); new `onPromote: (candidate: ScreenerCandidate) => void` prop threaded from `ScreenerPage`.
- `ScreenerPage`: `useWatchlist()` + `useLocation()`; `handlePromote(candidate)` finds the entry note (`entries?.find(e => e.ticker === candidate.ticker)?.notes ?? undefined`, empty-string → undefined) and navigates with `buildPromoteSearch`.

**Refactor — cleanup to consider:**

- Keep `ScreenerResultsTable` presentation-only (callback up, no navigation inside) to match the page-owns-effects split US-66 established.

**Acceptance criteria covered:**

- "When the trader clicks 'Promote to trade' on the AAPL row / Then the new-wheel form opens" (entry half of AC 1); thesis seeding from the US-69 dependency note; "Promote never auto-submits" (source side).

### 6. E2e Tests

**Files to create or modify:**

- `e2e/promote-to-trade.spec.ts` — new spec, one test per AC
- `e2e/screener-helpers.ts` — add: `promoteRow(page, ticker)` (click `screener-promote-<ticker>`, wait for the `#/new` form), `setOptionSnapshotFixtures(app, fixtures)` and `setMarketDataError(app, code)` runtime-env mutators via `app.evaluate`, and a `seedWatchlist` variant accepting notes

**Red — tests to write** (each maps to exactly one AC; names mirror the AC language; all launch via `launchScreener` with the AAPL fixture — mid 2.70, strike 180, dteOffset 37, `QUOTE_TIMESTAMP`):

- `test('promote pre-fills the new-wheel form')` — promote AAPL; assert ticker input `AAPL`, strike `180`, expiration `2026-08-21` (local date +37), premium `2.70`, contracts `1`, and the derived row shows `$18,000` (AC 1).
- `test('pre-filled premium is editable, not locked')` — clear premium, type `2.65`; assert the input holds `2.65` with no validation error (AC 2).
- `test('submitting records the edited premium')` — edit premium to `2.65`, submit, wait for the success card; verify the created position's premium is `2.65` via the production read path (`window.api` positions list/detail), not the 2.70 snapshot (AC 3).
- `test('a fresh quote is shown when the form opens')` — before promoting, `setOptionSnapshotFixtures` re-serves AAPL with mid `2.68` and a later timestamp; promote; assert the provenance strip shows the fresh time (not the screener's) and the premium input still reads `2.70` (AC 4).
- `test('warns when the price has moved materially')` — re-serve AAPL at mid `2.50`; promote; assert the gold banner text `Price moved: quoted $2.70 → now $2.50 — review before submitting.`, premium still `2.70`, and submit still succeeds after the warning (AC 5).
- `test('warns when the market is not open — CLOSED')` — launch with `marketStatus` CLOSED; promote; assert `data-kind="stale"` gold banner flagging the after-hours snapshot (AC 6, example 1).
- `test('warns when the market is not open — EXT')` — same with the EXT session fixture (AC 6, example 2).
- `test('form still works when the fresh quote cannot be fetched')` — after the screener renders, `setMarketDataError(app, 'unavailable')`; promote; assert promoted values pre-filled, banner `Couldn't refresh quote — showing screener snapshot from <fmtQuoteTime(QUOTE_TIMESTAMP)>`, then clear the error and submit successfully (AC 7).
- `test('promote never auto-submits')` — promote, wait for the form, do not submit; assert via `window.api` that zero positions exist; then submit and assert exactly one (AC 8).

**Green — implementation:**

- Helper additions only (this layer adds no production code): `promoteRow` clicks the Area-5 testid and waits for `input#ticker`; the env mutators run `app.evaluate((_, value) => { process.env.X = value })` — legal because `FakeMarketDataProvider` re-reads env per call; watchlist seeding passes `notes` through the production `watchlist.add` IPC for the thesis assertion inside the pre-fill test.
- Expected time strings computed with the same `date-fns` formatting as `fmtQuoteTime` so local-timezone runs stay deterministic (US-66 precedent).

**Refactor — cleanup to consider:**

- If the tests were green-on-arrival for any scenario, falsify assertions against flipped expected values (US-65/66 technique) before trusting them.
- Check for duplication between `promoteRow` plumbing and existing screener helpers.

**Acceptance criteria covered:**

- All nine scenarios from the story, one test each (the scenario outline's two examples are two tests).

## AC Audit

| #   | AC (Gherkin scenario)                                  | E2e test (Area 6)                                         |
| --- | ------------------------------------------------------ | --------------------------------------------------------- |
| 1   | Promote pre-fills the new-wheel form                   | `promote pre-fills the new-wheel form`                    |
| 2   | Pre-filled premium is editable, not locked             | `pre-filled premium is editable, not locked`              |
| 3   | Submitting records the edited premium                  | `submitting records the edited premium`                   |
| 4   | A fresh quote is shown when the form opens             | `a fresh quote is shown when the form opens`              |
| 5   | Warn when the price has moved materially               | `warns when the price has moved materially`               |
| 6   | Warn when the market is not open — CLOSED              | `warns when the market is not open — CLOSED`              |
| 7   | Warn when the market is not open — EXT                 | `warns when the market is not open — EXT`                 |
| 8   | Form still works when the fresh quote can't be fetched | `form still works when the fresh quote cannot be fetched` |
| 9   | Promote never auto-submits                             | `promote never auto-submits`                              |

Every AC has exactly one named e2e test. No uncovered ACs.
