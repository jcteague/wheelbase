# US-31: Market Data Provider Adapter

<!-- generated:from us-31 -->
## Summary
Foundational backend-only story for Epic 06. Ships the provider-agnostic `MarketDataProvider` interface, the concrete `AlpacaMarketDataProvider` implementation, and the `createMarketDataProvider` factory that downstream services use to obtain a provider without importing the concrete class. REST methods (stock quotes, option snapshots, broker activities, account info, market status) return `Promise`s; streaming (stock quotes JSON, option quotes/trades MessagePack) returns RxJS `Observable<StreamEvent<…>>` so consumers get first-class unsubscription, error/completion channels, and operators (`retry`, `share`, `debounceTime`) for downstream stories. WebSocket transport uses the raw `ws` package with two dedicated sockets — one per Alpaca data endpoint. No UI, no IPC handlers, no Zod schemas, no migrations — this story lives entirely in `src/main/integrations/` and is consumed by [US-32](./us-32-live-position-prices.md), [US-33](./us-33-option-mid-pnl.md), and [US-34](./us-34-position-cockpit.md).

## Acceptance criteria
- **AC-1:** `getStockQuotes(["AAPL","MSFT","TSLA"])` returns a `Map` with three entries; each entry's `price` is a 2dp decimal string.
- **AC-2:** `getOptionSnapshots(["AAPL260516P00180000"])` returns a `Map` entry with `bid`, `ask`, `mid` (= `(bid+ask)/2`), `greeks.delta`, `greeks.iv`, and `timestamp`.
- **AC-3:** `getActivities({ type: "OPASN", since: "2026-04-20" })` returns an array sorted by `transactionTime` descending with fields `activityId`, `activityType`, `symbol`, `qty`, `price`, `transactionTime`.
- **AC-4:** `getAccountInfo()` returns `buyingPower`, `portfolioValue`, `cash`, and `environment` (`"paper"` or `"live"`).
- **AC-5:** `getMarketStatus()` returns `isOpen`, `nextOpen`, `nextClose`, and `session` (one of `regular | pre | post | closed`).
- **AC-6:** `supportsStreaming(feed)` returns `true` for `"stockQuotes"`, `"optionQuotes"`, and `"optionTrades"`.
- **AC-7:** After `connect()`, `stream("stockQuotes", ["AAPL","MSFT"]).subscribe(observer)` emits a `StreamEvent<StockQuote>` for each tick.
- **AC-8:** `stream("optionQuotes", ["AAPL260516P00180000"]).subscribe(observer)` decodes MessagePack frames and emits `StreamEvent`.
- **AC-9:** Calling `subscription.unsubscribe()` sends the WebSocket `unsubscribe` message; the observer receives no further emissions; the underlying socket stays open for other subscriptions.
- **AC-10:** `disconnect()` closes both sockets and all active subscribers receive `complete`.
- **AC-11:** A provider built with `paper: true` authenticates against paper endpoints; `getAccountInfo()` returns `environment: "paper"`.
- **AC-12:** A 401 from the SDK becomes `MarketDataError` with `code: "auth_failed"` and a message containing `"authentication"`.
- **AC-13:** A network error becomes `MarketDataError` with `code: "network_error"` and a message that includes endpoint context.
- **AC-14:** An unexpected WebSocket close pushes a `StreamError` through the Observable error channel with `code: "stream_disconnected"`, the feed name, and `reconnectable: true`.
- **AC-15:** `getStockQuotes(["AAPL","ZZZZZ"])` returns a `Map` with AAPL only; no error is thrown.
- **AC-16:** Calling `stream(feed, …)` for a feed where `supportsStreaming(feed)` is `false` throws `MarketDataError` with `code: "streaming_unsupported"`.

(One e2e test per AC; all 16 pass in `src/main/integrations/alpaca-market-data.e2e.test.ts`.)

