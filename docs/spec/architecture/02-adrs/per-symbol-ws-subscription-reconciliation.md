# ADR: Per-symbol websocket subscriptions reconciled on every `stream()` call

<!-- generated:from us-99 -->

## Decision

`connect()` opens `wss://stream.data.alpaca.markets/v2/iex`, sends `{action:'auth', key, secret}` on the server's `connected` frame, and resolves on `authenticated` — sending **no** subscribe during connect. `stream('stockQuotes', symbols)` reconciles the provider's `subscribed` set against `symbols`: it sends `{action:'unsubscribe', bars:[removed]}` then `{action:'subscribe', bars:[added]}` (only non-empty arrays, only when the socket is open) and returns the tick `Subject` filtered to `symbols`. Observable teardown sends nothing; the next `stream()` call owns the reconciliation. An empty `symbols` set sends an unsubscribe for everything. `disconnect()` closes the socket and clears the set.

Server `error` frames after auth go to the stream's error channel as `StreamError { feed: 'stockQuotes', code, message, reconnectable: false }` with `code = 'symbol_limit'` (405), `'connection_limit'` (406), else `'unknown'`. There is no auto-reconnect.

Three lifecycle rules, each pinned by a test after being found at runtime or in review:

1. The `close` handler is guarded by socket identity (`if (this.ws !== ws) return`) — a closing socket must not clear state belonging to its replacement.
2. `connect()` clears `subscribed` — a replacement socket holds none of the previous socket's subscriptions.
3. `failStream` swaps in a fresh `Subject` before erroring the old one, and `stream()` is wrapped in `defer()` so each subscription binds to whichever subject is live.

## Context / Why

- Alpaca has no `AM.*`-style wildcard for bars on the free plan (30-symbol cap), so the provider must tell the server which symbols it wants.
- `subscribeToStockQuotes` only ever holds one active stream and tears the old one down before calling `stream()` again, so wholesale reconciliation is correct and avoids unsubscribe/subscribe churn on teardown.
- Dropping the renderer's rxjs subscription does not release Alpaca's; per-symbol subscriptions count against the cap, so navigating between views leaked symbols until a 405 killed the stream — hence the unsubscribe on an empty set.
- Without rule 1 a credential change nulled the live socket, no subscribe frame was sent, prices froze at the REST seed and never self-healed. Without rule 2 the diff computed "nothing to add" and the new socket silently received nothing. Without rule 3 a single 405 ended streaming for the life of the process, because an rxjs `Subject` is permanently stopped once it errors.
- A 405 must reach the renderer as a stream error (stale banner) rather than a silent partial feed; REST quotes keep working.

## Alternatives considered

- **Subscribe on Observable subscribe / unsubscribe on teardown** — the service's teardown-then-stream ordering would unsubscribe and resubscribe everything on each ticker change.
- **Client-side truncation to 30 symbols** — hides the limit from the trader.

## Consequences

- Frame handling lives in pure module-scope helpers (`parseFrames`, `mapBar`, `classifyStreamError`, `connectError` in `alpaca-market-data-mappers.ts`) so it is testable without a socket. Non-JSON frames and unknown `T` values are ignored.
- Logged control frames never include the secret: `alpaca_ws_connecting`, `alpaca_ws_authenticated`, `alpaca_ws_subscription_sent`, `alpaca_ws_subscription_confirmed`, `alpaca_ws_stream_error`, `alpaca_ws_closed`.

## Sources

- [extract: us-99](../../.extracts/us-99.md) — ADRs "Per-symbol websocket subscriptions reconciled on every `stream()` call", "Socket-identity guard, fresh `Subject` per stream fault, `defer()` on `stream()`"
- [feature: us-99-alpaca-market-data-provider](../../features/us-99-alpaca-market-data-provider.md)
<!-- /generated -->
