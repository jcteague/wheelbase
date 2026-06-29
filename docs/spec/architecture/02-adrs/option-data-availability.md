# ADR: Greeks/IV via REST snapshot only; OI/volume always null

<!-- generated:from us-31,market-data-massive-migration -->

## Decision

On `OptionSnapshot`, Greeks and implied volatility are populated **only** from the Massive REST options-snapshot endpoint, and only when Massive returns them:

- `greeks?` is optional — a `{ delta, gamma, theta, vega }` object of 4-dp decimal strings.
- `impliedVolatility?` is a separate optional **top-level** 4-dp decimal string (no longer nested under `greeks`).

There is no live option stream, so no stream frame ever carries Greeks or IV. `openInterest` and `volume` are typed `number | null` and are always `null` from the snapshot endpoint.

For stocks, Massive's snapshot is an **aggregate bar**, not a live quote: there is no bid/ask, so `StockQuote.price`, `StockQuote.bid`, and `StockQuote.ask` all carry the last-minute close.

## Why

Massive (a Polygon-compatible delayed-data vendor) exposes Greeks and IV only on the REST options snapshot, and only sometimes — hence the optional fields. The single JSON WebSocket carries aggregate-minute (`AM`) stock bars only; there is no option feed at all, so streaming frames cannot supply Greeks/IV. Open interest and daily volume are absent from the snapshot response, so both stay `null`.

Stock snapshots being aggregate bars (rather than live NBBO quotes) means `price`/`bid`/`ask` collapse onto the last-minute close — downstream consumers should treat the three as the same delayed value, not a real spread.

Encoding these limitations in the types means downstream stories (US-33's profit-target check, US-34's Greeks display) can't accidentally assume Greeks on a stream frame or a true bid/ask spread on a stock quote.

## Alternatives considered

- **Derive volume from option bars** — possible but adds complexity for no near-term benefit.
- **Source OI from a different provider** — out of scope; would require a second integration.
- **Treat stock bid/ask as a real spread** — rejected; Massive does not return NBBO on the snapshot, so any apparent spread would be fabricated.

## Source

- Feature page: [US-31 — market data provider adapter](../../features/us-31-market-data-provider-adapter.md)
- `src/main/integrations/market-data-provider.ts` (`StockQuote`, `OptionSnapshot` types)
- `src/main/integrations/massive-market-data.ts` (Massive REST mapping)

## Driven by

- [US-31 — market data provider adapter](../../features/us-31-market-data-provider-adapter.md)
- market-data Alpaca→Massive migration (retro plan)
<!-- /generated -->
