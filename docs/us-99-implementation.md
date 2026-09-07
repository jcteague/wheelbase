# US-99 — Alpaca as the sole market-data provider

Replaces `MassiveMarketDataProvider` with `AlpacaMarketDataProvider`, serving the whole
`MarketDataProvider` interface from Alpaca's free data plan. Massive's code, env var, settings
section, connection-test button and user-facing copy are gone: `grep -rni massive src e2e
.env.example` prints nothing.

Plan: `plans/us-99/plan.md` · Vendor contract: `plans/us-99/contracts/alpaca-market-data.md` ·
Mappings and fixtures: `plans/us-99/data-model.md`

## Why

Massive was a second vendor, a second key, and a second failure mode for data the trader's
existing Alpaca credentials can already serve. One vendor means one credential story
("Connect Alpaca") and one outage story.

## What changed

### The provider

`AlpacaMarketDataProvider` resolves credentials on **every** REST call and inside `connect()`
— it never caches them — so a credential change needs no object rebuild for the REST paths.
Four Alpaca surfaces back the one interface:

| Interface method         | Alpaca surface                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `getStockQuotes`         | one batched `GET /v2/stocks/snapshots?symbols=…&feed=iex`                                |
| `getOptionChainSnapshot` | `GET /v1beta1/options/snapshots/{underlying}?feed=indicative`, joined with open interest |
| `getOptionSnapshot`      | `GET /v1beta1/options/snapshots?symbols={contractId}&feed=indicative`                    |
| `connect` / `stream`     | `wss://stream.data.alpaca.markets/v2/iex`, per-symbol `bars` subscriptions               |

Open interest is not on the data API at all — it comes from the **trading** API
(`/v2/options/contracts`), whose host is per-environment. That second call is wrapped in its
own `try/catch`: a contracts outage degrades every strike to `openInterest: null` and logs a
warning rather than failing the chain pull.

The file is split in two so the vendor quirks can be pinned without a socket or a fetch stub:

- `alpaca-market-data-mappers.ts` — pure. Vendor response types, URL builders, and the
  mappings onto `StockQuote` / `OptionSnapshot` / `OptionChainQuote`. No I/O.
- `alpaca-market-data.ts` — the class. HTTP, retry, websocket lifecycle, subscription state.

### Streaming and the credential-change restart

Alpaca authenticates a websocket **once**, at connect. New keys therefore require a full
teardown and reconnect — unlike REST, which picks them up on the next request. `StreamState`
gained a `tickers` field so the restart can replay the last subscription without the renderer
re-issuing `set-stock-quote-tickers`.

```mermaid
sequenceDiagram
    participant UI as SettingsPage
    participant IPC as ipc/settings
    participant Main as index.ts<br/>onBrokerProviderChanged
    participant MD as ipc/market-data
    participant SVC as services/market-data
    participant P as AlpacaMarketDataProvider
    participant WS as Alpaca IEX stream

    UI->>IPC: save / remove / switch environment
    IPC->>Main: onBrokerProviderChanged()
    Main->>Main: brokerFactory.recreate()
    Main->>Main: scheduler.runNow(detect-assignments)
    Main->>MD: restartStockQuoteStream()
    MD->>SVC: restartStockQuoteStream(state, provider, onTick, onError)
    SVC->>P: disconnect()
    P->>WS: close
    Note over SVC: state.connected = false
    alt state.tickers is empty
        SVC-->>MD: teardown only, no reconnect
    else tickers remembered
        SVC->>P: connect(['stockQuotes'])
        P->>WS: auth with the NEW credentials
        WS-->>P: {"T":"success","msg":"authenticated"}
        SVC->>P: stream('stockQuotes', state.tickers)
        P->>WS: {"action":"subscribe","bars":[…]}
    end
    Note over SVC: connect() rejecting logs a warning<br/>and leaves REST working
```

The websocket lifecycle, including the paths that keep REST alive when streaming is not
entitled:

```mermaid
stateDiagram-v2
    [*] --> disconnected
    disconnected --> connecting: connect()
    connecting --> authenticating: {"T":"success","msg":"connected"}<br/>client sends auth
    authenticating --> ready: {"T":"success","msg":"authenticated"}

    connecting --> disconnected: socket error → network_error
    authenticating --> disconnected: 402 → auth_failed
    authenticating --> disconnected: 409 → streaming_unsupported
    authenticating --> disconnected: no auth frame in 10s → network_error

    ready --> ready: stream(symbols) → send only<br/>the unsubscribe/subscribe diff
    ready --> ready: {"T":"b"} → StreamEvent on the subject
    ready --> disconnected: 405/406 → subject.error(StreamError)
    ready --> disconnected: disconnect() or close<br/>ws = null, subscribed.clear()
```

