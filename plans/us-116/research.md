# Research: US-116 — Market facts come from the market-data provider, not the broker

**Linear:** [OPT-8](https://linear.app/optionswheel/issue/OPT-8) · Epic 06 — Live Market Data and IVR Foundation
**Archive copy:** `docs/epics/06-stories/US-116-market-facts-from-market-data-provider.md` (Linear is authoritative)

## What the code actually does today

Verified against `src/` on 2026-09-13, not taken from the spec.

| Fact                                                             | Where it lives now                                                                      | Consumer                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `getMarketStatus()`                                              | `BrokerProvider` → `AlpacaBrokerProvider` (`alpaca-broker.ts:204`, SDK `getClock()`)    | `ipc/broker.ts` `broker:market-status`, `polling-scheduler.ts:167,205` |
| `getMarketCalendar(range)`                                       | `BrokerProvider` → `AlpacaBrokerProvider` (`alpaca-broker.ts:219`, SDK `getCalendar()`) | `trading-calendar-store.ts:185` only                                   |
| `MarketStatus`, `MarketCalendarDay`, `MarketCalendarRange` types | `integrations/broker-provider.ts`                                                       | both of the above                                                      |

Confirmations that matter to the plan:

- **`refreshTradingCalendar` has exactly one caller** — `collectIVRSnapshots` (`ivr-collector.ts:112`), fired only by the `afterClose + 60min` scheduler job. `readTradingCalendar` has three: `ivr-collector.ts:116`, `watchlist-snapshot.ts:143`, `screener.ts:104`. So **both halves of the bench read the calendar and nothing on the bench ever fills it.** That is the dead-IV-column bug, exactly as the story describes.
- **`AlpacaMarketDataProvider` does not use the Alpaca SDK.** It is raw `fetch` through a private `apiFetch` (`alpaca-market-data.ts:65`) that already maps 401/403/404/429 to `MarketDataError`. It already calls the **trading** host via `buildContractsUrl(filter, credentials.environment, …)` for open interest (`:211`), and `ALPACA_TRADING_BASE_URLS` in `alpaca-hosts.ts` already exists for exactly that. `/v2/clock` and `/v2/calendar` are the same host, same key pair. **No new dependency, no new credential.**
- **`marketDataFactory.create()` never throws** (credentials are resolved per request); `brokerFactory.create()` _does_ throw when unconfigured. Every "safe broker" wrapper in the codebase exists because of that difference.
- **`CredentialStatus` already distinguishes the two.** `settings.ts:168` computes `marketData: 'configured' | 'missing'` independently of `activeBrokerEnv`. The renderer's pill gate (`useMarketStatusDisplay.ts:20`) ignores it and reads `activeBrokerEnv !== 'none'` — that is the pill half of the bug.
- **Two existing tests assert the current (wrong) boundary** and must invert: `market-data-provider.test.ts:42` and `fake-market-data.test.ts:12` both assert the market-data provider does _not_ expose `getMarketStatus`.
- **`settings-connections.ts` does its own `fetch`** against `ALPACA_TRADING_BASE_URLS` and never touches `BrokerProvider`, so the settings connection test is unaffected by this move.
- **`scheduler-instance.ts`'s `fallbackBroker` answers `getMarketStatus` too**, not only the calendar. Deleting it naively changes job parking behaviour — see ADR: Unconfigured market data parks jobs.

## Architecture Decisions

### ADR: Both market facts move to `MarketDataProvider`

- **Decision:** `getMarketStatus()` and `getMarketCalendar(range)` move from `BrokerProvider` to `MarketDataProvider`, together with the `MarketStatus`, `MarketCalendarDay` and `MarketCalendarRange` types, which relocate from `integrations/broker-provider.ts` to `integrations/market-data-provider.ts`. `BrokerProvider` becomes exactly `getAccountInfo` + `getActivities`.
- **Why:** Neither is a fact about the trader's account; both are facts about the market. This is the rule recorded in `CLAUDE.md` ("the broker is optional… one capability, one port"). Moving only the calendar would fix IV rank and leave the market-status pill gated on a broker, which is the same defect in a second place.
- **Alternatives considered:** Keep the calendar on `BrokerProvider` and give the market-data provider a `getMarketCalendar` that delegates — preserves the wrong boundary while adding indirection. Introduce a third `MarketCalendarProvider` port — a port per method, with no consumer that wants them separately.

### ADR: Alpaca serves clock and calendar as a fourth upstream behind the same port

- **Decision:** `AlpacaMarketDataProvider` answers both from `ALPACA_TRADING_BASE_URLS[environment]` using its existing `apiFetch`. New pure helpers land in `alpaca-market-data-mappers.ts`: `buildClockUrl(environment)`, `buildCalendarUrl(environment, range)`, `mapClock(raw)`, `mapCalendarDays(raw)`. `deriveSession` and `parseOffsetMinutes` move there verbatim from `alpaca-broker.ts`.
- **Why:** The provider already authenticates against that host for open interest, and `alpaca-hosts.ts` already documents the sharing. Errors become `MarketDataError` with the codes `apiFetch` already produces, which is what every other market-data consumer already handles.
- **Alternatives considered:** Use the `@alpacahq/typescript-sdk` client the broker uses — would put a second HTTP stack inside the market-data provider and bypass its retry/429 handling. Keep `environment_mismatch` classification (a `BrokerError`-only code) — it is a credential-setup diagnosis that belongs to the settings connection test, which has its own copy.

### ADR: The bench refreshes the calendar; the read stays synchronous

- **Decision:** A new `ensureTradingCalendar(db, getProvider, now)` in `trading-calendar-store.ts` is **awaited** by both `buildWatchlistSnapshot` and `screenWatchlistCandidates` before they call `readTradingCalendar`. It resolves the provider inside its own `try` (so an unconfigured provider is a logged skip), delegates to `refreshTradingCalendar`, and holds a module-level in-flight promise so the bench's two concurrent IPC calls share one fetch. `readTradingCalendar` stays pure, synchronous and DB-only.
- **Why:** US-98's "read never fetches" ADR is about `readTradingCalendar`, and it is preserved — the fetch moves into the service orchestration that already awaits quotes and earnings. Awaiting rather than firing-and-forgetting is what makes AC 1 true ("the KO IV rank is shown with its freshness ring" on _that_ page open); a fire-and-forget refresh shows `n/a` for one render and only resolves on a later refetch. The await is free in steady state: `refreshTradingCalendar` already self-throttles behind a single `MIN/MAX` query and returns `{ status: 'skipped' }` without touching the network, and it already swallows every failure into `{ status: 'failed' }`, so it can neither block nor break the bench.
- **Alternatives considered:** Fire-and-forget (story's suggestion) — fails AC 1 on the first open. A dedicated `market-data:refresh-calendar` IPC the renderer calls — puts orchestration in the renderer and adds a round trip. Refresh in `watchlist-snapshot` only — leaves the screener reading an empty cache on first paint, since the bench issues both queries concurrently. Keeping the nightly job as the only writer — that is the bug.

### ADR: Unconfigured market data parks scheduled jobs

- **Decision:** `createPollingScheduler` takes `getStatusSource: () => MarketStatusSource`, where `MarketStatusSource = Pick<MarketDataProvider, 'getMarketStatus'>`. `scheduler-instance.ts` supplies `marketDataFactory.create()` wrapped so a `MarketDataError` with code `auth_failed` degrades to a synthetic `closed` status; every other error propagates to the scheduler's existing "fall back to default cadence" branch. `fallbackBroker`, `getSafeBroker` and the `brokerFactory` import are deleted.
- **Why:** Today an unconfigured app gets `fallbackBroker`'s `closed` status, so interval jobs with `marketClosedMs: null` park instead of spinning. Dropping the stub outright would make them re-tick every 60 s forever against a provider that throws immediately, with a `warn` per tick. Narrowing the parameter to the one method the scheduler uses also stops `polling-scheduler.ts` importing a provider port it does not otherwise need.
- **Alternatives considered:** Pass the whole `MarketDataProvider` — a scheduler that can stream quotes is a wider seam than the job needs. Treat every status failure as `closed` — a transient network blip would park a job until an unknown `nextOpen`. Supersedes the `scheduler-singleton-safe-broker` ADR.

### ADR: `broker:market-status` is renamed, not re-pointed

- **Decision:** The channel becomes `market-data:market-status`, registered in `ipc/market-data.ts`. `preload`'s `broker.marketStatus` moves to `marketData.marketStatus`. In the renderer, `getMarketStatus` and the `MarketStatus` type move from `api/broker.ts` to `api/market-data.ts`, and the key moves from `brokerQueryKeys.marketStatus` to `marketDataQueryKeys.marketStatus = ['market', 'status']`.
- **Why:** The story asks for the rename, and the existing `ipc-channel-naming` and `vendor-scoped-query-keys` ADRs both key off the namespace. Leaving a market fact on a `broker:` channel re-creates the confusion this story removes.
- **Consequence to handle:** `useSettings.ts`'s `hasBrokerQueryKey` predicate invalidates only `queryKey[0] === 'broker'`. Once the status key is `['market', …]`, saving credentials would stop refreshing the pill. The predicate widens to match `'broker'` or `'market'` — which correctly also refreshes quotes and snapshots after a credential change.
- **Alternatives considered:** Keep the channel name and swap the service behind it — cheapest diff, but the name would then lie permanently.

### ADR: The pill gates on market-data credentials

- **Decision:** `useMarketStatusDisplay` gates on `settingsQuery.data?.marketData === 'configured'` and renames `hasBroker` → `hasMarketData`.
- **Why:** `CredentialStatus.marketData` is already computed for exactly this question (`settings.ts:168`). The pill asks "can we reach the market data provider", not "is a broker attached".
- **Alternatives considered:** Always enable the query and let the error state drive `DELAYED` — spends a failing IPC round trip every 60 s on an unconfigured install.

### ADR: The fake seams move with the capabilities

- **Decision:** `FakeMarketDataProvider` gains `getMarketStatus` (from `FAKE_MARKET_STATUS`) and `getMarketCalendar` (from `FAKE_MARKET_CALENDAR`, defaulting to generated weekday sessions); `FakeBrokerProvider` loses both, along with `DEFAULT_MARKET_STATUS`, `weekdaySessions` and the `date-fns` import. The e2e env var `FAKE_BROKER_CALENDAR` is renamed `FAKE_MARKET_CALENDAR` and `IvrLaunchOpts.brokerCalendar` becomes `marketCalendar`. `FAKE_MARKET_STATUS` keeps its name — it is already vendor-neutral.
- **Why:** `FAKE_BROKER_ERROR` must stop being able to break market status and the calendar; after the move `FAKE_MARKET_DATA_ERROR` is the correct injection point, which is what AC 5 and AC 6 test.
- **Watch for:** specs that already set `FAKE_MARKET_DATA_ERROR` (`provider-split.spec.ts:140`, `screener-helpers.ts:618,914`) now also lose the calendar. That is the intended AC-5/AC-6 behaviour, but their existing IV-rank assertions must be re-checked during Red.

### ADR: "No broker, yes market data" is expressed through the env-fallback credentials

- **Decision:** Add an e2e launch option `marketDataWithoutBroker: true` to `buildLaunchEnv` that drops `WHEELBASE_PRESEED_ACTIVE_ENV` (so `activeBrokerEnv` reads `'none'`) while setting non-empty `ALPACA_KEY_ID` / `ALPACA_SECRET_KEY` (so `hasFallbackCredentials()` is true and `marketData` reads `'configured'`). The existing `withoutBrokerCredentials` option is left alone.
- **Why:** This is the only state the current credential model can express for the story's Background ("market-data credentials saved, no broker credentials saved"), and it is a real state — it is the documented dev/CI path in `.env.example`. Changing `withoutBrokerCredentials` in place would silently re-point the specs that use it to assert a "market data missing" app.
- **Alternatives considered:** Split saved credentials into separate broker and market-data records — a settings-model change well outside this story.

## Open Questions

None blocking. The story's own open question — _where the refresh fires_ — is resolved by the "bench refreshes the calendar" ADR above, which departs from the story's suggested fire-and-forget for the reason recorded there.
