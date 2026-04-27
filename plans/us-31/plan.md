# Implementation Plan: US-31 — Market Data Provider Adapter

## Summary

Build a provider-agnostic `MarketDataProvider` interface with an `AlpacaMarketDataProvider` implementation that supports both REST request/response (stock quotes, option snapshots, activities, account info, market status) and WebSocket streaming (stock quotes via JSON, option quotes/trades via MessagePack). A factory function abstracts provider construction so downstream services never import the concrete class. This is the foundational integration layer for all Epic 06 live market data stories.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and setup instructions:

- **User Story & Acceptance Criteria:** `docs/epics/06-stories/US-31-market-data-provider-adapter.md`
- **Research & Design Decisions:** `plans/us-31/research.md`
- **Data Model & Type Definitions:** `plans/us-31/data-model.md`
- **Quickstart & Verification:** `plans/us-31/quickstart.md`

## Prerequisites

- `@alpacahq/typescript-sdk` already installed (v0.0.32-preview)
- Existing `src/main/integrations/alpaca.ts` — will be deprecated but not removed
- New dependencies to install: `ws`, `@types/ws`, `@msgpack/msgpack`, `rxjs`

---

## Implementation Areas

### 1. Install Dependencies

**Files to create or modify:**

- `package.json` — add `ws`, `@msgpack/msgpack`, `rxjs` to dependencies; `@types/ws` to devDependencies

**Red — tests to write:**

- No test for this step — dependency installation is verified by subsequent areas compiling.

**Green — implementation:**

- Run `pnpm add ws @msgpack/msgpack rxjs && pnpm add -D @types/ws`

**Refactor — cleanup to consider:**

- Verify `pnpm typecheck` passes with the new type definitions available.

**Acceptance criteria covered:**

- Prerequisite for all subsequent areas.

---

### 2. MarketDataProvider Interface & Shared Types

**Files to create or modify:**

- `src/main/integrations/market-data-provider.ts` — new file: interface + all shared types
- `src/main/integrations/market-data-provider.test.ts` — new file: type contract tests

**Red — tests to write (in `src/main/integrations/market-data-provider.test.ts`):**

- `MarketDataError has code and message properties`: Construct a `MarketDataError` with code `'auth_failed'` and a message, assert `error.code === 'auth_failed'`, `error.message` contains the message, and `error instanceof Error`.
- `MarketDataError codes are exhaustive`: Assert that creating a `MarketDataError` with each valid code (`auth_failed`, `network_error`, `rate_limited`, `stream_disconnected`, `streaming_unsupported`, `subscription_failed`, `unknown`) does not throw.
- `DataFeed type accepts valid values`: TypeScript compilation test — assign `'stockQuotes'`, `'optionQuotes'`, `'optionTrades'` to a `DataFeed` variable (this is a compile-time check; the test just verifies the module exports).

**Green — implementation (in `src/main/integrations/market-data-provider.ts`):**

- `MarketDataProvider` interface with all methods specified in `data-model.md`: `getStockQuotes`, `getOptionSnapshots`, `getActivities`, `getAccountInfo`, `getMarketStatus`, `supportsStreaming`, `connect`, `disconnect`, `stream`
- `StockQuote` type with fields: `price`, `bid`, `ask`, `change`, `changePercent` (all strings), `volume` (number), `timestamp` (string)
- `OptionSnapshot` type with fields: `bid`, `ask`, `mid`, `lastTrade` (strings), `openInterest`, `volume` (number | null), `greeks: { delta, gamma, theta, vega, iv }` (all strings), `timestamp` (string)
- `BrokerActivity` type with fields: `activityId`, `activityType`, `symbol` (strings), `qty` (number), `price` (string), `transactionTime` (string)
- `ActivityFilter` type with fields: `type` (string), `since?` (string)
- `AccountInfo` type with fields: `buyingPower`, `portfolioValue`, `cash` (strings), `environment` (`'paper' | 'live'`)
- `MarketStatus` type with fields: `isOpen` (boolean), `nextOpen`, `nextClose` (strings), `session` (`'regular' | 'pre' | 'post' | 'closed'`)
- `DataFeed` union type: `'stockQuotes' | 'optionQuotes' | 'optionTrades'`
- `StreamEvent<T>` generic type with fields: `feed` (DataFeed), `symbol` (string), `data` (T), `timestamp` (string)
- `StreamError` type with fields: `feed` (DataFeed), `code` (string), `message` (string), `reconnectable` (boolean)
- `MarketDataError` class extending `Error` with a `code` property typed as the union of valid error codes
- `stream` method signature: `stream(feed: DataFeed, symbols: string[]): Observable<StreamEvent<StockQuote | OptionSnapshot>>` — returns an RxJS Observable; errors emit as `StreamError` through the error channel; WebSocket unsubscribe is sent on Observable teardown
- Export the `MarketDataProvider` interface and all types

