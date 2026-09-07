# ADR: `MarketDataError` with a discriminating `code`

<!-- generated:from us-31,market-data-massive-migration,us-99 -->

## Decision

`MarketDataError extends Error` carries a typed, discriminating `code` field. The vocabulary shipped in source is six members:

`auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown`

The provider **throws** these (rather than returning a `Result` tuple), consistent with the rest of the codebase. IPC handlers translate the thrown error into the standard `{ ok, errors }` envelope via `handleIpcCall`, mapping `code` onto the `__root__` field so the renderer can branch without parsing message strings. Codes are derived from HTTP status or websocket error code only — never from message substrings.

## Code mapping (current state — Alpaca, US-99)

REST (`apiFetch` in `src/main/integrations/alpaca-market-data.ts`):

| Source                                                                   | `code`          | message                                        |
| ------------------------------------------------------------------------ | --------------- | ---------------------------------------------- |
| `loadCredentials()` returned `null` (no request made)                    | `auth_failed`   | `Alpaca credentials not configured`            |
| `401` / `403`                                                            | `auth_failed`   | `HTTP 401` / `HTTP 403`                        |
| `404`                                                                    | `not_found`     | `HTTP 404: {url}`                              |
| `?symbols=` snapshot response omitted the requested contract             | `not_found`     | `Option contract {contractId} not in snapshot` |
| `429` persisting after `MAX_RETRIES = 2` retries honouring `Retry-After` | `rate_limited`  | `rate limit exceeded`                          |
| `fetch` rejection where `isNetworkError(err)`                            | `network_error` | fetch error message                            |
| Any other non-2xx (including `400 invalid symbol`)                       | `unknown`       | `HTTP {status}`                                |
| `fetch` rejected with a non-network error                                | `unknown`       | underlying message                             |

Websocket (`connectError` / `classifyStreamError` in `alpaca-market-data-mappers.ts`):

| Phase         | Frame / event                  | Result                                                                                        |
| ------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| `connect()`   | `{"T":"error","code":402}`     | reject `MarketDataError('auth_failed')`                                                       |
| `connect()`   | `{"T":"error","code":409}`     | reject `MarketDataError('streaming_unsupported', 'insufficient subscription')`                |
| `connect()`   | `{"T":"error","code":406}`     | reject `MarketDataError('unknown', 'connection limit exceeded')`                              |
| `connect()`   | any other `error` frame        | reject `MarketDataError('unknown', msg)`                                                      |
| `connect()`   | socket `error` event           | reject `MarketDataError('network_error', err.message)`                                        |
| `connect()`   | no `authenticated` within 10 s | reject `MarketDataError('network_error', 'auth timeout')`                                     |
| after connect | `{"T":"error","code":405}`     | `subject.error({ feed: 'stockQuotes', code: 'symbol_limit', message, reconnectable: false })` |
| after connect | `{"T":"error","code":406}`     | `subject.error({ …, code: 'connection_limit', … })`                                           |
| after connect | any other `error` frame        | `subject.error({ …, code: 'unknown', … })`                                                    |

Post-connect failures are `StreamError`s on the Observable's error channel (surfaced to the renderer as `market-data:stream-error`), not thrown `MarketDataError`s. `connect()` rejections are caught by `subscribeToStockQuotes`, which logs and continues REST-only.

**Not errors:** an empty `snapshots` map → `[]` (the chain service classifies it as `no_options_listed`); a stock symbol missing from the snapshot map → omitted from the `Map`; a contracts-endpoint failure → `openInterest: null` + `warn`. A `400 invalid symbol` deliberately stays `unknown` so a malformed request from our side is visible as a provider-class failure instead of masquerading as a delisted ticker (mapping it to `not_found` would need substring matching).

`streaming_unsupported` — previously exercised only by `FakeMarketDataProvider` — now has its first live producer: a 409 "insufficient subscription" at websocket connect (the free plan on the `sip` socket).

## Why

The story's acceptance criteria require structured errors that callers can pattern-match on without parsing message strings. A typed `code` discriminant lets the IPC layer (and downstream stories) branch on `auth_failed` vs `network_error` vs `streaming_unsupported` without `if (msg.includes('401'))` heuristics. Throwing matches the existing convention; `Result<T, E>` would be cleaner functionally but would be an outlier. Keeping the Alpaca mapping identical in shape to the Massive one meant `classifyChainFailure`, `fetchOptionSnapshots` and `handleIpcCall` needed no change.

## Alternatives considered

- **`Result<T, E>` return tuples** — cleaner functional shape but inconsistent with the rest of the codebase.
- **Plain `Error` with substring matching** — fragile; couples callers to message wording.
- **Treat every socket error as `network_error`** — loses the auth vs. entitlement distinction the renderer copy relies on.

## Evolution

The us-31 (first Alpaca-era) plan defined `auth_failed | network_error | rate_limited | stream_disconnected | streaming_unsupported | subscription_failed | unknown`. The Massive migration **dropped** `stream_disconnected` and `subscription_failed` and **added** `not_found` (HTTP `404`). US-99 kept the six-member set unchanged and added the websocket-frame mapping above; per-symbol subscription failures (405/406) are `StreamError.code` values, not `MarketDataErrorCode` members.

## Source

- `docs/spec/.extracts/us-31.md`, `docs/spec/.extracts/market-data-massive-migration.md`, `docs/spec/.extracts/us-99.md`
- `plans/us-99/contracts/alpaca-market-data.md` "Error codes"
- Implementation: `src/main/integrations/market-data-provider.ts` (`MarketDataError`, `MarketDataErrorCode`), `src/main/integrations/alpaca-market-data.ts` (HTTP-status mapping), `src/main/integrations/alpaca-market-data-mappers.ts` (`connectError`, `classifyStreamError`)
- Feature pages: [us-31](../../features/us-31-market-data-provider-adapter.md), [us-99](../../features/us-99-alpaca-market-data-provider.md)
<!-- /generated -->