## What was built
The `MarketDataProvider` interface and shared types in `src/main/integrations/market-data-provider.ts`, the `AlpacaMarketDataProvider` implementation, and the `createMarketDataProvider` factory in `src/main/integrations/market-data-factory.ts`. The implementation creates its own Alpaca SDK client internally and owns two raw `ws` WebSocket connections (stock JSON at `wss://stream.data.alpaca.markets/v2/{dataFeed}`, option MessagePack at `wss://stream.data.alpaca.markets/v1beta1/{optionFeed}`). Each socket has one `Subject<StreamEvent>` that bridges frame events to Observable subscribers; each `stream()` call returns a new Observable that filters that Subject by symbol, sends `subscribe` on first subscription, and sends `unsubscribe` on Observable teardown. Three new npm dependencies introduced: `ws` + `@types/ws`, `@msgpack/msgpack` (decode via `decodeMulti()` because Alpaca batches frames), and `rxjs`. The pre-existing `src/main/integrations/alpaca.ts` is kept but marked `@deprecated` for removal once US-32/33/34 migrate callers.

## Architecture decisions
- **REST stays on the Alpaca SDK, streaming bypasses it.** The `@alpacahq/typescript-sdk` is a Deno-to-Node transpile and is no longer maintained; several methods have bugs (`getStocksSnapshots` wrong path, `getOptionsSnapshots` missing `greeks`/`impliedVolatility` in types, `getActivity` ignores query params) and WebSocket support is "todo". Working endpoints (`getAccount`, `getClock`, `getStocksQuotesLatest`, `getActivity`) stay on the SDK; streaming uses raw `ws` instead → [[alpaca-sdk-rest-only]]
- **Two dedicated WebSocket connections via the `ws` npm package.** Alpaca caps each endpoint at 1 concurrent connection, so the adapter multiplexes all symbol subscriptions per socket. `ws` is preferred over Node 21+'s built-in `WebSocket` because Electron's bundled Node version may differ and `ws` is trivially mockable in Vitest → [[ws-package-streaming]]
- **RxJS `Observable` for `stream(feed, symbols)`; `Promise` for everything else.** REST is request/response, streaming is push — they get different return types intentionally. Observables provide first-class `Subscription` teardown, error/completion channels, and the operators (`retry`/`retryWhen` for reconnection, `share`/`shareReplay` for multicast, `debounceTime`/`distinctUntilChanged` for throttling) that downstream stories will compose. Native Observable is Chromium-only, so the renderer-side primitive isn't usable in the Node main process → [[rxjs-observables-for-streaming]]
- **MessagePack decoding via `@msgpack/msgpack` using `decodeMulti()`.** Alpaca batches messages as arrays per frame; `decode()` throws `RangeError` on multi-object buffers, `decodeMulti()` is the documented multi-object reader → [[msgpack-option-streaming]]
- **Structured `MarketDataError` class with a discriminating `code` field.** Codes: `auth_failed`, `network_error`, `rate_limited`, `stream_disconnected`, `streaming_unsupported`, `subscription_failed`, `unknown`. Thrown (not returned), consistent with the rest of the codebase, so services pattern-match on `error.code` without parsing message strings → [[marketdataerror-structured-codes]]
- **`MarketStatus.session` is derived client-side from clock + extended-hours windows.** Alpaca's `/v2/clock` only returns `is_open`, `next_open`, `next_close` — no `session` field. The adapter derives `pre` (4:00–9:30 AM ET), `regular` (9:30 AM–4:00 PM ET when `is_open`), `post` (4:00–8:00 PM ET), and `closed` (otherwise) → [[market-session-derivation]]
- **Greeks/IV are REST-only; open interest is never available.** `OptionSnapshot.greeks` and `OptionSnapshot.iv` come from `/v1beta1/options/snapshots` only — stream frames never carry them. `openInterest` and `volume` are typed `number | null` and Alpaca always returns `null` for both → [[option-data-availability]]
- **Provider constructor owns the SDK client and the `paper`/`live` flag.** `AlpacaMarketDataProvider` creates the Alpaca SDK client internally via `createClient({ key, secret, paper })`. `environment: 'paper' | 'live'` is derived from the constructor's `paper` config, not from any API response, because `getAccount()` has no paper/live indicator → [[market-data-provider-interface]]
- **Factory hides the concrete provider; services never import the class.** `createMarketDataProvider(config)` switches on `config.provider` and returns the right implementation behind the interface — adding a non-Alpaca provider later is one new case in the factory → [[market-data-provider-interface]]
- **`src/main/integrations/alpaca.ts` is `@deprecated`, not deleted.** Removal happens incrementally as US-32/33/34 migrate callers; deleting now is safe today but unnecessarily risky.

