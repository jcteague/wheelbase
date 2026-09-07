# ADR: Stock data from IEX for both the REST seed and the stream

<!-- generated:from us-99 -->

## Decision

`getStockQuotes(tickers)` issues **one** batched `GET /v2/stocks/snapshots?symbols=…&feed=iex` and maps `price = latestTrade.p`, `bid = latestQuote.bp`, `ask = latestQuote.ap`, `prevClose = prevDailyBar.c`, `change = price − prevClose`, `changePercent = change / prevClose × 100` (4 dp), `volume = dailyBar.v`, `timestamp = latestTrade.t`. Symbols absent from Alpaca's map — or lacking a `latestTrade` — are omitted from the returned `Map`, never reported as `$0.00`. The stream subscribes to the `bars` channel on `wss://stream.data.alpaca.markets/v2/iex` and maps `b` frames exactly as the previous vendor's aggregate-minute frames were mapped: `price = bid = ask = c`, empty `change` / `changePercent` / `prevClose`, `volume = v`, `timestamp = t`.

## Context / Why

- The REST seed and the stream must come from the same feed or the first tick jumps against the seed (see [market-data-stream-with-rest-seed](./market-data-stream-with-rest-seed.md)). IEX is real-time on the free plan; `delayed_sip` lags 15 minutes; `sip` is 403 on REST and 409 on the socket.
- One batched request replaces N per-ticker requests against a 200 req/min budget.
- Only `price` and `prevClose` are rendered (`PriceCell`, `useStockQuotes`), so IEX's thin after-hours quotes (AAPL showed 305.33 / 338.27 at Friday's close against a 319.80 last trade) do not affect what the trader sees. The values are carried honestly rather than faked as `bid = ask = price`.

## Alternatives considered

- **`delayed_sip` for REST** — consolidated quotes, but a 15-minute lag and a seed/stream feed mismatch.
- **`bid = ask = price` as Massive did** — hides real data.
- **Streaming `quotes` as well as `bars`** — doubles symbol usage against the 30-symbol cap for a field nothing displays.

## Consequences

- `mapStockSnapshot` (`alpaca-market-data-mappers.ts`) is pure and pinned by the live 2026-09-04 AAPL fixture. The plan's worked example printed `changePercent '-2.5653'`; the normative rule (`ROUND_HALF_UP`, 4 dp) yields `-2.5654` and the implementation follows the rule.
- `IpcStockQuote` still omits `change` / `changePercent`; the renderer keeps recomputing them from `(price, prevClose)`.

## Sources

- [extract: us-99](../../.extracts/us-99.md) — ADR "Stock data from IEX for both REST seeds and the stream"
- [feature: us-99-alpaca-market-data-provider](../../features/us-99-alpaca-market-data-provider.md)
<!-- /generated -->
