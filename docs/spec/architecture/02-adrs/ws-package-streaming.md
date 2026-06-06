# ADR: Raw `ws` package with two dedicated sockets for streaming

<!-- generated:from us-31 -->

## Decision

Streaming uses the `ws` npm package with two independent WebSocket connections — one for stock data at `wss://stream.data.alpaca.markets/v2/{dataFeed}` (JSON frames), one for option data at `wss://stream.data.alpaca.markets/v1beta1/{optionFeed}` (MessagePack binary frames). All symbol subscriptions are multiplexed over each socket; only one connection per endpoint is allowed by Alpaca.

## Why

Alpaca's SDK has zero WebSocket support, and Node's built-in `WebSocket` (Node 21+) may not match Electron's bundled Node ABI. `ws` is battle-tested, works identically in the Electron main process and Vitest, and is trivially mockable with `MockSocket` test utilities. Multiplexing satisfies Alpaca's one-connection-per-endpoint limit while keeping subscription state in one place per feed.

## Alternatives considered

- **Node built-in WebSocket** — Electron's bundled Node may not match the expected API; less mockable.
- **`socket.io`** — wrong protocol; Alpaca uses raw WebSocket frames.

## Source

- `plans/us-31/research.md`
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->
