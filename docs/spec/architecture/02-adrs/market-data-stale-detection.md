# ADR: Stale market data detection via `dataUpdatedAt > 5 min`

<!-- generated:from us-32,market-data-massive-migration -->

## Decision

Stale-data detection uses TanStack Query's `dataUpdatedAt` (which is bumped automatically by both `queryFn` resolution and `setQueryData` calls — i.e. by both REST seeds and stream ticks). When `Date.now() - dataUpdatedAt > 5 * 60 * 1000` (`STALE_THRESHOLD_MS = 300_000`), the `StaleDataBanner` renders above the positions table and the market-status pill is forced to `DELAYED`. A `streamError != null` immediately forces both signals without waiting for the threshold.

The banner text reads `⚠ Prices may be delayed — last updated {minutesAgo}m ago`.

## Context / Why

- With streaming, the natural staleness signal is "no events arrived recently" rather than "the last poll was X seconds ago".
- `dataUpdatedAt` captures both REST seeds and stream ticks in one freshness clock — perfect for this signal.
- 5 minutes is a soft heuristic: short enough to alert traders that the data is potentially stale, long enough to tolerate normal stream gaps (e.g. between ticks for an illiquid ticker).
- Explicit `streamError` events take precedence so a known-broken stream surfaces faster than the 5-minute threshold.

## Alternatives considered

- **Listen for the provider's `StreamError` only** — better signal but doesn't cover the "silent stall" case where the WebSocket is still connected but no events arrive.
- **Single global `lastUpdateAt` (any ticker)** — masks the case where one ticker stops updating while others still tick.
- **Per-ticker staleness** — over-engineered; the banner signals the overall data freshness, which is what the trader needs to know.
- **Aggressive threshold (e.g. 30 s)** — too noisy for illiquid tickers.

## Consequences

- The hook surfaces `streamError` to the page; the page combines that with `dataUpdatedAt` via `deriveMarketStatusDisplay` (see ADR [market-status-pill](./market-status-pill.md)).
- The staleness effect emits a single combined `setStaleInfo({ stale, minutesAgo })` setState, using a functional `setStaleInfo((prev) => …)` updater that no-ops when the value is unchanged.
- The staleness display is re-evaluated on a periodic 30 s tick (`STALE_POLL_INTERVAL_MS = 30 * 1000`, `setInterval(evaluate, STALE_POLL_INTERVAL_MS)`), so the `minutesAgo` counter keeps advancing even when quotes stop arriving and `dataUpdatedAt` remains constant.
- Test coverage: e2e mocks `Date.now()` to return `t - 6min`, fires a tick (so TanStack Query records `dataUpdatedAt = t - 6min`), then restores `Date.now` and asserts the banner appears.

## Sources

- [extract: us-32](../../.extracts/us-32.md) — ADR "Stale Data Detection (>5 min)"; `STALE_THRESHOLD_MS = 5 * 60 * 1000`
- [extract: market-data-massive-migration](../../.extracts/market-data-massive-migration.md) — current-state location of `STALE_THRESHOLD_MS = 5 * 60 * 1000` in `src/renderer/src/hooks/useStockQuotes.ts`
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
<!-- /generated -->
