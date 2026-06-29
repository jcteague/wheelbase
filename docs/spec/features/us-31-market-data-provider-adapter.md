# US-31: Market Data Provider Adapter

<!-- generated:from us-31,market-data-massive-migration -->

## Summary

Foundational backend-only story for Epic 06. Ships the provider-agnostic `MarketDataProvider` type and the `marketDataFactory` that downstream services use to obtain a provider without importing the concrete class. REST methods (stock quotes, option snapshot, option chain snapshot) return `Promise`s; streaming (stock-quote aggregate bars) returns an RxJS `Observable<StreamEvent<…>>` so consumers get first-class unsubscription, error/completion channels, and operators (`retry`, `share`, `debounceTime`) for downstream stories. WebSocket transport uses the raw `ws` package with a single stock stream. No UI, no IPC handlers, no Zod schemas, no migrations — this story lives entirely in `src/main/integrations/` and is consumed by [US-32](./us-32-live-position-prices.md), [US-33](./us-33-option-mid-pnl.md), and [US-34](./us-34-position-cockpit.md).

> **Provider:** the concrete implementer of the type is `MassiveMarketDataProvider` (`src/main/integrations/massive-market-data.ts`), with `FakeMarketDataProvider` for tests/dev. Account info, broker activities, and market status are **not** on the market-data type — they live on a separate `BrokerProvider` (`broker:*` IPC), implemented by `AlpacaBrokerProvider`, the only surviving `Alpaca*` class. The sections below reflect the current Massive-based state; see **Revisions** for how it got here.

## Acceptance criteria

The criteria below describe the current Massive-based provider surface; coverage lives in `src/main/integrations/massive-market-data.test.ts` (and `market-data-provider.test.ts` / `market-data-factory.test.ts` for the interface + factory).

- **AC-1:** `getStockQuotes(["AAPL","MSFT","TSLA"])` returns a `Map` with three entries; each entry's `price`, `change`, and `prevClose` are decimal strings (price/change/prevClose 2dp, `changePercent` 4dp).
- **AC-2:** `getOptionSnapshot("AAPL260516P00180000")` returns an `OptionSnapshot` with `bid`, `ask`, `mid` (= `(bid+ask)/2`, computed via decimal.js), `lastTrade`, optional `greeks.{delta,gamma,theta,vega}` (4dp), optional `impliedVolatility` (4dp), and `timestamp`.
- **AC-3:** `getOptionChainSnapshot(filter)` returns an array of `OptionSnapshot`, following Massive's `next_url` cursor pagination until exhausted (or stopping at `filter.limit` when provided).
- **AC-4:** `supportsStreaming()` returns `true`.
- **AC-5:** After `connect()`, `stream("stockQuotes", ["AAPL","MSFT"]).subscribe(observer)` emits a `StreamEvent<StockQuote>` for each aggregate-minute (`AM`) bar matching one of the subscribed symbols; an empty symbol list matches all.
- **AC-6:** A 401/403 response becomes `MarketDataError` with `code: "auth_failed"`.
- **AC-7:** A network error becomes `MarketDataError` with `code: "network_error"`.
- **AC-8:** A 429 is retried up to `MAX_RETRIES` honouring `Retry-After`; once exhausted it becomes `MarketDataError` with `code: "rate_limited"`.
- **AC-9:** A 404 becomes `MarketDataError` with `code: "not_found"`.
- **AC-10:** `disconnect()` closes the socket and nulls the reference.
- **AC-11:** A missing API key throws `MarketDataError` with `code: "auth_failed"` before any network call.

## Revisions

- **us-31** (original): shipped the provider-agnostic `MarketDataProvider` interface, the `marketDataFactory`, and an `AlpacaMarketDataProvider` over the Alpaca SDK (REST) plus two raw `ws` sockets (JSON stock feed + MessagePack option feed). Account info, broker activities, and market status were methods on the interface.
- **market-data-massive-migration** (retro): migrated the market-data layer Alpaca→**Massive** (Polygon-compatible). The concrete impl is now `MassiveMarketDataProvider` (REST over `fetch` to `https://api.massive.com` with the key as an `apiKey` query param; a single JSON `wss://delayed.massive.com/stocks` socket for `AM` aggregate-minute bars). `MarketDataProvider` became a `type`; option reads split into singular `getOptionSnapshot` + `getOptionChainSnapshot`; the factory moved to a `configure({ loadMassiveApiKey })` / `recreate()` env-switched object with key loading in `massive-credentials.ts`. Broker concerns (account, market status, activities) split off onto a separate `BrokerProvider` (`broker:*` IPC, `AlpacaBrokerProvider`). No schema changes.

