# Red Phase Results: US-31 WebSocket Streaming (Layer 3)

## Feature Context

- **Feature directory**: `plans/us-31/`
- **User story**: `docs/epics/06-stories/US-31-market-data-provider-adapter.md`
- **Plan file**: `plans/us-31/plan.md`

## Test Files Modified

- `src/main/integrations/alpaca-market-data.test.ts` — appended 18 streaming tests in new `describe('AlpacaMarketDataProvider — WebSocket Streaming', ...)` block

## Interfaces Under Test

```typescript
// src/main/integrations/alpaca-market-data.ts — existing stubs to replace
class AlpacaMarketDataProvider {
  supportsStreaming(feed: DataFeed): boolean
  connect(): Promise<void>
  disconnect(): Promise<void>
  stream(feed: DataFeed, symbols: string[]): Observable<StreamEvent<StockQuote | OptionSnapshot>>
}
```

Streaming implementation will use:

- `ws` package for WebSocket connections (stock: JSON, option: MessagePack)
- `@msgpack/msgpack` for decoding option stream binary frames
- `rxjs` Subject internally to bridge WebSocket events → Observable subscribers

## Test Coverage Summary

### supportsStreaming (3 tests)

- [x] Returns `true` for `'stockQuotes'`
- [x] Returns `true` for `'optionQuotes'`
- [x] Returns `true` for `'optionTrades'`

### connect (3 tests)

- [x] Opens stock and option WebSocket connections with correct URLs (`v2/{feed}` and `v1beta1/{feed}`)
- [x] Authenticates both connections (sends `{"action":"auth","key":"...","secret":"..."}` after receiving connected message)
- [x] Resolves only after BOTH connections authenticate (not just one)

### stream Observable (4 tests)

- [x] Sends `{"action":"subscribe","quotes":[...]}` on stock WebSocket for stockQuotes feed
- [x] Emits `StreamEvent<StockQuote>` with mapped bid/ask as 2dp strings when JSON quote arrives
- [x] Sends subscribe on option WebSocket for optionQuotes feed
- [x] Decodes MessagePack option quote messages via `@msgpack/msgpack` decode

### unsubscribe (3 tests)

- [x] Stops receiving events after `subscription.unsubscribe()`
- [x] Sends `{"action":"unsubscribe",...}` on WebSocket (teardown fires)
- [x] Keeps WebSocket open when other subscriptions still active

### disconnect (2 tests)

- [x] Closes all WebSocket connections (both sockets `close()` called)
- [x] Completes all active Observable streams (subscriber `complete` callback invoked)

### error handling (3 tests)

- [x] Emits `StreamError` with `code: 'stream_disconnected'`, `feed: 'stockQuotes'`, `reconnectable: true` when stock WebSocket disconnects
- [x] Same for option WebSocket with `feed: 'optionQuotes'`
- [x] Throws `MarketDataError` with `code: 'streaming_unsupported'` for unsupported/invalid feeds (while valid feeds return Observable)

## Test Design Assumptions

- Mock WebSocket instances store event handlers in `_handlers` map, allowing tests to simulate server messages via `emitSocketEvent()` helper
- `connect()` creates both WebSocket instances synchronously before its first internal `await`, so mock sockets are available immediately after calling `connect()` without awaiting
- Stock WebSocket receives JSON text frames; option WebSocket receives MessagePack binary frames
- `connectAndAuth()` helper simulates the full auth flow (open → connected → authenticated) on both sockets

## Test Execution Results

```
17 passed, 18 failed (35 total)

Streaming failures — all due to missing implementation:
- 3× supportsStreaming: "expected false to be true" (stub returns false)
- 9× connect/stream/unsubscribe: "expected undefined to be defined" (no sockets created)
- 4× stream/disconnect/error: "MarketDataError: Streaming not yet implemented" (stub throws)
- 2× connect: "expected 0 to be ≥ 2" (no sockets created)
```

## Verification

- ✅ Every test fails because the feature doesn't exist yet — not due to test bugs
- ✅ All 17 existing REST tests still pass
- ✅ No syntax errors in test file
- ✅ No fixture or import errors caused by test setup

## Handoff to Green Phase

To resume: run `/green`. Green phase should:

1. Replace the streaming stubs in `src/main/integrations/alpaca-market-data.ts`
2. Implement `supportsStreaming()` → return `true` for all three DataFeed values
3. Implement `connect()` → create two `ws.WebSocket` instances, authenticate both
4. Implement `stream()` → return Observable backed by internal Subject, send subscribe/unsubscribe messages
5. Implement `disconnect()` → close sockets, complete Subjects
