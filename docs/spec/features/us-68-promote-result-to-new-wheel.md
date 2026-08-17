# US-68: Promote a screener result to the new-wheel form

<!-- generated:from us-68 -->

## Summary

US-68 is the bridge from "this is the best candidate" to actually opening the wheel. Every ranked
row on the [Screener page](us-66-screener-results.md) gains a **Promote to trade** action that opens
the [US-1 new-wheel form](../contracts/ipc-handlers.md) pre-filled from that candidate — ticker,
strike, expiration, premium, `contracts: 1` — plus a quote-provenance stamp and a `thesis` seeded
from the ticker's [watchlist note](us-63-manage-watchlist.md).

Like US-66, it is a **pure renderer story**: no IPC surface, no service, no engine, no migration. It
stitches over four shipped seams — the hash query string, `market-data:optionSnapshots`,
`useMarketStatusDisplay`, and `useWatchlist`.

The point of the story is what happens _after_ the pre-fill. An option quote is a point-in-time
snapshot, so by the time the trader reviews and submits, the mark may have moved. So the pre-filled
premium is an **editable default, never a lock**; the form re-fetches a fresh quote for that exact
contract on open; and a single non-blocking banner reconciles the two. Promote never places or
records a trade on its own — it lands the trader in the existing form for confirmation.

## Acceptance criteria

_Background: the screener shows an AAPL candidate — $180 put, expiring 2026-08-21, mark $2.70,
delta 0.28, quoted at 10:42:15._

- **Promote pre-fills the new-wheel form** — the form opens with ticker `AAPL`, strike `180`,
  expiration `2026-08-21`, premium per contract `2.70`, contracts `1`, and capital required
  `$18,000` (180 × 100 × 1).
- **Pre-filled premium is editable, not locked** — changing it to `2.65` is accepted.
- **Submitting records the edited premium** — the recorded trade shows $2.65, not the screener
  snapshot.
- **A fresh quote is shown when the form opens** — with a current mark of $2.68, the snapshot time
  updates to the fresh quote's time and the premium field still shows `2.70`.
- **Warn when the price has moved materially** — a re-fetched mark of $2.50 shows the non-blocking
  banner `Price moved: quoted $2.70 → now $2.50 — review before submitting`; the premium field still
  shows `2.70` and the trader can still submit.
- **Warn when the market is not open** — with the market status pill reading `CLOSED` or `EXT`, the
  form flags the pre-filled mark as a stale after-hours snapshot.
- **Form still works when the fresh quote can't be fetched** — with the provider unavailable, the
  promoted values are still pre-filled, a banner reads `Couldn't refresh quote — showing screener
snapshot from 10:42:15`, and the trader can still submit.
- **Promote never auto-submits** — no position is created until the trader submits the form.

## What was built

**The promote codec.** `src/renderer/src/lib/promote.ts` is the whole cross-page contract plus the
two display decisions the promoted form makes, and it is deliberately I/O-free — no hooks, no
`window.api`. It holds `buildPromoteSearch` / `parsePromotedParams` (a `URLSearchParams` codec
validated by a Zod schema reusing `tickerSchema`, `positiveMoneySchema` and `isoDateSchema`),
`markMovedMaterially` (the price-moved threshold), `derivePromoteBanner` (the banner state machine),
`promoteBannerMessage` (all trader-facing copy, in one place so the component, its unit tests and
the e2e spec assert the same literals), and `isPremiumOverridden`.

**The one-shot fresh quote.** `usePromotedQuote` builds the promoted contract's OCC put symbol with
`buildOccSymbol` and runs a single TanStack query over the existing `getOptionSnapshots` adapter —
no polling, no focus refetch, no retry, `staleTime: Infinity`, `gcTime: 0`, under a new
promote-scoped key in `marketDataQueryKeys`. Every failure mode collapses to `'failed'`.

**The banner.** `usePromoteBanner` composes the quote with `useMarketStatusDisplay` and returns the
single banner plus the provenance instant. `PromotedQuoteNotice` renders it as a gold or green
[`AlertBox`](../architecture/03-design-system.md) carrying `data-kind` and `data-tone`.

