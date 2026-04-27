# Research: US-31 — Market Data Provider Adapter

## Alpaca TypeScript SDK Limitations (v0.0.32-preview)

- **Decision:** Use the SDK for REST calls where it works correctly; bypass it with raw HTTP or raw WebSocket for areas where it's broken or missing.
- **Rationale:** The SDK is a Deno-to-Node transpile (via `dnt`), marked as no longer maintained. Several methods have bugs or incomplete types, but the core REST client (`getAccount`, `getClock`, `getStocksQuotesLatest`, `getActivity`) works. Building a full replacement HTTP client would be wasted effort for the working endpoints.
- **Alternatives considered:** (1) Replace SDK entirely with raw `fetch` — too much work for endpoints that already work. (2) Use `alpaca-trade-api-js` (the SDK's suggested replacement) — older, callback-based, worse TypeScript support.

### Specific SDK Issues

| Method                  | Issue                                                                                       | Mitigation                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `getStocksSnapshots()`  | Hits `/v1beta1/` instead of `/v2/`; snake_case/camelCase mismatch                           | Use `getStocksQuotesLatest()` for quotes; use `getStocksSnapshots()` with raw response cast for richer data if needed |
| `getOptionsSnapshots()` | Type omits `greeks`, `impliedVolatility` from response                                      | Cast raw response to our own richer `OptionSnapshot` type — the data IS returned, just untyped                        |
| `getActivity()`         | Only passes `activity_type` to URL path; ignores `after`, `until`, `page_size` query params | Use SDK's internal `context.request()` for filtered queries, or build URL manually and use SDK auth headers           |
| WebSocket streaming     | **Not implemented at all** — README says "todo"                                             | Build raw WebSocket clients using `ws` package                                                                        |
| `getClock()`            | No `session` field in response                                                              | Derive session type from clock timestamp + calendar data                                                              |
| `getAccount()`          | No paper/live indicator                                                                     | Track from the `paper` config flag passed at construction                                                             |

---

## WebSocket Streaming Architecture

- **Decision:** Use the `ws` npm package with two independent WebSocket connections — one for stock data (JSON), one for option data (MessagePack).
- **Rationale:** The SDK has zero WebSocket support. Node's built-in `WebSocket` (Node 21+) may differ in Electron's bundled Node version. `ws` is battle-tested, works identically in Electron main process and Vitest, and is trivially mockable.
- **Alternatives considered:** (1) Node built-in WebSocket — Electron's bundled Node may not match; less mockable. (2) `socket.io` — wrong protocol, Alpaca uses raw WebSocket.

### WebSocket URLs

| Stream               | URL                                                               | Encoding                  |
| -------------------- | ----------------------------------------------------------------- | ------------------------- |
| Stock quotes/trades  | `wss://stream.data.alpaca.markets/v2/sip` (or `iex`)              | JSON text frames          |
| Option quotes/trades | `wss://stream.data.alpaca.markets/v1beta1/opra` (or `indicative`) | MessagePack binary frames |

Paper and live accounts share the same data stream URLs. The paper/live distinction only affects the trading API base URL.

### Authentication Flow

1. Connect to WebSocket
2. Receive: `[{"T":"success","msg":"connected"}]`
3. Send: `{"action":"auth","key":"...","secret":"..."}`
4. Receive: `[{"T":"success","msg":"authenticated"}]`
5. Subscribe: `{"action":"subscribe","quotes":["AAPL","MSFT"]}`

For option streams, the same protocol applies but all messages are MessagePack-encoded.

### Connection Limits

Most Alpaca subscriptions allow only **1 concurrent connection per endpoint**. The adapter must multiplex all symbol subscriptions over a single stock connection and a single option connection.

---

## MessagePack Decoding

- **Decision:** Use `@msgpack/msgpack` package for decoding option stream binary frames.
- **Rationale:** It's the standard MessagePack implementation for JavaScript, works with Node `Buffer` directly (extends `Uint8Array`), and is the library Alpaca documentation references.
- **Alternatives considered:** `msgpack-lite` — older, less maintained, same API surface.

### Usage Pattern

```typescript
import { decode } from '@msgpack/msgpack'

// Node Buffer from ws is Uint8Array-compatible
const msg = decode(buffer) as AlpacaStreamMessage
```

**Gotcha:** `decode()` throws `RangeError` if buffer contains multiple packed objects per frame — use `decodeMulti()` if Alpaca batches messages (which it does — messages arrive as arrays).

---

## Option Snapshot Data Availability

- **Decision:** Greeks and IV are available via REST option snapshots only, NOT via streaming. Open interest is NOT available through Alpaca's option snapshot API at all.
- **Rationale:** Alpaca's option streaming only provides quote (bid/ask) and trade (price/size) data. Greeks/IV come from the REST `/v1beta1/options/snapshots` endpoint. Open interest is absent from all Alpaca option endpoints.
- **Alternatives considered:** Deriving volume from `getOptionsBars()` — possible but adds complexity. OI would need a different data source entirely.

### Fields Available by Source

| Field                              | REST Snapshot | Stream Quote | Stream Trade |
| ---------------------------------- | ------------- | ------------ | ------------ |
| bid/ask                            | ✅            | ✅           | —            |
| last trade price                   | ✅            | —            | ✅           |
| greeks (delta, gamma, theta, vega) | ✅            | —            | —            |
| implied volatility                 | ✅            | —            | —            |
| open interest                      | ❌            | —            | —            |
| volume                             | ❌ (use bars) | —            | —            |

The `OptionSnapshot` type in our interface will include `openInterest` and `volume` as `string | null` to accommodate providers that do supply this data, with Alpaca returning `null` for both.

---

## Market Session Detection

- **Decision:** Derive session type (`regular`, `pre`, `post`, `closed`) by comparing the clock timestamp against calendar open/close times plus known extended-hours windows.
- **Rationale:** Alpaca's `/v2/clock` only returns `is_open` (boolean), `next_open`, and `next_close`. There is no `session` field. Pre-market is 4:00–9:30 AM ET, post-market is 4:00–8:00 PM ET.
- **Alternatives considered:** Only returning `is_open` boolean — insufficient for the AC which requires session as one of `regular | pre | post | closed`.

---

## Error Handling Strategy

- **Decision:** Define a `MarketDataError` class extending `Error` with a `code` field. Use specific codes: `auth_failed`, `network_error`, `rate_limited`, `stream_disconnected`, `streaming_unsupported`, `subscription_failed`, `unknown`.
- **Rationale:** Consistent with the story's AC which requires structured errors with specific codes. Services can pattern-match on `error.code` without parsing message strings.
- **Alternatives considered:** Returning `Result<T, E>` tuples — cleaner functionally but inconsistent with the rest of the codebase which uses thrown errors.

---

## Streaming Abstraction: RxJS Observables

- **Decision:** Use RxJS `Observable` for the streaming interface. REST methods remain plain `Promise`-returning functions.
- **Rationale:** The callback + manual subscription registry pattern is a hand-rolled, less capable Observable. RxJS provides: (1) first-class unsubscription via `Subscription`, (2) built-in error/completion channels — no separate `onStreamError` callback, (3) operators that downstream stories need (`retry`/`retryWhen` for US-38 reconnection, `share`/`shareReplay` for multicasting to multiple UI components in US-32–34, `distinctUntilChanged` and `debounceTime` for throttling). Native `Observable` (WICG spec, Chromium 135+) is only available in the renderer — the main process where the provider lives is Node.js, which has no native Observable.
- **Alternatives considered:** (1) Native Observable — not available in Node.js/Electron main process, and missing critical operators (`retry`, `share`, `debounceTime`). (2) Callbacks with manual registry — works but reimplements Observable badly; downstream stories would hand-roll retry/multicast logic. (3) AsyncIterables — pull-based, wrong model for push-based WebSocket streams.

### Interface Shape

```typescript
// Instead of:
subscribe(feed, symbols, callback): StreamSubscription
onStreamError(callback): void

// Observable version:
stream(feed: DataFeed, symbols: string[]): Observable<StreamEvent<StockQuote | OptionSnapshot>>
// Errors flow through the Observable error channel (StreamError)
// Unsubscribe via subscription.unsubscribe()
// Multicasting via .pipe(share()) in downstream consumers
```

### Dependency Impact

RxJS is ~30KB tree-shakeable. Only `Observable`, `Subject`, and a handful of creation/utility functions are needed in this story. Operators like `retry`, `share`, `debounceTime` will be imported in downstream stories.

---

## New Dependencies Required

| Package            | Purpose                                        | Install Command                        |
| ------------------ | ---------------------------------------------- | -------------------------------------- |
| `ws`               | WebSocket client for Electron main process     | `pnpm add ws && pnpm add -D @types/ws` |
| `@msgpack/msgpack` | Decode option stream MessagePack frames        | `pnpm add @msgpack/msgpack`            |
| `rxjs`             | Observable abstraction for WebSocket streaming | `pnpm add rxjs`                        |

---

## Existing `alpaca.ts` Disposition

- **Decision:** Keep `src/main/integrations/alpaca.ts` as-is during this story. The new `AlpacaMarketDataProvider` will create its own SDK client internally. Deprecation/removal of the old file happens when downstream stories migrate callers.
- **Rationale:** No existing code imports from `alpaca.ts` except possibly future Phase 2+ stories. Removing it now risks breaking the build if any downstream branch depends on it. Mark it with a `@deprecated` JSDoc comment instead.
- **Alternatives considered:** Deleting immediately — safe today (nothing imports it beyond the lazy factory) but unnecessarily risky if other branches exist.
