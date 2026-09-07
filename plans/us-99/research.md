# Research: US-99 — Alpaca as the sole market-data provider (retire Massive)

## Story

No story file exists. The user asked to go straight to a plan from an investigation run on
2026-09-06 and then widened the scope from "Alpaca for option quotes only" to "full market
data from Alpaca". Story id **US-99** is the next free number (US-98 is the highest in
`docs/epics/`). The derived acceptance criteria live in `plan.md` under "Acceptance Criteria
(derived)"; promote them to `docs/epics/06-stories/US-99-alpaca-market-data-provider.md` when
convenient — nothing here depends on that file existing.

### Problem being solved

The screener showed "No candidates match your criteria" with a wide-open delta band. The
main-process log proved the chain pull succeeded (140 AAPL / 161 NVDA puts in the 30–45
DTE window) but every strike ended `no_options_listed`, because `toCandidateStrikes`
requires a positive bid **and** ask and every Massive chain entry mapped to `0.00 / 0.00`.

Root cause is a data entitlement. Probes on 2026-09-06 with the user's Massive Starter keys:

| Probe (Massive)                                  | Result                                                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `/v3/snapshot/options/AAPL` (chain, 140 results) | `last_quote` present on **0** results; `last_trade` on 0; only `day`, `greeks`, `open_interest`, `implied_volatility` |
| `/v3/snapshot/options/AAPL/O:…` (single)         | same keys, no quote block                                                                                             |
| `/v3/quotes/O:…`, `/v3/trades/O:…`               | HTTP 403 `NOT_AUTHORIZED … upgrade your plan`                                                                         |

Massive's pricing page confirms options quotes ship only on Options Advanced ($199/mo).
Both of the user's Massive plans are also 15-minute delayed.

Alpaca's **free** plan, probed with the user's paper keys the same day, covers every feed
the app consumes from Massive today:

| App need (Massive today)            | Alpaca free equivalent                                           | Probe result                                                                                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stock snapshot for underlying price | `GET data.alpaca.markets/v2/stocks/snapshots?symbols=…&feed=iex` | HTTP 200; `latestTrade`, `latestQuote`, `minuteBar`, `dailyBar`, `prevDailyBar`; unknown symbols omitted from the map; `feed=sip` → 403 `subscription does not permit querying recent SIP data`; `feed=delayed_sip` → 200 |
| Live minute bars                    | `wss://stream.data.alpaca.markets/v2/iex`, `bars` channel        | `connected` → auth → `authenticated` → `subscription {bars:[AAPL,NVDA]}`; `v2/sip` → `{"T":"error","code":409,"msg":"insufficient subscription"}`; bad keys → `{"T":"error","code":402,"msg":"auth failed"}`              |
| Option chain snapshot               | `GET /v1beta1/options/snapshots/{underlying}?feed=indicative`    | HTTP 200, 140 contracts in one request; `latestQuote` on 140/140, two-sided on 110, `greeks` on 105; `feed=opra` → 403 `OPRA agreement is not signed`                                                                     |
| Single option snapshot              | `GET /v1beta1/options/snapshots?symbols=…&feed=indicative`       | HTTP 200; missing symbols omitted; malformed symbol → HTTP 400 `invalid symbol`                                                                                                                                           |
| Open interest (not in snapshots)    | `GET {paper-api\|api}.alpaca.markets/v2/options/contracts`       | HTTP 200, 140 contracts, `open_interest` as a **string** or `null`; paper keys on the live host → 401                                                                                                                     |
| Market clock                        | already `AlpacaBrokerProvider.getMarketStatus`                   | existing                                                                                                                                                                                                                  |

Free-plan limits from Alpaca's pricing page: IEX stock source, 200 REST requests/min, one
websocket connection, **30 streamed symbols**, indicative options. Algo Trader Plus ($99)
lifts all of these and adds real-time SIP + OPRA.

