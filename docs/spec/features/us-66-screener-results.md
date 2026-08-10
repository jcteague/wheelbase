# US-66: Display ranked screener results with key metrics

<!-- generated:from us-66 -->

## Summary

US-66 is the payoff surface of the screener epic: the `/screener` page that renders
[us-65](us-65-score-wheel-candidates.md)'s scored candidates as a dense, ranked table —
one recommended put strike per ticker, in the engine's yield-per-delta order. A trader
reads many numbers at once, so the table shows the decision-relevant fields together
(strike, expiration, DTE, mark, period and annualized yield, delta, IV rank, open
interest, spread), and a collapsed `Excluded (n)` section below it carries every
non-ranking ticker with its verbatim engine reason — so the list is visibly complete
rather than silently trimmed.

The page owns no screening logic. **The renderer never re-sorts, never computes a yield,
and never formats a value outside `lib/screener-format.ts`.** Rank is `index + 1` over the
array the engine emits, so the displayed order can never contradict the displayed numbers.

Three body states are mutually exclusive and visually distinct — ranked results, "no
candidates match your criteria", and "market data unavailable" — and the header reuses the
existing [`MarketStatusPill`](../architecture/02-adrs/market-status-pill.md) so the
freshness of the marks is always visible; a CLOSED session adds a gold `Stale snapshot`
badge and the quote time.

Pure renderer work: no IPC surface, no service, no engine, no migration. Promoting a
candidate into the trade form is US-68, editing criteria is US-67, and the earnings badge
treatment is US-70 — all three are omitted deliberately, with their seams left intact.

## Acceptance criteria

_Background: the watchlist has been screened, and the market status pill reads LIVE._

- **Results are ranked by yield-per-delta** — given KO scores 0.71, AAPL 0.53 and MSFT
  0.50, KO is listed first, AAPL second, MSFT third; and each row shows strike,
  expiration, DTE, mark, period yield, annualized yield, delta, IV rank, open interest,
  and spread.
- **A row shows the metrics for its recommended strike** — AAPL's top strike (the $180
  put, 37 DTE, mark $2.70, delta 0.28, OI 4,200, spread $0.06 (2%)) renders
  `1.5% period`, `14.8%/yr`, delta `0.28`, IV rank `44`, `4,200 OI` and `$0.06 (2%)`; its
  yield-per-delta score is 0.53 (0.148 / 0.28).
- **IV rank unavailable is shown, not blank** — with no IVR for MSFT, the IV rank cell
  reads `n/a` and MSFT is still ranked by yield-per-delta.
- **Excluded candidates are listed with a reason** — expanding the excluded section shows
  TSLA with the verbatim reason `spread 22% exceeds 10%`, and no yield-per-delta rank is
  shown for it.
- **Provider outage is distinguished from no results** — when Massive was unreachable, a
  "market data unavailable" state is shown, visually distinct from an empty "no candidates
  match your criteria" state.
- **Stale marks are flagged** — when the market status pill reads CLOSED, the results are
  badged as a stale snapshot with the quote time.

## What was built

**Display formatters.** `src/renderer/src/lib/screener-format.ts` holds seven pure helpers
that turn the payload's decimal strings into the exact strings the ACs pin:
`fmtYieldPercent` (×100, up to 2dp with trailing zeros trimmed, so `"0.0150"` → `1.5%` and
annualized renders as `14.8%/yr`), `fmtScore` (fixed 2dp), `fmtSpread`, `fmtDelta`,
`fmtIvr` (`n/a` when null), `fmtOpenInterest` (`—` when null), and `fmtQuoteTime`. They
take narrow primitive inputs, never whole candidate objects; money-adjacent math goes
through `decimal.js` and `fmtQuoteTime` uses `date-fns` `format(parseISO(...))` rather than
slicing a timestamp. Trailing-zero trimming deliberately mirrors the US-65 engine's own
reason-string convention, so a table cell can never disagree stylistically with an
exclusion chip beside it. `fmtMoney` / `fmtPct` are reused from `lib/format.ts`.

**Adapter and hook.** `api/screener.ts` follows the watchlist adapter pattern and throws
mapped `ApiError`s **only** on an `ok: false` envelope; `status: 'provider_unavailable'`
resolves normally, because US-65 modelled it as data. `useScreenerResults()` wraps
`useQuery` with `screenerQueryKeys.results` and no `refetchInterval` — refresh is a
deliberate action. The renderer types alias the ambient `Ipc*` shapes field-for-field, with
no snake_case remapping.