## What was built

The `MarketDataProvider` type and shared types in `src/main/integrations/market-data-provider.ts`, the `MassiveMarketDataProvider` implementation in `src/main/integrations/massive-market-data.ts`, the `FakeMarketDataProvider` in `src/main/integrations/fake-market-data.ts`, and the `marketDataFactory` in `src/main/integrations/market-data-factory.ts`. The Massive implementation talks to a Polygon-compatible REST API (`https://api.massive.com`) over the global `fetch`, appending `apiKey` to each request, and owns a single raw `ws` WebSocket (`wss://delayed.massive.com/stocks`) for aggregate-minute (`AM`) stock bars. One `Subject<StreamEvent<StockQuote>>` bridges incoming bars to Observable subscribers; each `stream()` call returns an Observable filtering that Subject by symbol. REST errors map onto `MarketDataError` codes by HTTP status (`401/403 → auth_failed`, `429 → rate_limited` after retry, `404 → not_found`, network failure → `network_error`, else `unknown`); 429s retry up to `MAX_RETRIES` honouring `Retry-After`. The npm dependencies `ws` + `@types/ws` and `rxjs` are used; `@msgpack/msgpack` was introduced by the original Alpaca version. The pre-existing `src/main/integrations/alpaca.ts` is kept but marked `@deprecated`.

## Architecture decisions

- **Massive (Polygon-compatible) over the Alpaca SDK.** The market-data layer was migrated to Massive; `MassiveMarketDataProvider` talks to `https://api.massive.com` REST over the global `fetch` (no SDK dependency) and a single `wss://delayed.massive.com/stocks` WebSocket. The Polygon-compatible message/snapshot shapes are mapped to the provider's neutral types at the boundary → [[massive-market-data-provider]]
- **Single WebSocket via the `ws` npm package for aggregate-minute bars.** The stock stream subscribes to `AM.*` (aggregate-minute bars) after `auth`; there is no separate option stream. `ws` is preferred over Node's built-in `WebSocket` because it is trivially mockable in Vitest → [[ws-package-streaming]]
- **RxJS `Observable` for `stream(feed, symbols)`; `Promise` for everything else.** REST is request/response, streaming is push — they get different return types intentionally. Observables provide first-class `Subscription` teardown, error/completion channels, and the operators (`retry`/`retryWhen` for reconnection, `share`/`shareReplay` for multicast, `debounceTime`/`distinctUntilChanged` for throttling) that downstream stories will compose. Native Observable is Chromium-only, so the renderer-side primitive isn't usable in the Node main process → [[rxjs-observables-for-streaming]]
- **One `Subject<StreamEvent<StockQuote>>` bridges the socket to subscribers.** Each `stream()` call returns `tickSubject.pipe(filter(...))` keyed by the requested symbol set (empty set matches all); incoming `AM` bars are pushed onto the Subject in the socket's `message` handler → [[rxjs-observables-for-streaming]]
- **Structured `MarketDataError` class with a discriminating `code` field.** Codes: `auth_failed`, `network_error`, `not_found`, `rate_limited`, `streaming_unsupported`, `unknown`. Mapped from HTTP status (`401/403`, `404`, `429`-after-retry) and network failures. Thrown (not returned), consistent with the rest of the codebase, so services pattern-match on `error.code` without parsing message strings → [[marketdataerror-structured-codes]]
- **429s are retried in-adapter honouring `Retry-After`.** `apiFetch` retries up to `MAX_RETRIES` (2) on a 429, waiting `Retry-After` seconds (default 1s) before re-issuing; only after exhaustion does it throw `rate_limited`.
- **Greeks/IV are nullable on the snapshot.** `OptionSnapshot.greeks` and `OptionSnapshot.impliedVolatility` are optional and only populated when Massive returns them; `openInterest` and `volume` are typed `number | null` and always `null` from the snapshot endpoint → [[option-data-availability]]
- **Option contract ids get an `O:` prefix at the API boundary.** The renderer builds bare OCC symbols; `MassiveMarketDataProvider` prefixes them with `O:` (Polygon convention) when calling the options snapshot endpoint, and derives the underlying ticker by parsing the leading letters → [[massive-market-data-provider]]
- **Factory hides the concrete provider; services never import the class.** `marketDataFactory.create()` returns `FakeMarketDataProvider` when `FAKE_MARKET_DATA === 'true'`, otherwise a `MassiveMarketDataProvider` built from the configured key loader (default reads `process.env.MASSIVE_API_KEY`), else throws. The result is cached; `configure({ loadMassiveApiKey })` swaps the loader and resets the cache, and `recreate()` clears the cache (returns `void`). Adding another provider later is one new branch in `buildProvider()` → [[market-data-provider-interface]]
- **`src/main/integrations/alpaca.ts` is `@deprecated`, not deleted.** It predates this layer; account info / activities / market status now flow through the separate `BrokerProvider` (`broker:*` IPC) and `AlpacaBrokerProvider`.