The "trouble getting option data from Alpaca" that motivated the original migration is
explained by the pre-migration provider (removed in `2debc14`): it defaulted `optionFeed` to
`'opra'` (403 on every free account) **and** read `snap.latest_quote.bp` where Alpaca sends
`latestQuote`, so even the indicative feed would have crashed the mapper.

## Current state (verified against `src/`, 2026-09-06)

- **Adapter seam.** `MarketDataProvider` (`src/main/integrations/market-data-provider.ts`)
  — `getStockQuotes`, `getOptionSnapshot`, `getOptionChainSnapshot`, `supportsStreaming`,
  `connect(feeds?)`, `disconnect`, `stream(feed, symbols): Observable<StreamEvent>`.
  `MarketDataErrorCode = auth_failed | network_error | not_found | rate_limited |
streaming_unsupported | unknown`. `StockQuote = { price, bid, ask, change, changePercent,
prevClose, volume, timestamp }`.
- **Factory.** `marketDataFactory.configure({ loadMassiveApiKey })`, cached `create()`,
  `recreate()`, `disconnect()`. Fake under `FAKE_MARKET_DATA=true`, else Massive, else
  **throws** `"Market data provider not configured…"`. `screenWatchlistCandidates` catches
  that throw → `provider_unavailable`; `evaluateAlerts` takes `marketDataFactory.create()`
  as a default parameter.
- **Massive provider** (`massive-market-data.ts`, 400 lines + 33 tests). REST via global
  `fetch` with `?apiKey=`; `MAX_RETRIES = 2` on 429 honouring `Retry-After`; per-ticker stock
  snapshots at concurrency 4 mapping `min.c` → `price`, `bid = ask = price`,
  `todaysChange` / `todaysChangePerc`, `prevDay.c`, `day.v`, `min.t`. Websocket
  `wss://delayed.massive.com/stocks`: auth, then one `subscribe AM.*`, `resolve()` on the
  subscription confirmation, `AM` bars → `StockQuote { price = c, bid = ask = c, change '',
changePercent '', prevClose '', volume v, timestamp e }` pushed into a `Subject`;
  `stream(feed, symbols)` filters the subject by symbol; `disconnect()` closes. No
  reconnect logic. Chain walk at 10 results/page (≈21 requests for AAPL). Local helpers
  `parseUnderlying`, `withOptionPrefix`, `computeMid`, `mapSnapResult`, `mapChainResult`;
  today's uncommitted `isCompleteGreeks` guard.
- **Stream lifecycle.** `services/market-data.ts` `StreamState = { connected, activeSub }`;
  `subscribeToStockQuotes` tears down `activeSub`, calls `provider.connect(['stockQuotes'])`
  once per session (connect failure → `warn` and continue REST-only), then
  `provider.stream('stockQuotes', tickers).subscribe(...)`. `ipc/market-data.ts` owns the
  single `streamState` and the push callbacks (`market-data:stock-quote`,
  `market-data:stream-error`). Nothing today re-establishes the stream after a credential
  change — ADR `runtime-broker-provider-refresh` states market data is unaffected by broker
  settings mutations.
- **Chain service / screener.** `pullWatchlistChains` fans out at concurrency 4,
  `classifyChainFailure` (`not_found` → ticker, else provider), `[]` → `no_options_listed`.
  `core/screener.ts` rule `open_interest` **skips** when `openInterest === null`, so a
  source without OI silently disables the liquidity floor.
- **Tradeability.** `isTradeableStrike(bid, ask)` requires finite and `> 0` for both.
- **Alpaca credentials.** Per-environment, encrypted with `safeStorage`;
  `createSettingsService` exposes `loadAlpacaCredentials(env)` and
  `loadActiveAlpacaCredentials()` → `{ environment, keyId, secret } | null`. `brokerFactory`
  is configured with the latter; its default config reads `ALPACA_KEY_ID` /
  `ALPACA_SECRET_KEY` / `ALPACA_PAPER` from env. `onBrokerProviderChanged` (fired from
  `ipc/settings.ts` on save/remove of the active env and on every environment switch) calls
  `brokerFactory.recreate()` and nudges the detect-assignments job.
