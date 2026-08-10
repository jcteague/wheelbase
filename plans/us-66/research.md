# Research: US-66 — Display ranked screener results with key metrics

## Scope of research

US-66 is a **pure renderer story**. Every backend piece it consumes shipped in US-65
(`screener:results` IPC, `ScoredCandidate` / `ScreenerExclusion` shapes, preload
exposure) and is verified against current source below. No external/library unknowns
exist — all questions were resolved by reading the codebase, the US-65 spec page
(`docs/spec/features/us-65-score-wheel-candidates.md`), and the mockup
(`mockups/us-66-screener-results.mdx`).

## Verified current state (source-checked 2026-08-09)

| Claim                                                                                                                                                                                                               | Verified against                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `screener:results` takes no payload, returns `{ ok, status, ranked, excluded, quoteTimestamp }` inside the IPC envelope                                                                                             | `src/main/ipc/screener.ts`, `src/main/services/screener.ts:36-41`                                 |
| `provider_unavailable` arrives with empty `ranked`/`excluded` and null `quoteTimestamp` — modelled **inside** the success payload, never as an envelope error                                                       | `src/main/services/screener.ts:205`, `plans/us-65/contracts/screener-results.md`                  |
| Preload already exposes `window.api.screener.results()` typed as `IpcScreenerResultsResult`; `IpcScoredCandidate` carries all display fields incl. `earningsFlagged`, `ivRank: { value, observedAt }                | null`                                                                                             | `src/preload/index.ts:80-82`, `src/preload/index.d.ts:396-451` |
| Exclusion reasons arrive as render-verbatim strings (`spread 22% exceeds 10%`, `no puts quoted in the 30–45 DTE window`, `market data unavailable`)                                                                 | `src/main/core/screener.ts` formatters, `src/main/services/screener.ts:62-64,108-118`             |
| Every watchlist ticker appears in exactly one of `ranked` / `excluded` when `status: 'ok'`                                                                                                                          | US-65 spec "no ticker vanishes" invariant + `screener.integration.test.ts`                        |
| `MarketStatusPill` exists with `state: 'LIVE'                                                                                                                                                                       | 'EXT'                                                                                             | 'CLOSED'                                                       | 'DELAYED'`; `useMarketStatusDisplay()`is the shared wiring (settings → hasBroker → broker clock → display) already used by`PositionsListPage` | `src/renderer/src/components/MarketStatusPill.tsx`, `src/renderer/src/hooks/useMarketStatusDisplay.ts` |
| Renderer table convention is the in-house `TablePrimitives` (`TableHeader`/`TableCell` over a plain `<table>`), e.g. `WatchlistPage`                                                                                | `src/renderer/src/components/ui/TablePrimitives.tsx`, `src/renderer/src/pages/WatchlistPage.tsx`  |
| API-adapter + TanStack Query pattern: `api/<domain>.ts` maps the envelope (`throwMappedIpcErrors` on `!ok`), `hooks/use<Domain>.ts` wraps `useQuery`, query keys live in `hooks/<domain>QueryKeys.ts`               | `src/renderer/src/api/watchlist.ts`, `src/renderer/src/hooks/useWatchlist.ts`                     |
| Routing is wouter hash-based; nav items live in `App.tsx` sidebar (`NavItem`), routes in the `Switch`                                                                                                               | `src/renderer/src/App.tsx:39-56,103-108`                                                          |
| E2E market data is faked via `FAKE_MARKET_DATA=true` + `WHEELBASE_MOCK_OPTION_SNAPSHOTS` (OCC-symbol-keyed); `getOptionChainSnapshot` filters by underlying/type/expiration window, so screener chains work offline | `src/main/integrations/fake-market-data.ts:84-98`                                                 |
| E2E provider outage: `FAKE_MARKET_DATA_ERROR=<code>` makes every provider call throw; no ticker answered + provider failure ⇒ `provider_unavailable`                                                                | `src/main/integrations/fake-market-data.ts:64-67`, `src/main/services/candidate-chains.ts:93-103` |
| E2E market session: `FAKE_MARKET_STATUS` env (JSON `MarketStatus`) drives the pill (`session: 'closed'` ⇒ CLOSED)                                                                                                   | `src/main/integrations/fake-broker.ts:66-69`, `e2e/live-underlying-price.spec.ts`                 |
| E2E IVR seeding: `WHEELBASE_FAKE_IVR` + `_test:ivr-set-outcomes` + the collect-now path persists `ivr_snapshot` rows offline (US-44 pattern)                                                                        | `e2e/ivr-helpers.ts`, `src/main/ipc/test-ivr.ts`                                                  |

