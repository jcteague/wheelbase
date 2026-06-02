# ADR: MessagePack decoding for option stream frames

<!-- generated:from us-31 -->

## Decision

Decode Alpaca's option WebSocket frames with `@msgpack/msgpack`, using `decodeMulti()` (not `decode()`) because Alpaca batches multiple packed objects per binary frame. Stock frames stay on JSON; only the option socket uses MessagePack.

## Why

`@msgpack/msgpack` is the standard MessagePack implementation for JavaScript and the library Alpaca's documentation references. It works directly on Node `Buffer` (extends `Uint8Array`). The naïve `decode()` call throws `RangeError` when a buffer contains multiple packed objects — Alpaca's batching makes this the norm, not the exception — so `decodeMulti()` is required.

## Alternatives considered

- **`msgpack-lite`** — older, less maintained, same API surface.

## Source

- `plans/us-31/research.md`
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->