`connect()` rejecting is not fatal: `subscribeToStockQuotes` catches it, logs, and returns —
REST quotes keep flowing (AC6).

### Settings and credential status

`CredentialStatus` lost `massive` / `massiveLastCheckedAt` and gained `marketData`, derived
rather than stored: an active broker environment **or** an env fallback (see below). There is no
market-data connection test any more — the Alpaca credential cards already have one, and it
is the same key. `TestConnectionPayloadSchema` is now `z.literal('alpaca')`, so a stale
renderer sending another vendor gets a Zod error rather than a silent no-op.

The factory **never throws**. Previously an unconfigured app failed at `create()`; now it
always builds a provider and each call raises `MarketDataError('auth_failed')`, which is what
lets Positions show its "Connect Alpaca" banner and the screener its outage card instead of
crashing (AC4).

```mermaid
graph LR
    A[marketDataFactory.create] --> B{FAKE_MARKET_DATA<br/>=== 'true'?}
    B -- yes --> C[FakeMarketDataProvider]
    B -- no --> D[AlpacaMarketDataProvider]
    D --> E{loadCredentials<br/>per call}
    E -- null --> F["MarketDataError('auth_failed')"]
    E -- credentials --> G[Alpaca request]
    F --> H[Screener: outage card<br/>Positions: Connect Alpaca banner]
```

### Where credentials come from

Two sources, and the order matters because getting it wrong is invisible until the app
reports "not connected" while quotes are flowing:

```mermaid
graph TD
    A[market-data / broker factory<br/>loadActiveAlpacaCredentials] --> B{saved in the database?}
    B -- yes --> C[use them<br/>encrypted via safeStorage]
    B -- no --> D{"process.env.ALPACA_KEY_ID<br/>defined?"}
    D -- "yes, non-empty" --> E[use it]
    D -- "yes, empty string" --> F["null — explicitly not configured"]
    D -- undefined --> G{"import.meta.env<br/>MAIN_VITE_ALPACA_KEY_ID?"}
    G -- yes --> E
    G -- no --> F
```

Three things about this are easy to get wrong and are load-bearing:

- **`electron-vite` does not copy `.env` into the main process's `process.env`.** It exposes
  only `MAIN_VITE_`-prefixed values, through `import.meta.env`, inlined at build time. A bare
  `ALPACA_KEY_ID=` line in `.env` is silently ignored — which is why the loader reads both.
- **An explicitly empty `process.env.ALPACA_KEY_ID` means "not configured"** and beats an
  inlined value (`??`, not `||`). Without this, a bundle built on a machine with real keys in
  `.env` carries them, and e2e could not construct a credential-less app. `buildLaunchEnv`
  and `settings-environment.spec.ts` both blank the two vars after spreading `process.env`,
  so a spec's credential state is a property of the test rather than of the machine.
- **Both factories use the same fallback.** Market data reading `.env` while the broker
  ignored it produced exactly one visible symptom — working prices next to a permanently
  failing `broker_market_status` — and no error that named the cause.

`CredentialStatus.marketData` therefore takes an injected `hasFallbackCredentials`, which
keeps the settings service database-facing: `index.ts` owns the knowledge of where "outside
the database" is. The option is **required**, not defaulted — a silent `() => false` is how
the two factories drifted apart in the first place.

> Keys inlined from `.env` end up in `out/main/index.js`. Never build a distributable on a
> machine with real keys in `.env`; Settings (safeStorage) is the intended path.

### Socket lifecycle

Three defects here were found by review or runtime rather than by the layer-by-layer tests,
and all three were invisible to the mocked socket:

- **A closing socket must not clear state belonging to its replacement.** `close` fires after
  the WS closing handshake, by which time `connect()` has already installed the next socket.
  The handler is guarded by identity (`if (this.ws !== ws) return`); without it, a credential
  change nulled the live socket, no subscribe frame was ever sent, prices froze at the REST
  seed, and it never self-healed.
- **A replacement socket holds none of the previous socket's subscriptions,** so `connect()`
  clears `subscribed`. Otherwise the diff in `reconcileSubscriptions` computes "nothing to
  add" and the new socket silently receives nothing.