## Architecture Decisions

### ADR: Screener results consumed via a status-preserving API adapter

- **Decision:** Add `src/renderer/src/api/screener.ts` with `getScreenerResults(): Promise<ScreenerResults>` that throws mapped errors only on `!result.ok` (the unexpected `internal_error` row) and otherwise returns the **full payload including `status`**. `provider_unavailable` is data the page renders, not an error the query rejects with. Wrap in `useScreenerResults()` (TanStack `useQuery`, key from `hooks/screenerQueryKeys.ts`), fetch on mount, no polling; the outage card's "Retry refresh" button calls `refetch()`.
- **Why:** Matches the repo's adapter/hook/queryKeys pattern (watchlist, alerts, market-data). US-65 deliberately modelled every expected failure inside the success payload so the renderer can distinguish outage from empty; letting the query reject on outage would collapse that distinction into a generic error state. No polling because a screen run fans out provider requests per ticker — refresh is a deliberate trader action, consistent with there being no polling indicator convention (`MarketStatusPill` is the freshness signal).
- **Alternatives considered:** Throwing an `ApiError` for `provider_unavailable` and branching on error code in the page — rejected: it conflates the modelled outage with genuine IPC failure and fights the US-65 contract. TanStack polling (`refetchInterval`) — rejected: unrequested, provider-expensive, and the story defines freshness via the pill + stale badge instead.

### ADR: Table built on existing `TablePrimitives`, not a new shadcn Table import

- **Decision:** Render the ranked table as a plain `<table>` using the existing `TableHeader`/`TableCell` primitives (`src/renderer/src/components/ui/TablePrimitives.tsx`), with `wb-*` token classes per cell (gold rank badge + ticker, `text-wb-green` yields, muted secondary columns).
- **Why:** The story's technical note says "dense shadcn `Table`", but the codebase's established dense-table convention (WatchlistPage, LegHistoryTable) is `TablePrimitives` — which _is_ this repo's shadcn-style table layer, already carrying the exact mono-uppercase header and border treatment the mockup shows. Adding the shadcn registry `table.tsx` would duplicate an existing primitive for one page.
- **Alternatives considered:** `npx shadcn add table` — rejected as duplication; CSS-grid rows like the mockup's MDX — rejected: the mockup's grid is a preview-rendering artifact, real pages use semantic tables (and e2e selectors already assume `tr`/`td` patterns elsewhere).

### ADR: Display formatting — trim-to-2dp percents, 2dp score, integer spread percent

- **Decision:** New pure helpers in `src/renderer/src/lib/screener-format.ts`:
  - `fmtYieldPercent(fraction4dp)` → `×100`, up to 2dp with trailing zeros trimmed: `"0.0150"` → `1.5%`, `"0.0158"` → `1.58%`; annualized rendered as `` `${fmtYieldPercent(v)}/yr` `` → `14.8%/yr`.
  - `fmtScore(yieldPerDelta4dp)` → fixed 2dp: `"0.5286"` → `0.53`, `"0.5018"` → `0.50`.
  - `fmtSpread(abs2dp, pct2dp)` → `` `${fmtMoney(abs)} (${fmtPct(Number(pct))})` `` → `$0.06 (2%)` (integer percent via existing `fmtPct`).
  - `fmtIvr(ivRank | null)` → `n/a` when null, else the value with trailing zeros trimmed (`"44.0"` → `44`).
  - `fmtDelta(delta4dp)` → fixed 2dp (`"0.2800"` → `0.28`).
  - `fmtOpenInterest(n | null)` → `en-US` thousands grouping (`4200` → `4,200`), `—` when null.
  - `fmtQuoteTime(iso)` → local `HH:mm:ss` for the stale line (`16:00:02`).