- **Massive footprint to remove** (`grep -rni massive src e2e .env.example`, non-test):
  `integrations/massive-market-data.ts`, `massive-credentials.ts`, `market-data-factory.ts`,
  `index.ts` (`loadMassiveApiKey`, `testMassiveConnection`, mock dispatcher `massive`
  branch), `services/settings.ts` (`CredentialStatus.massive`, `massiveLastCheckedAt`,
  `loadMassiveApiKey` option), `services/settings-connections.ts` (`testMassiveConnection`,
  `MASSIVE_BASE_URL = 'https://api.syncswimmer.com'` — a host that does not resolve),
  `schemas.ts` (`vendor: 'massive'` literal), `env.d.ts` (`MAIN_VITE_MASSIVE_API_KEY`),
  `preload/index.d.ts`, renderer `api/settings.ts`, `App.tsx`, `MarketDataStatusDot.tsx`,
  `SettingsPage.tsx` (Massive section, test button, empty-state copy),
  `PositionsListPage.tsx` (setup banner, "Massive authentication failed" prompt),
  `LiveBrokerConfirmDialog.tsx` ("Market data is unaffected — Massive continues to supply
  prices."), `ScreenerPage.tsx` ("Massive couldn't be reached"), `alpaca.ts` deprecation
  comments, `.env.example`, e2e `settings-environment.spec.ts` (`massiveApiKey` launch
  option, `MASSIVE_API_KEY` env, `DEFAULT_CONNECTION_MOCKS.massive`, five Massive-named
  scenarios), e2e `provider-split.spec.ts` (two Massive-named tests).
- **Renderer consumers of `StockQuote`.** Only `price` and `prevClose` are read
  (`PriceCell.tsx`, `useStockQuotes.ts`); `bid`, `ask`, `change`, `changePercent` are
  carried but not displayed.
- **OCC symbols.** `src/shared/option-symbol.ts` has `buildOccSymbol` only; the fake
  provider owns a private `OCC_SYMBOL` regex + `parseOccSymbol`. Alpaca keys snapshot maps
  by bare OCC symbol with no `details` block, so the new mapper needs that parser.
- **E2E harness.** Every spec launches with `FAKE_MARKET_DATA=true`; the fake is
  credential-agnostic and serves `WHEELBASE_MOCK_*` fixtures. "Empty-state on first launch"
  currently gets `—` prices because the factory throws without `MASSIVE_API_KEY`; it also
  launches with no stock fixtures, so `—` is preserved once the fake serves an empty map.

## Unknowns

All resolved by probing or documentation on 2026-09-06.

1. Which Alpaca stock feeds does the free plan serve? — `iex` and `delayed_sip` (REST 200);
   `sip` 403 on REST and 409 on the socket.
2. Websocket protocol and error shapes? — verified handshake above; documented error codes
   400 invalid syntax, 401 not authenticated, 402 auth failed, 403 already authenticated,
   404 auth timeout, 405 symbol limit exceeded, 406 connection limit exceeded, 407 slow
   client, 409 insufficient subscription, 410 invalid subscribe action, 500 internal error.
3. Does the indicative options feed carry two-sided quotes and greeks? — Yes (110/140,
   105/140).
4. Open interest? — Not in snapshots; in `/v2/options/contracts` (string or `null`).
5. Pagination? — Options snapshots: `limit` 1..1000 (default 100), `page_token` /
   `next_page_token`. Contracts: `limit` ≤ 10 000. Stock snapshots: single request, no paging.
6. Timestamps? — RFC-3339 with nanoseconds; `new Date(...)` parses them, truncating to ms.

## Architecture Decisions

### ADR: Alpaca's free data plan replaces Massive as the only market-data vendor

- **Decision:** Implement `AlpacaMarketDataProvider` (`src/main/integrations/alpaca-market-data.ts`)
  covering the whole `MarketDataProvider` interface — IEX stock snapshots, IEX websocket
  bars, indicative option snapshots and chains, open interest from the contracts endpoint —
  and delete `MassiveMarketDataProvider`, `massive-credentials.ts`, the Massive settings
  surface, and the `MASSIVE_API_KEY` / `MAIN_VITE_MASSIVE_API_KEY` configuration. Never
  request `feed=opra` or `feed=sip`.
- **Why:** Massive Starter cannot supply option quotes at any setting and is 15-minute
  delayed; Alpaca's free plan covers every feed the app uses, adds option bid/ask, is
  real-time on IEX, and the app already stores Alpaca credentials. Dropping Massive removes
  $58/month, a second vendor, a second secret, and the "shared app configuration" concept in
  Settings. The user chose the full replacement over the interim composite explicitly.
- **Alternatives considered:** Composite (Massive stocks + Alpaca options) — throwaway once
  Massive goes. Massive Advanced ×2 ($398/mo) — cost. marketdata.app ($30) — still a second
  vendor. Keep Massive code as a dormant alternative — unexercised code paths and a dead
  env var; the prior migration deleted the Alpaca provider the same way.

### ADR: One provider instance with lazily resolved credentials; broker changes restart only the stream

- **Decision:** `AlpacaMarketDataProvider` takes `{ loadCredentials: () => AlpacaCredentials
| null }` and resolves it on every REST call and inside `connect()`. The factory always
  constructs it (no throw when unconfigured); a missing credential surfaces per call as
  `MarketDataError('auth_failed', 'Alpaca credentials not configured')`. `onBrokerProviderChanged`
  in `index.ts` additionally calls a new `restartStockQuoteStream()` exported by
  `registerMarketDataHandlers`, which disconnects the provider, clears `connected`, and
  re-runs `subscribeToStockQuotes` with the tickers remembered in `StreamState`.
  `marketDataFactory.recreate()` is not used for credential changes.
- **Why:** Market data now depends on the broker credentials, so a saved, removed or switched
  key must reach the websocket, whose auth happens at `connect()`. Recreating the provider
  would orphan `StreamState.connected` and the renderer's push subscription; restarting the
  stream against the same singleton is the minimal change and keeps REST reads working
  without any lifecycle event. Never throwing from the factory keeps `evaluateAlerts` and
  the screener on their existing per-call failure isolation (`auth_failed` → `provider_unavailable`
  / degraded), which is the same trader-facing outcome as today's factory throw.
- **Alternatives considered:** Cache credentials at construction + `recreate()` on change —
  the stream hazard above, and the screener/alerts would need re-wiring. Push a "credentials
  changed" event to the renderer and let it re-send `set-stock-quote-tickers` — round-trips
  through the UI for a main-process concern.

### ADR: Stock data from IEX for both REST seeds and the stream

- **Decision:** `getStockQuotes(tickers)` issues **one** batched `GET /v2/stocks/snapshots?symbols=…&feed=iex`
  and maps `price = latestTrade.p`, `bid = latestQuote.bp`, `ask = latestQuote.ap`,
  `prevClose = prevDailyBar.c`, `change = price − prevClose`, `changePercent = change /
prevClose × 100` (4dp, matching Massive's `todaysChangePerc` semantics), `volume =
dailyBar.v`, `timestamp = latestTrade.t`. Symbols absent from the response are omitted from
  the returned `Map`. The stream subscribes to the `bars` channel on `wss://…/v2/iex` and
  maps `b` frames exactly as Massive mapped `AM` frames (`price = bid = ask = c`, empty
  `change`/`changePercent`/`prevClose`, `volume = v`, `timestamp = t`).
- **Why:** The REST seed and the stream must come from the same feed or the first tick
  jumps against the seed (ADR `market-data-stream-with-rest-seed`); IEX is real-time on the
  free plan while `delayed_sip` lags 15 minutes. One batched request replaces N per-ticker
  requests. Only `price` and `prevClose` are rendered, so IEX's thin after-hours quotes
  (AAPL showed 305.33 / 338.27 at Friday's close against a 319.80 last trade) do not affect
  what the trader sees; the values are carried honestly rather than faked as `bid = ask =
price`.
- **Alternatives considered:** `delayed_sip` for REST — consolidated quotes but 15-minute
  lag and a seed/stream mismatch. `bid = ask = price` as Massive did — hides real data.
  Streaming `quotes` as well as `bars` — doubles symbol usage against the 30 cap for a field
  nothing displays.

### ADR: Per-symbol websocket subscriptions reconciled on every `stream()` call

- **Decision:** `connect()` opens the socket, sends `{action:'auth', key, secret}` and
  resolves on `{"T":"success","msg":"authenticated"}`. `stream('stockQuotes', symbols)`
  reconciles the provider's `subscribed` set against `symbols`: sends
  `{action:'unsubscribe', bars:[removed]}` then `{action:'subscribe', bars:[added]}` when the
  socket is open, and returns the tick `Subject` filtered to `symbols`. Observable teardown
  sends nothing; the next `stream()` call owns the reconciliation. `disconnect()` closes the
  socket and clears the set. Server `error` frames after auth are pushed to the subject's
  error channel as `StreamError { feed: 'stockQuotes', code, message, reconnectable: false }`
  with `code` = `'symbol_limit'` for 405, `'connection_limit'` for 406, else `'unknown'`.
- **Why:** Alpaca has no `AM.*` wildcard for bars on the free plan (30-symbol cap), so the
  provider must tell the server which symbols it wants. The service only ever holds one
  active stream and always tears the old one down before calling `stream()` again, so
  wholesale reconciliation is correct and avoids unsubscribe/subscribe churn on teardown. A
  405 must reach the renderer as a stream error (stale banner) rather than a silent partial
  feed; REST quotes keep working.
- **Alternatives considered:** Subscribe on Observable subscribe and unsubscribe on
  teardown — the service's teardown-then-stream ordering would unsubscribe everything and
  resubscribe everything on each ticker change. Client-side truncation to 30 symbols —
  hides the limit from the trader.

### ADR: Websocket error frames map onto the existing `MarketDataErrorCode` vocabulary

- **Decision:** During `connect()`: 402 → `MarketDataError('auth_failed')`; 409 →
  `MarketDataError('streaming_unsupported')`; 406 → `MarketDataError('unknown', 'connection
limit exceeded')`; any other `error` frame → `unknown`; socket `error` event →
  `network_error`; no `authenticated` within 10 s → `MarketDataError('network_error', 'auth
timeout')`. `subscribeToStockQuotes` already catches connect failures and continues
  REST-only with a `warn`, so an entitlement problem never blocks prices.
- **Why:** `streaming_unsupported` is the interface's existing name for "this feed cannot be
  streamed on this subscription" and was previously exercised only by the fake; 409 is its
  first live producer. Mapping by numeric code follows ADR `marketdataerror-structured-codes`
  (no message-substring inspection).
- **Alternatives considered:** Treat every socket error as `network_error` — loses the
  auth vs. entitlement distinction the renderer copy relies on.

### ADR: HTTP-status-only REST error mapping; empty maps are data, not errors

- **Decision:** `401`/`403` → `auth_failed`; `404` → `not_found`; `429` → retry up to
  `MAX_RETRIES = 2` honouring `Retry-After` (seconds, default 1 s), then `rate_limited`;
  `fetch` rejection with `isNetworkError` → `network_error`; any other non-2xx (including
  `400 invalid symbol`) → `unknown`. Option chain with empty `snapshots` → `[]`. `?symbols=`
  response missing the requested contract → `MarketDataError('not_found', 'Option contract
{id} not in snapshot')`. Stock snapshot missing a symbol → omitted from the `Map`.
- **Why:** Mirrors the Massive mapping so `classifyChainFailure`, `fetchOptionSnapshots`
  and `handleIpcCall` behave identically. `[]` for an unknown underlying yields
  `no_options_listed`. `400` stays `unknown` so a malformed request from our side is visible
  as a provider-class failure instead of masquerading as a delisted ticker.
- **Alternatives considered:** Map `400 invalid symbol` to `not_found` — needs substring
  matching.

### ADR: Open interest from `/v2/options/contracts`, joined by symbol, degrading to `null`

- **Decision:** After a non-empty chain page set, call `GET {tradingHost}/v2/options/contracts`
  with the same underlying/type/expiration/strike filters, `limit=10000`, paginating on
  `page_token`; build `Map<symbol, number | null>` from the string `open_interest`; set
  `openInterest` per quote. On any failure: `warn` `alpaca_open_interest_unavailable
{ underlying, err }`, `openInterest: null` on every quote, quotes still returned.
  `tradingHost` follows `credentials.environment` (`paper` → `https://paper-api.alpaca.markets`,
  `live` → `https://api.alpaca.markets`). Single-contract snapshots set `openInterest: null`
  and skip the contracts call (Massive parity).
- **Why:** Snapshots carry no OI and the screener's OI rule skips on `null`, which would
  silently disable the liquidity floor. One extra request per ticker keeps the criterion
  honest; degrading follows CLAUDE.md's failure-isolation rule.
- **Alternatives considered:** Skip OI — filter silently off. `close_price` from contracts
  as a fallback mark — out of scope.

### ADR: Defensive mapping with a shared OCC parser

- **Decision:** Promote the fake provider's `OCC_SYMBOL` regex and `parseOccSymbol` into
  `src/shared/option-symbol.ts` (flat `OccIdentity = { underlying, contractId, strike (4dp),
expiration, contractType }`, `null` on mismatch), re-export from `src/main/core/option-symbol.ts`,
  use from both the fake and the Alpaca mapper. Every vendor block is optional in the
  mapper: missing `latestQuote`/`latestTrade` → `'0.00'`; greeks only when `delta`, `gamma`,
  `theta`, `vega` are all numbers (drop `rho`); `impliedVolatility` only when a number;
  `volume = dailyBar?.v ?? null`; `timestamp = new Date(latestQuote?.t ?? latestTrade?.t ??
0).toISOString()`; unparseable map keys skipped with a `debug` log.
- **Why:** Two incidents this week (`greeks: {}` on Massive, `latest_quote` vs `latestQuote`
  on old Alpaca) were mappers trusting the vendor shape. Normalising nanosecond timestamps
  keeps `quoteTimestamp` consumers on millisecond ISO.
- **Alternatives considered:** Throw on an unparseable key — one bad entry costs the ticker.

### ADR: Pagination semantics mirror the documented `OptionChainFilter` contract

- **Decision:** No `filter.limit` → `limit=1000`, follow `next_page_token` to exhaustion.
  `filter.limit` → `min(limit, 1000)` plus `filter.cursor` as `page_token`, first page only.
  `type` → `type`; `expirationFrom/To` → `expiration_date_gte/lte`; `strikeFrom/To` →
  `strike_price_gte/lte`.
- **Why:** `plans/us-64/contracts/option-chain-snapshot.md` pins "no limit means the whole
  chain; a limit means one page"; Alpaca's default page is 100, so an explicit 1000 makes
  AAPL/NVDA one request each.
- **Alternatives considered:** Always single page — truncates wide chains.

### ADR: `CredentialStatus.marketData` replaces `massive`; market data is a consequence of the active broker environment

- **Decision:** `CredentialStatus` drops `massive` and `massiveLastCheckedAt` and gains
  `marketData: 'configured' | 'missing'`, computed as `activeBrokerEnv !== 'none'`.
  `settings:test-connection` accepts only `{ vendor: 'alpaca', … }`; `testMassiveConnection`
  and the `massive` mock branch are deleted. The Settings "Market Data" region becomes
  "Market Data — Alpaca", explains that stock prices (IEX, real-time), option quotes
  (indicative) and Greeks come from Alpaca's free data feeds using the active broker
  credentials, shows which environment is in use or a "Connect Alpaca below" prompt, and
  keeps the "Refresh IVR now" action. The Positions "Massive is app-provided…" banner is
  removed (the existing no-broker banner covers it, with copy extended to mention market
  data); the auth-failure prompt reads "Alpaca authentication failed — check your key in
  Settings" for both stream and broker errors; `LiveBrokerConfirmDialog` says "Market data
  reconnects with your live keys — same Alpaca feeds, same prices."; `ScreenerPage`'s outage
  card says "Alpaca market data couldn't be reached on the last refresh."
- **Why:** With one vendor there is nothing "shared" to configure; the trader's single
  action is saving Alpaca keys. The status dot, banners and dialog must not name a vendor
  that no longer exists. Removing the Massive test button also deletes the
  `api.syncswimmer.com` probe bug.
- **Alternatives considered:** Keep `massive` field as always-`missing` for compatibility —
  dead contract surface. Add a separate market-data credential — the same keys twice.

### ADR: E2E stays on the credential-agnostic fake; the vendor adapter is verified by recorded-fixture unit tests

- **Decision:** `FakeMarketDataProvider` is unchanged and still selected by
  `FAKE_MARKET_DATA=true`. `AlpacaMarketDataProvider` is covered by Vitest over a stubbed
  global `fetch` and the existing `vi.mock('ws')` `MockWs` pattern from
  `massive-market-data.test.ts`, with fixtures transcribed from the 2026-09-06 probes. E2E
  specs drop `MASSIVE_API_KEY` / `massiveApiKey`, rename the Massive scenarios, assert the
  new Settings/Positions/Screener copy, and keep every existing market-data scenario as the
  regression gate.
- **Why:** Same standard `provider-split.spec.ts` set for US-39; the harness is offline by
  design and credentials are user secrets.
- **Alternatives considered:** Make the fake credential-aware so "no keys → no prices" is
  e2e-observable — would break every spec that streams fixture prices without saving
  credentials.

## Behavioural notes for the implementer

- Rate budget on the free plan is 200 REST requests/min. Per screener refresh: 2 per ticker
  (chain + contracts) at concurrency 4. Per alert-evaluation tick: 1 batched stock snapshot
  - 1 per open option leg. Stock quote REST seeds: 1 per ticker-set change. Comfortably
    inside the budget for a single-user desktop app; `warn` on `rate_limited`.
- The websocket cap is 30 symbols. Positions plus watchlist should fit; a 405 surfaces as a
  stream error and the stale banner, never as a silent partial feed.
- Logging: `debug` per REST request URL (never headers) and response status; `debug` per
  websocket control frame (auth result, subscription list) with secrets redacted; `info`
  once per chain pull `{ underlying, contracts, twoSided, withGreeks, oiResolved }`; `info`
  on stream connect/disconnect/restart; `warn` on OI degradation, connect failure, and
  `rate_limited`. Never log inside `src/main/core/`.
- `subscribeToStockQuotes` must remember `tickers` on `StreamState` so `restartStockQuoteStream`
  can replay them; with an empty list it just tears down.
- `screenWatchlistCandidates` keeps its `try { getProvider() }` guard (cheap, still correct
  for the fake/unknown case) but the comment about "unconfigured provider" now refers to
  per-call `auth_failed` from the chain pull.
- The `.env.example` Alpaca block becomes the only market-data configuration; document that
  the keys drive market data too and that `FAKE_MARKET_DATA=true` bypasses it.
- `@msgpack/msgpack` in `package.json` stays unused after this story (it was already
  unused); removing it is optional housekeeping, not part of this plan.
- Out of scope, surfaced for follow-ups: screener empty-state copy when strikes were merely
  unquoted; websocket auto-reconnect (Massive had none either); streaming `quotes` for live
  bid/ask.

## Open Questions

None blocking. Assumptions made explicit:

1. Story id **US-99**; no story file is created by this plan.
2. Paper and live keys serve identical market data; only the contracts (OI) host depends on
   the environment.
3. The uncommitted `isCompleteGreeks` fix in `massive-market-data.ts` becomes moot when that
   file is deleted; the Alpaca mapper carries the same guard.
