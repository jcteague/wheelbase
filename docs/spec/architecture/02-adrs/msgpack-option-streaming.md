# ADR: MessagePack decoding for option stream frames

<!-- generated:from us-31,market-data-massive-migration -->

## Decision

Decode Alpaca's option WebSocket frames with `@msgpack/msgpack`, using `decodeMulti()` (not `decode()`) because Alpaca batches multiple packed objects per binary frame. Stock frames stay on JSON; only the option socket uses MessagePack.

## Why

`@msgpack/msgpack` is the standard MessagePack implementation for JavaScript and the library Alpaca's documentation references. It works directly on Node `Buffer` (extends `Uint8Array`). The naïve `decode()` call throws `RangeError` when a buffer contains multiple packed objects — Alpaca's batching makes this the norm, not the exception — so `decodeMulti()` is required.

## Alternatives considered

- **`msgpack-lite`** — older, less maintained, same API surface.

## Current state

Superseded / not implemented: this ADR described an Alpaca option-streaming design that was never shipped. The live market-data provider is **Massive** (`src/main/integrations/massive-market-data.ts`), which serves option data via REST snapshots and streams Polygon-compatible JSON ticks over a single `ws` socket — there is no MessagePack option socket. No `msgpack`, `decodeMulti`, or `@msgpack/msgpack` reference exists anywhere in `src/`; the `@msgpack/msgpack` dependency in `package.json` is unused. The original decision/rationale is retained here for history only.

## Source

- `plans/us-31/research.md`
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->
