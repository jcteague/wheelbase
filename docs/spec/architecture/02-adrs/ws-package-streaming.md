# ADR: Raw `ws` package for a single JSON streaming socket

<!-- generated:from us-31,market-data-massive-migration -->

## Decision

Streaming uses the `ws` npm package over a **single** WebSocket connection to `wss://delayed.massive.com/stocks` (`WS_URL`), carrying JSON text frames. After the socket opens the client authenticates with `{action:'auth',params:<apiKey>}`; on `auth_success` it subscribes with `{action:'subscribe',params:'AM.*'}` and thereafter receives aggregate-minute (`ev:'AM'`) stock-bar frames. The socket is exposed to consumers as an RxJS `Observable<StreamEvent<…>>`; each `stream(feed, symbols)` call filters the shared event stream down to the subscribed symbol set rather than issuing a per-symbol WebSocket unsubscribe. There is no option WebSocket — only stock aggregate-minute bars stream.

## Why

The market-data SDK has no WebSocket support, and Node's built-in `WebSocket` (Node 21+) may not match Electron's bundled Node ABI. `ws` is battle-tested, works identically in the Electron main process and Vitest, and is trivially mockable with `MockSocket` test utilities. Massive multiplexes everything onto one socket with Polygon-compatible JSON framing, so a single connection plus client-side symbol filtering is sufficient.

## Alternatives considered

- **Node built-in WebSocket** — Electron's bundled Node may not match the expected API; less mockable.
- **`socket.io`** — wrong protocol; the endpoint speaks raw WebSocket frames.

## Current state

This is the shipped design. The provider instantiates exactly one socket (`new WebSocket(WS_URL)`) in `src/main/integrations/massive-market-data.ts`. This single-JSON-socket form **superseded** an earlier two-socket design (a JSON stock socket at `wss://stream.data.alpaca.markets/v2/{dataFeed}` plus a MessagePack option socket at `…/v1beta1/{optionFeed}`) during the Alpaca→Massive migration. None of the old Alpaca feed URLs, `dataFeed`/`optionFeed` selectors, or MessagePack framing remain in `src/`; `@msgpack/msgpack` lingers as an unused dependency in `package.json`. The original choices — raw `ws`, JSON frames, and `MockSocket` test utilities — still hold; the second socket, the OPRA/option feed, and per-symbol WebSocket unsubscribe were dropped.

## Driven by

- [us-31 — market data provider adapter](../../features/us-31-market-data-provider-adapter.md)
- [us-32 — live position prices](../../features/us-32-live-position-prices.md)

## Source

- `plans/us-31/research.md`
- `plans/market-data-massive-migration/research.md`
<!-- /generated -->