**Components.** `ScreenerResultsTable` renders a plain `<table>` on the existing
`TableHeader`/`TableCell` primitives with 12 columns (`#`, `Ticker`, `Strike`, `Exp`,
`DTE`, `Mark`, `Yield`, `Ann.`, `Δ`, `IVR`, `OI`, `Spread`), a 20×20 gold rank chip, gold
mono tickers, `text-wb-green` yields, and a `ScoreLegend` caption explaining the ranking.
Rows carry `data-testid="screener-row-<ticker>"` and `data-yield-per-delta`.
`ScreenerExcludedSection` is a collapsible card (default collapsed) whose rows pair the
ticker with the engine's verbatim reason in a red-dim chip — and carry no rank anywhere.
`ScreenerStateCard` is one component with a `tone: 'error' | 'neutral'` prop covering both
the outage and empty states, exposing `data-tone` so their distinctness is machine-checkable.

**Page and route.** `ScreenerPage` composes the above, exports `SCREENER_PAGE_TITLE`, and
derives one value — `staleQuoteTime`, non-null only when the market display is CLOSED,
ranked rows exist, and a `quoteTimestamp` is present — which drives the header badge, the
gold caption, and the count line's `3 candidates · quoted 16:00:02` variant together.
`App.tsx` adds the `⌕ Screener` nav item after Watchlist, the `/screener` route, and the
shell's `PAGE_TITLES` entry, all labelled from the exported constant so they cannot drift.

**End-to-end verification.** `e2e/screener-results.spec.ts` runs six scenarios — one per AC
— against the packaged app with nothing between the IPC and the DOM stubbed: the fake
provider serves OCC-keyed put chains, the real US-65 engine scores them, and the assertions
read rendered cells. See the fixtures ADR below for why the numbers are what they are.

## Architecture decisions

### Screener results are consumed via a status-preserving adapter

- **Decision:** `getScreenerResults()` throws only on an `ok: false` envelope and otherwise
  returns the full payload **including `status`**; `useScreenerResults()` fetches on mount
  with no polling, and the outage card's "Retry refresh" calls `refetch()`.
- **Why:** US-65 deliberately modelled every expected failure inside the success payload so
  the renderer can tell an outage from an empty screen. Rejecting the query on outage would
  collapse that distinction into a generic error state. No polling because a screen run fans
  out provider requests per ticker — and the pill, not a spinner, is the freshness signal.
- **Rejected:** mapping `provider_unavailable` to an `ApiError` and branching on its code;
  a TanStack `refetchInterval`.

### Three mutually exclusive body states, with exclusions surviving the empty state

- **Decision:** Exactly one of ranked table / empty card / outage card renders. The
  collapsed excluded section renders under **both** `ok` branches when there are
  exclusions, and never under an outage.
- **Why:** The ACs require outage and empty to be visually distinct — error-red vs
  neutral-muted tones. An all-excluded screen _is_ the empty state, and hiding the reasons
  there would be exactly the silent trimming the story forbids. Exclusions are never shown
  on an outage because US-65 guarantees the list is empty there: an outage says nothing
  about any individual ticker.
- **Rejected:** following the mockup literally (its `empty` toggle simply doesn't populate
  exclusion fixtures; the story text is the stronger signal).

### The stale badge keys off market display CLOSED, not a timestamp heuristic

- **Decision:** `useMarketStatusDisplay()` drives everything; `display === 'CLOSED'` with
  ranked results yields the badge and the `Quoted HH:mm:ss` caption. `LIVE`/`EXT` render
  unbadged.
- **Why:** The AC pins exactly one trigger. Reusing the existing hook keeps one
  session-derivation path — the pill and this badge are the only freshness indicators, and
  no polling or timing copy was invented. See
  [Market status pill](../architecture/02-adrs/market-status-pill.md).
- **Rejected:** badging on `EXT` too (not in the AC); comparing `quoteTimestamp` age
  against wall-clock (invents a staleness heuristic the story doesn't define).

### The score is a row data-attribute, not a 13th column

- **Decision:** Each row carries `data-yield-per-delta={fmtScore(...)}`; a legend under the
  table explains the ranking, and the rank badge gets the score as a `title`.
- **Why:** The AC asserts a specific score, so it must be machine-verifiable — but the
  mockup deliberately keeps it out of an already-dense 12-column table. The data attribute
  is the stable test contract; the `title` is a bonus affordance, not the contract.

### Built on `TablePrimitives`, not a new shadcn `Table`

- **Decision:** A plain `<table>` on the existing `TableHeader`/`TableCell` primitives.
- **Why:** The story's note says "dense shadcn `Table`", but `TablePrimitives` _is_ this
  repo's shadcn-style table layer (`WatchlistPage`, `LegHistoryTable`), already carrying the
  mono-uppercase header and border treatment the mockup shows. Importing the registry
  `table.tsx` would duplicate an existing primitive for one page. See
  [Design system](../architecture/03-design-system.md).

### Formatting rounds for display only, and trims like the engine does

- **Decision:** Percents render at up to 2dp with trailing zeros trimmed; the score is fixed
  2dp; spread percent is an integer via the existing `fmtPct`.
- **Why:** The AC pins `1.5%`, not `1.50%`. US-65 ships 4dp values and leaves display to the
  surface — formatting in the main process would create a second source of rounding truth,
  violating its round-once decision.

### E2E fixtures reproduce the AC numbers through the real engine

- **Decision:** OCC-keyed fixtures with expirations at `localDate(+37)` / `localDate(+44)`,
  calibrated so the real engine emits the ACs' exact strings: KO (score 0.71), AAPL (1.5%,
  14.8%/yr, 0.53, `$0.06 (2%)`), MSFT (0.50, **no IVR seeded** ⇒ `n/a`), and TSLA whose
  0.66 spread is **exactly 22%** of mark so the engine's round-up formatter emits
  `spread 22% exceeds 10%`. Watchlist entries and IV ranks are seeded through production
  paths (`watchlist.add`; the real `ivr-collect` job over the US-44 fake-scraper seam).
