# ADR: RxJS Observables for the streaming interface

<!-- generated:from us-31 -->

## Decision

`stream(feed, symbols)` returns an RxJS `Observable<StreamEvent<…>>`. REST methods (`getStockQuotes`, `getOptionSnapshots`, `getActivities`, `getAccountInfo`, `getMarketStatus`) stay on plain `Promise`-returning functions. Errors flow through the Observable error channel as `StreamError`; teardown via `subscription.unsubscribe()` sends the WebSocket unsubscribe message.

## Why

A hand-rolled callback + manual subscription registry is just a less capable Observable. RxJS provides first-class unsubscription via `Subscription`, built-in error/completion channels (no separate `onStreamError` callback), and the operators downstream stories actually need: `retry`/`retryWhen` for reconnection (US-38), `share`/`shareReplay` for multicasting (US-32–34), `distinctUntilChanged` and `debounceTime` for throttling. Native WICG `Observable` only exists in the renderer — the main process is Node and has none.

## Alternatives considered

- **Native Observable** — not available in Node/Electron main; missing the critical operators.
- **Callbacks with a manual subscription registry** — reimplements Observable badly; downstream stories would hand-roll retry and multicast on top.
- **AsyncIterables** — pull-based, wrong model for a push-based WebSocket stream.

## Source

- `plans/us-31/research.md`
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->
