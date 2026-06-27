---
page: docs/spec/architecture/02-adrs/ws-package-streaming.md
audited_at: 2026-06-27
findings: 3
---

# Audit: ws-package-streaming.md

## Verified (3)

- ✓ Streaming uses the `ws` npm package — `src/main/integrations/massive-market-data.ts:3` `import WebSocket from 'ws'`; `package.json:54` `"ws": "^8.20.0"`.
- ✓ `MockSocket` test utilities exist — `src/main/integrations/alpaca-stream-test-utils.ts:9` (`export type MockSocket`), plus `emitSocketEvent`/`simulateAuth` helpers.
- ✓ MessagePack dependency present — `package.json:34` `"@msgpack/msgpack": "^3.1.3"` (option-data binary-frame decode claim has a dependency, though see Drift re: the actual provider).

## Drift (3)

- ✗ The page claims **two independent sockets** — stock at `wss://stream.data.alpaca.markets/v2/{dataFeed}` and option at `wss://stream.data.alpaca.markets/v1beta1/{optionFeed}`. Current code instantiates a **single** WebSocket to a **non-Alpaca** endpoint: `src/main/integrations/massive-market-data.ts:17` `const WS_URL = 'wss://delayed.massive.com/stocks'`, used at `:268` `new WebSocket(WS_URL)`. `grep -rn "new WebSocket"` finds exactly one instantiation; no `stream.data.alpaca.markets`, `v1beta1`, `dataFeed`, or `optionFeed` strings exist in src/. Suggested fix: rewrite the ADR for the Massive (Polygon-compatible) provider, or supersede it.
- ✗ The page frames streaming as an **Alpaca** integration ("Alpaca's SDK has zero WebSocket support... Multiplexing satisfies Alpaca's one-connection-per-endpoint limit"). The live streaming integration was migrated to "Massive" in commit `2debc14` ("market data / broker api separation, massive for market data"); `massive-market-data.ts:22` comment reads "Polygon-compatible WebSocket message shapes." The Alpaca-specific rationale is stale.
- ✗ Message framing claim ("stock = JSON frames, option = MessagePack binary frames") cannot be confirmed against the current single-socket Massive implementation; the documented two-feed split no longer maps to code. Flag as drift pending an updated framing description for the Massive socket.

## Unverifiable (1)

- ? "ws works identically in the Electron main process and Vitest" — runtime/portability narrative; flag for human review.

## Missing files (0)

None within src/ scope. (Note: `src/main/integrations/alpaca.ts` still exists but is now `@deprecated` and contains no WebSocket code.)
