# Data Model: US-99 — Alpaca as the sole market-data provider

No database changes. No migration. No new settings rows (Alpaca credentials are already
stored per environment). Everything below is in-memory shape: provider config, vendor
response shapes, the mapping onto the existing `StockQuote` / `OptionSnapshot` /
`OptionChainQuote` types in `src/main/integrations/market-data-provider.ts`, the extended
`StreamState`, and the changed `CredentialStatus`.

## Entities

### `AlpacaMarketDataConfig` (new — `src/main/integrations/alpaca-market-data.ts`)

| Field             | Type                              | Notes                                                                                                                                                 |
| ----------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadCredentials` | `() => AlpacaCredentials \| null` | Existing `{ environment, keyId, secret }` from `src/main/services/settings.ts`; called on **every** REST request and inside `connect()`, never cached |

Module constants:

| Name                  | Value                                                                               |
| --------------------- | ----------------------------------------------------------------------------------- |
| `DATA_BASE_URL`       | `https://data.alpaca.markets`                                                       |
| `STREAM_URL`          | `wss://stream.data.alpaca.markets/v2/iex`                                           |
| `TRADING_BASE_URLS`   | `{ paper: 'https://paper-api.alpaca.markets', live: 'https://api.alpaca.markets' }` |
| `STOCK_FEED`          | `'iex'`                                                                             |
| `OPTION_FEED`         | `'indicative'` (never `'opra'`)                                                     |
| `CHAIN_PAGE_SIZE`     | `1000` (Alpaca max)                                                                 |
| `CONTRACTS_PAGE_SIZE` | `10000` (Alpaca max)                                                                |
| `MAX_RETRIES`         | `2` (HTTP 429 only, honouring `Retry-After`)                                        |
| `AUTH_TIMEOUT_MS`     | `10_000` (no `authenticated` frame → `network_error`)                               |

Internal state (private to the instance): `ws: WebSocket | null`, `subscribed: Set<string>`,
`tickSubject: Subject<StreamEvent<StockQuote>>`.

### `AlpacaCredentials` (existing — `src/main/services/settings.ts`)

Unchanged. Shared env loader `loadAlpacaCredentialsFromEnv()` moves out of
`broker-factory.ts` into `src/main/integrations/alpaca-credentials.ts` and is the default
for both factories: `{ keyId: ALPACA_KEY_ID, secret: ALPACA_SECRET_KEY, environment:
ALPACA_PAPER === 'true' ? 'paper' : 'live' }` or `null` when either key is missing.

### `StreamState` (extended — `src/main/services/market-data.ts`)

| Field       | Type                   | Notes                                                                                               |
| ----------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| `connected` | `boolean`              | existing                                                                                            |
| `activeSub` | `Subscription \| null` | existing                                                                                            |
| `tickers`   | `string[]`             | **new** — last ticker set passed to `subscribeToStockQuotes`; replayed by `restartStockQuoteStream` |

### `CredentialStatus` (changed — `src/main/services/settings.ts`, mirrored in `src/preload/index.d.ts` and `src/renderer/src/api/settings.ts`)

| Field                            | Type                          | Change                                                            |
| -------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `marketData`                     | `'configured' \| 'missing'`   | **new** — `activeBrokerEnv !== 'none' ? 'configured' : 'missing'` |
| `alpacaPaper`                    | `CredentialState`             | unchanged                                                         |
| `alpacaLive`                     | `CredentialState`             | unchanged                                                         |
| `activeBrokerEnv`                | `'paper' \| 'live' \| 'none'` | unchanged                                                         |
| `alpacaPaperAccountNumberMasked` | `string \| null`              | unchanged                                                         |
| `alpacaLiveAccountNumberMasked`  | `string \| null`              | unchanged                                                         |
| ~~`massive`~~                    | —                             | **removed**                                                       |
| ~~`massiveLastCheckedAt`~~       | —                             | **removed**                                                       |

### `OccIdentity` (moved — `src/shared/option-symbol.ts`)

Returned by `parseOccSymbol(symbol)`; `null` when the symbol does not match
`^([A-Z]+)(\d{2})(\d{2})(\d{2})([PC])(\d{8})$`.