## Contracts touched
- **`MarketDataProvider`** — integration interface exposing `getStockQuotes`, `getOptionSnapshots`, `getActivities`, `getAccountInfo`, `getMarketStatus`, `supportsStreaming(feed)`, `connect()`, `disconnect()`, and `stream(feed, symbols): Observable<StreamEvent<…>>`. Implementation: `src/main/integrations/market-data-provider.ts`.
- **`StockQuote`** — `{ price, bid, ask, change, changePercent: string (2dp); volume: number; timestamp: ISO-8601 }`. `change` and `changePercent` ship hardcoded to `'0.00'` in US-31 (see Open Questions); US-32 adds `prevClose` and computes them client-side. Implementation: `src/main/integrations/market-data-provider.ts`.
- **`OptionSnapshot`** — `{ bid, ask, mid (computed), lastTrade: string (2dp); openInterest, volume: number | null; greeks: { delta, gamma, theta, vega, iv: string (4dp) }; timestamp }`. `mid` is computed via decimal.js, not from the API. Implementation: `src/main/integrations/market-data-provider.ts`.
- **`BrokerActivity` + `ActivityFilter`** — `{ activityId, activityType, symbol, qty, price, transactionTime }` sorted by `transactionTime` desc; filter is `{ type: string; since?: YYYY-MM-DD }`. Implementation: `src/main/integrations/market-data-provider.ts`.
- **`AccountInfo`** — `{ buyingPower, portfolioValue, cash: string; environment: 'paper' | 'live' }`. `environment` is derived from constructor config. Implementation: `src/main/integrations/market-data-provider.ts`.
- **`MarketStatus`** — `{ isOpen: boolean; nextOpen, nextClose: ISO-8601; session: 'regular' | 'pre' | 'post' | 'closed' }`. `session` is derived client-side. Implementation: `src/main/integrations/market-data-provider.ts`.
- **`DataFeed`, `StreamEvent<T>`, `StreamError`** — `DataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'`; `StreamEvent<T> = { feed, symbol, data: T, timestamp }`; `StreamError = { feed, code, message, reconnectable }`. Implementation: `src/main/integrations/market-data-provider.ts`.
- **`MarketDataError`** — `Error` subclass with discriminated `code: 'auth_failed' | 'network_error' | 'rate_limited' | 'stream_disconnected' | 'streaming_unsupported' | 'subscription_failed' | 'unknown'`. Thrown by all REST methods and `stream()` when the feed is unsupported. Implementation: `src/main/integrations/market-data-provider.ts`.
- **`createMarketDataProvider(config)`** — factory. `MarketDataConfig = { provider: 'alpaca'; keyId; secretKey; paper; dataFeed?: 'sip' | 'iex' | 'delayed_sip'; optionFeed?: 'opra' | 'indicative' }`. Switches on `provider`; throws for unknown values. Implementation: `src/main/integrations/market-data-factory.ts`.
- **WebSocket subscribe/unsubscribe protocol** — connect → server `success/connected` → client `auth` → server `success/authenticated` → client `{action:'subscribe', quotes:[…]}` → server pushes frames; unsubscribe on Observable teardown via `{action:'unsubscribe', quotes:[…]}`. Stock socket: `wss://stream.data.alpaca.markets/v2/{dataFeed}` (default `sip`), JSON text frames. Option socket: `wss://stream.data.alpaca.markets/v1beta1/{optionFeed}` (default `opra`), MessagePack binary frames. Paper and live accounts share the same stream URLs.

