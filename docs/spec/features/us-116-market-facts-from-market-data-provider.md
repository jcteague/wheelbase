# US-116: Market facts come from the market-data provider, not the broker

<!-- generated:from us-116 -->

> **Status: shipped.** `BrokerProvider` is exactly `getAccountInfo` + `getActivities`; the
> exchange clock and calendar are `MarketDataProvider` capabilities; the bench refreshes the
> calendar on the read path it serves. All eight acceptance scenarios are covered by
> `e2e/market-facts-without-broker.spec.ts`, one verbatim-named test each.
>
> No schema change, no migration, no new dependency, no new credential.

## The problem

The broker is optional. A trader can use Wheelbase purely as a journal: enter wheels by hand,
track cost basis through rolls, screen the bench. Broker credentials add assignment detection and
account data. Nothing else should require them.

Two capabilities broke that rule, and both sat on `BrokerProvider`:

| Capability          | Consumer                                             | Without a broker            |
| ------------------- | ---------------------------------------------------- | --------------------------- |
| `getMarketCalendar` | IV-rank freshness (`readTradingCalendar`)            | every IV reading read `n/a` |
| `getMarketStatus`   | the market-status pill, and the stale-snapshot badge | the pill never resolved     |

Neither is a fact about the trader's account. They ended up behind the broker only because
Alpaca serves them from its trading host — a sourcing accident that leaked into the domain
boundary. The consequence nobody intended: **IV rank is scraped from Barchart with no credentials
at all**, yet the whole IV column was dead on any install without a broker, because the calendar
that ages a reading could not be fetched.

Observed 2026-09-13 (a Sunday), Alpaca paper credentials saved, chains pulling normally:
`trading_session` 0 rows, `ivr_snapshot` 0 rows, and `"Trading calendar has never been fetched;
IVR freshness is unavailable"` firing on every `watchlist_snapshot_built`.

## The rule this establishes

Recorded in `CLAUDE.md`:

> The broker is optional; the app must be fully usable as a journal without one.
> `BrokerProvider` answers facts about _your account_ — `getAccountInfo`, `getActivities` — and
> nothing else may depend on it. Facts about _the market_ belong on `MarketDataProvider`, even
> when the vendor serves them from a broker-flavoured host and even when a second upstream or
> service is needed to answer them.

The interface is defined by what the consumer needs, not by which host answers. Whether a
capability takes one call, two, or a different vendor entirely is the adapter's problem — hiding
exactly that is what the adapter is for.

## What shipped

**The ports.** `getMarketStatus()` and `getMarketCalendar(range)` move to `MarketDataProvider`,
with the `MarketStatus`, `MarketCalendarDay` and `MarketCalendarRange` types. Two narrowed slices
keep consumers off the full port: `MarketStatusSource` (the polling scheduler) and
`MarketCalendarSource` (the trading-calendar store and the IVR collector). `BrokerProvider` keeps
`BrokerErrorCode`'s `'environment_mismatch'` — `getAccountInfo` still produces it.

**Alpaca as a fourth upstream behind the same port.** `AlpacaMarketDataProvider` answers both from
`ALPACA_TRADING_BASE_URLS[environment]` through the `apiFetch` it already uses for open interest.
`buildClockUrl`, `buildCalendarUrl`, `mapClock`, `mapCalendarDays`, `deriveSession` and
`parseOffsetMinutes` live in `alpaca-market-data-mappers.ts`. Errors are `MarketDataError` with
the codes `apiFetch` already produces — not `BrokerError`, and no `environment_mismatch`.

**The bench refreshes the calendar it reads.** `ensureTradingCalendar(db, getProvider, now)` is
awaited by `buildWatchlistSnapshot` and `screenWatchlistCandidates` before either calls
`readTradingCalendar`. US-98's "read never fetches" rule is preserved exactly — the fetch moved
into the service orchestration that already awaits quotes and earnings. See
[trading-calendar-fetched-and-cached](../architecture/02-adrs/trading-calendar-fetched-and-cached.md).

**The channel renames.** `broker:market-status` → `market-data:market-status`, with the preload
path, the renderer API module and the query key moving with it. See
[market-status-pill](../architecture/02-adrs/market-status-pill.md).

**The pill gates on market-data credentials.** `useMarketStatusDisplay` reads
`marketData === 'configured'` instead of `activeBrokerEnv !== 'none'`; the returned field is
`hasMarketData`.

**The scheduler stops constructing a broker.** `fallbackBroker`, `getSafeBroker` and the
`brokerFactory` import are deleted from `scheduler-instance.ts`. See
[scheduler-singleton-safe-broker](../architecture/02-adrs/scheduler-singleton-safe-broker.md),
whose safe-broker half this supersedes.

## Acceptance criteria

Background for all eight: market-data credentials saved, no broker credentials saved, KO on the
watchlist.

| #   | Scenario                                                    | Covered by                                                          |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | IV rank is judged without a broker                          | `it('IV rank is judged without a broker')`                          |
| 2   | The market-status pill resolves without a broker            | `it('The market-status pill resolves without a broker')`            |
| 3   | A fresh install does not wait for the nightly collection    | `it('A fresh install does not wait for the nightly collection')`    |
| 4   | The calendar is not refetched on every render               | `it('The calendar is not refetched on every render')`               |
| 5   | A calendar failure degrades IV freshness only               | `it('A calendar failure degrades IV freshness only')`               |
| 6   | A calendar failure is not reported as a market-data outage  | `it('A calendar failure is not reported as a market-data outage')`  |
| 7   | Assignment detection still requires a broker                | `it('Assignment detection still requires a broker')`                |
| 8   | Collection still refreshes the calendar on its own schedule | `it('Collection still refreshes the calendar on its own schedule')` |

