# US-31 — Market Data Provider Adapter — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 0 — Setup (no dependencies)

### Install Dependencies

- [x] **[Setup]** Install new packages
  - Run `pnpm add ws @msgpack/msgpack rxjs && pnpm add -D @types/ws`
  - Run `pnpm typecheck` — must pass with new type definitions available
  - Verify `package.json` has `ws`, `@msgpack/msgpack`, `rxjs` in dependencies and `@types/ws` in devDependencies

---

## Layer 1 — Foundation (depends on Layer 0)

> These areas can be started immediately after deps are installed and run in parallel.

### MarketDataProvider Interface & Shared Types

- [x] **[Red]** Write failing tests — `src/main/integrations/market-data-provider.test.ts`
  - `MarketDataError has code and message properties` — construct with code `'auth_failed'`, assert `error.code`, `error.message`, `error instanceof Error`
  - `MarketDataError codes are exhaustive` — create with each valid code (`auth_failed`, `network_error`, `rate_limited`, `stream_disconnected`, `streaming_unsupported`, `subscription_failed`, `unknown`), assert none throw
  - `DataFeed type accepts valid values` — compile-time check, assign `'stockQuotes'`, `'optionQuotes'`, `'optionTrades'` to `DataFeed` variable, verify module exports
  - Run `pnpm test src/main/integrations/market-data-provider.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/market-data-provider.ts` _(depends on: Interface Red ✓)_
  - `MarketDataProvider` interface with methods: `getStockQuotes`, `getOptionSnapshots`, `getActivities`, `getAccountInfo`, `getMarketStatus`, `supportsStreaming`, `connect`, `disconnect`, `stream`
  - Types: `StockQuote` (price/bid/ask/change/changePercent as strings, volume as number, timestamp), `OptionSnapshot` (bid/ask/mid/lastTrade as strings, openInterest/volume as number|null, greeks with delta/gamma/theta/vega/iv as 4dp strings), `BrokerActivity`, `ActivityFilter`, `AccountInfo`, `MarketStatus`, `DataFeed`, `StreamEvent<T>`, `StreamError`
  - `MarketDataError` class extending `Error` with typed `code` property
  - `stream` method signature: `stream(feed: DataFeed, symbols: string[]): Observable<StreamEvent<StockQuote | OptionSnapshot>>`
  - See `plans/us-31/data-model.md` for complete field specs
  - Run `pnpm test src/main/integrations/market-data-provider.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/market-data-provider.ts` _(depends on: Interface Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Deprecate Existing `alpaca.ts`

- [x] **[Green]** Add deprecation annotations — `src/main/integrations/alpaca.ts`
  - Add `/** @deprecated Use createMarketDataProvider() from market-data-factory.ts instead */` JSDoc to `client` and `resetClient` exports
  - Verify no other files import from `alpaca.ts`

---

## Layer 2 — REST Implementation (depends on Layer 1)

> Start after Interface & Shared Types Green is complete.

### AlpacaMarketDataProvider — REST Methods

**Requires:** Interface & Shared Types Green ✓

- [x] **[Red]** Write failing tests — `src/main/integrations/alpaca-market-data.test.ts` _(depends on: Interface Green ✓)_
  - Mock `@alpacahq/typescript-sdk` `createClient` and individual SDK methods
  - **Stock quotes (3 tests):**
    - `getStockQuotes returns map of ticker to StockQuote for valid tickers` — mock `getStocksQuotesLatest` for AAPL+MSFT, assert Map entries with `price`, `bid`, `ask` as 2dp strings, `volume` as number, `timestamp` string
    - `getStockQuotes omits unknown tickers from result` — mock SDK returning AAPL only for ["AAPL","ZZZZZ"], assert AAPL present, ZZZZZ absent, no error
    - `getStockQuotes returns price as string with 2 decimal places` — mock price `172.5`, assert `"172.50"`
  - **Option snapshots (3 tests):**
    - `getOptionSnapshots returns map of contractId to OptionSnapshot` — mock `getOptionsSnapshots` with raw response including untyped `greeks`/`impliedVolatility`, assert `bid`, `ask`, `mid`, `lastTrade` as strings, `greeks.delta`/`greeks.iv` as 4dp strings
    - `getOptionSnapshots computes mid as (bid + ask) / 2` — mock bid=4.15 ask=4.35, assert `mid` is `"4.25"`
    - `getOptionSnapshots sets openInterest and volume to null` — assert both `null`
  - **Activities (2 tests):**
    - `getActivities returns array sorted by transactionTime desc` — mock mixed-order activities, assert sorted descending
    - `getActivities maps Alpaca fields to BrokerActivity shape` — mock single OPASN, assert `activityId`, `activityType`, `symbol`, `qty`, `price` (string), `transactionTime`
  - **Account info (2 tests):**
    - `getAccountInfo returns buying power, portfolio value, cash, environment` — mock `getAccount`, assert fields, `environment` is `"paper"`
    - `getAccountInfo returns environment "live" when paper is false` — construct with `paper: false`, assert `"live"`
  - **Market status (4 tests):**
    - `getMarketStatus returns isOpen, nextOpen, nextClose, session` — mock `getClock` with `is_open: true` during regular hours, assert `session: "regular"`
    - `getMarketStatus returns session "closed" when market is closed` — timestamp outside all sessions
    - `getMarketStatus returns session "pre" during pre-market hours` — 8:00 AM ET on trading day
    - `getMarketStatus returns session "post" during post-market hours` — 5:00 PM ET on trading day
  - **Error handling (3 tests):**
    - `throws MarketDataError with code auth_failed on 401/403`
    - `throws MarketDataError with code network_error on connection failure` — message includes endpoint context
    - `handles unknown ticker gracefully (no error)` — ["AAPL","ZZZZZ"], AAPL only in result
  - Run `pnpm test src/main/integrations/alpaca-market-data.test.ts` — all 17 new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/alpaca-market-data.ts` _(depends on: REST Red ✓)_
  - `AlpacaMarketDataProvider` implementing `MarketDataProvider`
  - Constructor: `{ keyId, secretKey, paper, dataFeed?, optionFeed? }` → creates SDK client via `createClient({ key, secret, paper })`
  - `getStockQuotes` → `client.getStocksQuotesLatest({ symbols })`, map to `StockQuote`, prices via `new Decimal(value).toFixed(2)`
  - `getOptionSnapshots` → `client.getOptionsSnapshots({ symbols })`, cast raw for greeks/IV, compute `mid = (bid+ask)/2` via decimal.js
  - `getActivities` → `client.getActivity({ activity_type })`, map to `BrokerActivity`, sort `transactionTime` desc
  - `getAccountInfo` → `client.getAccount()`, set `environment` from constructor `paper` flag
  - `getMarketStatus` → `client.getClock()`, derive `session` (pre: 4:00–9:30 AM ET, regular: 9:30 AM–4:00 PM ET, post: 4:00–8:00 PM ET, closed: otherwise)
  - Private `wrapError(err, context)` → rethrows as `MarketDataError` with appropriate code
  - Stub `connect`, `disconnect`, `stream`, `supportsStreaming` (Area 4 implements these)
  - Run `pnpm test src/main/integrations/alpaca-market-data.test.ts` — all 17 tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/alpaca-market-data.ts` _(depends on: REST Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract mapping helpers (`mapAlpacaQuote`, `mapAlpacaOptionSnapshot`) as pure functions
  - Ensure no SDK types leak into public interface
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Streaming & Factory (depends on Layer 2)

> These areas can run in parallel with each other **after** REST Methods Green is complete.

### AlpacaMarketDataProvider — WebSocket Streaming (RxJS Observable)

**Requires:** REST Methods Green ✓

- [x] **[Red]** Write failing tests — append to `src/main/integrations/alpaca-market-data.test.ts` _(depends on: REST Green ✓)_
  - Mock `ws` module: `vi.mock('ws', ...)` returning mock WebSocket instances with `on`, `send`, `close`, `readyState`
  - **supportsStreaming (3 tests):**
    - Returns `true` for `'stockQuotes'`, `'optionQuotes'`, `'optionTrades'`
  - **connect (3 tests):**
    - `connect opens stock and option WebSocket connections` — assert two sockets created with correct URLs (`wss://stream.data.alpaca.markets/v2/{feed}` and `wss://stream.data.alpaca.markets/v1beta1/{feed}`)
    - `connect authenticates both connections` — simulate server connected message, assert auth sent with key/secret
    - `connect resolves after both connections authenticate` — simulate auth success on both, assert promise resolves
  - **stream Observable (4 tests):**
    - `stream sends subscribe message on stock WebSocket for stockQuotes` — subscribe to Observable, assert socket received `{"action":"subscribe","quotes":["AAPL","MSFT"]}`
    - `stream emits StockQuote events as they arrive` — simulate server quote `[{"T":"q","S":"AAPL","bp":172.60,"ap":172.70,...}]`, assert `StreamEvent<StockQuote>` emitted
    - `stream sends subscribe on option WebSocket for optionQuotes` — assert option socket received MessagePack-encoded subscribe
    - `stream decodes MessagePack option quote messages` — simulate MessagePack-encoded option quote, assert decoded `StreamEvent` emitted
  - **unsubscribe (3 tests):**
    - `unsubscribe stops receiving events` — `.subscribe()`, then `sub.unsubscribe()`, simulate more events, assert `next` not called
    - `unsubscribe sends unsubscribe message on WebSocket` — assert socket received `{"action":"unsubscribe",...}` (teardown fires)
    - `unsubscribe keeps WebSocket open for other subscriptions` — two separate streams, unsubscribe one, assert other still receives
  - **disconnect (2 tests):**
    - `disconnect closes all WebSocket connections` — assert both sockets `close()` called
    - `disconnect completes all active Observable streams` — assert subscriber `complete` callback invoked
  - **error handling (3 tests):**
    - `stream errors with StreamError when stock WebSocket disconnects` — simulate unexpected close, assert `error` callback receives `StreamError` with `code: 'stream_disconnected'`, `feed: 'stockQuotes'`, `reconnectable: true`
    - `stream errors with StreamError when option WebSocket disconnects` — same for option socket
    - `stream throws MarketDataError for unsupported feed` — override `supportsStreaming` to return `false`, assert `MarketDataError` with `code: 'streaming_unsupported'`
  - Run `pnpm test src/main/integrations/alpaca-market-data.test.ts` — all 18 new tests must fail (17 REST tests still pass)
- [x] **[Green]** Implement streaming in `src/main/integrations/alpaca-market-data.ts` _(depends on: Streaming Red ✓)_
  - `supportsStreaming(feed)` → returns `true` for all three DataFeed values
  - `connect()` → creates two `ws.WebSocket` instances (stock JSON + option MessagePack), authenticates both, creates internal `Subject<StreamEvent>` per socket to bridge WebSocket events to Observable subscribers. Resolves when both authenticated.
  - `disconnect()` → closes both sockets, calls `complete()` on all internal Subjects
  - `stream(feed, symbols)` → checks `supportsStreaming` (throws `MarketDataError` if false), returns `new Observable(subscriber => { ... })`:
    - Sends subscribe message on appropriate socket
    - Pipes from internal Subject, filtering events matching requested symbols
    - **Teardown**: sends unsubscribe message on socket, removes symbol filter
  - Stock socket message handler: parse JSON, switch on `T` field (`q`→quote), map to `StreamEvent<StockQuote>`, push via `subject.next()`
  - Option socket message handler: `decode()` from `@msgpack/msgpack`, same routing via option Subject
  - Socket `close` handler: push `StreamError` via `subject.error()` with `reconnectable: true`
  - Run `pnpm test src/main/integrations/alpaca-market-data.test.ts` — all 35 tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/alpaca-market-data.ts` _(depends on: Streaming Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract `createAlpacaStream(url, encoding)` helper to reduce duplication between stock/option sockets
  - Ensure Subjects properly cleaned up on disconnect
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Market Data Factory

**Requires:** REST Methods Green ✓

- [x] **[Red]** Write failing tests — `src/main/integrations/market-data-factory.test.ts` _(depends on: REST Green ✓)_
  - `createMarketDataProvider returns AlpacaMarketDataProvider for provider "alpaca"` — call with `{ provider: 'alpaca', keyId: 'test', secretKey: 'test', paper: true }`, assert result has all `MarketDataProvider` methods
  - `createMarketDataProvider throws for unknown provider` — `{ provider: 'unknown' as any, ... }`, assert throws
  - `factory passes config through to provider` — call with `paper: true`, mock SDK `getAccount`, assert `environment: "paper"`
  - Run `pnpm test src/main/integrations/market-data-factory.test.ts` — all 3 tests must fail
- [x] **[Green]** Implement — `src/main/integrations/market-data-factory.ts` _(depends on: Factory Red ✓)_
  - `MarketDataConfig` type: `{ provider: 'alpaca', keyId, secretKey, paper, dataFeed?, optionFeed? }`
  - `createMarketDataProvider(config): MarketDataProvider` — switch on `config.provider`, construct `AlpacaMarketDataProvider` for `'alpaca'`, throw for unknown
  - Export `createMarketDataProvider` and `MarketDataConfig`
  - Run `pnpm test src/main/integrations/market-data-factory.test.ts` — all 3 tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/market-data-factory.ts` _(depends on: Factory Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Integration Tests (depends on all previous layers)

> Start after ALL Green tasks from Layers 1–3 are complete.

### E2e Integration Tests

**Requires:** All Green tasks ✓ (Interface, REST, Streaming, Factory, Deprecate)

- [x] **[Red]** Write failing e2e tests — `src/main/integrations/alpaca-market-data.e2e.test.ts` _(depends on: all Green tasks ✓)_
  - Each test creates a provider via `createMarketDataProvider`, mocks SDK + `ws`, exercises full flow from factory → typed response
  - One `it()` per AC — test names mirror AC language:
    - AC-1: `Interface exposes stock quote retrieval` → `it('returns stock quotes as map with 2dp prices')`
    - AC-2: `Interface exposes option snapshot retrieval` → `it('returns option snapshots with greeks and computed mid')`
    - AC-3: `Interface exposes broker activity polling` → `it('returns activities sorted by transactionTime desc')`
    - AC-4: `Interface exposes account info retrieval` → `it('returns account info with paper environment')`
    - AC-5: `Interface exposes market status check` → `it('returns market status with session type')`
    - AC-6: `Provider declares streaming capabilities per feed` → `it('supports streaming for all three feeds')`
    - AC-7: `Provider connects and streams stock quotes` → `it('streams stock quotes via Observable')`
    - AC-8: `Provider streams option quotes via MessagePack` → `it('streams option quotes decoded from MessagePack')`
    - AC-9: `Unsubscribe stops receiving events` → `it('stops events after Observable unsubscribe')`
    - AC-10: `Disconnect closes all streams` → `it('closes sockets and completes Observables on disconnect')`
    - AC-11: `Alpaca connects using configured credentials` → `it('authenticates with paper credentials')`
    - AC-12: `Structured error when credentials invalid` → `it('throws MarketDataError auth_failed on 401')`
    - AC-13: `Structured error when API unreachable` → `it('throws MarketDataError network_error on connection failure')`
    - AC-14: `Error event when stream disconnects` → `it('emits StreamError on unexpected WebSocket close')`
    - AC-15: `Handles unknown ticker gracefully` → `it('omits unknown tickers without error')`
    - AC-16: `Subscribe rejects unsupported feed` → `it('throws MarketDataError streaming_unsupported')`
  - Run `pnpm test src/main/integrations/alpaca-market-data.e2e.test.ts` — all 16 tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2e Red ✓)_
  - These are test-only — all production code exists from Layers 1–3
  - Fix any wiring issues discovered between factory → provider → SDK/WebSocket mocks
  - Run `pnpm test src/main/integrations/alpaca-market-data.e2e.test.ts` — all 16 tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2e Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Share WebSocket simulation helpers with Area 4 tests (extract to test-utils if duplicated)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (16 ACs → 16 tests)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
