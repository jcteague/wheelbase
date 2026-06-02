# ADR: Underlying price sourced via `useStockQuotes`, not `OptionSnapshot`

<!-- generated:from us-34 -->

## Decision

`PositionDetailPage` calls `useStockQuotes([position.ticker])` alongside `useOptionSnapshots`, derives `underlyingPrice = stockQuotesQuery.data?.[ticker]?.price ?? null`, and threads it down as a new prop on `PositionDetailContent` → `PositionCockpit`. `OptionSnapshot` is **not** extended to carry the underlying.

## Why

Alpaca's option-snapshot endpoint does not include the underlying price; the stock-quote stream (built in US-31, consumed in US-32) is the correct source and is already wired. Adding a field to `OptionSnapshot` would require a backend contract change that has no benefit beyond saving one renderer call.

## Alternatives considered

- **Derive underlying from greeks** — not reliable; greeks model the option, not the spot price.
- **Extend `OptionSnapshot` with an `underlyingPrice` field** — out-of-scope backend change with no upside.

## Source

- `plans/us-34/research.md`
- Feature page: `../../features/us-34-position-cockpit.md`
<!-- /generated -->
