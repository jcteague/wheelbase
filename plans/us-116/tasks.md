# US-116 — Market facts come from the market-data provider, not the broker — Tasks

**Plan:** `plans/us-116/plan.md` · **Research:** `plans/us-116/research.md` · **Contract:** `plans/us-116/contracts/market-data-market-status.md`
**Story:** Linear [OPT-8](https://linear.app/optionswheel/issue/OPT-8)

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

## Read this before starting — this is a _move_, not an addition

The plan's 11 implementation areas are regrouped here into 9 task areas so that **the tree compiles at the end of every layer**. Two consequences:

1. **The port and both its implementations land together (Layer 1).** Adding `getMarketStatus` / `getMarketCalendar` to the `MarketDataProvider` type instantly breaks `AlpacaMarketDataProvider` and `FakeMarketDataProvider`, which no longer satisfy it. Splitting them across layers would leave `pnpm typecheck` red between layers, so plan areas 1, 2 and 4 are one area here.
2. **The broker keeps its copies until everything has moved off them (Layer 4).** `BrokerProvider` cannot shed a method while a class still implements it or a caller still calls it, so plan area 3 (alpaca-broker), the `fake-broker` half of area 4, and the deletion halves of areas 9 and 10 are collected into **Area G — Retire the broker's market capabilities**. Until then both providers answer market status; that duplication is deliberate and temporary.

**Gates per layer:**

| Layer | `pnpm test` | `pnpm typecheck` / `pnpm lint` | `pnpm test:e2e`                                           |
| ----- | ----------- | ------------------------------ | --------------------------------------------------------- |
| 1–3   | must pass   | must pass                      | **not a gate** — e2e seams still point at the broker fake |
| 4     | must pass   | must pass                      | must pass                                                 |
| 5     | must pass   | must pass                      | must pass                                                 |

Do not chase a red e2e run before Layer 4. Do not let `pnpm test` or `pnpm typecheck` stay red at the end of any layer.

---

## Layer 1 — The market-data port and both its implementations

> One area. Nothing else can start until its Green task is checked off.

### A. Market-data port gains market status and the exchange calendar

- [x] **[Red]** Write failing tests — `src/main/integrations/market-data-provider.test.ts`, `src/main/integrations/alpaca-market-data.test.ts`, `src/main/integrations/fake-market-data.test.ts`
  - **Port shape** (`market-data-provider.test.ts`): **invert** the existing case at `:42` (`'does not expose getAccountInfo, getActivities, or getMarketStatus'`) — a structurally-typed fixture must satisfy `MarketDataProvider` with `getMarketStatus` and `getMarketCalendar` present, while still not exposing `getAccountInfo` / `getActivities`; and `MarketStatus`, `MarketCalendarDay`, `MarketCalendarRange` are importable from this module
  - **Alpaca `getMarketStatus`** (`alpaca-market-data.test.ts`, stubbing `fetch` — this provider does not use the SDK): requests `https://paper-api.alpaca.markets/v2/clock` for paper and `https://api.alpaca.markets/v2/clock` for live; `is_open: true` → `session: 'regular'`, `isOpen: true`, `next_open` / `next_close` passed through unchanged; `is_open: false` with a `timestamp` at 07:00 ET → `'pre'`, at 17:00 ET → `'post'`, at 02:00 ET → `'closed'`; a `-05:00` (EST) offset is honoured rather than the `-04:00` default; an unparseable offset falls back to `-04:00`; a 401 rejects with `MarketDataError` code `auth_failed` (**not** `BrokerError`, no `environment_mismatch`); a network throw rejects with `network_error`; absent credentials reject `auth_failed` before any fetch
  - **Alpaca `getMarketCalendar`** (`alpaca-market-data.test.ts`): requests `/v2/calendar?start=…&end=…` on the trading host with both dates in the query string; maps to `{ date, close }` pairs dropping `open`; filters rows whose `date` or `close` is not a string; an empty response returns `[]`
  - **Fake** (`fake-market-data.test.ts`): **invert** the case at `:12` — `getMarketStatus` and `getMarketCalendar` are now defined, `getAccountInfo` / `getActivities` still undefined; `getMarketStatus` returns the default fixture with `FAKE_MARKET_STATUS` unset and the parsed value when set; `getMarketCalendar` with `FAKE_MARKET_CALENDAR` unset returns every weekday in range at `'16:00'` and no weekend days; with it set, returns only fixture days inside `[range.start, range.end]`; `FAKE_MARKET_DATA_ERROR` makes both throw `MarketDataError` with that code
  - Source cases to port: `alpaca-broker.test.ts:237–400` (re-pointed from the SDK at `fetch`), `fake-broker.test.ts:95–126`
  - Run `pnpm vitest run src/main/integrations/` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/market-data-provider.ts`, `alpaca-market-data-mappers.ts`, `alpaca-market-data.ts`, `fake-market-data.ts` _(depends on: A Red ✓)_
  - `market-data-provider.ts`: **copy** `MarketStatus`, `MarketCalendarDay`, `MarketCalendarRange` from `broker-provider.ts` under a `// --- Market session types ---` banner, doc comments word for word; add `getMarketStatus(): Promise<MarketStatus>` and `getMarketCalendar(range: MarketCalendarRange): Promise<MarketCalendarDay[]>` to the `MarketDataProvider` type; add `export type MarketStatusSource = Pick<MarketDataProvider, 'getMarketStatus'>`. **Leave `broker-provider.ts` alone** — Area G deletes the originals
  - `alpaca-market-data-mappers.ts`: add `buildClockUrl(environment)` → `` `${ALPACA_TRADING_BASE_URLS[environment]}/v2/clock` ``; `buildCalendarUrl(environment, range)` → same base + `/v2/calendar` with `start` / `end` via `URLSearchParams`; `mapClock(raw: AlpacaClock): MarketStatus`; `mapCalendarDays(raw: AlpacaCalendarDay[]): MarketCalendarDay[]` — the `filter` + `map` lifted from `alpaca-broker.ts:229–231` **with its comments** ("Alpaca lists only days the exchange traded…", "`close` already reflects early closes…"). Copy `parseOffsetMinutes`, `deriveSession` and the five session-hour constants from `alpaca-broker.ts`; add the `AlpacaClock` / `AlpacaCalendarDay` response types next to the other `Alpaca*` types
  - `alpaca-market-data.ts`: both methods are `const credentials = this.credentials()` → one `await this.apiFetch(url, credentials)` → the mapper. **No local try/catch** — `apiFetch` already produces typed `MarketDataError`s. `logger.debug` the resolved session on status and the day count on calendar
  - `fake-market-data.ts`: `getMarketStatus` reads `FAKE_MARKET_STATUS`, `getMarketCalendar` reads `FAKE_MARKET_CALENDAR` with a generated-weekday default; copy `DEFAULT_MARKET_STATUS`, `FAKE_CLOSE_TIME`, `weekdaySessions` (keeping its US-98 comment on why the calendar is generated rather than fixtured) and `parseEnv` from `fake-broker.ts`. Both call `this.maybeThrow()` first so `FAKE_MARKET_DATA_ERROR` governs them
  - Run `pnpm vitest run src/main/integrations/` — all tests must pass; `pnpm typecheck` must be clean
- [x] **[Refactor]** `/refactor` — the four files above _(depends on: A Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Watch for: `deriveSession` now existing in two places (expected until Area G — note it, do not delete the broker's copy yet); `AlpacaClock` / `AlpacaCalendarDay` sitting in the mappers module rather than the provider
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Consumers switch to the market-data port

> Three areas, all parallel, all gated on **A Green ✓**. None of them touch the same file.

### B. Trading calendar store: retype + `ensureTradingCalendar`

**Requires:** A Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/trading-calendar-store.test.ts` _(depends on: A Green ✓)_
  - Retype the mock provider at `:20` from a broker shape to `Pick<MarketDataProvider, 'getMarketCalendar'>`; the existing `refreshTradingCalendar` cases (`:138`, `:152`, `:166`) stay green against the new type
  - New `describe('ensureTradingCalendar')`: an empty `trading_session` triggers exactly one `getMarketCalendar` call and leaves rows spanning 120-back/400-ahead; a table already covering `now + 400` days triggers **no** call (the AC-4 unit case); two concurrent calls against an empty table produce exactly one `getMarketCalendar` call and both resolve; a call _after_ the first settles is free to fetch again; `getProvider()` throwing resolves without rejecting and logs `trading_calendar_provider_unavailable` at `warn`; `getMarketCalendar` rejecting resolves without rejecting, leaves stored rows untouched, and logs `trading_calendar_refresh_failed` at `warn`
  - `readTradingCalendar` is unchanged — still synchronous, still `EMPTY_TRADING_CALENDAR` on an empty table
  - Run `pnpm vitest run src/main/services/trading-calendar-store.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/trading-calendar-store.ts` _(depends on: B Red ✓)_
  - Swap the `BrokerProvider` import for `MarketDataProvider`; narrow `refreshTradingCalendar`'s parameter to `Pick<MarketDataProvider, 'getMarketCalendar'>` (per the tighten-helper-input-types convention)
  - `let inFlight: Promise<void> | null = null` at module scope; `ensureTradingCalendar(db, getProvider, now)` returns `inFlight` when set, else assigns `inFlight = run().finally(() => { inFlight = null })`
  - `run()` guards **only** the `getProvider()` call in a `try` (warn + return on throw), then `await refreshTradingCalendar(db, provider, now)` and discards the result — it already logs every outcome and never throws
  - Keep `persistDays`' `source` as `'alpaca'`. Update the module header: the calendar comes from the **market-data** provider; "a screen must not hang on the broker" → "…on a provider"; note that `ensureTradingCalendar` is the write path the bench calls
  - Run `pnpm vitest run src/main/services/trading-calendar-store.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/trading-calendar-store.ts` _(depends on: B Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Watch for: `ensureTradingCalendar` must have no `catch` that could swallow a programming error; `needsRefresh`'s comment now that a bench open, not a nightly job, is the usual caller
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### C. Polling scheduler reads status from market data

**Requires:** A Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/polling-scheduler.test.ts`, `src/main/services/scheduler-instance.test.ts` (new) _(depends on: A Green ✓)_
  - `polling-scheduler.test.ts`: retype the `:43` fixture to `{ getMarketStatus }`; every existing cadence, parking and provider-swap case (`:470–527`) stays green against the new parameter; a status source rejecting with a network error still falls back to `marketOpenMs` for an interval job
  - `scheduler-instance.test.ts`: a provider whose `getMarketStatus` rejects with `MarketDataError('auth_failed')` yields `session: 'closed'`, so a `marketClosedMs: null` job parks rather than re-ticking; a rejection with `MarketDataError('network_error')` propagates, leaving the scheduler's own fallback branch to handle it; the module does not import `brokerFactory`
  - Run `pnpm vitest run src/main/services/polling-scheduler.test.ts src/main/services/scheduler-instance.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/polling-scheduler.ts`, `src/main/services/scheduler-instance.ts` _(depends on: C Red ✓)_
  - `createPollingScheduler(getStatusSource: () => MarketStatusSource)`; rename both call sites (`:167`, `:205`) to `getStatusSource().getMarketStatus()`; surrounding try/catch and log messages unchanged; re-point the `MarketStatus` import at `market-data-provider`
  - `scheduler-instance.ts`: delete `fallbackBroker`, `getSafeBroker` and the `brokerFactory` import. Keep `closedMarketStatus`, renamed to say it means an unconfigured _provider_. Build the source as an object literal whose `getMarketStatus` wraps `marketDataFactory.create().getMarketStatus()` in a try that **rethrows anything that is not `MarketDataError` with code `auth_failed`**. `logger.debug` the degradation — not `warn`, or an unconfigured install spams the log every 60 s
  - Run `pnpm vitest run src/main/services/` — all tests must pass
- [x] **[Refactor]** `/refactor` — both files _(depends on: C Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Note for `/update-spec` later: this supersedes the `scheduler-singleton-safe-broker` ADR. Do not edit `docs/spec/` here
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### D. IPC channel `market-data:market-status`

**Requires:** A Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/market-data.test.ts` _(depends on: A Green ✓)_
  - `market-data:market-status` returns `{ ok: true, status }` from `provider.getMarketStatus()`, matching `contracts/market-data-market-status.md`
  - A provider rejecting with `MarketDataError('auth_failed')` returns `{ ok: false, errors: [{ field: '__root__', code: 'auth_failed' }] }` — never a throw across the bridge
  - Run `pnpm vitest run src/main/ipc/market-data.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/market-data.ts`, `src/preload/index.ts`, `src/preload/index.d.ts` _(depends on: D Red ✓)_
  - One `ipcMain.handle('market-data:market-status', …)` wrapping `handleIpcCall('market_data_market_status_unhandled_error', async () => ({ status: await getProvider().getMarketStatus() }))` — no payload, no Zod schema, thin per the IPC rule; place it with the other read-only market-data handlers, not among the streaming ones
  - `preload/index.ts`: add `marketStatus: () => invoke('market-data:market-status')` to the `marketData` group. **Leave `broker.marketStatus` in place** — Area G deletes it
  - `preload/index.d.ts`: type the new result on the `marketData` group
  - Run `pnpm vitest run src/main/ipc/` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/ipc/market-data.ts` _(depends on: D Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Read paths, jobs and renderer

> Three areas, all parallel. Each names its own upstream dependency.

### E. The bench refreshes the calendar it reads

**Requires:** B Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/watchlist-snapshot.test.ts`, `src/main/services/screener.test.ts` _(depends on: B Green ✓)_
  - `watchlist-snapshot.test.ts`: building against an empty `trading_session` calls `getMarketCalendar` once and then renders the seeded IV rank with a non-null `ivRank.state` (**AC-1 unit case**); building twice against a table already covering today calls it at most once; a provider whose `getMarketCalendar` rejects still returns one row per entry with `entry`, `quote` and `verdict` populated and `ivRank` null — the failure must not empty the bench; that same rejection still logs `watchlist_snapshot_built` at `info` with the full `rowCount`
  - `screener.test.ts`: screening against an empty `trading_session` calls `getMarketCalendar` once and assesses the seeded readings; a rejecting `getMarketCalendar` with healthy chains and quotes returns `status: 'ok'` — **not** `'provider_unavailable'` (**AC-6 unit case**); an unconfigured provider (`getProvider()` throws) still short-circuits to `PROVIDER_UNAVAILABLE` before any calendar work
  - Run `pnpm vitest run src/main/services/watchlist-snapshot.test.ts src/main/services/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/watchlist-snapshot.ts`, `src/main/services/screener.ts` _(depends on: E Red ✓)_
  - `buildWatchlistSnapshot`: add `ensureTradingCalendar(db, getProvider, currentDate)` as a third entry in the existing `Promise.all` alongside `readQuotes` and `readEarningsOrEmpty`, discarding its void result. It must sit **before** the `getAssessedIvrByUnderlying` block at `:141` so the read sees refreshed rows
  - `screenWatchlistCandidates`: call it after the `getProvider()` try/catch — the provider is already in hand, so pass `() => provider`
  - **Do not widen `ScreenerResults.status`.** A calendar failure is not a provider outage; `PROVIDER_UNAVAILABLE` stays reserved for `pullWatchlistChains` reporting one
  - Extend `watchlist-snapshot.ts`'s header comment listing independently-failing boundaries to name the calendar refresh
  - Run `pnpm vitest run src/main/services/` — all tests must pass
- [x] **[Refactor]** `/refactor` — both files _(depends on: E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Watch for: the two call sites reading as one idiom; `readAssessedIvr`'s doc comment in `screener.ts` (which explains why there is no catch) extended to say the refresh is likewise best-effort and self-logging
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### F. IVR collector takes a market-data provider

**Requires:** B Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/ivr-collector.test.ts`, `src/main/index.test.ts` _(depends on: B Green ✓)_
  - `ivr-collector.test.ts`: retype the fixtures at `:181` and `:207` to market-data shapes; the run still calls `getMarketCalendar` before reading the session (`:195`); a rejecting `getMarketCalendar` still runs the batch on the cached calendar and returns the same counts; omitting the provider skips the refresh and reads the existing cache; a run eight days after the last fetch refreshes the calendar (**AC-8 unit case**)
  - `index.test.ts`: the registered `ivr-collect` job is constructed without any `brokerFactory` call
  - Run `pnpm vitest run src/main/services/ivr-collector.test.ts src/main/index.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/ivr-collector.ts`, `src/main/index.ts` _(depends on: F Red ✓)_
  - `brokerProvider?: BrokerProvider` → `marketDataProvider?: Pick<MarketDataProvider, 'getMarketCalendar'>`; rewrite its doc comment — "Absent when no broker is configured" is no longer true, since the market-data factory always constructs, so absence now only happens in tests
  - `index.ts`: delete `tryCreateBroker` and its `ivr_collect_broker_unavailable` debug log outright (`marketDataFactory.create()` never throws); the job passes `marketDataProvider: marketDataFactory.create()`
  - The `session.status === 'closed'` skip is **unchanged** — _when_ IVR is collected is US-100
  - Run `pnpm vitest run src/main/services/ivr-collector.test.ts src/main/index.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — both files _(depends on: F Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Watch for: `ivr-collector.ts` should no longer import anything from `broker-provider`; the "Best effort, and deliberately before the read" comment at `:108` says "a broker outage" and should say "a provider outage"
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### G. Renderer: the pill asks market data, gated on market-data credentials

**Requires:** D Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/api/market-data.test.ts`, `hooks/marketDataQueryKeys.test.ts`, `hooks/useMarketStatusDisplay.test.ts`, `hooks/useSettings.test.ts` _(depends on: D Green ✓)_
  - `api/market-data.test.ts`: `getMarketStatus` calls `window.api.marketData.marketStatus()` and returns `result.status`; an `{ ok: false }` envelope throws a 502 `ApiError` carrying `result.errors` (port the three cases from `api/broker.test.ts:59–78`)
  - `marketDataQueryKeys.test.ts`: `marketStatus[0]` is `'market'`
  - `useMarketStatusDisplay.test.ts`: with `marketData: 'configured'` and `activeBrokerEnv: 'none'`, the status query is **enabled** and the display derives from its session (**AC-2 unit case**); with `marketData: 'missing'`, the query is disabled and the display falls back as it does today
  - `useSettings.test.ts`: the invalidation predicate matches `marketDataQueryKeys.marketStatus` as well as `brokerQueryKeys.account` — `:56` currently asserts the old key, and without this fix saving credentials silently stops refreshing the pill
  - `NewWheelForm.test.tsx`: the `:547` case (a plain US-1 form must not start the 60 s poll) must stay green
  - Run `pnpm vitest run src/renderer/` — all new tests must fail
- [x] **[Green]** Implement — `api/market-data.ts`, `hooks/marketDataQueryKeys.ts`, `hooks/useMarketStatus.ts`, `hooks/useMarketStatusDisplay.ts`, `hooks/useSettings.ts` _(depends on: G Red ✓)_
  - `api/market-data.ts`: add `getMarketStatus()` and the `MarketStatus` type, following the file's existing unwrap idiom. **Leave `api/broker.ts` alone** — Area G-of-the-plan (here, Area H) deletes the originals
  - `marketDataQueryKeys.ts`: add `marketStatus: ['market', 'status'] as const`
  - `useMarketStatus.ts`: re-point the import and the key; check its doc comment does not say "broker"
  - `useMarketStatusDisplay.ts`: gate on `settingsQuery.data?.marketData === 'configured'`; rename `hasBroker` → `hasMarketData`; update the two consumers (`BenchHeader` via `WatchlistPage`, and `PromotedFormChrome`'s comment at `:17` which still says "polls broker status")
  - `useSettings.ts`: `hasBrokerQueryKey` → `hasVendorQueryKey`, matching `queryKey[0] === 'broker' || queryKey[0] === 'market'`, commented to say a credential change invalidates every vendor-backed read, quotes included
  - **No component markup changes** — `MarketStatusPill`, its `wb-*` tokens and the `LIVE`/`EXT`/`CLOSED`/`DELAYED` states are untouched
  - Run `pnpm vitest run src/renderer/` — all tests must pass
- [x] **[Refactor]** `/refactor` — the renderer files above _(depends on: G Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Watch for: stale uses of the word "broker" in market-status context across the renderer — the naming is half the point of this story
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Retire the broker's market capabilities

> One area. This is the deletion half of the move: it can only land once nothing reads the broker's copies.

### H. `BrokerProvider` becomes `getAccountInfo` + `getActivities`

**Requires:** B, C, D, E, F, G Green ✓ (every consumer must have moved first)

- [x] **[Red]** Write failing tests — `broker-provider.test.ts`, `alpaca-broker.test.ts`, `fake-broker.test.ts`, `ipc/broker.test.ts`, `api/broker.test.ts`, `brokerQueryKeys.test.ts` _(depends on: B, C, D, E, F, G Green ✓)_
  - `broker-provider.test.ts`: rewrite `:13` (`'exports BrokerProvider interface with getAccountInfo, getActivities, getMarketStatus'`) to assert exactly two members; drop the `getMarketCalendar` assertion at `:43`
  - `alpaca-broker.test.ts`: the provider instance no longer exposes `getMarketStatus` or `getMarketCalendar` (`toBeUndefined()` on both); delete the `getMarketStatus` / `getMarketCalendar` describes from `:237` onward; existing `getAccountInfo` / `getActivities` cases including `environment_mismatch` stay green **untouched**
  - `fake-broker.test.ts`: delete the `getMarketStatus` describe (`:95`); drop `getMarketStatus` from the interface-shape assertion at `:128`; assert both methods are now undefined and that `FAKE_BROKER_ERROR` has no way to affect market status or the calendar
  - `ipc/broker.test.ts`: `broker:market-status` is no longer registered; drop the `getMarketStatus` mock at `:15` and the case at `:105`; `broker:account` and `broker:activities` stay green
  - `api/broker.test.ts`: delete the `getMarketStatus` describe (`:59`); `getBrokerAccount` cases stay
  - `brokerQueryKeys.test.ts`: `marketStatus` is gone; `account` and `activities` still start with `'broker'`
  - Run `pnpm test` — the new assertions must fail
- [x] **[Green]** Implement — deletions across main, preload, renderer and e2e helpers _(depends on: H Red ✓)_
  - `integrations/broker-provider.ts`: delete `MarketStatus`, `MarketCalendarDay`, `MarketCalendarRange` and both method signatures. **Keep** `BrokerErrorCode`'s `'environment_mismatch'` — `getAccountInfo` still produces it
  - `integrations/alpaca-broker.ts`: delete `getMarketStatus`, `getMarketCalendar`, `deriveSession`, `parseOffsetMinutes`, the five session-hour constants, the `AlpacaCalendarDay` type and the now-unused type imports. `wrapError`, `isAuthError`, `toMoney`, `maskAccountNumber` all stay
  - `integrations/fake-broker.ts`: delete both methods, `DEFAULT_MARKET_STATUS`, `FAKE_CLOSE_TIME`, `weekdaySessions` and the `date-fns` import. Keep its own `parseEnv` — it still serves `FAKE_BROKER_ACCOUNT*` / `FAKE_BROKER_ACTIVITIES`, and sharing one with the market-data fake would couple two test doubles
  - `ipc/broker.ts`: delete the `broker:market-status` handler and any import it orphaned
  - `preload/index.ts` + `index.d.ts`: delete `broker.marketStatus` and its type
  - `renderer/src/api/broker.ts`: delete `getMarketStatus` and the `MarketStatus` type; `hooks/brokerQueryKeys.ts`: delete `marketStatus`
  - **e2e seam rename** (this is the layer where the old env var dies): `FAKE_BROKER_CALENDAR` → `FAKE_MARKET_CALENDAR` and `IvrLaunchOpts.brokerCalendar` → `marketCalendar` in `e2e/ivr-helpers.ts`; update every call site in `e2e/ivr-staleness.spec.ts`, `e2e/ivr-collector.spec.ts`, `e2e/ivr-watchlist-collection.spec.ts`; rewrite the header comment and `weekdayCalendar`'s doc in `e2e/trading-day-fixtures.ts` to name `FakeMarketDataProvider.getMarketCalendar` / `FAKE_MARKET_CALENDAR`
  - `e2e/provider-split.spec.ts`: move `'getMarketStatus returns current session'` (`:545`) onto `window.api.marketData.marketStatus()`
  - Run `pnpm test && pnpm typecheck` — clean; then `pnpm test:e2e` — **this is the first layer where e2e is a gate**
- [x] **[Refactor]** `/refactor` — the deleted-from files _(depends on: H Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verification greps that must both return nothing: `grep -rn "getMarketCalendar\|getMarketStatus" src/main/integrations/broker-provider.ts` and `grep -rn "broker:market-status\|FAKE_BROKER_CALENDAR" src e2e`
  - Watch for: `wrapError`'s `context` parameter now only ever receives `'getAccountInfo'` or `'getActivities'` — leave the signature as is rather than narrowing it; confirm `isNetworkError` is still imported and used in `alpaca-broker.ts`
  - Run `pnpm test && pnpm lint && pnpm typecheck && pnpm test:e2e`

---

## Layer 5 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### I. E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/market-facts-without-broker.spec.ts` _(depends on: all Green tasks ✓)_
  - One `it()` per AC — test names mirror the AC language exactly. AC coverage:
    - AC-1: _IV rank is judged without a broker_ → `it('IV rank is judged without a broker')` — launch `marketDataWithoutBroker`, KO watchlist entry, `ivr_snapshot` at the previous close, empty `trading_session`; open Watchlist; assert the KO IV-rank cell shows its value with a freshness ring and no `'calendar has never been fetched'` line is logged
    - AC-2: _The market-status pill resolves without a broker_ → `it('The market-status pill resolves without a broker')` — assert `[data-testid="market-status-pill"]` reads LIVE with `FAKE_MARKET_STATUS` set to a regular session, and never renders the unresolved/DELAYED state
    - AC-3: _A fresh install does not wait for the nightly collection_ → `it('A fresh install does not wait for the nightly collection')` — empty `trading_session`, `ivr-collect` never run; open Watchlist; assert `trading_session` is non-empty afterwards and a reading collected after that point is aged rather than `n/a`
    - AC-4: _The calendar is not refetched on every render_ → `it('The calendar is not refetched on every render')` — seed a calendar fetched today; open Watchlist twice; assert exactly one `'Trading calendar refreshed'` log line across both opens
    - AC-5: _A calendar failure degrades IV freshness only_ → `it('A calendar failure degrades IV freshness only')` — assert every saved stock still lists ticker, thesis and price, every IV rank reads `n/a`, the failure is logged at `warn`, and no error is surfaced to the trader
    - AC-6: _A calendar failure is not reported as a market-data outage_ → `it('A calendar failure is not reported as a market-data outage')` — calendar failing while quotes and chains serve normally; assert the `'Market data unavailable'` notice is absent and tickers meeting criteria still appear under "Meets criteria"
    - AC-7: _Assignment detection still requires a broker_ → `it('Assignment detection still requires a broker')` — launch `marketDataWithoutBroker`; assert no assignment-detection run is logged, no pending-assignment banner appears, and the absence is not surfaced as a market-data problem
    - AC-8: _Collection still refreshes the calendar on its own schedule_ → `it('Collection still refreshes the calendar on its own schedule')` — seed `trading_session` last fetched eight days ago; trigger `ivr-collect` through the test-scheduler IPC; assert the calendar was refreshed
  - Run `pnpm test:e2e -- e2e/market-facts-without-broker.spec.ts` — all new tests must fail
- [x] **[Green]** Make e2e tests pass — `e2e/assignment-helpers.ts`, `e2e/ivr-helpers.ts`, plus any spec the new seams disturb _(depends on: I Red ✓)_
  - Add `marketDataWithoutBroker` to `LaunchOpts` and `buildLaunchEnv`: `delete env.WHEELBASE_PRESEED_ACTIVE_ENV` **and** set `ALPACA_KEY_ID` / `ALPACA_SECRET_KEY` to non-empty test values, so `activeBrokerEnv` reads `'none'` while `CredentialStatus.marketData` reads `'configured'`. This is the only state the current credential model can express for the story's Background (see the research ADR). **Do not change the existing `withoutBrokerCredentials` option** — specs rely on it meaning "market data missing"
  - AC-5 and AC-6 need the calendar to fail while quotes succeed. `FAKE_MARKET_DATA_ERROR` is global to the fake, so either use the runtime toggle `screener-helpers.ts:914` already provides, scoped across the calendar call, or add a dedicated `FAKE_MARKET_CALENDAR_ERROR` to `FakeMarketDataProvider.getMarketCalendar`. **Prefer the dedicated var if the toggle makes the spec racy** — decide here, not by retrying a flake
  - Re-check every spec that already sets `FAKE_MARKET_DATA_ERROR` (`provider-split.spec.ts:140`, `screener-helpers.ts:618,914`, and any case in `screener-results.spec.ts` / `watchlist-bench.spec.ts`) — those runs now lose the calendar too. That is the intended AC-5/AC-6 behaviour, but their existing IV-rank assertions must be re-checked, not assumed
  - Log assertions follow whatever pattern `ivr-staleness.spec.ts` already uses for `trading_calendar_*` lines — do not invent a second one
  - Run `pnpm test:e2e` — the full suite must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: I Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test:e2e`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC — 8 scenarios, 8 named tests
- [x] `grep -rn "getMarketCalendar\|getMarketStatus" src/main/integrations/broker-provider.ts` returns nothing
- [x] `grep -rn "broker:market-status\|FAKE_BROKER_CALENDAR" src e2e` returns nothing
- [x] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
- [x] `pnpm test:e2e` — green
- [x] `/update-spec us-116` run — captures the move into `docs/spec/`, and supersedes the `scheduler-singleton-safe-broker` ADR
