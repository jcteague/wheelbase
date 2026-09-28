---
page: docs/spec/architecture/02-adrs/per-symbol-ws-subscription-reconciliation.md
audited_at: 2026-09-28
findings: 1
---

# Audit: per-symbol-ws-subscription-reconciliation.md

## Verified (11)

- ✓ `connect()` opens `wss://stream.data.alpaca.markets/v2/iex` — `src/main/integrations/alpaca-market-data.ts:56`.
- ✓ Sends `{ action: 'auth', key, secret }` on the `connected` frame, resolves on `authenticated`; no subscribe during connect — `alpaca-market-data.ts:411-420`.
- ✓ `connect()` clears `subscribed` — `alpaca-market-data.ts:383`.
- ✓ Reconciliation sends `unsubscribe` (removed) then `subscribe` (added), only non-empty, only when `readyState === OPEN` — `alpaca-market-data.ts:524-543`.
- ✓ `stream()` wraps the subject in `defer()` and filters to the symbol set — `alpaca-market-data.ts:510-522`.
- ✓ Post-auth error frames → `failStream({ feed: 'stockQuotes', code: classifyStreamError(frame.code), reconnectable: false })` — `alpaca-market-data.ts:472-489`; 405 → `symbol_limit`, 406 → `connection_limit`, else `unknown` — `alpaca-market-data-mappers.ts:433-437`.
- ✓ Close handler guarded by `if (this.ws !== ws) return` — `alpaca-market-data.ts:452`.
- ✓ `failStream` swaps in a fresh `Subject` before erroring the old one — `alpaca-market-data.ts:494-501`.
- ✓ `disconnect()` closes the socket and clears the set — `alpaca-market-data.ts:503-508`.
- ✓ Pure helpers `parseFrames`, `mapBar`, `classifyStreamError`, `connectError` in `alpaca-market-data-mappers.ts:402, 413, 433, 439`.
- ✓ Log names `alpaca_ws_connecting`, `_authenticated`, `_subscription_sent`, `_subscription_confirmed`, `_stream_error`, `_closed` — `alpaca-market-data.ts:375, 420, 543, 425, 500, 444`.

## Drift (1)

- ✗ Omission: the page says stream faults are the error-frame codes (405/406/unknown, `reconnectable: false`) and "There is no auto-reconnect". Code also fails the stream on an unexpected socket close with `code: 'connection_lost'`, `reconnectable: true` (`alpaca-market-data.ts:443-463`). Not a contradiction, but the stream-error vocabulary on the page is incomplete. Suggested fix: add the `connection_lost` path.

## Unverifiable (2)

- ? Free-plan 30-symbol cap / no wildcard — vendor fact.
- ? Runtime incident narratives behind the three lifecycle rules — history.

## Missing files (0)

None.