- **Why:** The ACs pin exact rendered strings. Deriving them from real engine math over
  crafted fixtures — rather than stubbing the IPC — proves the renderer formats what US-65
  actually emits. Expirations are relative because DTE, not the calendar date, is the
  invariant; hardcoded dates would rot.
- **Note:** These tests were green on arrival (Layer 5 adds no production code), so their
  assertions were falsified against a throwaway copy of the spec with every expected value
  flipped — all six failed against the real rendered value. Same technique US-65's Layer 4
  used.

### Out-of-scope mockup elements are omitted, seams intact

- **Decision:** No Promote button (US-68), no earnings badge or row demotion (US-70 —
  `earningsFlagged` is on the renderer type but unused), no criteria-editing affordance
  (US-67 — the empty card is copy-only).
- **Why:** The story names all three as out of scope, and Simplicity First forbids
  speculative rendering. Keeping `earningsFlagged` on the type means US-70 adds a badge
  without touching the adapter.

### Route paths stay stated in three places

- **Decision:** The refactor replaced the shell header's five-deep nested ternary with a
  `PAGE_TITLES` lookup, but left route paths in the nav item, the title map, and the
  `Switch`.
- **Why:** Collapsing them needs a config-driven `PAGES` array, and the sidebar's
  interleaved section headers, the `/` route's two-value active check, and the nav-less
  `/positions/:id` route each become an exception encoded into that config. The duplication
  is cheaper than the abstraction.

## Contracts touched

**None added.** US-66 consumes [`screener:results`](../contracts/ipc-handlers.md) exactly as
US-65 shipped it — payload-free request; response
`{ ok, status, ranked, excluded, quoteTimestamp }` with `status: 'provider_unavailable'`
always arriving with empty `ranked`/`excluded` and a null timestamp. The renderer types in
`api/screener.ts` alias the ambient `IpcScoredCandidate` / `IpcScreenerExclusion` /
`IpcScreenerResultsResult` shapes field-for-field.

The page does introduce a **DOM contract** that the e2e suite binds to:
`screener-row-<ticker>` (with `data-yield-per-delta`), `screener-count`, `screener-empty`,
`screener-unavailable`, `screener-stale-badge`, `screener-stale-caption`,
`screener-excluded-toggle`, and `screener-excluded-row-<ticker>`.

## Schema

None. US-66 persists nothing and adds no migration.

## Source files

- `src/renderer/src/lib/screener-format.ts`
- `src/renderer/src/api/screener.ts`
- `src/renderer/src/hooks/screenerQueryKeys.ts`
- `src/renderer/src/hooks/useScreenerResults.ts`
- `src/renderer/src/components/ScreenerStateCard.tsx`
- `src/renderer/src/components/ScreenerResultsTable.tsx`
- `src/renderer/src/components/ScreenerExcludedSection.tsx`
- `src/renderer/src/pages/ScreenerPage.tsx`
- `src/renderer/src/App.tsx`
- `e2e/screener-results.spec.ts` — six scenarios, one per acceptance criterion
- `e2e/screener-helpers.ts` — OCC put fixtures, launch/seed plumbing, row queries
- `e2e/assignment-helpers.ts` — gained the shared `launchElectron(env)`
- `e2e/ivr-helpers.ts` — delegates to `launchElectron`

## Related

- [US-63 — Create and remove watchlist entries](us-63-manage-watchlist.md) — the feed being screened
- [US-64 — Pull option chains for watchlist tickers](us-64-pull-option-chains-for-watchlist.md) — the data acquisition layer
- [US-65 — Score wheel candidates](us-65-score-wheel-candidates.md) — the engine whose output this page renders
- [Market data](../domain/market-data.md) · [IPC handlers](../contracts/ipc-handlers.md) · [Design system](../architecture/03-design-system.md)

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
