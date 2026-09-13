# US-96: One live bench — the watchlist and screener on a single page

<!-- generated:from us-96 -->

> **Status: shipped.** All 33 acceptance criteria are covered by verbatim-named tests in
> `e2e/watchlist-bench.spec.ts`, all passing. The standalone Screener page is retired.

## Summary

Epic 08 had shipped the bench in two halves. The Watchlist page held the names and the
conditions a trader was waiting for; the Screener page pulled chains for those names and
ranked the best put per ticker. Reading the bench meant reading two pages and doing the
join in your head — _is this name ranked, and does it also satisfy my own entry
conditions?_

This story folds them into one page at `/watchlist`. Every entry becomes a card carrying
its live price and an age-assessed IV rank, and the bench splits in two:

- **Meets criteria** — every saved condition passes on a **usable** IV reading _and_ the
  screener found a qualifying put. Cards follow the screener's rank order.
- **Stocks of interest** — everything else, each carrying the single most decisive reason
  it is held back: an unmet price or IV condition, an earnings gate, an unusable reading,
  or the screener's verbatim exclusion.

Selecting a card opens a sticky **stock detail** panel: last price and day change, the IV
rank beside its freshness ring, the thesis, each condition with its verdict, the earnings
date, and — for a name that meets criteria — the matching put's metrics with a **Review
trade** action that hands off to the pre-filled new-wheel form
([us-68](./us-68-promote-result-to-new-wheel.md)).

The rule that ties it together is [us-98](./us-98-ivr-staleness-tiers.md)'s: **an unusable
reading is an unknown, and an unknown never decides anything.** A stale, expired, or
earnings-predating reading cannot satisfy an `IVR ≥ N` condition, so a stale-rich reading
can never promote a name into Meets criteria.

## How a row is built

A read-only `watchlist:snapshot` IPC returns one row per entry, judged at a single request
clock: the quote, the freshness-assessed IV reading, the earnings display, and a per-gate
verdict from the pure engine `src/main/core/watchlist-signal.ts`. A pure renderer helper,
`src/renderer/src/lib/bench.ts`, then merges those rows with `screener:results`.

Live price comes from the market-data adapter, IV rank from the IVR snapshot store aged
through the us-98 freshness engine, and earnings from the shared earnings-calendar store
([us-70](./us-70-earnings-in-window-warning.md)) — never from the chain provider.

A stock reaches Meets criteria only when all three hold: every gate is `met` or `none`, the
screen actually ran, and a ranked candidate exists for that ticker.

## The three gates

Each entry carries up to three saved conditions. Each yields a verdict, and a label when it
is holding the stock back.

| Gate         | Condition          | `unknown` when                                                      | Label                                                                        |
| ------------ | ------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Price**    | Would own below $N | the quote failed                                                    | `Price unavailable`, or `Price $178.40 above $170 target`                    |
| **IV**       | `IVR ≥ N`          | the reading is absent, expired, stale, or predates earnings         | `IV unavailable` / `IV too old to judge` / `IV predates earnings` / `IV low` |
| **Earnings** | Post-earnings only | the date is unknown, unavailable, already past, or cannot be parsed | `Earnings date unknown`, or `Earnings in 3 days`                             |

A condition the trader never set reads `none` and is omitted entirely — it is not a check
that failed. Reasons are listed in precedence order **earnings → price → IV**: an imminent
print keeps a trader out whatever the price, and a price miss outranks an IV reading.

The earnings window is 7 days, inclusive, counted in **Eastern calendar days** — so a
10:42 CT Wednesday and a 23:30 ET Tuesday agree about what "three days out" means.

## IV-rank freshness on the bench

This story ships the ring treatment us-98 designed. Fill is a step function of the tier,
never of the raw age: fresh full green, aging three-quarters, stale half, expired a
quarter, and predates-earnings an empty gold ring with a centre dot. Hovering or focusing
the cell opens a tooltip naming the tier, the observed session in ET, the age in trading
days, and what the reading can and cannot decide.

An **expired** reading now reaches the renderer as a reading rather than collapsing to
`null`: it shows `exp`, muted, where a never-collected ticker shows `n/a` with no ring.
Both are unusable and both read `IV unavailable` on the card, but they are no longer
indistinguishable — one means the collector has been failing, the other that it has never
had enough history to run.

## Degradation

A provider outage degrades verdicts, not rows. Every card keeps its ticker, its thesis, and
its locally-stored IV reading with its ring; prices read `—`; no stock is marked as meeting
criteria; and every reason reads `Data unavailable · not evaluated`.

Because nothing was screened, the empty Meets section says it is **waiting for market
data** rather than telling the trader to loosen criteria that rejected nothing — the
distinction [us-66](./us-66-screener-results.md) exists to protect.

Per-item isolation holds throughout: one ticker's quote failing empties only that price;
the earnings and IVR reads degrade to unknown-for-everyone; and the provider failing to
construct at all still returns a fully rendered bench.

## What changed elsewhere

- **The Screener page is gone** — `ScreenerPage`, `ScreenerResultsTable` and
  `ScreenerExcludedSection` are deleted, along with the `/screener` route and nav item. The
  criteria sheet, criteria strip, state cards and promote handoff moved across unchanged.
- **`watchlist:list` is retired.** Its only consumer was the old watchlist table; the
  snapshot returns the same entries plus the day's verdict.
- **`screener:results` widened** — `IpcIvRank.state` now includes `expired`.
- **Five inherited e2e suites were re-pointed** to the card surface
  ([us-66](./us-66-screener-results.md), [us-67](./us-67-configure-screening-criteria.md),
  [us-68](./us-68-promote-result-to-new-wheel.md),
  [us-70](./us-70-earnings-in-window-warning.md),
  [us-98](./us-98-ivr-staleness-tiers.md)), keeping every test name and story id.

## Out of scope

Editing a thesis or conditions in place (us-69 — the cards and panel are read-only); live
streaming ticks; alerting when a stock flips into Meets criteria (the pure engine is
designed for it); changes to screener scoring, the IV-rank floor, or the
earnings-before-expiry rule; historical charts.

## Source

- Engine: `src/main/core/watchlist-signal.ts`, `src/main/core/ivr-freshness.ts`
- Services: `watchlist-snapshot.ts`, `underlying-quotes.ts`, `earnings-horizon.ts`
- IPC: `src/main/ipc/watchlist.ts` (`watchlist:snapshot`)
- Renderer: `pages/WatchlistPage.tsx`, `lib/bench.ts`, `lib/day-change.ts`,
  `components/Bench*.tsx`, `FreshnessRing.tsx`, `IvrCell.tsx`
- Tests: `e2e/watchlist-bench.spec.ts` (33 ACs)

<!-- /generated -->