**Promoted mode on the form.** `NewWheelForm` gains an optional `promoted` prop. When set it renders
`PromotedFormChrome` (the gold "⊞ Promoted from Screener · Quoted HH:mm:ss" strip and the banner),
mockup field hints, a `{dte} DTE` hint under expiration, and `NewWheelDerivedRow` — capital required
and yield-if-flat, recomputed live via `useWatch` as the trader edits. Contracts defaults to `'1'`
and the Advanced section opens so the seeded thesis is visible. Without the prop the form renders
and behaves exactly as US-1 shipped it.

**The entry point.** `ScreenerResultsTable` gains a trailing, unlabelled action column with a
compact gold `Promote to trade` button per row; it stays presentation-only, raising the candidate
through `onPromote`. `ScreenerPage` owns the effect: look up the ticker's watchlist note, then
navigate. The 12 metric columns US-66 pinned keep their positions.

**Supporting helpers.** `lib/decimal-input.ts` (`parseInputDecimal` — free-text form input to a
`Decimal`, or `null` while it is empty or mid-edit) and `format.ts`'s `computeDteFromInput`.

**End-to-end verification.** `e2e/promote-to-trade.spec.ts` runs one scenario per AC against the
packaged app, plus a regression test that a promote does not leak into the next plain visit. Quote
drift and provider outage between the screener run and the form's re-fetch are produced by mutating
the fake provider's env at runtime — the provider re-reads `process.env` on every call, so no new
test seam was needed. All 10 assertions were falsified against the running app before being trusted.

## Architecture decisions

### The promoted payload travels on the hash query string — and is consumed once

- **Decision:** Promote navigates to
  `#/new?promoted=1&ticker=…&strike=…&expiration=…&premium=…&quotedAt=…[&thesis=…]`. `NewWheelPage`
  parses it **once** into a `useState` initializer, then clears the query with
  `history.replaceState`. The clear is keyed off the raw `promoted` param, not the parsed result.
- **Why:** The query string is the established mechanism for one-shot navigation context, and the
  payload is five scalars plus an optional thesis. The consume step is load-bearing: wouter's hash
  `navigate` writes the query into the real `location.search` and never clears it, while
  `useHashLocation` exposes no `searchHook`, so `useSearch()` reads that same value. Left in place,
  the params outlive the promote — the sidebar's plain "Open Wheel" would re-open the form fully
  pre-filled from a candidate nobody promoted. A malformed promote is cleared for the same reason:
  its surviving `ticker=` would still pre-fill the next visit.
- **Rejected:** global state (rejected by the existing ADR for exactly this problem); a module-level
  "pending promote" variable (breaks on reload); passing only `contractId` and re-deriving from the
  screener cache (fails when that cache is cold).

### Deviation must exceed max($0.05, 5%) — both tests, strictly

- **Decision:** `markMovedMaterially` warns only when `|fresh − promoted| > max(0.05, 0.05 ×
promoted)`, strict, via `decimal.js`. A deviation exactly at the threshold is silent.
- **Why:** A nickel move on a $2.70 mark is routine bid-ask bounce. The $0.05 floor exists to keep
  sub-$1.00 premiums from triggering on noise, not as an independent trigger — so it is the max of
  the two tests, not the min. Promoted 2.70 → threshold 0.135: fresh 2.50 warns, fresh 2.68 is
  silent. Sub-$1: 0.60 → threshold 0.05, so 0.64 is silent and 0.66 warns.
- **Note:** this is an AND. The story was revised on this branch from an earlier "> 5% **or** >
  $0.05"; a $2.70 → $2.62 move is now silent where the old wording warned.

### One banner slot, fixed precedence: offline > stale > moved > edited > match

- **Decision:** `derivePromoteBanner` returns exactly one state. `stale` carries
  `session: 'CLOSED' | 'EXT'` so the copy can differ. No state ever disables submit.
