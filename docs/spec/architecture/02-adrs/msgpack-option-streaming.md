# ADR: MessagePack decoding for option stream frames

<!-- generated:from us-31,market-data-massive-migration -->

## Status

Superseded — never shipped. Specified for an Alpaca-based option stream that the Massive migration replaced before it ever reached `src/`.

## Decision (as originally specified)

Decode Alpaca's option WebSocket frames with `@msgpack/msgpack`, using `decodeMulti()` (not `decode()`) because Alpaca batched multiple packed objects per binary frame. Stock frames would stay on JSON; only the dedicated option socket would use MessagePack binary framing.

## Why

`@msgpack/msgpack` is the standard MessagePack implementation for JavaScript and the library Alpaca's documentation referenced. It works directly on Node `Buffer` (which extends `Uint8Array`). The naïve `decode()` call throws `RangeError` when a buffer contains multiple packed objects — Alpaca's batching made this the norm, not the exception — so `decodeMulti()` was required.

## Alternatives considered

- **`msgpack-lite`** — older, less maintained, same API surface.

## Current state

This design never shipped. The live market-data provider is **Massive** (`src/main/integrations/massive-market-data.ts`), a Polygon-compatible delayed-data vendor. It serves option data via REST snapshots (`/v3/snapshot/options/...`) and streams over a **single JSON WebSocket** at `wss://delayed.massive.com/stocks` (aggregate-minute `AM` bars, JSON text frames only). There is no second option socket, no OPRA feed, and no binary/MessagePack decode path.

`@msgpack/msgpack` remains a declared dependency in `package.json` (`^3.1.3`) but is no longer imported anywhere in `src/` — it is unused leftover from the original Alpaca design. No `msgpack`, `decodeMulti`, or `@msgpack/msgpack` reference exists in current source.

The decision and rationale above are retained for history only.

## Driven by

- [us-31 — Market data provider adapter](../../features/us-31-market-data-provider-adapter.md) — original Alpaca-era story where this was specified.
- [market-data Alpaca→Massive migration](../../features/market-data-massive-migration.md) — retro plan that superseded it with the single JSON socket.

## Source

- `plans/us-31/research.md`
- `plans/market-data-massive-migration/research.md`
<!-- /generated -->
