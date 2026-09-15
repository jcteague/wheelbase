---
story: us-116
kind: refactor
parent: null
topics: [market-data, alpaca-integration, screener, settings]
status: planned
---

# Implementation Plan: US-116 — Market facts come from the market-data provider, not the broker

## Summary

Move `getMarketStatus` and `getMarketCalendar` off `BrokerProvider` and onto `MarketDataProvider`, so the exchange calendar and session state no longer require an optional broker relationship. Alpaca answers both from the trading host it already authenticates against for open interest. The bench then refreshes the calendar on the read path it serves, which is what makes IV rank legible on a fresh install instead of dead until the nightly collection first runs. Done when `BrokerProvider` is exactly `getAccountInfo` + `getActivities`, the pill and the IV column both work with `activeBrokerEnv === 'none'`, and all eight acceptance scenarios pass end to end.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** Linear [OPT-8](https://linear.app/optionswheel/issue/OPT-8) (archive copy: `docs/epics/06-stories/US-116-market-facts-from-market-data-provider.md` — Linear wins on any difference)
- **Research & Design Decisions:** `plans/us-116/research.md`
- **Data Model & Port Shapes:** `plans/us-116/data-model.md`
- **API Contract:** `plans/us-116/contracts/market-data-market-status.md`
- **Quickstart & Verification:** `plans/us-116/quickstart.md`

## Prerequisites

None — all required schema and infrastructure already exists. `trading_session` and `refreshTradingCalendar` shipped with US-98; `AlpacaMarketDataProvider`, `apiFetch` and `ALPACA_TRADING_BASE_URLS` shipped with US-99. No migration, no new dependency, no new credential.

## Implementation Areas

### 1. Port surfaces

**Files to create or modify:**

- `src/main/integrations/market-data-provider.ts` — add `MarketStatus`, `MarketCalendarDay`, `MarketCalendarRange` types (moved verbatim, doc comments intact); add `getMarketStatus()` and `getMarketCalendar(range)` to `MarketDataProvider`; add `export type MarketStatusSource = Pick<MarketDataProvider, 'getMarketStatus'>`
- `src/main/integrations/broker-provider.ts` — delete those three types and both methods; `BrokerProvider` becomes `getAccountInfo` + `getActivities`

**Red — tests to write:**

- `market-data-provider.test.ts`: **invert** the existing `'does not expose getAccountInfo, getActivities, or getMarketStatus'` case (`:42`) — a structurally-typed fixture must now satisfy `MarketDataProvider` with `getMarketStatus` and `getMarketCalendar` present, and the case is renamed to assert the port _does_ expose them while still not exposing `getAccountInfo` / `getActivities`
- `market-data-provider.test.ts`: `MarketStatus`, `MarketCalendarDay` and `MarketCalendarRange` are importable from this module
- `broker-provider.test.ts`: rewrite `'exports BrokerProvider interface with getAccountInfo, getActivities, getMarketStatus'` (`:13`) to assert exactly two members, and drop the `getMarketCalendar` assertion at `:43`

**Green — implementation:**

- Move the three type declarations from `broker-provider.ts` into `market-data-provider.ts` under a `// --- Market session types ---` banner, keeping the existing doc comments word for word
- Add the two method signatures to the `MarketDataProvider` type; add `MarketStatusSource`
- Remove both signatures from `interface BrokerProvider`; leave `BrokerErrorCode`'s `'environment_mismatch'` in place — `getAccountInfo` still produces it

**Refactor — cleanup to consider:**

- Confirm no file still imports `MarketStatus` (etc.) from `broker-provider`; `pnpm typecheck` is the gate. Expect breakage in areas 2–10 — do not patch importers here beyond what typecheck needs to compile the two port files.

**Acceptance criteria covered:** structural precondition for all eight; no scenario passes on this area alone.

---

### 2. Alpaca market-data adapter gains clock and calendar

**Files to create or modify:**

- `src/main/integrations/alpaca-market-data-mappers.ts` — add `buildClockUrl(environment)`, `buildCalendarUrl(environment, range)`, `mapClock(raw)`, `mapCalendarDays(raw)`; move `parseOffsetMinutes` and `deriveSession` here verbatim from `alpaca-broker.ts` along with the `DEFAULT_ET_OFFSET_MINUTES` / `PRE_MARKET_START_HOUR` / `REGULAR_MARKET_START_HOUR` / `REGULAR_MARKET_END_HOUR` / `POST_MARKET_END_HOUR` constants
- `src/main/integrations/alpaca-market-data.ts` — add `getMarketStatus()` and `getMarketCalendar(range)` using the existing `this.credentials()` + `this.apiFetch(...)` path

**Red — tests to write:**

In `src/main/integrations/alpaca-market-data.test.ts`, a new `describe('getMarketStatus')` and `describe('getMarketCalendar')`, seeded by porting the cases currently at `alpaca-broker.test.ts:237–400` and re-pointing them at `fetch` (the market-data provider stubs `fetch`, not the SDK):

- `getMarketStatus` requests `https://paper-api.alpaca.markets/v2/clock` for paper credentials and `https://api.alpaca.markets/v2/clock` for live
- `is_open: true` maps to `session: 'regular'`, `isOpen: true`, and passes `next_open` / `next_close` through unchanged
- `is_open: false` with a `timestamp` at 07:00 ET maps to `'pre'`; at 17:00 ET maps to `'post'`; at 02:00 ET maps to `'closed'`
- a `timestamp` whose offset is `-05:00` (EST) is read against that offset, not against the `-04:00` default
- a `timestamp` with no parseable offset falls back to `-04:00`
- a 401 response rejects with `MarketDataError` code `auth_failed` (**not** `BrokerError`, and no `environment_mismatch`)
- a network throw rejects with code `network_error`
- `getMarketCalendar({ start, end })` requests `/v2/calendar?start=…&end=…` on the trading host with both dates in the query string
- the response maps to `{ date, close }` pairs, dropping `open`
- rows with a non-string `date` or `close` are filtered out
- an empty array response returns `[]`
- credentials absent → rejects `auth_failed` before any fetch

**Green — implementation:**

- `buildClockUrl(environment)` → `` `${ALPACA_TRADING_BASE_URLS[environment]}/v2/clock` ``; `buildCalendarUrl(environment, range)` → the same base plus `/v2/calendar` with `start` and `end` as `URLSearchParams`
- `mapClock(raw: AlpacaClock): MarketStatus` returning `{ isOpen: raw.is_open, nextOpen: raw.next_open, nextClose: raw.next_close, session: deriveSession(raw.is_open, raw.timestamp) }`
- `mapCalendarDays(raw: AlpacaCalendarDay[]): MarketCalendarDay[]` — the `filter` + `map` lifted from `alpaca-broker.ts:229–231`, comments included (the "absence is a closure" and "close already reflects early closes" notes must survive the move)
- On the provider: both methods are `const credentials = this.credentials()` then one `await this.apiFetch(url, credentials)` then the mapper — no local try/catch, since `apiFetch` already produces typed `MarketDataError`s
- `logger.debug` the resolved session on status and the day count on calendar, per the logging standard

**Refactor — cleanup to consider:**

- `AlpacaClock` and `AlpacaCalendarDay` belong next to the other `Alpaca*` response types in the mappers module, not in the provider
- Check `deriveSession` did not pick up a duplicate: it must exist in exactly one place after area 3

**Acceptance criteria covered:** the upstream half of "IV rank is judged without a broker" and "the market-status pill resolves without a broker".

---

### 3. Alpaca broker adapter sheds both methods

**Files to create or modify:**

- `src/main/integrations/alpaca-broker.ts` — delete `getMarketStatus`, `getMarketCalendar`, `deriveSession`, `parseOffsetMinutes`, the five session-hour constants, the `AlpacaCalendarDay` type and the now-unused `MarketCalendarDay` / `MarketCalendarRange` / `MarketStatus` imports
- `src/main/integrations/alpaca-broker.test.ts` — delete the `getMarketStatus` and `getMarketCalendar` describes (`:237` onward) once area 2's ports are green

**Red — tests to write:**

- `alpaca-broker.test.ts`: the provider instance no longer exposes `getMarketStatus` or `getMarketCalendar` (`expect(...).toBeUndefined()` on both), mirroring how `fake-market-data.test.ts:12` currently phrases the inverse assertion
- Existing `getAccountInfo` / `getActivities` cases, including `environment_mismatch` classification, must stay green untouched

**Green — implementation:**

- Delete the listed members. `wrapError`, `isAuthError`, `toMoney` and `maskAccountNumber` all stay — they still serve the two remaining methods

**Refactor — cleanup to consider:**

- `wrapError`'s `context` parameter now only ever receives `'getAccountInfo'` or `'getActivities'`; leave the signature as is rather than narrowing it
- Verify `isNetworkError` is still imported and used

**Acceptance criteria covered:** "Assignment detection still requires a broker" — the broker keeps exactly the account capabilities and nothing else.

---

### 4. Fake providers move their seams

**Files to create or modify:**

- `src/main/integrations/fake-market-data.ts` — add `getMarketStatus()` reading `FAKE_MARKET_STATUS`, and `getMarketCalendar(range)` reading `FAKE_MARKET_CALENDAR` with a generated-weekday default; move `DEFAULT_MARKET_STATUS`, `FAKE_CLOSE_TIME`, `weekdaySessions` and `parseEnv` across from the fake broker
- `src/main/integrations/fake-broker.ts` — delete both methods and everything that only served them (`DEFAULT_MARKET_STATUS`, `FAKE_CLOSE_TIME`, `weekdaySessions`, the `date-fns` import)

**Red — tests to write:**

- `fake-market-data.test.ts`: **invert** `'no longer exposes broker methods (getAccountInfo, getActivities, getMarketStatus)'` (`:12`) — `getMarketStatus` and `getMarketCalendar` are now defined; `getAccountInfo` and `getActivities` are still undefined
- `fake-market-data.test.ts`: `getMarketStatus` returns the `DEFAULT_MARKET_STATUS` fixture when `FAKE_MARKET_STATUS` is unset, and the parsed value when it is set
- `fake-market-data.test.ts`: `getMarketCalendar` with `FAKE_MARKET_CALENDAR` unset returns every weekday in the range at `'16:00'` and no weekend days
- `fake-market-data.test.ts`: `getMarketCalendar` with `FAKE_MARKET_CALENDAR` set returns only fixture days inside `[range.start, range.end]`
- `fake-market-data.test.ts`: `FAKE_MARKET_DATA_ERROR` makes both new methods throw `MarketDataError` with that code — this is the seam AC 5 and AC 6 drive
- `fake-broker.test.ts`: delete the `getMarketStatus` describe (`:95`) and drop `getMarketStatus` from the interface-shape assertion at `:128`; add that both methods are now undefined
- `fake-broker.test.ts`: `FAKE_BROKER_ERROR` no longer has any way to affect market status or the calendar

**Green — implementation:**

- Both new methods call the existing `this.maybeThrow()` first, so `FAKE_MARKET_DATA_ERROR` governs them like every other fake method
- `weekdaySessions` keeps its US-98 comment explaining why the calendar is generated rather than fixtured

**Refactor — cleanup to consider:**

- `parseEnv` now lives in the market-data fake; check whether `fake-broker.ts` still needs its own copy for `FAKE_BROKER_ACCOUNT*` / `FAKE_BROKER_ACTIVITIES` (it does — leave both, they are three lines each and sharing them would couple two test doubles)

**Acceptance criteria covered:** offline seam for all eight scenarios.

---

### 5. Trading calendar store: market-data provider + `ensureTradingCalendar`

**Files to create or modify:**

- `src/main/services/trading-calendar-store.ts` — `refreshTradingCalendar`'s `provider` parameter becomes `Pick<MarketDataProvider, 'getMarketCalendar'>`; add the exported `ensureTradingCalendar(db, getProvider, now)` with the module-level in-flight promise

**Red — tests to write:**

In `src/main/services/trading-calendar-store.test.ts`, retype the existing mock provider (`:20`) from a broker to a market-data shape, then add a new `describe('ensureTradingCalendar')`:

- an empty `trading_session` table triggers exactly one `getMarketCalendar` call and leaves rows spanning the 120-back/400-ahead range
- a table already covering `now + 400` days triggers **no** `getMarketCalendar` call (the existing `needsRefresh` throttle — the AC-4 unit case)
- two concurrent `ensureTradingCalendar` calls against an empty table produce exactly one `getMarketCalendar` call and both promises resolve
- a second call _after_ the first settles is free to fetch again (the in-flight guard clears)
- `getProvider()` throwing resolves without rejecting and logs `trading_calendar_provider_unavailable` at `warn`
- `getMarketCalendar` rejecting resolves without rejecting, leaves previously stored rows untouched, and logs `trading_calendar_refresh_failed` at `warn` (existing behaviour at `:152`, now reached through `ensureTradingCalendar`)
- `readTradingCalendar` is unchanged: still synchronous, still returns `EMPTY_TRADING_CALENDAR` on an empty table

**Green — implementation:**

- Swap the `BrokerProvider` import for `MarketDataProvider`; narrow the parameter to `Pick<MarketDataProvider, 'getMarketCalendar'>` per the "tighten helper input types" convention
- `let inFlight: Promise<void> | null = null` at module scope; `ensureTradingCalendar` returns `inFlight` when set, otherwise assigns `inFlight = run().finally(() => { inFlight = null })` and returns it
- `run()` resolves the provider inside its own `try` (warn + return on throw), then `await refreshTradingCalendar(db, provider, now)` and discards the result — `refreshTradingCalendar` already logs every outcome and never throws
- Keep `persistDays`' `source` argument as `'alpaca'`; the vendor is unchanged by this story
- Update the module header comment: the calendar is fetched through the **market-data** provider, and the "reads never fetch — a screen must not hang on the broker" sentence becomes "…must not hang on a provider", with a note that `ensureTradingCalendar` is the write path the bench calls

**Refactor — cleanup to consider:**

- Check `REFRESH_INTERVAL_DAYS` and the `needsRefresh` comment still read correctly now that a bench open, not a nightly job, is the usual caller
- Confirm `ensureTradingCalendar` has no `catch` that could swallow a programming error — only the `getProvider()` call is guarded

**Acceptance criteria covered:** "The calendar is not refetched on every render"; the store half of "A calendar failure degrades IV freshness only".

---

### 6. The bench refreshes the calendar it reads

**Files to create or modify:**

- `src/main/services/watchlist-snapshot.ts` — `await ensureTradingCalendar(getProvider, …)` inside the existing `Promise.all`, before `readTradingCalendar`
- `src/main/services/screener.ts` — same, after the provider is resolved and before `readAssessedIvr`

**Red — tests to write:**

- `watchlist-snapshot.test.ts`: building a snapshot against an empty `trading_session` calls `getMarketCalendar` once and then renders the seeded IV rank with a non-null `ivRank.state` — the AC-1 unit case
- `watchlist-snapshot.test.ts`: building twice against a table already covering today calls `getMarketCalendar` at most once
- `watchlist-snapshot.test.ts`: a provider whose `getMarketCalendar` rejects still returns one row per watchlist entry, each with its `entry`, `quote` and `verdict` populated and `ivRank` null — the failure must not empty the bench
- `watchlist-snapshot.test.ts`: a rejecting `getMarketCalendar` alongside a working `getStockQuotes` still logs `watchlist_snapshot_built` at `info` with the full `rowCount`
- `screener.test.ts`: screening against an empty `trading_session` calls `getMarketCalendar` once and assesses the seeded readings
- `screener.test.ts`: a rejecting `getMarketCalendar` with healthy chains and quotes returns `status: 'ok'` (**not** `'provider_unavailable'`) with the ranked candidates intact — the AC-6 unit case
- `screener.test.ts`: an unconfigured provider (`getProvider()` throws) still short-circuits to `PROVIDER_UNAVAILABLE` before any calendar work

**Green — implementation:**

- In `buildWatchlistSnapshot`, add `ensureTradingCalendar(db, getProvider, currentDate)` as a third entry in the existing `Promise.all` alongside `readQuotes` and `readEarningsOrEmpty`, discarding its void result. It must sit _before_ the `getAssessedIvrByUnderlying` block at `:141` so the read sees refreshed rows
- In `screenWatchlistCandidates`, call it after the `getProvider()` try/catch — the provider is already in hand there, so pass `() => provider`
- Do **not** widen `ScreenerResults.status`: a calendar failure is not a provider outage, and `PROVIDER_UNAVAILABLE` stays reserved for `pullWatchlistChains` reporting one
- Extend the `watchlist-snapshot.ts` header comment's list of independently-failing boundaries to name the calendar refresh

**Refactor — cleanup to consider:**

- Both call sites now pass a provider getter and a clock — check whether the shapes are close enough to read as one idiom, and make the two calls look identical if not
- `readAssessedIvr`'s doc comment in `screener.ts` explains why there is no catch; extend it to say the refresh is likewise best-effort and already self-logging

**Acceptance criteria covered:** "IV rank is judged without a broker"; "A fresh install does not wait for the nightly collection"; "A calendar failure degrades IV freshness only"; "A calendar failure is not reported as a market-data outage".

---

### 7. IVR collector takes a market-data provider

**Files to create or modify:**

- `src/main/services/ivr-collector.ts` — `brokerProvider?: BrokerProvider` becomes `marketDataProvider?: Pick<MarketDataProvider, 'getMarketCalendar'>`
- `src/main/index.ts` — delete `tryCreateBroker`; the IVR job passes `marketDataProvider: marketDataFactory.create()`

**Red — tests to write:**

- `ivr-collector.test.ts`: retype the fixtures at `:181` and `:207` to market-data shapes; the run still calls `getMarketCalendar` before reading the session (`:195`)
- `ivr-collector.test.ts`: a rejecting `getMarketCalendar` still runs the batch on the cached calendar and returns the same counts — existing case at `:208`, retyped
- `ivr-collector.test.ts`: omitting `marketDataProvider` skips the refresh and reads the existing cache
- `ivr-collector.test.ts`: a run eight days after the last fetch refreshes the calendar — the AC-8 unit case
- `index.test.ts`: the registered `ivr-collect` job is constructed without any `brokerFactory` call

**Green — implementation:**

- Rename the field and its doc comment ("Absent when no broker is configured" is no longer true — the market-data factory always constructs, so absence now only happens in tests)
- In `index.ts`, `marketDataFactory.create()` never throws, so the `try/catch` and the `ivr_collect_broker_unavailable` debug log are deleted outright
- The `session.status === 'closed'` skip is unchanged — _when_ IVR is collected is US-100's story

**Refactor — cleanup to consider:**

- Check whether `ivr-collector.ts` still imports anything from `broker-provider` (it should not)
- The "Best effort, and deliberately before the read" comment at `:108` still holds; update "a broker outage" to "a provider outage"

**Acceptance criteria covered:** "Collection still refreshes the calendar on its own schedule".

---

### 8. Polling scheduler reads status from market data

**Files to create or modify:**

- `src/main/services/polling-scheduler.ts` — `createPollingScheduler(getStatusSource: () => MarketStatusSource)`; drop the `BrokerProvider` import
- `src/main/services/scheduler-instance.ts` — delete `fallbackBroker`, `getSafeBroker` and the `brokerFactory` import; supply a market-data-backed status source that degrades `auth_failed` to a synthetic closed status

**Red — tests to write:**

- `polling-scheduler.test.ts`: retype the `:43` fixture to `{ getMarketStatus }`; every existing cadence, parking and provider-swap case (`:470–527`) stays green against the new parameter
- `polling-scheduler.test.ts`: a status source that rejects with a network error still falls back to `marketOpenMs` for an interval job (existing behaviour, re-asserted against the new type)
- `scheduler-instance.test.ts` (new file): a provider whose `getMarketStatus` rejects with `MarketDataError('auth_failed')` yields `session: 'closed'`, so a `marketClosedMs: null` job parks rather than re-ticking
- `scheduler-instance.test.ts`: a provider whose `getMarketStatus` rejects with `MarketDataError('network_error')` propagates the rejection, leaving the scheduler's own fallback branch to handle it
- `scheduler-instance.test.ts`: the module does not import `brokerFactory`

**Green — implementation:**

- Rename the parameter and both call sites (`:167`, `:205`) to `getStatusSource().getMarketStatus()`; the surrounding try/catch and log messages are unchanged
- In `scheduler-instance.ts`, keep `closedMarketStatus` but rename it to say what it means (an unconfigured provider, not a broker), and build the source as an object literal whose `getMarketStatus` wraps `marketDataFactory.create().getMarketStatus()` in a try that rethrows anything that is not `MarketDataError` with code `auth_failed`
- `logger.debug` the degradation so an unconfigured install is diagnosable without log spam at `warn`

**Refactor — cleanup to consider:**

- `polling-scheduler.ts` imports `MarketStatus` for `decideNextCadenceMs` and `parkUntilNextOpen` — re-point that import at `market-data-provider`, not at a re-export
- The `scheduler-singleton-safe-broker` ADR is now superseded; note it for the `/update-spec` pass rather than editing docs here

**Acceptance criteria covered:** "Assignment detection still requires a broker" (the scheduler no longer constructs one at all, and the detect-assignments handler's own `activeBrokerEnv === 'none'` guard is what keeps detection off).

---

### 9. IPC: `market-data:market-status`

**Files to create or modify:**

- `src/main/ipc/market-data.ts` — register `market-data:market-status`
- `src/main/ipc/broker.ts` — delete the `broker:market-status` handler
- `src/preload/index.ts` — `marketData.marketStatus()`; remove `broker.marketStatus`
- `src/preload/index.d.ts` — move the `MarketStatus` result type onto the `marketData` group

**Red — tests to write:**

- `src/main/ipc/market-data.test.ts`: `market-data:market-status` returns `{ ok: true, status }` from `provider.getMarketStatus()`, matching `contracts/market-data-market-status.md`
- `src/main/ipc/market-data.test.ts`: a provider rejecting with `MarketDataError('auth_failed')` returns `{ ok: false, errors: [{ field: '__root__', code: 'auth_failed' }] }` — never a throw across the bridge
- `src/main/ipc/broker.test.ts`: `broker:market-status` is no longer registered; drop the `getMarketStatus` mock at `:15` and the case at `:105`; `broker:account` and `broker:activities` stay green

**Green — implementation:**

- One `ipcMain.handle('market-data:market-status', …)` wrapping `handleIpcCall('market_data_market_status_unhandled_error', async () => ({ status: await getProvider().getMarketStatus() }))` — no payload, no Zod schema, thin per the IPC rule
- `ipc/broker.ts` keeps only the two account handlers

**Refactor — cleanup to consider:**

- Check the handler sits with the other read-only market-data handlers rather than among the streaming ones
- Confirm `ipc/broker.ts` no longer imports anything it stopped using

**Acceptance criteria covered:** transport for "The market-status pill resolves without a broker".

---

### 10. Renderer: the pill asks market data, gated on market-data credentials

**Files to create or modify:**

- `src/renderer/src/api/market-data.ts` — add `getMarketStatus()` and the `MarketStatus` type
- `src/renderer/src/api/broker.ts` — remove both
- `src/renderer/src/hooks/marketDataQueryKeys.ts` — add `marketStatus: ['market', 'status'] as const`
- `src/renderer/src/hooks/brokerQueryKeys.ts` — remove `marketStatus`
- `src/renderer/src/hooks/useMarketStatus.ts` — re-point the import and the key
- `src/renderer/src/hooks/useMarketStatusDisplay.ts` — gate on `marketData === 'configured'`; rename `hasBroker` → `hasMarketData`
- `src/renderer/src/hooks/useSettings.ts` — widen `hasBrokerQueryKey` to also match `'market'`

**Red — tests to write:**

- `api/market-data.test.ts`: `getMarketStatus` calls `window.api.marketData.marketStatus()` and returns `result.status`; an `{ ok: false }` envelope throws a 502 `ApiError` carrying `result.errors` (port the three cases from `api/broker.test.ts:59–78`)
- `api/broker.test.ts`: delete the `getMarketStatus` describe; the `getBrokerAccount` cases stay
- `marketDataQueryKeys.test.ts`: `marketStatus[0]` is `'market'`
- `brokerQueryKeys.test.ts`: `marketStatus` is gone; `account` and `activities` still start with `'broker'`
- `useMarketStatusDisplay.test.ts`: with `marketData: 'configured'` and `activeBrokerEnv: 'none'`, the status query is **enabled** and the display derives from its session — the AC-2 unit case
- `useMarketStatusDisplay.test.ts`: with `marketData: 'missing'`, the query is disabled and the display falls back as it does today
- `useSettings.test.ts`: the invalidation predicate matches `marketDataQueryKeys.marketStatus` as well as `brokerQueryKeys.account` — saving credentials must still refresh the pill (`:56` currently asserts the old key)
- `NewWheelForm.test.tsx`: the `:547` case — a plain US-1 form must not start the 60 s poll — still passes; its comment naming a "broker-status poll" needs the wording updated

**Green — implementation:**

- `getMarketStatus` in `api/market-data.ts` follows the file's existing unwrap idiom; the `MarketStatus` type moves with it
- `useMarketStatusDisplay` reads `settingsQuery.data?.marketData === 'configured'`; the returned field is `hasMarketData`. Update the two consumers (`BenchHeader` via `WatchlistPage`, and `PromotedFormChrome`'s comment at `:17` which still says "polls broker status")
- `hasBrokerQueryKey` becomes `hasVendorQueryKey`, matching `queryKey[0] === 'broker' || queryKey[0] === 'market'`, with a comment saying a credential change invalidates every vendor-backed read, quotes included
- No component markup changes: `MarketStatusPill`, its `wb-*` tokens and the `LIVE`/`EXT`/`CLOSED`/`DELAYED` states are untouched

**Refactor — cleanup to consider:**

- `useMarketStatus.ts`'s name is still right; check its doc comment does not say "broker"
- Grep the renderer for the word "broker" in market-status context and fix stale comments — this is the naming half of the story's point

**Acceptance criteria covered:** "The market-status pill resolves without a broker".

---

### 11. E2e Tests

**Files to create or modify:**

- `e2e/market-facts-without-broker.spec.ts` — new; one test per acceptance scenario
- `e2e/assignment-helpers.ts` — add the `marketDataWithoutBroker` launch option to `buildLaunchEnv` and `LaunchOpts`
- `e2e/ivr-helpers.ts` — `IvrLaunchOpts.brokerCalendar` → `marketCalendar`; write `FAKE_MARKET_CALENDAR`; pass `marketDataWithoutBroker` through
- `e2e/trading-day-fixtures.ts` — update the header comment and `weekdayCalendar`'s doc to name `FakeMarketDataProvider.getMarketCalendar` / `FAKE_MARKET_CALENDAR`
- `e2e/ivr-staleness.spec.ts`, `e2e/ivr-collector.spec.ts`, `e2e/ivr-watchlist-collection.spec.ts` — rename the `brokerCalendar` option at each call site
- `e2e/provider-split.spec.ts` — move `'getMarketStatus returns current session'` (`:545`) onto `window.api.marketData.marketStatus()`; add that `window.api.broker` no longer exposes `marketStatus`
- `e2e/screener-results.spec.ts`, `e2e/watchlist-bench.spec.ts` — re-check any case that sets `FAKE_MARKET_DATA_ERROR`, which now also fails the calendar

**Red — tests to write:**

One test per AC, named in the AC's own language:

1. `'IV rank is judged without a broker'` — launch with `marketDataWithoutBroker`, a KO watchlist entry, an `ivr_snapshot` at the previous close and an empty `trading_session`; open the Watchlist page; assert the KO IV-rank cell shows its value with a freshness ring, and that no `'calendar has never been fetched'` line appears in the main-process log
2. `'The market-status pill resolves without a broker'` — same launch; assert `[data-testid="market-status-pill"]` reads one of LIVE/EXT/CLOSED (with `FAKE_MARKET_STATUS` set to a regular session, LIVE) and never renders the unresolved/DELAYED state
3. `'A fresh install does not wait for the nightly collection'` — empty `trading_session`, `ivr-collect` never run; open the Watchlist page; assert `trading_session` is non-empty afterwards and a reading collected after that point is aged rather than `n/a`
4. `'The calendar is not refetched on every render'` — seed a calendar fetched today; open the Watchlist page twice; assert exactly one `'Trading calendar refreshed'` log line across both opens
5. `'A calendar failure degrades IV freshness only'` — `FAKE_MARKET_DATA_ERROR` scoped so the calendar fails; assert every saved stock is still listed with ticker, thesis and price, every IV rank reads `n/a`, the failure is logged at `warn`, and no error toast or error region is rendered
6. `'A calendar failure is not reported as a market-data outage'` — calendar failing while quotes and chains serve normally; assert the `'Market data unavailable'` notice is absent and tickers meeting their criteria still appear under "Meets criteria"
7. `'Assignment detection still requires a broker'` — launch with `marketDataWithoutBroker`; assert no assignment-detection run is logged, no pending-assignment banner appears, and the absence is not surfaced as a market-data problem
8. `'Collection still refreshes the calendar on its own schedule'` — seed `trading_session` last fetched eight days ago; trigger `ivr-collect` through the test-scheduler IPC; assert the calendar was refreshed

**Green — implementation:**

- `marketDataWithoutBroker` in `buildLaunchEnv`: `delete env.WHEELBASE_PRESEED_ACTIVE_ENV` **and** set `ALPACA_KEY_ID` / `ALPACA_SECRET_KEY` to non-empty test values, so `activeBrokerEnv` reads `'none'` while `CredentialStatus.marketData` reads `'configured'` (see the research ADR — this is the only state the current credential model can express for the story's Background)
- Scenario 5 and 6 need the calendar to fail while quotes succeed. `FAKE_MARKET_DATA_ERROR` is global to the fake, so use the runtime toggle `screener-helpers.ts:914` already provides to set it only across the calendar call, or add a dedicated `FAKE_MARKET_CALENDAR_ERROR` to `FakeMarketDataProvider.getMarketCalendar` if the timing proves unreliable — decide during Red, and prefer the dedicated var if the toggle makes the spec racy
- Assertions on main-process logs follow whatever pattern `ivr-staleness.spec.ts` already uses for `trading_calendar_*` lines rather than inventing a second one

**Refactor — cleanup to consider:**

- `trading-day-fixtures.ts`'s header is the clearest surviving description of the old boundary — rewriting it accurately is part of the story, not incidental
- Check no e2e file still writes `FAKE_BROKER_CALENDAR`

**Acceptance criteria covered:** all eight, one test each.

## AC Audit

| #   | Acceptance scenario                                         | Covered by                              |
| --- | ----------------------------------------------------------- | --------------------------------------- |
| 1   | IV rank is judged without a broker                          | Area 11 test 1; units in areas 2, 5, 6  |
| 2   | The market-status pill resolves without a broker            | Area 11 test 2; units in areas 2, 9, 10 |
| 3   | A fresh install does not wait for the nightly collection    | Area 11 test 3; unit in area 6          |
| 4   | The calendar is not refetched on every render               | Area 11 test 4; unit in area 5          |
| 5   | A calendar failure degrades IV freshness only               | Area 11 test 5; units in areas 5, 6     |
| 6   | A calendar failure is not reported as a market-data outage  | Area 11 test 6; unit in area 6          |
| 7   | Assignment detection still requires a broker                | Area 11 test 7; units in areas 3, 8     |
| 8   | Collection still refreshes the calendar on its own schedule | Area 11 test 8; unit in area 7          |

No uncovered acceptance criteria.

## Out of Scope (restated from the story)

When IVR is collected (US-100) · freshness tiers, rings and tooltip copy (US-98) · per-contract implied volatility on the cockpit (US-117) · `getAccountInfo` / `getActivities` and assignment detection · the Barchart scraper · adding a non-Alpaca calendar source.