- **Why:** The states genuinely overlap and the mockup shows one banner. `offline` outranks `stale`
  because it explains why no fresh time is shown; `stale` outranks the price comparisons because a
  closed-market fetch "succeeds" with the 16:00 close, so comparing against it would mislead. The
  `session` discriminator exists because a single "Market closed — …" string is **false during an
  EXT session**, with the pill beside it reading `EXT`; equity options do not trade extended hours,
  which is the accurate reason an EXT mark is stale.
- **Rejected:** stacking banners (two gold "verify before recording" warnings is noise); a
  timestamp-age staleness heuristic (the pill's session derivation is the single source).

### The re-fetch never writes into form state

- **Decision:** The fresh quote flows only into the provenance strip and the banner. The premium
  field is set once, from the promoted mark, in `useForm({ defaultValues })` — no `reset()`, no
  `setValue()` on resolution.
- **Why:** Two ACs assert the field still reads `2.70` after a fresh `2.68` / `2.50` arrives. The
  trader records their actual fill, not the mark. Keeping fetch results out of React Hook Form state
  also sidesteps every race between resolution and typing.

### Provenance and banner deliberately report different instants

- **Decision:** The provenance strip shows the **freshest mark held** — the re-fetch's timestamp once
  it lands. The `offline` and `stale` banners carry `promoted.quotedAt` instead.
- **Why:** They describe different things. The strip answers "how current is the newest quote I
  have?" The banners describe **the pre-filled mark**, which is always the screener's — so "the
  pre-filled mark is a stale after-hours snapshot (quoted 10:42:15)" must name the screener's
  instant. Unifying them makes the banner assert a false provenance for the value in the premium
  field. Each element names what it is describing.

### "Edited" is a property of the form, not of the banner

- **Decision:** The derived row's "recomputed from your price" caption reads `isPremiumOverridden`
  directly, independently of which banner won the precedence chain.
- **Why:** Deriving it from `banner.kind === 'edited'` silently dropped the caption whenever a
  higher-precedence banner held the single slot — i.e. for most of the trading day — even though the
  yield genuinely had been recomputed from the trader's price.

### The promoted chrome is a component, so the plain form mounts no market-data hooks

- **Decision:** `PromotedFormChrome` owns `usePromoteBanner`, and `NewWheelForm` renders it only when
  something was promoted.
- **Why:** `useMarketStatusDisplay` mounts `useMarketStatus`, which polls on a 60s interval. Calling
  it unconditionally added a permanent `market:status` poll to `#/new`, a page that previously made
  no market calls. The derived row stays in the form (it also needs strike/contracts/expiration) and
  takes `edited` as a prop — which is what made the extraction possible.

### DTE for live form input is counted in local calendar days

- **Decision:** `computeDteFromInput` uses `differenceInCalendarDays(parseISO(…), new Date())`,
  matching the engine's `src/main/core/dte.ts` rather than the UTC arithmetic in the older renderer
  `computeDte`.
- **Why:** `computeDte` builds "today" from UTC date parts, so west of UTC after the UTC date rolls
  over (≈17:00 ET — exactly when candidates get reviewed) it counts a day short. The promoted form
  would read `36 DTE` for the row that just said `37`, and annualize the yield off that wrong number.

## Contracts

US-68 adds no IPC surface. Its one interface boundary is the cross-page **promote-navigation**
contract, produced by `ScreenerPage` and consumed by `NewWheelPage`:

```typescript
type PromoteSearchParams = {
  promoted: '1' // discriminator — absent on the plain ?ticker= flows
  ticker: string // uppercase ticker
  strike: string // Decimal-normalized ('180.0000' → '180')
  expiration: string // YYYY-MM-DD
  premium: string // the promoted mark, 2dp, verbatim ('2.70')
  quotedAt: string // ISO instant of the screener quote
  thesis?: string // watchlist note, URL-encoded; omitted when absent
}

function buildPromoteSearch(candidate: PromoteSource, note?: string | null): string
function parsePromotedParams(search: string): PromotedCandidate | null
```

Malformed or incomplete params are **not** an error state: `parsePromotedParams` returns `null`, the
page renders the plain form (honouring a bare `?ticker=` if present), and the params are cleared
from the URL either way.

**DOM contract:** `screener-promote-<ticker>`, `promote-provenance`, `promote-banner` (with
`data-kind` and `data-tone`), `derived-capital`, `derived-yield`.

## Schema

None. US-68 persists nothing new — no table, no migration, no service change. The recorded trade goes
through the existing `positions:create` path with whatever the trader confirms; SQLite stays the
source of truth and the screener snapshot is never written anywhere.

## Key files

- `src/renderer/src/lib/promote.ts` — codec, threshold, banner state machine, copy, override predicate
- `src/renderer/src/lib/decimal-input.ts` — `parseInputDecimal`, `parsePositiveInputDecimal`
- `src/renderer/src/lib/format.ts` — `computeDteFromInput`
- `src/renderer/src/hooks/usePromotedQuote.ts` · `usePromoteBanner.ts` · `marketDataQueryKeys.ts`
- `src/renderer/src/components/PromotedFormChrome.tsx` · `PromoteProvenance.tsx` ·
  `PromotedQuoteNotice.tsx` · `NewWheelDerivedRow.tsx`
- `src/renderer/src/components/NewWheelForm.tsx` — optional `promoted` prop
- `src/renderer/src/components/ScreenerResultsTable.tsx` — trailing promote action column
- `src/renderer/src/components/ui/AlertBox.tsx` · `ui/TablePrimitives.tsx`
- `src/renderer/src/pages/ScreenerPage.tsx` · `NewWheelPage.tsx`
- `e2e/promote-to-trade.spec.ts` — 9 AC scenarios + 1 leak regression
- `e2e/screener-helpers.ts` — promote helpers, runtime env mutators, watchlist notes

## Known gaps

- **The renderer has two DTE bases.** `computeDteFromInput` counts local calendar days; the older
  `computeDte` still backs ~9 call sites with UTC arithmetic, including `lib/verdict.ts`, which makes
  management decisions on it. Converging on the local implementation is a small follow-up.
- **Yield and capital math is duplicated across the process boundary.** `NewWheelDerivedRow`
  re-implements formulas the [US-65 engine](us-65-score-wheel-candidates.md) already ran on the same
  contract. A pure module under `src/shared/` would let both consume one copy.
- **An outage suppresses the after-hours flag** — with the market CLOSED _and_ the provider down,
  `offline` outranks `stale`.
- **A materially-moved price is never surfaced outside market hours**, since `stale` unconditionally
  outranks `moved` — so the price-moved warning is unreachable in the session where most wheel
  planning happens.
- **The promoted form shows no market-status pill**, though its banner reports the session.
- **`derivePromoteBanner` handles 2 of the 4 `MarketStatusDisplay` members.** It tests
  `CLOSED || EXT` explicitly (matching the AC's two examples); `DELAYED` falls through to the
  price comparison and would show a reassuring `match` banner over data the app has flagged as
  delayed. Unreachable today only because `usePromoteBanner` calls `useMarketStatusDisplay()`
  with the default `stale = false` — one future caller passing `true` flips it silently.
- **The strip and the banner both label their instant "Quoted"** and, when the market is
  CLOSED/EXT and the re-fetch succeeded, print different times. Each value is individually
  correct (the strip must update per AC 4; the banner must name the pre-filled mark), but the
  shared label attributes the fresh quote's time to the promote. Relabelling one of them
  (e.g. `Promoted 10:42:15 · Quote 16:00:02`) would resolve it — a copy decision, not a code one.

## Related

- [US-66 — Display ranked screener results](us-66-screener-results.md) — the page promote starts from
- [US-67 — Configure screening criteria](us-67-configure-screening-criteria.md) — what shapes the candidates
- [US-65 — Score wheel candidates](us-65-score-wheel-candidates.md) — the engine behind the row
- [US-63 — Manage watchlist](us-63-manage-watchlist.md) — the note that seeds the thesis
- [US-39 — Massive market-data provider](us-39-massive-market-data-provider.md) — the fresh quote's source
- [IPC handlers](../contracts/ipc-handlers.md) · [Design system](../architecture/03-design-system.md)

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