- **Why:** These exact renderings are pinned by the ACs (`"1.5% period"`, `"14.8%/yr"`, `"0.28"`, `"44"`, `"4,200 OI"`, `"$0.06 (2%)"`, score `0.53`) and by the mockup (`1.58%`, `15.6%/yr`≈, `0.50`, `(6%)`). Trailing-zero trimming on percents mirrors the US-65 engine's own reason-string convention (up to 2dp, zeros trimmed), so the table can never disagree stylistically with an exclusion reason beside it. Existing `fmtMoney`/`fmtPct` are reused rather than re-implemented.
- **Alternatives considered:** Fixed 2dp everywhere — rejected: AC scenario 2 pins `1.5%` not `1.50%`. Formatting in the main process and shipping display strings — rejected: US-65 deliberately ships 4dp values and leaves display to the surface; two sources of rounding truth violates the round-once ADR.

### ADR: Stale badge = market display CLOSED, driven by the existing pill wiring

- **Decision:** `ScreenerPage` calls `useMarketStatusDisplay()`; when `display === 'CLOSED'` and ranked results exist, the header shows a gold `Stale snapshot` badge and the table is captioned with `Quoted {fmtQuoteTime(quoteTimestamp)} · after-hours option marks are unreliable`. `LIVE`/`EXT` render unbadged. The pill itself renders in the page header in all states.
- **Why:** The AC pins exactly one trigger — "Given the market status pill reads CLOSED" — and the mockup's `stale` state is the CLOSED session. Reusing `useMarketStatusDisplay` keeps one session-derivation path (per the market-status-pill memory: never invent new timing copy; the pill + this badge are the only freshness indicators).
- **Alternatives considered:** Badging on `EXT` too — rejected: not in the AC, and US-67/later can widen the predicate in one place if the trader wants it. Comparing `quoteTimestamp` age with wall-clock — rejected: invents a staleness heuristic the story doesn't define.

### ADR: Three mutually exclusive body states + always-visible exclusions under `ok`

