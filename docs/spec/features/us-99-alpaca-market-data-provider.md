# US-99: Alpaca as the sole market-data provider (retire Massive)

<!-- generated:from us-99 -->

## Summary

US-99 replaces `MassiveMarketDataProvider` with `AlpacaMarketDataProvider`, serving the whole
provider-agnostic `MarketDataProvider` interface from Alpaca's **free** data plan: one batched
IEX stock snapshot for REST seeds, an IEX websocket with per-symbol `bars` subscriptions for live
prices, indicative option chains and single-contract snapshots with bid/ask, greeks and IV, and
open interest joined from the trading API. The trader's existing Alpaca broker credentials are
the only market-data configuration; there is no second vendor, second key, or "shared app
configuration" concept any more. Massive's code, env vars, Settings section, "Test connection"
button and every piece of user-facing copy are gone — `grep -rni massive src e2e .env.example`
prints nothing.

The story exists because the screener showed "No candidates match your criteria" with a
wide-open delta band: Massive Starter has no entitlement to option quotes at any setting (every
chain strike mapped to `0.00 / 0.00`, so `isTradeableStrike` rejected all of them) and both
Massive plans were 15-minute delayed. Alpaca's free plan, probed on 2026-09-06, served every feed
the app consumed from Massive plus real option bid/ask, real-time on IEX. This is the second
vendor swap behind the same interface — see [Revisions](#revisions) for how it relates to
[the Alpaca → Massive migration](./market-data-massive-migration.md), which this page supersedes.

No database or schema changes. No new IPC handler. Cross-story view of the layer:
[domain/market-data](../domain/market-data.md).

## Acceptance criteria

Derived — no story file exists; these stand in for the story's Gherkin.

- **AC1 — Stock prices from Alpaca.** Given active Alpaca credentials, when the renderer requests
  stock quotes for N tickers, then one IEX snapshot request is made and each quote carries
  `price` from the latest trade, real bid/ask, `prevClose` from the previous daily bar, and daily
  volume.
- **AC2 — Live prices stream from Alpaca.** After the REST seed, minute bars for the subscribed
  tickers arrive over one IEX websocket; changing the ticker set subscribes and unsubscribes only
  the difference; ticks reach the renderer on `market-data:stock-quote`.
- **AC3 — Option quotes feed the screener and position marks.** Chains and single-contract
  snapshots come from the indicative feed with bid, ask, mid, greeks, IV, volume and timestamp;
  open interest is joined from the contracts endpoint; two-sided strikes rank.
- **AC4 — No credentials degrades, never crashes.** Without Alpaca credentials the app starts,
  market-data calls fail with `auth_failed`, the screener shows its unavailable card, Positions
  shows the "Connect Alpaca" banner, and no Alpaca request is made.
- **AC5 — Credentials take effect without restart.** Saving, removing or switching Alpaca
  credentials restarts the stock stream with the new keys and the next REST call uses them.
- **AC6 — Streaming problems leave REST working.** A 409 (insufficient subscription) at connect
  continues REST-only with a warning; a 405 (symbol limit) after connect surfaces as a stream
  error and the stale banner; prices still load.
- **AC7 — Structured error codes.** REST 401/403 → `auth_failed`, 404 → `not_found`, 429 → retry
  then `rate_limited`, transport → `network_error`, other non-2xx → `unknown`; websocket 402 →
  `auth_failed`, 409 → `streaming_unsupported`; unknown underlying → empty chain; missing
  contract → `not_found`.
- **AC8 — Missing blocks never abort a response.** Snapshots without `latestQuote`, `latestTrade`
  or with partial `greeks` map to zeroed prices / omitted greeks; unparseable map keys and
  trade-less stock snapshots are skipped; the rest is returned.
- **AC9 — Massive is gone.** No Massive code, env var, settings field, test button, mock key or
  user-facing copy remains; `CredentialStatus.marketData` reports configured when a broker
  environment is active; Settings, Positions, Screener and the live-switch dialog describe Alpaca
  as the market-data source.
- **AC10 — Fake path unchanged.** `FAKE_MARKET_DATA=true` still selects the untouched
  `FakeMarketDataProvider`; every existing market-data e2e scenario passes.

E2E coverage: AC4 `Empty-state on first launch shows the Connect Alpaca banner and dashes`; AC5
`Switching broker environment restarts market data with the new keys`; AC7 `Market-data auth
failure surfaces a typed error`; AC9 `Settings names Alpaca as the market-data source`, `Positions
auth prompt names Alpaca`, `Expired Alpaca credentials surface a re-entry prompt`, `Screener
outage card names Alpaca`, `Screener names the missing connection when Alpaca is not configured`;
AC10 `Market data is enabled by the active Alpaca credentials`, `Market data fixtures render
without a broker account`. AC1–3 ride the pre-existing live-price, screener and option-P&L
scenarios; AC6 and AC8 are unit-only because they are not observable offline.

## What was built

**The provider.** `AlpacaMarketDataProvider` (`src/main/integrations/alpaca-market-data.ts`)
takes `{ loadCredentials: () => AlpacaCredentials | null }` and resolves it on **every** REST
call and inside `connect()` — it never caches credentials, so REST picks up a key change on the
next request with no object rebuild. Four Alpaca surfaces back the one interface:

| Interface method         | Alpaca surface                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `getStockQuotes`         | one batched `GET /v2/stocks/snapshots?symbols=…&feed=iex`                                        |
| `getOptionChainSnapshot` | `GET /v1beta1/options/snapshots/{underlying}?feed=indicative` (paged), joined with open interest |
| `getOptionSnapshot`      | `GET /v1beta1/options/snapshots?symbols={contractId}&feed=indicative`                            |
| `connect` / `stream`     | `wss://stream.data.alpaca.markets/v2/iex`, per-symbol `bars` subscriptions                       |

Open interest is not on the data API at all — it comes from the **trading** API
(`/v2/options/contracts`), whose host is per-environment (`ALPACA_TRADING_BASE_URLS` in
`alpaca-hosts.ts`, shared with the settings probes). That second call is wrapped in its own
`try/catch`: a contracts outage degrades every strike to `openInterest: null` and logs
`alpaca_open_interest_unavailable` rather than failing the chain pull. `feed=opra` and `feed=sip`
are never requested (both 403 on the free plan). Requests authenticate with
`APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` headers, which are never logged.

The provider is split in two so vendor quirks can be pinned without a socket or a fetch stub:
`alpaca-market-data-mappers.ts` is pure (vendor response types, URL builders, the mappings onto
`StockQuote` / `OptionSnapshot` / `OptionChainQuote`, frame parsing), and
`alpaca-market-data.ts` is the class (HTTP, `MAX_RETRIES = 2` on 429 honouring `Retry-After`,
websocket lifecycle, subscription state). Identity for chain entries comes from parsing the OCC
map key with the shared `parseOccSymbol`, promoted from the fake provider into
`src/shared/option-symbol.ts`. Every vendor block is optional in the mapper: a missing
`latestQuote`/`latestTrade` yields `'0.00'`, greeks are emitted only when delta/gamma/theta/vega
are all numbers (`rho` dropped), nanosecond timestamps normalise to millisecond ISO with epoch 0
meaning "never quoted", and an unparseable key or a trade-less stock snapshot is skipped with a
debug log.

**Streaming and the credential-change restart.** Alpaca authenticates a websocket **once**, at
connect, so new keys need a full teardown and reconnect. `stream('stockQuotes', symbols)`
reconciles the provider's `subscribed` set against the requested symbols and sends only the
unsubscribe/subscribe diff; an empty set sends an unsubscribe, because dropping the renderer's
rxjs subscription does not release Alpaca's and per-symbol subscriptions count against the free
plan's 30-symbol cap. `StreamState` gained a `tickers` field and `services/market-data.ts` a
`restartStockQuoteStream`; `registerMarketDataHandlers` returns
`{ restartStockQuoteStream }`, and `onBrokerProviderChanged` in `index.ts` calls it after
`brokerFactory.recreate()`. The restart disconnects, clears `connected`, and — only when tickers
are remembered — reconnects with the new credentials and replays the subscription; a connect
failure logs a warning and leaves REST working. Three socket-lifecycle defects were found by
review or at runtime and are pinned: the `close` handler is guarded by socket identity so a
closing socket never clears its replacement's state; `connect()` clears `subscribed` so the
reconcile diff does not compute "nothing to add" on a fresh socket; and `failStream` swaps in a
fresh `Subject` (with `stream()` wrapped in `defer()`) so a single 405 does not end streaming for
the life of the process.

**Error vocabulary.** REST codes follow HTTP status only: 401/403 → `auth_failed`, 404 →
`not_found`, exhausted 429 → `rate_limited`, `isNetworkError` → `network_error`, anything else
(including `400 invalid symbol`) → `unknown`. An empty `snapshots` map is `[]` (→
`no_options_listed` downstream); a `?symbols=` response missing the contract is `not_found`.
Websocket frames during `connect()` map 402 → `auth_failed`, 409 → `streaming_unsupported` (its
first live producer), 406/other → `unknown`, socket error → `network_error`, 10 s auth timeout →
`network_error`; after connect, 405 → `StreamError.code 'symbol_limit'`, 406 →
`'connection_limit'`, all `reconnectable: false`. There is no auto-reconnect (Massive parity).

**Factory and credentials.** `marketDataFactory.configure({ loadActiveAlpacaCredentials })`
**never throws** — an unconfigured app builds the provider and each call raises
`MarketDataError('auth_failed', 'Alpaca credentials not configured')`, which is what lets
Positions show its "Connect Alpaca" banner and the screener its card instead of crashing. Both
factories default to the shared `loadAlpacaCredentialsFromEnv()`
(`src/main/integrations/alpaca-credentials.ts`), which reads `ALPACA_KEY_ID` /
`ALPACA_SECRET_KEY` / `ALPACA_PAPER` from `process.env` **only** — never `import.meta.env`,
because `electron-vite` inlines `MAIN_VITE_*` values into the bundle at build time. An
explicitly empty value means "not configured", which is how the e2e harness forces a
credential-less app. Saved Settings credentials take priority; `.env.example` documents that
`.env` deliberately cannot configure Alpaca keys.

**Settings and credential status.** `CredentialStatus` lost `massive` / `massiveLastCheckedAt`
and gained `marketData: 'configured' | 'missing'`, computed as
`activeBrokerEnv !== 'none' || hasFallbackCredentials()`. `hasFallbackCredentials` is a
**required** `SettingsServiceOptions` seam that `index.ts` wires to the env loader, keeping the
settings service database-facing while never reporting "missing" while env-fallback quotes flow.
`TestConnectionPayloadSchema` is a plain `z.object` with `vendor: z.literal('alpaca')`; a stale
`{ vendor: 'massive' }` payload is a Zod error. The Settings "Market Data — Alpaca" region
explains the feeds, shows "Using {env} credentials" or "Connect Alpaca below to enable market
data", has no test button, and keeps "Refresh IVR now". Positions has one Alpaca auth prompt for
both stream and broker `auth_failed`; the LIVE dialog says market data reconnects with live keys;
the `MarketDataStatusDot` titles read "Market data: connected via Alpaca" / "Market data: connect
Alpaca in Settings".

**Screener copy split.** `ScreenerPage` branches its `provider_unavailable` state on
`CredentialStatus.marketData`: credentials present but the refresh failed → "Alpaca market data
couldn't be reached on the last refresh…" with **Retry refresh**; no credentials → "Market data
not connected…" with **Open Settings**. Positions already made that distinction.

**Rate budget** (free plan: 200 REST req/min, one websocket, 30 streamed symbols): 2 requests per
watchlist ticker per screener refresh at concurrency 4; 1 batched stock snapshot + 1 per open
option leg per alert tick. A 405 is surfaced as a stream error, never truncated client-side.

## Revisions

- **us-99** (original, 2026-09-06): full vendor replacement as described above. This page also
  **supersedes** [market-data-massive-migration](./market-data-massive-migration.md) — the retro
  plan that recorded the earlier Alpaca → Massive swap — and the Massive-specific portions of
  [us-39](./us-39-massive-market-data-provider.md) and
  [us-37](./us-37-paper-live-broker-environment-toggle.md) (the "shared Massive app
  configuration" model, the Massive status/test surface, and the claim that broker changes leave
  market data untouched). The original Alpaca → Massive move was itself motivated by a bug in the
  first Alpaca provider (it requested `feed=opra`, which 403s on every free account, and read
  `latest_quote` where Alpaca sends `latestQuote`), not by an Alpaca data gap.

## Architecture decisions

- [alpaca-sole-market-data-vendor](../architecture/02-adrs/alpaca-sole-market-data-vendor.md) — Alpaca's free data plan is the only market-data vendor; Massive removed. Supersedes [shared-massive-app-configuration](../architecture/02-adrs/shared-massive-app-configuration.md).
- [market-data-lazy-credentials-stream-restart](../architecture/02-adrs/market-data-lazy-credentials-stream-restart.md) — one provider instance resolving credentials per call; the factory never throws; broker changes restart only the stock stream. Amends [runtime-broker-provider-refresh](../architecture/02-adrs/runtime-broker-provider-refresh.md) and [market-data-provider-lifecycle](../architecture/02-adrs/market-data-provider-lifecycle.md).
- [iex-feed-for-seed-and-stream](../architecture/02-adrs/iex-feed-for-seed-and-stream.md) — one batched IEX snapshot seeds; the IEX `bars` websocket streams; real bid/ask carried, not faked. Amends [market-data-stream-with-rest-seed](../architecture/02-adrs/market-data-stream-with-rest-seed.md).
- [per-symbol-ws-subscription-reconciliation](../architecture/02-adrs/per-symbol-ws-subscription-reconciliation.md) — `stream()` reconciles the subscribed set (diff only); 405/406 become `StreamError`s; socket-identity guard and fresh `Subject` per fault.
- [open-interest-from-contracts-endpoint](../architecture/02-adrs/open-interest-from-contracts-endpoint.md) — OI joined from the trading API by symbol, degrading to `null` with a warning.
- [alpaca-credentials-runtime-env-only](../architecture/02-adrs/alpaca-credentials-runtime-env-only.md) — the shared env fallback reads `process.env` only; `.env` can never configure keys.
- Websocket and REST error mapping onto the six-member `MarketDataErrorCode` — folded into [marketdataerror-structured-codes](../architecture/02-adrs/marketdataerror-structured-codes.md).
- Provider interface unchanged; factory config changed — [market-data-provider-interface](../architecture/02-adrs/market-data-provider-interface.md).
- Alpaca SDK stays broker-only; market data uses raw `fetch` + `ws` — [alpaca-sdk-rest-only](../architecture/02-adrs/alpaca-sdk-rest-only.md).
- Inlined here (no standalone ADR): defensive mapping with the shared OCC parser
  ([occ-symbol-pure-leaf](../architecture/02-adrs/occ-symbol-pure-leaf.md) now also covers
  `parseOccSymbol`); chain pagination mirrors the US-64 `OptionChainFilter` contract (no `limit`
  → `limit=1000` to exhaustion, `limit` → one page); `CredentialStatus.marketData` derived from
  the active environment or the env fallback; e2e stays on the credential-agnostic fake with the
  vendor adapter pinned by recorded-fixture unit tests; pure mappers module split from the I/O
  class; screener "not connected" vs "unreachable" cards.

## Contracts touched

- **`AlpacaMarketDataProvider`** — the external vendor seam (endpoints, headers, websocket
  handshake, error tables). See [contracts/alpaca-integration](../contracts/alpaca-integration.md)
  and [domain/market-data](../domain/market-data.md).
- **`marketDataFactory.configure({ loadActiveAlpacaCredentials })`** — default
  `loadAlpacaCredentialsFromEnv`; fake under `FAKE_MARKET_DATA=true`; never throws.
- **`StreamState.tickers`, `restartStockQuoteStream`, `MarketDataHandlers`** — the stream restart
  path from `onBrokerProviderChanged`.
- **`settings:get-credential-status`** — response gains `marketData`, loses `massive` /
  `massiveLastCheckedAt`. **`settings:test-connection`** — payload is Alpaca-only
  (`TestConnectionPayloadSchema`); the `{ vendor: 'massive' }` result variant is gone;
  `WHEELBASE_MOCK_SETTINGS_CONNECTIONS` drops `massive`. See
  [contracts/ipc-handlers](../contracts/ipc-handlers.md) and
  [contracts/zod-schemas](../contracts/zod-schemas.md).
- **`parseOccSymbol` / `OccIdentity`** — new shared pure helper in `src/shared/option-symbol.ts`.
- **`loadAlpacaCredentialsFromEnv`** — shared env loader, default for both factories.
- **Schema** — none.

## Source files

- `src/main/integrations/alpaca-market-data.ts`
- `src/main/integrations/alpaca-market-data-mappers.ts`
- `src/main/integrations/alpaca-credentials.ts`
- `src/main/integrations/alpaca-hosts.ts`
- `src/main/integrations/market-data-factory.ts`
- `src/main/integrations/broker-factory.ts`
- `src/main/integrations/fake-market-data.ts`
- `src/main/integrations/alpaca.ts`
- `src/shared/option-symbol.ts`
- `src/main/core/option-symbol.ts`
- `src/main/services/market-data.ts`
- `src/main/services/settings.ts`
- `src/main/services/settings-connections.ts`
- `src/main/schemas.ts`
- `src/main/ipc/market-data.ts`
- `src/main/ipc/settings.ts`
- `src/main/ipc/screener.ts`
- `src/main/index.ts`
- `src/main/env.d.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/api/settings.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/MarketDataStatusDot.tsx`
- `src/renderer/src/components/LiveBrokerConfirmDialog.tsx`
- `src/renderer/src/pages/SettingsPage.tsx`
- `src/renderer/src/pages/PositionsListPage.tsx`
- `src/renderer/src/pages/ScreenerPage.tsx`
- `.env.example`
- `e2e/settings-environment.spec.ts`
- `e2e/provider-split.spec.ts`
- `e2e/screener-results.spec.ts`
- `e2e/assignment-helpers.ts`
- `docs/us-99-implementation.md` (results record; its credential-source diagram predates the `process.env`-only decision)

Deleted: `src/main/integrations/massive-market-data.ts`, `src/main/integrations/massive-credentials.ts` (and their tests).

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
