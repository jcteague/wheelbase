---
page: docs/spec/architecture/02-adrs/ws-package-streaming.md
audited_at: 2026-09-28
findings: 6
---

# Audit: ws-package-streaming.md

## Verified (5)

- ✓ `ws` npm package is used — `package.json:55`; `import WebSocket from 'ws'` in `src/main/integrations/alpaca-market-data.ts:2`.
- ✓ Exactly one socket is instantiated — `new WebSocket(STREAM_URL)` at `alpaca-market-data.ts:386`.
- ✓ Exposed as RxJS `Observable<StreamEvent<…>>`, with each `stream()` filtering a shared subject by symbol set — `alpaca-market-data.ts:509-521`.
- ✓ No option WebSocket: "option feeds stay on the REST snapshot path" — `alpaca-market-data.ts:368`.
- ✓ `@msgpack/msgpack` lingers as an unused dependency — `package.json:34`; no import in `src/` (grep empty). `MockSocket` test utility exists — `src/main/integrations/alpaca-stream-test-utils.ts:9`.

## Drift (5)

- ✗ Page presents the Massive socket as "the shipped design" (line 20) in `src/main/integrations/massive-market-data.ts`. That file does not exist; streaming lives in `src/main/integrations/alpaca-market-data.ts` (Massive retired by US-99). The page carries no superseded banner. Suggested fix: mark the Massive design as superseded by US-99 and describe the Alpaca socket.
- ✗ Endpoint: page says `wss://delayed.massive.com/stocks` (`WS_URL`); code uses `STREAM_URL = 'wss://stream.data.alpaca.markets/v2/iex'` — `alpaca-market-data.ts:56`. The page's claim that "none of the old Alpaca feed URLs … remain in `src/`" is also false for the same reason.
- ✗ Auth/subscribe frames: page says `{action:'auth',params:<apiKey>}` then `{action:'subscribe',params:'AM.*'}` receiving `ev:'AM'` frames. Code waits for `T:'success', msg:'connected'`, sends `{ action: 'auth', key, secret }`, and handles `T:'b'` (bar) frames — `alpaca-market-data.ts:411-433`; subscriptions are per-symbol `{ action: 'subscribe', bars: [...] }` — `alpaca-market-data.ts:540`.
- ✗ Page says `stream()` filters "rather than issuing a per-symbol WebSocket unsubscribe" and that per-symbol unsubscribe "was dropped". Code sends `{ action: 'unsubscribe', bars: removed }` for symbols dropped between `stream()` calls — `alpaca-market-data.ts:535-537` (free-plan symbol cap).
- ✗ Rationale "Massive multiplexes everything onto one socket with Polygon-compatible JSON framing" (line 11) is stated as the current reason; it no longer applies to the Alpaca socket. Suggested fix: fold into the superseded/history note.

## Unverifiable (1)

- ? "Node's built-in WebSocket may not match Electron's bundled Node ABI" — environment rationale; not checkable. `plans/us-31/research.md` is historical; `plans/market-data-massive-migration/` exists (not audited).

## Missing files (0)

None. Links `../../features/us-31-market-data-provider-adapter.md` and `../../features/us-32-live-position-prices.md` exist.