| Field          | Type              | Derivation                             | Example (`AAPL261009P00320000`) |
| -------------- | ----------------- | -------------------------------------- | ------------------------------- |
| `underlying`   | `string`          | leading letters                        | `AAPL`                          |
| `contractId`   | `string`          | the symbol itself                      | `AAPL261009P00320000`           |
| `strike`       | `string` (4dp)    | `Number(digits) / 1000` → `toFixed(4)` | `320.0000`                      |
| `expiration`   | `string`          | `20YY-MM-DD`                           | `2026-10-09`                    |
| `contractType` | `'put' \| 'call'` | `P` → `put`, `C` → `call`              | `put`                           |

## Vendor response shapes (Alpaca, as observed 2026-09-06)

### Stock snapshots — `GET {DATA_BASE_URL}/v2/stocks/snapshots?symbols=A,B&feed=iex`

```typescript
// Top level is a map keyed by symbol. Unknown symbols are simply absent.
type AlpacaStockSnapshots = Record<string, AlpacaStockSnapshot>

type AlpacaStockSnapshot = {
  latestTrade?: { p: number; s: number; t: string; x: string; c: string[]; i: number; z: string }
  latestQuote?: {
    bp: number
    bs: number
    ap: number
    as: number
    t: string
    bx: string
    ax: string
    c: string[]
    z: string
  }
  minuteBar?: AlpacaBar
  dailyBar?: AlpacaBar
  prevDailyBar?: AlpacaBar
}
type AlpacaBar = {
  o: number
  h: number
  l: number
  c: number
  v: number
  t: string
  n: number
  vw: number
}
```

Live sample (AAPL, Friday close): `latestTrade.p 319.8`, `latestQuote.bp 305.33 / ap 338.27`,
`prevDailyBar.c 328.22`, `dailyBar.v 1224559`, `latestTrade.t '2026-09-04T20:34:14.232841838Z'`.

### Websocket frames — `wss://stream.data.alpaca.markets/v2/iex`

```typescript
// Every server message is a JSON ARRAY of frames.
type AlpacaWsFrame =
  | { T: 'success'; msg: 'connected' | 'authenticated' }
  | { T: 'subscription'; trades?: string[]; quotes?: string[]; bars?: string[] }
  | { T: 'error'; code: number; msg: string }
  | {
      T: 'b'
      S: string
      o: number
      h: number
      l: number
      c: number
      v: number
      t: string
      n: number
      vw: number
    }
  | { T: string } // anything else is ignored

// Client → server
type AlpacaWsAuth = { action: 'auth'; key: string; secret: string }
type AlpacaWsSubscribe = { action: 'subscribe' | 'unsubscribe'; bars: string[] }
```

Observed handshake: `[{"T":"success","msg":"connected"}]` → send auth →
`[{"T":"success","msg":"authenticated"}]` → send subscribe → `[{"T":"subscription","bars":["AAPL","NVDA"]}]`.
Observed errors: `[{"T":"error","code":402,"msg":"auth failed"}]`, `[{"T":"error","code":409,"msg":"insufficient subscription"}]`.

### Option snapshots — `GET {DATA_BASE_URL}/v1beta1/options/snapshots/{underlying}` and `…/snapshots?symbols=`

```typescript
type AlpacaOptionSnapshots = {
  snapshots: Record<string, AlpacaOptionSnapshot> // keyed by bare OCC symbol; may be {}
  next_page_token: string | null
}

type AlpacaOptionSnapshot = {
  latestQuote?: {
    bp: number
    ap: number
    bs: number
    as: number
    bx: string
    ax: string
    c: string
    t: string
  }
  latestTrade?: { p: number; s: number; t: string; x: string; c: string }
  greeks?: Partial<{ delta: number; gamma: number; theta: number; vega: number; rho: number }>
  impliedVolatility?: number
  dailyBar?: AlpacaBar
  minuteBar?: AlpacaBar
  prevDailyBar?: AlpacaBar
}
```

Every block is optional in the type even where Alpaca sent it on every probed row.

### Contracts (open interest) — `GET {TRADING_BASE_URLS[env]}/v2/options/contracts`

