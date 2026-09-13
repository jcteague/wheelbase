# US-116: Market facts come from the market-data provider, not the broker

**As a** trader using Wheelbase to journal and track wheels, with no broker connected,
**I want** the exchange calendar and market status to come from the market-data provider I already configured,
**So that** IV rank, freshness and the market-status pill actually work — instead of the app silently gating market facts on an optional broker relationship I never asked for.

---

## Context

The broker is optional. A trader can use Wheelbase purely as a journal: enter wheels by
hand, track cost basis through rolls, screen the bench. Broker credentials add assignment
detection and account data. Nothing else should require them.

Two capabilities break that rule today, and both sit on `BrokerProvider`:

| Capability          | Consumer                                             | Without a broker             |
| ------------------- | ---------------------------------------------------- | ---------------------------- |
| `getMarketCalendar` | IV-rank freshness (`readTradingCalendar`)            | every IV reading reads `n/a` |
| `getMarketStatus`   | the market-status pill, and the stale-snapshot badge | pill never resolves          |

Neither is a fact about the trader's account. "Which days were exchange sessions" and "is
the exchange open right now" are facts about the **market**, and they end up behind the
broker only because Alpaca serves them from its trading host.

That sourcing accident leaked into the domain boundary, with a consequence nobody intended:
**IV rank is scraped from Barchart with no credentials at all** — `barchart-ivr-scraper.ts`
has zero auth references — and yet IV rank is dead on any install without a broker, because
the calendar that ages the reading cannot be fetched.

### The market-data provider is already an authenticated trading-API client

This needs no new credential, no new secret, and no new vendor. `MarketDataProvider` already
spans three upstreams behind one interface:

| Upstream                           | Serves                           |
| ---------------------------------- | -------------------------------- |
| `data.alpaca.markets`              | quotes, option snapshots         |
| `paper-api.alpaca.markets`         | option contracts / open interest |
| `wss://stream.data.alpaca.markets` | streaming                        |

`alpaca-market-data.ts:211` already calls the **trading** host with its own credentials for
the open-interest lookup, and `alpaca-hosts.ts` says so outright: the trading base URL is
_"shared by the settings connection test and the market-data provider's open-interest
lookup."_ `/v2/calendar` and `/v2/clock` are on that same host, behind the same key pair.

So this is pure layering. A fourth upstream behind the same port is the established pattern
here, not a new concession.

### The rule this story establishes

Recorded in `CLAUDE.md`:

> **The broker is optional; the app must be fully usable as a journal without one.**
> `BrokerProvider` answers facts about _your account_ — `getAccountInfo`, `getActivities` —
> and nothing else may depend on it. Facts about _the market_ belong on
> `MarketDataProvider`, even when the vendor serves them from a broker-flavoured host and
> even when a second upstream or service is needed to answer them.

The interface is defined by what the consumer needs, not by which host answers. Whether a
capability takes one call, two, or a different vendor entirely is the adapter's problem —
hiding exactly that is what the adapter is for. If the calendar one day comes from a
dedicated calendar service, it still belongs on this port.

### Why the bootstrap problem mostly evaporates

`refreshTradingCalendar` currently has exactly one caller — inside `collectIVRSnapshots`, the
daily job registered at `afterClose + 60min`. On a fresh install `trading_session` is empty,
so **no** reading can be aged, and the whole IV column is dead until that job first runs.

**Observed 2026-09-13 (a Sunday), Alpaca paper credentials saved, chains pulling normally:**
`trading_session` 0 rows, `ivr_snapshot` 0 rows, and
`"Trading calendar has never been fetched; IVR freshness is unavailable"` firing on every
`watchlist_snapshot_built`.

Once the calendar is a market-data capability, the provider that needs it is already
constructed on the path that needs it — the bench builds a snapshot and pulls quotes on
every render. The refresh rides along with the read it serves, instead of waiting on an
unrelated nightly job that is gated on market hours.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has saved market-data credentials
  And no broker credentials are saved
  And the watchlist contains KO

Scenario: IV rank is judged without a broker
  Given KO has an IV rank recorded at the previous close
  And the trading calendar has never been fetched
  When the trader opens the Watchlist page
  Then the trading calendar is fetched from the market-data provider
  And the KO IV rank is shown with its freshness ring
  And no "calendar has never been fetched" warning is logged

Scenario: The market-status pill resolves without a broker
  When the trader opens the Watchlist page
  Then the market-status pill shows the current session state
  And it does not show an unresolved or error state

Scenario: A fresh install does not wait for the nightly collection
  Given the trading calendar has never been fetched
  And the scheduled IVR collection has never run
  When the trader opens the Watchlist page
  Then the trading calendar is fetched
  And a reading collected afterwards is aged rather than read as unreadable