All in `e2e/market-facts-without-broker.spec.ts`.

### How the harder ones are made to bite

The Background is expressed by a `marketDataWithoutBroker` launch option: it drops
`WHEELBASE_PRESEED_ACTIVE_ENV` (so `activeBrokerEnv` reads `'none'`) while setting non-empty
`ALPACA_KEY_ID` / `ALPACA_SECRET_KEY` (so `hasFallbackCredentials()` is true and `marketData`
reads `'configured'`). That is the only state the current credential model can express for it,
and it is a real one — the documented dev/CI path in `.env.example`.

- **AC 1 and AC 3** need a recorded reading _and_ an unfetched calendar. Only the collector can
  write a reading, and it refreshes the calendar on the same run — so those tests launch with
  `FAKE_MARKET_CALENDAR_ERROR` set, let the collector persist the reading against an empty
  `trading_session` (asserted, not assumed), then clear the fault and open the bench.
- **AC 2** launches twice: a regular-session fixture asserting `LIVE`, then a closed-session
  fixture asserting `CLOSED`. A _disabled_ status query is not visibly unresolved —
  `deriveMarketStatusDisplay` falls back to `computeNYSESession()`, the renderer's own wall clock,
  which reads `LIVE` unaided during market hours. The clock cannot be both, so the pair fails at
  any hour if the query is not actually running.
- **AC 4** reads a main-process counter (`_test:market-calendar-fetch-count`) across two page
  reloads. The refresh throttle lives in the store, so a bench that skipped a fetch is otherwise
  indistinguishable from one that made it.
- **AC 7** seeds the same `AAPL_PUT_180` + OPASN fixture that _does_ raise a pending assignment in
  `assignment-detection.spec.ts`, runs the real detect-assignments job through
  `assignments:run-detection-now`, and asserts nothing was detected while the pill still resolves.
  Deleting the `activeBrokerEnv === 'none'` guard makes it fail.
- **AC 5**'s warn-level clause and **AC 1**'s negative-log clause are pinned by
  `trading-calendar-store.test.ts` — the e2e suite has no main-process log seam.

## Test seams that moved

`FakeBrokerProvider` loses both methods; `FakeMarketDataProvider` gains them, reading
`FAKE_MARKET_STATUS` and `FAKE_MARKET_CALENDAR` (defaulting to generated weekday sessions). The
e2e env var `FAKE_BROKER_CALENDAR` is renamed `FAKE_MARKET_CALENDAR` and `IvrLaunchOpts.brokerCalendar`
becomes `marketCalendar`. `FAKE_BROKER_ERROR` can no longer break a market fact.

A dedicated `FAKE_MARKET_CALENDAR_ERROR` fails **only** `getMarketCalendar`: AC 5 and AC 6 need
the calendar to fail while quotes and chains serve normally, which the global
`FAKE_MARKET_DATA_ERROR` cannot express without racing a runtime toggle.

Specs that already set `FAKE_MARKET_DATA_ERROR` now lose the calendar too. `watchlist-bench.spec.ts`'s
"Market data unavailable degrades verdicts, not rows" injects the outage _after_ seeding rather than
at launch: the IV readings and the calendar are both local caches an established install already
holds, and a launch-time error would leave the tiers it asserts reporting an empty calendar rather
than an outage.

## Known limitations and follow-ups

- **The unconfigured-install scheduler status never actually parks.** Its `nextOpen` is stamped at
  module load, so `parkUntilNextOpen` sees a non-positive delay and re-ticks with a `warn`.
  Pre-existing, inherited from the deleted `fallbackBroker`; fixing it needs a decision about how
  long an uncredentialed install should wait before retrying.
- **`buildWatchlistSnapshot` resolves the provider twice** — once in `readQuotes`, once inside
  `ensureTradingCalendar` — logging two "unavailable" events for one cause.
  `screenWatchlistCandidates` already resolves once and passes the value.
- **`mapClock` / `mapCalendarDays` trust the vendor payload shape**, so a malformed 200 escapes as
  a raw `TypeError` rather than a `MarketDataError`. Inherited in kind from `alpaca-broker.ts`.
- **The IVR collector still calls `refreshTradingCalendar` directly** rather than through
  `ensureTradingCalendar` — two doors into one operation, only one deduped. Deliberate: the
  nightly job owns its own provider and wants no in-flight sharing with bench reads.
- **The ensure→read→assess ordering is written out at two call sites**, each with a comment
  explaining why the await must precede the read. Folding it into the IVR assessment would make
  the ordering impossible to skip.

## Sources

- [extract: us-116](../.extracts/us-116.md)
- Linear [OPT-8](https://linear.app/optionswheel/issue/OPT-8)
- `docs/us-116-implementation.md`
- Related: [us-98 — IVR staleness tiers](./us-98-ivr-staleness-tiers.md),
  [us-99 — Alpaca market-data provider](./us-99-alpaca-market-data-provider.md),
  [us-96 — one live bench](./us-96-one-live-bench.md),
  [us-32 — live position prices](./us-32-live-position-prices.md)

<!-- /generated -->