No IPC contracts, no Zod schemas, no preload bridge methods, and no DB migrations are introduced by this story — downstream UI stories (US-32, US-33, US-34) wire all of that on top of this layer.

## Decisions & tradeoffs
- **One factory entry per provider; services never import the concrete class.** Adding a non-Alpaca provider later is one new case in `createMarketDataProvider` and a new implementation file, with no consumer churn.
- **REST methods are `Promise`-returning; only `stream()` is an Observable.** Mixed paradigms intentionally — request/response and push are different shapes and should be modeled accordingly.
- **`StockQuote.change` / `changePercent` are hardcoded to `'0.00'` on both REST and stream paths.** Previous-close isn't available from `getStocksQuotesLatest` or stream frames; US-32 addresses this by adding `prevClose` and computing the change renderer-side.
- **No reconnection logic in the provider.** `StreamError.reconnectable: true` is a hint, not a behavior — `retry`/`retryWhen` will be composed by consumers (US-38).
- **One `Subject` per socket bridges WebSocket events to Observable subscribers.** Each `stream()` call returns a new Observable that filters from the per-socket `Subject<StreamEvent>` by symbol; teardown sends `unsubscribe` and removes the symbol filter.
- **`disconnect()` nulls out internal socket and Subject references after cleanup** to prevent accidental use of closed/completed resources.
- **Shared `mapQuoteToStockQuote(bp, ap, timestamp)` helper** keeps REST and streaming codepaths consistent for `StockQuote` construction.
- **Test utilities (`emitSocketEvent`, `simulateAuth`, `MockSocket`) extracted to `alpaca-stream-test-utils.ts`** to avoid drift between unit and e2e tests; `connectAndAuth` is kept per-file because factory-driven vs direct-constructor versions differ.
- **All money values converted via `new Decimal(value).toFixed(2)` (or `.toFixed(4)` for greeks)** — never floats in the public type surface.
- **Backend-only story — no UI, no IPC handlers, no Zod schemas, no migrations.** Every integration touchpoint is a TypeScript type at the `src/main/integrations/` boundary.
- **Test file naming:** unit + integration tests live alongside the implementation (`*.test.ts`); end-to-end factory-driven tests live in `*.e2e.test.ts` colocated in the same dir.

## Source files
- `src/main/integrations/market-data-provider.ts` — interface, shared types, `MarketDataError` class
- `src/main/integrations/market-data-provider.test.ts` — type contract + `MarketDataError` tests
- `src/main/integrations/market-data-factory.ts` — `createMarketDataProvider` + `MarketDataConfig`
- `src/main/integrations/market-data-factory.test.ts` — factory tests
- `src/main/integrations/alpaca-market-data.ts` — `AlpacaMarketDataProvider` implementation (current tree may use `alpaca-broker.ts` after later refactors)
- `src/main/integrations/alpaca-market-data.test.ts` — unit + integration tests
- `src/main/integrations/alpaca-market-data.e2e.test.ts` — one e2e test per AC
- `src/main/integrations/alpaca-stream-test-utils.ts` — shared `MockSocket`, `emitSocketEvent`, `simulateAuth` helpers
- `src/main/integrations/alpaca.ts` — pre-existing file, `@deprecated` by this story
- `package.json` — new deps: `ws`, `@types/ws`, `@msgpack/msgpack`, `rxjs`

## Open questions
- **Reconnection logic is deferred to consumers / a future story.** `StreamError.reconnectable: true` signals intent only; `retry`/`retryWhen` composition lives in US-38.
- **`change` / `changePercent` ship as `'0.00'`** until US-32 adds `prevClose` and computes the daily change renderer-side.
- **`alpaca-market-data.ts` may grow large** — flagged at ~400 lines in refactor; "could be split if more streaming features are added (e.g., trade stream handling)" but not actioned.
- **Optional integration test against real Alpaca paper credentials** is described in `quickstart.md` but not committed; uses `describe.skipIf(!process.env.ALPACA_KEY_ID)` and is excluded from CI.
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