Scenario: The calendar is not refetched on every render
  Given the trading calendar was fetched today
  When the trader opens the Watchlist page twice
  Then the calendar is fetched no more than once

Scenario: A calendar failure degrades IV freshness only
  Given the market-data provider fails to return a calendar
  When the trader opens the Watchlist page
  Then every saved stock is still listed with its ticker, thesis and price
  And each IV rank reads "n/a"
  And the failure is logged at warn level
  And no error is surfaced to the trader

Scenario: A calendar failure is not reported as a market-data outage
  Given the market-data provider fails to return a calendar
  And quotes and chains are served normally
  When the trader opens the Watchlist page
  Then the bench does not show the "Market data unavailable" notice
  And stocks that meet their criteria are still listed under "Meets criteria"

Scenario: Assignment detection still requires a broker
  Given no broker credentials are saved
  When the trader opens the app
  Then no assignment detection runs
  And the absence of a broker is not reported as a market-data problem

Scenario: Collection still refreshes the calendar on its own schedule
  Given the trading calendar was last fetched eight days ago
  When the scheduled IVR collection fires
  Then the trading calendar is refreshed
```

---

## Technical Notes

- **Move both capabilities, not just the calendar.** `getMarketCalendar` **and**
  `getMarketStatus` move from `BrokerProvider` to `MarketDataProvider`. Leaving the status
  behind would keep the bench header gated on the broker and leave the rule half-applied.
  `BrokerProvider` is then exactly `getAccountInfo` + `getActivities`.
- **Keep them separate methods.** The calendar is reference data on a 7-day refresh; status
  is a live poll on a 60-second interval. Same port, different cadence, different failure
  handling. Do not fold one into the other.
- **Errors must stay attributable.** A calendar failure degrades IV freshness only. It must
  not surface as the bench's "Market data unavailable" outage card, which is driven by
  `screener:results` returning `provider_unavailable` — that distinction is US-66's and the
  US-96 review already caught one case of an outage inventing a verdict.
- **The IPC channel renames.** `broker:market-status` becomes market-data-backed. Either
  rename it to `market-data:market-status` (cleaner, touches the preload, the renderer's
  `api/broker.ts`, `useMarketStatus`, and `brokerQueryKeys.marketStatus`) or keep the channel
  name and swap its service. Prefer the rename: leaving a market fact on a `broker:` channel
  re-creates the confusion this story exists to remove.
- **Where the refresh fires is the remaining open question.** With the provider already
  constructed by the bench, the cheapest correct option is to refresh alongside the snapshot
  build, fired-and-forgotten, so the read path stays synchronous. US-98's ADR "Read never
  fetches" still stands — `readTradingCalendar` must not become async or network-bound, or
  the bench hangs on a provider.
- **The existing 7-day throttle does most of the work.** `refreshTradingCalendar` already
  refreshes at most weekly over a 120-day-back / 400-day-ahead window, so the added call is a
  no-op in steady state.
- **The test seam moves with it.** `FakeBrokerProvider.getMarketCalendar` and the
  `brokerCalendar` / `weekdayCalendar` fixtures currently drive the entire US-98 e2e suite
  from the fake broker; they move to the fake market-data provider. The `fallbackBroker` stub
  in `scheduler-instance.ts` exists only to answer `getMarketCalendar` and should disappear.
- **Collection stays gated on the session.** This story changes where the calendar comes
  from, not when IVR is collected — that is US-100.

---

## Out of Scope

- **When IVR is collected** (US-100) — on-add and explicit triggers are that story. This one
  changes only whether a collected reading can be interpreted, and by whom it is served.
- **The freshness tiers, rings and tooltip copy** (US-98). Boundaries and treatment unchanged.
- **Per-contract implied volatility on the position cockpit** (US-117) — a different value
  from a different path, needing no calendar at all.
- **`getAccountInfo` / `getActivities`** and assignment detection. Those are genuinely
  account facts and stay on the broker, where a missing broker correctly disables them.
- The Barchart scraper (US-43), its pacing, or its session handling.
- Adding a non-Alpaca calendar source. The point is the port, not the vendor.

---

## Dependencies

- **US-98:** introduced `trading_session`, `refreshTradingCalendar`, and the freshness engine
  whose calendar this story re-homes
- **US-99:** the Alpaca market-data adapter that already authenticates against the trading
  host and gains these two capabilities
- **US-96:** the bench is where both the dead IV column and the market-status pill are visible
- **Pairs with US-100:** US-100 makes readings exist; this makes them legible, and removes the
  broker from the path entirely. A fresh install needs both before IV rank works

---

## Estimate

5 points