**Refactor — cleanup to consider:**

- Ensure all type names are consistent with data-model.md naming.
- Check that no unnecessary types were added.

**Acceptance criteria covered:**

- Foundation for all ACs — defines the interface contract that every scenario validates.

---

### 3. AlpacaMarketDataProvider — REST Methods

**Files to create or modify:**

- `src/main/integrations/alpaca-market-data.ts` — new file: `AlpacaMarketDataProvider` implementing `MarketDataProvider`
- `src/main/integrations/alpaca-market-data.test.ts` — new file: unit tests with mocked SDK

**Red — tests to write (in `src/main/integrations/alpaca-market-data.test.ts`):**

- `getStockQuotes returns map of ticker to StockQuote for valid tickers`: Mock `client.getStocksQuotesLatest` to return quotes for AAPL and MSFT. Assert result is a Map with entries for both, each having `price`, `bid`, `ask` as 2dp strings, `volume` as a number, and a `timestamp` string.
- `getStockQuotes omits unknown tickers from result`: Mock SDK to return data for AAPL only when asked for ["AAPL", "ZZZZZ"]. Assert result has AAPL but not ZZZZZ, and no error is thrown.
- `getStockQuotes returns price as string with 2 decimal places`: Mock SDK with a price of `172.5`. Assert the returned `price` is `"172.50"`.
- `getOptionSnapshots returns map of contractId to OptionSnapshot`: Mock `client.getOptionsSnapshots` to return raw Alpaca response (including untyped `greeks` and `impliedVolatility`). Assert result Map has the contract ID with `bid`, `ask`, `mid`, `lastTrade` as strings, and `greeks.delta`, `greeks.iv` as 4dp strings.
- `getOptionSnapshots computes mid as (bid + ask) / 2`: Mock SDK with bid=4.15, ask=4.35. Assert `mid` is `"4.25"`.
- `getOptionSnapshots sets openInterest and volume to null`: Assert both fields are `null` in the Alpaca implementation (Alpaca doesn't provide them).
- `getActivities returns array sorted by transactionTime desc`: Mock `client.getActivity` to return activities in mixed order. Assert result array is sorted descending by `transactionTime`.
- `getActivities maps Alpaca fields to BrokerActivity shape`: Mock a single OPASN activity. Assert mapped fields: `activityId`, `activityType`, `symbol`, `qty`, `price` (string), `transactionTime`.
- `getAccountInfo returns buying power, portfolio value, cash, environment`: Mock `client.getAccount`. Assert all four fields present and `environment` is `"paper"` when constructed with `paper: true`.
- `getAccountInfo returns environment "live" when paper is false`: Construct provider with `paper: false`. Assert `environment` is `"live"`.
- `getMarketStatus returns isOpen, nextOpen, nextClose, session`: Mock `client.getClock` to return `is_open: true` with a timestamp during regular hours. Assert `isOpen` is `true` and `session` is `"regular"`.
- `getMarketStatus returns session "closed" when market is closed`: Mock clock with `is_open: false` and timestamp outside all sessions. Assert `session` is `"closed"`.
- `getMarketStatus returns session "pre" during pre-market hours`: Mock clock with `is_open: false` and timestamp at 8:00 AM ET on a trading day. Assert `session` is `"pre"`.
- `getMarketStatus returns session "post" during post-market hours`: Mock clock with `is_open: false` and timestamp at 5:00 PM ET on a trading day. Assert `session` is `"post"`.
- `throws MarketDataError with code auth_failed on 401/403`: Mock SDK method to throw a 401 error. Assert thrown error is `MarketDataError` with `code === 'auth_failed'`.
- `throws MarketDataError with code network_error on connection failure`: Mock SDK method to throw a network-level error. Assert `MarketDataError` with `code === 'network_error'` and message includes endpoint context.
- `handles unknown ticker gracefully (no error)`: Call `getStockQuotes(["AAPL", "ZZZZZ"])` with SDK returning only AAPL data. Assert no throw, result has AAPL only.

**Green — implementation (in `src/main/integrations/alpaca-market-data.ts`):**

- `AlpacaMarketDataProvider` that implements `MarketDataProvider` from `market-data-provider.ts`
- Constructor accepts `{ keyId, secretKey, paper, dataFeed?, optionFeed? }`, creates Alpaca SDK client internally via `createClient({ key, secret, paper })`
- `getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>` — calls `client.getStocksQuotesLatest({ symbols: tickers.join(',') })`, maps response to `StockQuote` type, converts numeric prices to 2dp strings using decimal.js
- `getOptionSnapshots(contractIds: string[]): Promise<Map<string, OptionSnapshot>>` — calls `client.getOptionsSnapshots({ symbols: contractIds.join(',') })`, casts raw response to include `greeks`/`impliedVolatility`, computes `mid = (bid + ask) / 2` via decimal.js, formats all money values as strings
- `getActivities(filter: ActivityFilter): Promise<BrokerActivity[]>` — calls `client.getActivity({ activity_type: filter.type })`, maps to `BrokerActivity`, sorts by `transactionTime` descending
- `getAccountInfo(): Promise<AccountInfo>` — calls `client.getAccount()`, maps fields, sets `environment` from constructor's `paper` flag
- `getMarketStatus(): Promise<MarketStatus>` — calls `client.getClock()`, derives `session` from timestamp analysis (pre: 4:00–9:30 AM ET, regular: 9:30 AM–4:00 PM ET when `is_open`, post: 4:00–8:00 PM ET, closed: otherwise)
- Private helper `wrapError(err, context)` that catches SDK errors and rethrows as `MarketDataError` with appropriate code
- All money values converted via `new Decimal(value).toFixed(2)` (or `.toFixed(4)` for greeks)
- Stub methods for streaming (`connect`, `disconnect`, `stream`, `supportsStreaming`) — these will be implemented in the next area

**Refactor — cleanup to consider:**

- Extract Alpaca response mapping into pure helper functions (e.g., `mapAlpacaQuote`, `mapAlpacaOptionSnapshot`) for testability
- Ensure no SDK types leak into the public interface — all returns use our own types from `market-data-provider.ts`
- Check for duplication between `getStockQuotes` and `getOptionSnapshots` mapping logic

**Acceptance criteria covered:**

- AC: Interface exposes stock quote retrieval
- AC: Interface exposes option snapshot retrieval
- AC: Interface exposes broker activity polling
- AC: Interface exposes account info retrieval
- AC: Interface exposes market status check
- AC: Provider returns structured error when credentials are invalid
- AC: Provider returns structured error when API is unreachable
- AC: Provider handles unknown ticker gracefully
- AC: Alpaca implementation connects using configured credentials (account info returns correct environment)

---

### 4. AlpacaMarketDataProvider — WebSocket Streaming (RxJS Observable)

**Files to create or modify:**

- `src/main/integrations/alpaca-market-data.ts` — add streaming implementation to existing provider
- `src/main/integrations/alpaca-market-data.test.ts` — add streaming tests

**Red — tests to write (append to `src/main/integrations/alpaca-market-data.test.ts`):**

- `supportsStreaming returns true for stockQuotes`: Assert `provider.supportsStreaming('stockQuotes')` returns `true`.
- `supportsStreaming returns true for optionQuotes`: Assert `provider.supportsStreaming('optionQuotes')` returns `true`.
- `supportsStreaming returns true for optionTrades`: Assert `provider.supportsStreaming('optionTrades')` returns `true`.
- `connect opens stock and option WebSocket connections`: Mock `ws` constructor. Call `connect()`. Assert two `WebSocket` instances were created — one with stock URL, one with option URL.
- `connect authenticates both connections`: Mock `ws`. Call `connect()`. Simulate the server sending `[{"T":"success","msg":"connected"}]` on both sockets. Assert both sockets sent an auth message with key/secret.
- `connect resolves after both connections authenticate`: Mock `ws`. Call `connect()`. Simulate auth success on both. Assert the promise resolves.
- `stream sends subscribe message on stock WebSocket for stockQuotes feed`: Mock `ws`. After connect + auth, call `provider.stream('stockQuotes', ['AAPL', 'MSFT']).subscribe(...)`. Assert stock socket received `{"action":"subscribe","quotes":["AAPL","MSFT"]}`.
- `stream emits StockQuote events as they arrive`: Mock `ws`. Subscribe to `stream('stockQuotes', ['AAPL'])`. Simulate server sending a quote message `[{"T":"q","S":"AAPL","bp":172.60,"ap":172.70,...}]`. Collect emitted values and assert a `StreamEvent<StockQuote>` with mapped data was emitted.
- `stream sends subscribe message on option WebSocket for optionQuotes feed`: After connect + auth, subscribe to `stream('optionQuotes', ['AAPL260516P00180000'])`. Assert option socket received a MessagePack-encoded subscribe message.
- `stream decodes MessagePack option quote messages`: Simulate server sending a MessagePack-encoded option quote. Collect emitted values and assert the Observable emitted a properly decoded `StreamEvent`.
- `unsubscribe stops receiving events for unsubscribed symbols`: Subscribe to `stream('stockQuotes', ['AAPL', 'MSFT'])`, then call `subscription.unsubscribe()`. Simulate a new AAPL quote arriving. Assert the `next` spy was NOT called after unsubscribe.
- `unsubscribe sends unsubscribe message on WebSocket`: After calling `subscription.unsubscribe()`, assert the socket received `{"action":"unsubscribe","quotes":["AAPL","MSFT"]}` (teardown logic fires on unsubscribe).
- `unsubscribe keeps WebSocket open for other active subscriptions`: Create two separate `stream()` Observables for AAPL and MSFT. Unsubscribe AAPL only. Assert socket is still open. Assert MSFT events still arrive.
- `disconnect closes all WebSocket connections`: Call `disconnect()`. Assert both stock and option sockets had `close()` called.
- `disconnect completes all active Observable streams`: Subscribe to a stream, then call `disconnect()`. Assert the subscriber's `complete` callback was invoked.
- `stream errors with StreamError when stock WebSocket disconnects unexpectedly`: Subscribe to `stream('stockQuotes', ['AAPL'])`. Simulate the stock socket emitting a `close` event unexpectedly. Assert the subscriber's `error` callback received a `StreamError` with `code: 'stream_disconnected'`, `feed: 'stockQuotes'`, and `reconnectable: true`.
- `stream errors with StreamError when option WebSocket disconnects unexpectedly`: Same as above but for option socket with `feed: 'optionQuotes'`.
- `stream throws MarketDataError with code streaming_unsupported for unsupported feed`: Create a mock provider subclass that overrides `supportsStreaming` to return `false` for `'optionQuotes'`. Assert calling `stream('optionQuotes', ...)` throws `MarketDataError` with `code: 'streaming_unsupported'`.

**Green — implementation (in `src/main/integrations/alpaca-market-data.ts`):**

- `supportsStreaming(feed: DataFeed): boolean` — Alpaca returns `true` for all three feeds (`stockQuotes`, `optionQuotes`, `optionTrades`)
- `connect(): Promise<void>` — creates two `ws.WebSocket` instances:
  - Stock: `wss://stream.data.alpaca.markets/v2/{dataFeed}` (default `sip`)
  - Option: `wss://stream.data.alpaca.markets/v1beta1/{optionFeed}` (default `opra`)
  - For each: wait for `open` event, then wait for connected message, send auth, wait for authenticated message
  - Resolve when both connections are authenticated
  - Internally, create a `Subject<StreamEvent>` per feed that bridges WebSocket messages to Observable subscribers
- `disconnect(): Promise<void>` — close both WebSocket connections, call `complete()` on all internal Subjects (which completes all downstream subscriptions gracefully)
- `stream(feed: DataFeed, symbols: string[]): Observable<StreamEvent<StockQuote | OptionSnapshot>>`:
  - Checks `supportsStreaming(feed)` first — throws `MarketDataError` with `streaming_unsupported` if false
  - Returns `new Observable(subscriber => { ... })` that:
    - Determines which socket to use (stock for `stockQuotes`, option for `optionQuotes`/`optionTrades`)
    - Sends `{"action":"subscribe","quotes":symbols}` (or `"trades"` for optionTrades) on the appropriate WebSocket
    - Pipes from the internal Subject, filtering events matching the requested symbols
    - **Teardown function** (returned from the Observable constructor): sends `{"action":"unsubscribe",...}` on the WebSocket and removes the symbol filter — this runs automatically when `subscription.unsubscribe()` is called
- Internal message routing: on stock socket `message` event, parse JSON, switch on `T` field (`q` for quotes), map to `StreamEvent<StockQuote>` via mapping helpers from area 3, push to the stock Subject via `subject.next(event)`. On option socket `message` event, decode MessagePack via `decode()` from `@msgpack/msgpack`, same routing via the option Subject.
- Internal error handling: on socket `close` event (unexpected), push `StreamError` to Subject via `subject.error(streamError)` — this propagates to all subscribers' error callbacks
- Track connection state: `disconnected | connecting | connected` per socket, throw if `stream()` called before `connect()`

**Refactor — cleanup to consider:**

- Extract WebSocket management into a helper function (e.g., `createAlpacaStream(url, encoding): { socket, subject, authenticate }`) to reduce duplication between stock and option connections
- Ensure Subjects are properly cleaned up on disconnect to prevent memory leaks
- Check that MessagePack encode for outgoing subscribe messages on option socket is correct

**Acceptance criteria covered:**

- AC: Provider declares streaming capabilities per feed
- AC: Provider connects and streams stock quotes
- AC: Provider streams option quotes via MessagePack
- AC: Unsubscribe stops receiving events for those symbols
- AC: Disconnect closes all streams
- AC: Provider emits error event when stream disconnects unexpectedly
- AC: Subscribe rejects unsupported feed

---

### 5. Market Data Factory

**Files to create or modify:**

- `src/main/integrations/market-data-factory.ts` — new file: factory function
- `src/main/integrations/market-data-factory.test.ts` — new file: factory tests

**Red — tests to write (in `src/main/integrations/market-data-factory.test.ts`):**

- `createMarketDataProvider returns AlpacaMarketDataProvider for provider "alpaca"`: Call factory with `{ provider: 'alpaca', keyId: 'test', secretKey: 'test', paper: true }`. Assert result implements `MarketDataProvider` (has all required methods).
- `createMarketDataProvider throws for unknown provider`: Call factory with `{ provider: 'unknown' as any, ... }`. Assert it throws an error.
- `factory passes config through to provider`: Call factory with `paper: true`. Call `getAccountInfo()` (mocked). Assert the underlying provider was configured with paper mode.

**Green — implementation (in `src/main/integrations/market-data-factory.ts`):**

- `MarketDataConfig` type with fields: `provider` (`'alpaca'`), `keyId`, `secretKey`, `paper`, optional `dataFeed`, optional `optionFeed`
- `createMarketDataProvider(config: MarketDataConfig): MarketDataProvider` — switch on `config.provider`, construct `AlpacaMarketDataProvider` for `'alpaca'`, throw for unknown providers
- Export `createMarketDataProvider` and `MarketDataConfig`

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- AC: Alpaca implementation connects using configured credentials (factory wires credentials through)

---

### 6. Deprecate Existing `alpaca.ts`

**Files to create or modify:**

- `src/main/integrations/alpaca.ts` — add `@deprecated` JSDoc comments

**Red — tests to write:**

- No tests needed — this is a documentation-only change.

**Green — implementation:**

- Add `/** @deprecated Use createMarketDataProvider() from market-data-factory.ts instead */` JSDoc to the `client` export and `resetClient` export in `src/main/integrations/alpaca.ts`

**Refactor — cleanup to consider:**

- Verify no other files import from `alpaca.ts` (there shouldn't be any active imports).

**Acceptance criteria covered:**

- Technical note: "Retire `alpaca.ts`" — marked deprecated per research.md decision.

---

### 7. E2e Tests

Since US-31 is a backend-only story with no UI, the E2e tests are integration tests that exercise the full provider through its public interface with mocked external dependencies (Alpaca SDK and WebSocket). Each test maps to exactly one AC.

**Files to create or modify:**

- `src/main/integrations/alpaca-market-data.e2e.test.ts` — new file: end-to-end integration tests through the factory

**Red — tests to write (in `src/main/integrations/alpaca-market-data.e2e.test.ts`):**

Each test creates a provider via `createMarketDataProvider`, mocks the Alpaca SDK client and `ws` module, and exercises the full flow from factory through to typed response.

- `AC: Interface exposes stock quote retrieval` — call `getStockQuotes(["AAPL", "MSFT", "TSLA"])` through factory-created provider, assert Map with 3 entries, each with `price` as 2dp string
- `AC: Interface exposes option snapshot retrieval` — call `getOptionSnapshots(["AAPL260516P00180000"])`, assert Map entry with `bid`, `ask`, `mid` (equals (bid+ask)/2), `greeks.delta`, `greeks.iv`, `timestamp`
- `AC: Interface exposes broker activity polling` — call `getActivities({ type: "OPASN", since: "2026-04-20" })`, assert array sorted by `transactionTime` descending with fields `activityId`, `activityType`, `symbol`, `qty`, `price`, `transactionTime`
- `AC: Interface exposes account info retrieval` — call `getAccountInfo()`, assert `buyingPower`, `portfolioValue`, `cash`, `environment` fields present and `environment` is `"paper"`
- `AC: Interface exposes market status check` — call `getMarketStatus()`, assert `isOpen`, `nextOpen`, `nextClose`, `session` fields present and `session` is one of `regular | pre | post | closed`
- `AC: Provider declares streaming capabilities per feed` — assert `supportsStreaming("stockQuotes")` is `true`, `supportsStreaming("optionQuotes")` is `true`, `supportsStreaming("optionTrades")` is `true`
- `AC: Provider connects and streams stock quotes` — call `connect()`, then `stream("stockQuotes", ["AAPL", "MSFT"]).subscribe(observer)`, simulate quote events, assert observer received `StreamEvent<StockQuote>` emissions with correct symbols
- `AC: Provider streams option quotes via MessagePack` — call `connect()`, then `stream("optionQuotes", ["AAPL260516P00180000"]).subscribe(observer)`, simulate MessagePack-encoded quote, assert observer received decoded `StreamEvent` emission
- `AC: Unsubscribe stops receiving events for those symbols` — subscribe to Observable, call `subscription.unsubscribe()`, simulate more events, assert observer received no further emissions and WebSocket stays open
- `AC: Disconnect closes all streams` — subscribe to multiple stream Observables, call `disconnect()`, assert all sockets closed and all subscribers received `complete`
- `AC: Alpaca implementation connects using configured credentials` — create provider with paper=true credentials, mock auth flow, assert connection to paper endpoint and `getAccountInfo()` returns `environment: "paper"`
- `AC: Provider returns structured error when credentials are invalid` — mock SDK to return 401, call `getAccountInfo()`, assert `MarketDataError` with `code: "auth_failed"` and message includes `"authentication"`
- `AC: Provider returns structured error when API is unreachable` — mock SDK to throw network error, call `getStockQuotes(["AAPL"])`, assert `MarketDataError` with `code: "network_error"` and message includes endpoint context
- `AC: Provider emits error event when stream disconnects unexpectedly` — subscribe to `stream("stockQuotes", ["AAPL"])`, simulate WebSocket close, assert subscriber's `error` callback received `StreamError` with `code: "stream_disconnected"`, includes feed name and `reconnectable` flag
- `AC: Provider handles unknown ticker gracefully` — call `getStockQuotes(["AAPL", "ZZZZZ"])`, assert result contains AAPL, "ZZZZZ" absent (not an error)
- `AC: Subscribe rejects unsupported feed` — mock a scenario where `supportsStreaming("optionQuotes")` returns `false`, call `stream("optionQuotes", ...)`, assert `MarketDataError` with `code: "streaming_unsupported"`

**Green — implementation:**

- These are test-only — no production code is written in this area. All production code was built in areas 1–6.

**Refactor — cleanup to consider:**

- Ensure test helpers for WebSocket simulation are shared (not duplicated from area 4 tests).
- Check that each test is self-contained and doesn't depend on test execution order.

**Acceptance criteria covered:**

- ALL 16 ACs — one test per AC, test names mirror AC language.