## Contracts touched

- **`MarketDataProvider`** — provider contract declared as a TypeScript `type` (not an `interface`) exposing `getStockQuotes(tickers): Promise<Map<string, StockQuote>>`, `getOptionSnapshot(contractId): Promise<OptionSnapshot>` (singular), `getOptionChainSnapshot(filter): Promise<OptionSnapshot[]>`, `supportsStreaming(feed)`, `connect(feeds?)`, `disconnect()`, and `stream(feed, symbols): Observable<StreamEvent<StockQuote | OptionSnapshot>>`. Defined in `src/main/integrations/market-data-provider.ts`. (Account info, broker activities, and market status are **not** on this type — they live on `BrokerProvider`.)
- **`StockQuote`** — `{ price, bid, ask, change: string (2dp); changePercent: string (4dp); prevClose: string (2dp); volume: number; timestamp: ISO-8601 }`. From REST, `change`/`changePercent`/`prevClose` come from Massive's snapshot (`todaysChange`, `todaysChangePerc`, `prevDay.c`); stream ticks leave them as empty strings. Defined in `src/main/integrations/market-data-provider.ts`.
- **`OptionSnapshot`** — `{ bid, ask, mid (computed, 2dp), lastTrade: string (2dp); openInterest, volume: number | null; greeks?: { delta, gamma, theta, vega: string (4dp) }; impliedVolatility?: string (4dp); timestamp }`. `mid` is computed via decimal.js, not from the API; `greeks` and `impliedVolatility` are optional. Defined in `src/main/integrations/market-data-provider.ts`.
- **`OptionChainFilter`** — `{ underlying: string; expirationFrom?, expirationTo?: string; type?: 'put' | 'call'; strikeFrom?, strikeTo?: string; limit?: number; cursor?: string }`. Defined in `src/main/integrations/market-data-provider.ts`.
- **`MarketDataFeed`, `StreamEvent<T>`, `StreamError`** — `MarketDataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'`; `StreamEvent<T> = { feed, symbol, data: T, timestamp }`; `StreamError = { feed, code, message, reconnectable }`. Defined in `src/main/integrations/market-data-provider.ts`.
- **`MarketDataError` / `MarketDataErrorCode`** — `MarketDataError` is an `Error` subclass carrying a `readonly code: MarketDataErrorCode`, where `MarketDataErrorCode` is a named union of six members: `'auth_failed' | 'network_error' | 'not_found' | 'rate_limited' | 'streaming_unsupported' | 'unknown'`. Thrown by REST methods. Defined in `src/main/integrations/market-data-provider.ts`.
- **`marketDataFactory`** — an object (not a function) with `configure(next)`, `create()`, `recreate()`, and `disconnect()`. `configure(next: { loadMassiveApiKey: () => string })` swaps the key loader and resets the cache; `create()` returns a cached `FakeMarketDataProvider` (when `FAKE_MARKET_DATA === 'true'`) or a `MassiveMarketDataProvider` built from the configured key loader (otherwise throws `"Market data provider not configured. Set MASSIVE_API_KEY or FAKE_MARKET_DATA=true."`); `recreate()` clears the cached provider and returns `void`; `disconnect()` tears down the cached provider. Defined in `src/main/integrations/market-data-factory.ts`. The wired key loader lives in `src/main/integrations/massive-credentials.ts` (`loadMassiveApiKey`, preferring `MAIN_VITE_MASSIVE_API_KEY` from electron-vite's `.env` and falling back to `process.env.MASSIVE_API_KEY`).
- **WebSocket protocol** — connect to `wss://delayed.massive.com/stocks` → on open, client sends `{action:'auth', params: apiKey}` → server `status/auth_success` → client `{action:'subscribe', params:'AM.*'}` → server `status/success` (resolves `connect()`) and then pushes `AM` aggregate-minute bars; `status/auth_failed` rejects. JSON text frames throughout (Polygon-compatible shapes). There is no option WebSocket and no per-symbol unsubscribe message — symbol filtering is done in the Observable.

No IPC contracts, no Zod schemas, no preload bridge methods, and no DB migrations are introduced by this story — downstream UI stories (US-32, US-33, US-34) wire all of that on top of this layer.

## Decisions & tradeoffs

- **One factory branch per provider; services never import the concrete class.** Adding another provider later is one new branch in `buildProvider()` and a new implementation file, with no consumer churn.
- **REST methods are `Promise`-returning; only `stream()` is an Observable.** Mixed paradigms intentionally — request/response and push are different shapes and should be modeled accordingly.
- **Stream ticks carry only price/volume.** `AM` aggregate-minute bars don't include daily change or previous close, so stream `StockQuote`s leave `change`/`changePercent`/`prevClose` as empty strings; the REST snapshot path populates them, and US-32 carries the seed value forward.
- **No reconnection logic in the provider.** `StreamError.reconnectable: true` is a hint, not a behavior — `retry`/`retryWhen` will be composed by consumers.
- **A single `Subject` bridges the socket to Observable subscribers.** Each `stream()` call returns `tickSubject.pipe(filter(...))`; symbol filtering happens in the operator (an empty symbol list matches all). There is no per-symbol WebSocket unsubscribe.
- **`disconnect()` closes the socket and nulls the reference** to prevent accidental use of a closed resource.
- **All money values converted via `new Decimal(value).toFixed(2)` (or `.toFixed(4)` for greeks/IV)** — never floats in the public type surface; `mid` uses `ROUND_HALF_UP`.
- **Backend-only story — no UI, no IPC handlers, no Zod schemas, no migrations.** Every integration touchpoint is a TypeScript type at the `src/main/integrations/` boundary.

## Source files

- `src/main/integrations/market-data-provider.ts` — `MarketDataProvider` type, shared types, `MarketDataError` class
- `src/main/integrations/market-data-provider.test.ts` — type contract + `MarketDataError` tests
- `src/main/integrations/market-data-factory.ts` — `marketDataFactory`
- `src/main/integrations/market-data-factory.test.ts` — factory tests
- `src/main/integrations/massive-credentials.ts` — `loadMassiveApiKey` (the wired key loader; `MAIN_VITE_MASSIVE_API_KEY` → `MASSIVE_API_KEY`)
- `src/main/integrations/massive-market-data.ts` — `MassiveMarketDataProvider` implementation
- `src/main/integrations/massive-market-data.test.ts` — unit + integration tests
- `src/main/integrations/fake-market-data.ts` — `FakeMarketDataProvider` (env-driven test/dev provider)
- `src/main/integrations/fake-market-data.test.ts` — fake-provider tests
- `src/main/integrations/integration-errors.ts` — shared `isNetworkError` helper
- `src/main/integrations/alpaca.ts` — pre-existing file, `@deprecated`
- `package.json` — deps: `ws`, `@types/ws`, `rxjs` (and `@msgpack/msgpack` from the original Alpaca version)

## Open questions

- **Reconnection logic is deferred to consumers / a future story.** `StreamError.reconnectable: true` signals intent only; `retry`/`retryWhen` composition lives downstream.
- **Stream `change` / `changePercent` / `prevClose` ship as empty strings**; US-32 carries the REST-seeded `prevClose` forward and computes the daily change renderer-side.
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