```typescript
type AlpacaContracts = {
  option_contracts: Array<{
    symbol: string // bare OCC
    open_interest: string | null // '8' — a STRING when present
    open_interest_date: string | null
    close_price: string | null
    close_price_date: string | null
    strike_price: string
    expiration_date: string
    type: 'put' | 'call'
    tradable: boolean
    status: 'active' | 'inactive'
  }>
  next_page_token: string | null
}
```

Only `symbol` and `open_interest` are read → `Map<string, number | null>` via
`Number(open_interest)` when non-null and finite.

## Mapping onto `StockQuote` (REST seed)

| Target          | Source                     | Rule                                                                                                        |
| --------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `price`         | `latestTrade.p`            | `Decimal` → `toFixed(2)`; snapshot **skipped** (omitted from map, `debug` log) when `latestTrade` is absent |
| `bid`           | `latestQuote?.bp ?? price` | `toFixed(2)`                                                                                                |
| `ask`           | `latestQuote?.ap ?? price` | `toFixed(2)`                                                                                                |
| `prevClose`     | `prevDailyBar?.c`          | `toFixed(2)`; `''` when absent (renderer treats `''` as null)                                               |
| `change`        | `price − prevClose`        | `toFixed(2)`; `''` when `prevClose` absent                                                                  |
| `changePercent` | `change / prevClose × 100` | `toFixed(4)`; `''` when `prevClose` absent or zero                                                          |
| `volume`        | `dailyBar?.v ?? 0`         |                                                                                                             |
| `timestamp`     | `latestTrade.t`            | `new Date(t).toISOString()`                                                                                 |

Worked example from the live sample: `price '319.80'`, `bid '305.33'`, `ask '338.27'`,
`prevClose '328.22'`, `change '-8.42'`, `changePercent '-2.5653'`, `volume 1224559`,
`timestamp '2026-09-04T20:34:14.232Z'`.

## Mapping onto `StockQuote` (stream tick, frame `T: 'b'`)

Identical to the Massive `AM` mapping: `price = bid = ask = c.toFixed(2)`, `change ''`,
`changePercent ''`, `prevClose ''`, `volume = v`, `timestamp = new Date(t).toISOString()`.
Emitted as `StreamEvent { feed: 'stockQuotes', symbol: S, data, timestamp }`.

## Mapping onto `OptionChainQuote`

| Target field        | Source                                                          | Rule                                                                            |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `contractId`        | map key                                                         | via `parseOccSymbol`; entry **skipped + debug log** when it fails to parse      |
| `strike`            | `parseOccSymbol(key).strike`                                    | 4dp string                                                                      |
| `expiration`        | `parseOccSymbol(key).expiration`                                | `YYYY-MM-DD`                                                                    |
| `contractType`      | `parseOccSymbol(key).contractType`                              |                                                                                 |
| `bid`               | `latestQuote?.bp ?? 0`                                          | `toFixed(2)`                                                                    |
| `ask`               | `latestQuote?.ap ?? 0`                                          | `toFixed(2)`                                                                    |
| `mid`               | `(bid + ask) / 2`                                               | `ROUND_HALF_UP`, 2dp                                                            |
| `lastTrade`         | `latestTrade?.p ?? 0`                                           | `toFixed(2)`                                                                    |
| `openInterest`      | contracts map lookup by key                                     | `number \| null`; `null` when absent, unparseable, or the contracts call failed |
| `volume`            | `dailyBar?.v ?? null`                                           |                                                                                 |
| `greeks`            | `greeks` when `delta`, `gamma`, `theta`, `vega` are all numbers | each `toFixed(4)`; `rho` dropped; otherwise omitted                             |
| `impliedVolatility` | `impliedVolatility` when `typeof === 'number'`                  | `toFixed(4)`; otherwise omitted                                                 |
| `timestamp`         | `latestQuote?.t ?? latestTrade?.t ?? 0`                         | `new Date(x).toISOString()` (epoch 0 = never quoted)                            |

Worked example (fixture for tests) — snapshot key `AAPL261009P00320000`:

