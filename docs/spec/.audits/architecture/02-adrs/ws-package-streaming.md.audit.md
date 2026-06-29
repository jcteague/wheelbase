---
page: docs/spec/architecture/02-adrs/ws-package-streaming.md
audited_at: 2026-06-29
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/ws-package-streaming.md

## Verified (12)

- ✓ `ws` package is a dependency — `package.json:54` (`"ws": "^8.20.0"`) and imported at `src/main/integrations/massive-market-data.ts:3` (`import WebSocket from 'ws'`).
- ✓ Single WebSocket endpoint `wss://delayed.massive.com/stocks` defined as `WS_URL` — `src/main/integrations/massive-market-data.ts:17`.
- ✓ Exactly one socket instantiated (`new WebSocket(WS_URL)`) — `src/main/integrations/massive-market-data.ts:268`; only one `new WebSocket` in the file.
- ✓ Auth handshake `{action:'auth',params:<apiKey>}` — `massive-market-data.ts:272` (`ws.send(JSON.stringify({ action: 'auth', params: this.apiKey }))`).
- ✓ Subscribes on `auth_success` with `{action:'subscribe',params:'AM.*'}` — `massive-market-data.ts:285-286`.
- ✓ Receives aggregate-minute frames (`ev:'AM'`) — type at `massive-market-data.ts:25` and handler branch at `:294` (`else if (msg.ev === 'AM')`).
- ✓ JSON text frames (auth/subscribe sent via `JSON.stringify`; status type at `:23`) — `massive-market-data.ts:272,284,286`.
- ✓ Exposed to consumers as RxJS `Observable<StreamEvent<…>>` — `import { Subject, filter, type Observable } from 'rxjs'` (`:2`); `stream(...)` returns `Observable<StreamEvent<StockQuote | OptionSnapshot>>` (`:256-259`); `rxjs` dep at `package.json:50`.
- ✓ `stream(feed, symbols)` filters shared stream by subscribed symbol set rather than per-symbol unsubscribe — `massive-market-data.ts:261-262` (`new Set(symbols)` + `tickSubject.pipe(filter(...))`); no `unsubscribe` reference in the file.
- ✓ No Alpaca feed URLs, `dataFeed`/`optionFeed` selectors, or MessagePack framing remain in the file — grep for `alpaca.markets|v1beta1|dataFeed|optionFeed|@msgpack|msgpack` returns nothing in `massive-market-data.ts`; and nothing in all of `src/`.
- ✓ `@msgpack/msgpack` lingers as an unused dependency in `package.json:34` (no `msgpack` import anywhere under `src/`).
- ✓ `MockSocket` test utilities still exist — `src/main/integrations/alpaca-stream-test-utils.ts:9` (`export type MockSocket`).

## Drift (0)

(none)

## Unverifiable (1)

- ? "Why" rationale (battle-tested, Electron ABI vs Node 21+ built-in WebSocket, Polygon-compatible framing) and the historical two-socket superseded design are narrative/historical justification, not mechanically auditable against current `src/`. Flag for human review only if the history matters.

## Missing files (0)

- ✓ `../../features/us-31-market-data-provider-adapter.md` exists.
- ✓ `../../features/us-32-live-position-prices.md` exists.

## Notes

- Minor (not drift): the `MockSocket` utility lives in `src/main/integrations/alpaca-stream-test-utils.ts` — a legacy Alpaca-named filename that survived the Massive migration. The type/utilities are present as the page claims; only the filename is stale.