- **An rxjs `Subject` is permanently stopped once it errors.** `failStream` swaps in a fresh
  one before erroring the old, and `stream()` wraps in `defer()` so each subscription binds
  to whichever subject is live. Without this a single 405 symbol-limit rejection ended
  streaming for the life of the process.

Relatedly, an empty ticker set now sends an unsubscribe. Dropping the renderer's rxjs
subscription does not release Alpaca's, and per-symbol subscriptions count against the free
plan's 30-symbol cap — so navigating between views leaked symbols until a 405 killed the
stream. Harmless under the previous vendor, which subscribed to a wildcard and kept no
per-symbol state.

### Telling "not connected" apart from "unreachable"

The screener had one `provider_unavailable` state and one message, so a trader with no keys
was told Alpaca "couldn't be reached" — pointing at an outage instead of at Settings.
Positions already made this distinction; the screener now does too, branching on
`CredentialStatus.marketData`:

| State                               | Card                                                          |
| ----------------------------------- | ------------------------------------------------------------- |
| credentials present, refresh failed | "Alpaca market data couldn't be reached…" + **Retry refresh** |
| no credentials at all               | "Market data not connected…" + **Open Settings**              |

## Key files

| File                                                  | Change                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `src/main/integrations/alpaca-market-data.ts`         | **new** — the provider: HTTP, retry, websocket, subscription state    |
| `src/main/integrations/alpaca-market-data-mappers.ts` | **new** — pure vendor↔domain mappings, URL builders, frame parsing    |
| `src/main/integrations/alpaca-credentials.ts`         | **new** — `loadAlpacaCredentialsFromEnv`, shared by both factories    |
| `src/main/integrations/alpaca-hosts.ts`               | **new** — the per-environment trading host map, shared with settings  |
| `src/shared/option-symbol.ts`                         | `parseOccSymbol` / `OccIdentity` promoted out of the fake provider    |
| `src/main/integrations/market-data-factory.ts`        | Alpaca or fake; never throws                                          |
| `src/main/services/market-data.ts`                    | `StreamState.tickers`, `restartStockQuoteStream`                      |
| `src/main/ipc/market-data.ts`                         | returns `{ restartStockQuoteStream }`; tick/error callbacks hoisted   |
| `src/main/index.ts`                                   | factory takes the active Alpaca credentials; restart on broker change |
| `src/main/services/settings.ts`                       | `CredentialStatus.marketData`; required `hasFallbackCredentials`      |
| `src/main/services/settings-connections.ts`           | `testMassiveConnection` removed; host map hoisted                     |
| `src/renderer/src/pages/SettingsPage.tsx`             | "Market Data — Alpaca" region; no test button                         |
| `src/renderer/src/pages/PositionsListPage.tsx`        | one Alpaca auth prompt; Massive setup banner removed                  |
| `src/renderer/src/pages/ScreenerPage.tsx`             | not-connected card split from the outage card                         |
| `e2e/assignment-helpers.ts`                           | `withoutBrokerCredentials`; blanks inherited `ALPACA_*`               |
| `src/main/integrations/massive-*.ts`                  | **deleted**                                                           |

## Vendor quirks pinned by tests

Each of these was observed against live Alpaca on 2026-09-06 and has a test:

- Deep-OTM strikes carry `greeks: {}` — present but empty. A partial greek set is dropped
  wholesale rather than emitted half-filled, since the screener ranks on delta.
- `rho` is returned by Alpaca and never surfaced.
- Chain snapshots carry **no** strike or expiration fields; identity comes from parsing the
  OCC map key. An unparseable key is skipped with a debug log, not thrown.
- `open_interest` is a **string** when present, `null` otherwise.
- Timestamps have nanosecond precision (`…19:59:59.813790162Z`) and normalise to millisecond
  ISO. Epoch 0 means "never quoted".
- A stock snapshot with no `latestTrade` has no price to anchor bid/ask against and is
  omitted from the map rather than reported as `$0.00`.
- Every server websocket message is a JSON **array** of frames.

## Known deviation from the plan

`data-model.md`'s worked example prints `changePercent: '-2.5653'`, but its own stated rule
(`change / prevClose × 100`, `toFixed(4)`, ROUND_HALF_UP) yields `-2.5654` for the sample
values (−8.42 / 328.22 × 100 = −2.56535250…). The rule is normative and matches CLAUDE.md's
money math, so the implementation and its test follow the rule.