- **Decision:** The page body renders exactly one of: (1) **ranked table** (`status: 'ok'`, `ranked.length > 0`), (2) **empty card** "No candidates match your criteria" (`status: 'ok'`, `ranked.length === 0`), (3) **outage card** "Market data unavailable" with red-toned border/icon and a "Retry refresh" button (`status: 'provider_unavailable'`). The collapsed **Excluded (n)** section renders below states (1) _and_ (2) whenever `excluded.length > 0`; it never renders in state (3).
- **Why:** The ACs require outage and empty to be visually distinct (error-red vs neutral-muted treatment per the mockup's `CenteredCard` tones). Showing exclusions under the empty state follows the story's trust requirement ("excluded and unavailable tickers are shown too … so the trader trusts the list is complete") — an all-excluded screen _is_ the empty state, and hiding the reasons there would be exactly the silent trimming the story forbids. Never under outage, because US-65 guarantees `excluded` is empty on outage (an outage says nothing about individual tickers).
- **Alternatives considered:** Following the mockup literally (no excluded section on the empty state) — rejected: the mockup's `empty` toggle just doesn't populate fixtures for it; the story text is the stronger signal. A single generic empty component parameterised by tone — kept, as one `ScreenerStateCard` with a `tone` prop (mockup's `CenteredCard`), since the two cards differ only in tone/copy/action.

### ADR: Score is exposed as a row data-attribute, not a column

- **Decision:** The ranked table has no score column (matching the mockup's 13 columns); each row carries `data-yield-per-delta={fmtScore(candidate.yieldPerDelta)}` and `data-testid={'screener-row-' + ticker}`, and a `ScoreLegend` caption under the table explains the ranking ("Ranked by yield-per-delta — annualized return-if-flat ÷ delta").
- **Why:** AC scenario 2 asserts "its yield-per-delta score is 0.53" — the number must be machine-verifiable — but the mockup deliberately keeps it out of the dense column set and explains it in the legend instead. A data attribute satisfies the AC in e2e without adding a 14th column the design rejected.
- **Alternatives considered:** A visible score column — rejected: contradicts the mockup and widens an already 12-column dense table. Tooltip-only (`title` on the rank badge) — viable but weaker: `title` is a UX affordance, the data attribute is the stable test contract; the rank badge gets `title` as a bonus, not the contract.

### ADR: Out-of-scope mockup elements are omitted, with their seams left intact

- **Decision:** Do **not** render: the Promote button/column (US-68), the earnings warning badges and earnings row-demotion (US-70 — `earningsFlagged` is read into the renderer type but unused), or any criteria-editing affordance (US-67 — the empty card's "Open Screener settings" action from the mockup is omitted; the card is copy-only). The mockup's `earnings` toggle state documents US-70, not this story.
- **Why:** Story's Out of Scope section names all three explicitly; Simplicity First forbids speculative rendering. Keeping `earningsFlagged` on the renderer type (it's already in `IpcScoredCandidate`) means US-70 adds a badge without touching the adapter.
- **Alternatives considered:** A disabled Promote button as a placeholder — rejected: dead UI for a story that may reshape it.

### ADR: New `/screener` route + nav item after Watchlist

- **Decision:** Add `<Route path="/screener" component={ScreenerPage} />` and a `NavItem` (`icon "⌕"`, label from `SCREENER_PAGE_TITLE`) in the Trading group directly after Watchlist in `App.tsx`.
- **Why:** The mockup's sidebar shows Screener adjacent to Watchlist (the feed it screens); hash routing and NavItem/Route are the established mechanism. Watchlist-then-Screener matches the trader's flow (curate list → screen it).
- **Alternatives considered:** Mockup's exact order (Watchlist, Screener, Calendar — i.e. moving Calendar) — rejected: reordering existing nav is unrelated churn.

### ADR: E2E fixtures reproduce AC numbers through the real engine

- **Decision:** `e2e/screener-helpers.ts` builds OCC-keyed `WHEELBASE_MOCK_OPTION_SNAPSHOTS` fixtures with expirations computed from `localDate(offset)` (e2e/dates.ts) so DTE lands in the 30–45 default window on any run date. Canonical fixtures (all puts, signed negative deltas as the provider ships them):
  - **AAPL** strike 180, bid 2.67 / ask 2.73 (mark 2.70), delta −0.28, OI 4200, exp = today+37 ⇒ period 1.5%, ann 14.8%/yr, score 0.53, spread $0.06 (2%).
  - **KO** strike 60, bid 0.92 / ask 0.98 (mark 0.95), delta −0.22, OI 1800, exp = today+37 ⇒ score 0.71 (rank 1).
  - **MSFT** strike 410, bid 6.05 / ask 6.35 (mark 6.20), delta −0.25, OI 2600, exp = today+44 ⇒ score 0.50 (rank 3); **no IVR outcome programmed** ⇒ `n/a`.
  - **TSLA** strike 240, bid 2.67 / ask 3.33 (mark 3.00, spread 0.66 = exactly 22%), delta −0.25, OI 1000, exp = today+37 ⇒ excluded `spread 22% exceeds 10%` (exact-22% chosen so the engine's round-up-2dp/trim formatter emits the AC's literal string).
  - Watchlist seeded via `window.api.watchlist.add` in `page.evaluate`; IVR (KO 38, AAPL 44) seeded via the US-44 offline path (`WHEELBASE_FAKE_IVR` + `_test:ivr-set-outcomes` + collect-now), per `e2e/ivr-helpers.ts`; outage via `FAKE_MARKET_DATA_ERROR: 'network_error'`; CLOSED session via `FAKE_MARKET_STATUS`.
- **Why:** The ACs pin exact rendered strings; deriving them from real engine math over crafted fixtures (rather than stubbing the IPC) keeps the e2e end-to-end and proves the renderer formats what US-65 actually emits. AC scenario 2's "expiring 2026-08-21 (37 DTE)" is fixture narrative — DTE, not the calendar date, is the invariant; hardcoded dates would rot.
- **Alternatives considered:** Freezing the app clock — no such seam exists in the packaged main process; relative expirations are the established pattern (`e2e/dates.ts`, expiring-soon specs).

## Open Questions

None. All unknowns were resolved against source; no `NEEDS CLARIFICATION` items remain.