```json
{
  "latestQuote": {
    "ap": 9.41,
    "as": 44,
    "ax": "W",
    "bp": 8.97,
    "bs": 25,
    "bx": "U",
    "c": "A",
    "t": "2026-09-04T19:59:59.813790162Z"
  },
  "latestTrade": { "c": "a", "p": 9.21, "s": 2, "t": "2026-09-04T19:59:44.613327747Z", "x": "J" },
  "greeks": { "delta": -0.467, "gamma": 0.0163, "rho": -0.1434, "theta": -0.1309, "vega": 0.3826 },
  "impliedVolatility": 0.2538,
  "dailyBar": {
    "c": 9.21,
    "h": 9.75,
    "l": 6.45,
    "n": 53,
    "o": 6.45,
    "t": "2026-09-04T04:00:00Z",
    "v": 147,
    "vw": 8.301633
  }
}
```

with contracts row `{ "symbol": "AAPL261009P00320000", "open_interest": "8" }` maps to:

```json
{
  "contractId": "AAPL261009P00320000",
  "strike": "320.0000",
  "expiration": "2026-10-09",
  "contractType": "put",
  "bid": "8.97",
  "ask": "9.41",
  "mid": "9.19",
  "lastTrade": "9.21",
  "openInterest": 8,
  "volume": 147,
  "greeks": { "delta": "-0.4670", "gamma": "0.0163", "theta": "-0.1309", "vega": "0.3826" },
  "impliedVolatility": "0.2538",
  "timestamp": "2026-09-04T19:59:59.813Z"
}
```

## Mapping onto `OptionSnapshot` (single contract)

Same rules minus the identity fields; `openInterest: null` always (no contracts call);
`volume = dailyBar?.v ?? null`.

## Request-parameter mapping (`OptionChainFilter` → Alpaca query)

| `OptionChainFilter` | Options snapshot param                          | Contracts param                              |
| ------------------- | ----------------------------------------------- | -------------------------------------------- |
| `underlying`        | path segment                                    | `underlying_symbols`                         |
| `type`              | `type`                                          | `type`                                       |
| `expirationFrom`    | `expiration_date_gte`                           | `expiration_date_gte`                        |
| `expirationTo`      | `expiration_date_lte`                           | `expiration_date_lte`                        |
| `strikeFrom`        | `strike_price_gte`                              | `strike_price_gte`                           |
| `strikeTo`          | `strike_price_lte`                              | `strike_price_lte`                           |
| `limit`             | `limit=min(limit,1000)`; presence ⇒ single page | —                                            |
| `cursor`            | `page_token`                                    | —                                            |
| —                   | `feed=indicative` always                        | `limit=10000`, `page_token` while paginating |

## Validation rules

- Every REST request and `connect()` requires `loadCredentials()` to be non-null; otherwise
  `MarketDataError('auth_failed', 'Alpaca credentials not configured')`.
- Money 2dp, greeks/IV 4dp, strike 4dp — identical to Massive so `isWellFormedStrike` /
  `isTradeableStrike` behave the same.
- A missing option quote maps to `'0.00'` and is dropped downstream by `isTradeableStrike`,
  never thrown.
- Websocket `stream()` accepts any symbol list; a server 405 surfaces on the error channel
  rather than being truncated client-side.

## State machines

### Which credentials serve a request

```
loadCredentials() → null        ⇒ MarketDataError('auth_failed')   [REST + connect]
loadCredentials() → credentials ⇒ request with APCA-API-KEY-ID / APCA-API-SECRET-KEY headers
```

Evaluated per call; no restart needed for REST after a credential change.

### Websocket

```
disconnected ──connect()──▶ connecting ──'connected'──▶ authenticating ──'authenticated'──▶ ready
      ▲                        │ error/402/409/timeout            │ 'error' frame → subject.error
      └────── disconnect() ────┴──────────────────────────────────┘ close → ws=null, subscribed.clear()

ready ──stream(symbols)──▶ diff vs subscribed → send unsubscribe(removed), subscribe(added) → filtered Observable
```

### Credential change (main process)

```
settings save/remove(active env) | switch env
  → onBrokerProviderChanged()
      → brokerFactory.recreate()                (existing)
      → scheduler.runNow(detect-assignments)    (existing)
      → restartStockQuoteStream()               (NEW)
           → provider.disconnect(); state.connected = false
           → subscribeToStockQuotes(state, provider, state.tickers, onTick, onError)
```
