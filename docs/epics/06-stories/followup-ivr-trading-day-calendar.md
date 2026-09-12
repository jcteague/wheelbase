# Follow-up: IVR collector should detect weekday market holidays

**Status:** ✅ Resolved by US-98 (2026-09-10)
**Source:** US-44 code review, 2026-06-20
**Area:** `src/main/services/ivr-collector.ts`, `src/main/integrations/broker-provider.ts`

> **Resolution.** Implemented as recommended below, with one addition: the calendar is
> **cached**, not fetched per check.
>
> - `BrokerProvider.getMarketCalendar(range)` returns the venue's own sessions
>   (`{ date, close }`, Eastern wall clock; closed days simply absent).
>   `AlpacaBrokerProvider` implements it over the SDK's `getCalendar({ start, end })`;
>   `FakeBrokerProvider` generates weekdays or reads `FAKE_BROKER_CALENDAR`.
> - Sessions land in the new `trading_session` table (migration `015`), written only by
>   `refreshTradingCalendar`. Closures are stored explicitly as a NULL `close_at`, so
>   coverage is derivable and an unfetched day reads as **unknown** rather than as a
>   closure. Reads never fetch — a screen must not hang on the broker, and a brokerless
>   install still gets a correct guard from what was cached.
> - `collectIVRSnapshots` refreshes (when a broker exists) then asks
>   `getTradingSession` for today's Eastern date. `isTradingDay` and
>   `fetchMarketStatusOrNull` are deleted; the broker argument is now optional.
>
> Regression coverage: `e2e/ivr-collector.spec.ts` — "A recognised weekday holiday skips
> collection with no fetch" and "The holiday guard still holds with no broker
> configured". See [the spec's ADR](../../spec/architecture/02-adrs/trading-calendar-fetched-and-cached.md)
> and [us-98](../../spec/features/us-98-ivr-staleness-tiers.md).
>
> **Still open:** the optional `PollingScheduler.runNow` error-propagation cleanup at the
> foot of this page was not taken up — it touches shared US-46 infrastructure.

## Problem

`collectIVRSnapshots` decides whether today is a trading day with a local heuristic:

```ts
function isTradingDay(now: Date, session: MarketStatus['session']): boolean {
  if (session !== 'closed') return true
  const day = now.getUTCDay()
  return day !== 0 && day !== 6 // only weekends are treated as non-trading
}
```

`MarketStatus.session` is `'closed'` for **both** after-hours on a trading day and a
full market holiday (the broker `getClock()` endpoint exposes no holiday flag). The
weekend check only rejects Saturday/Sunday, so a **weekday market holiday**
(Thanksgiving, Good Friday, Juneteenth, etc.) is misclassified as a trading day.

## Impact

- On a weekday holiday, a **manual** `Refresh IVR now` proceeds to scrape Barchart —
  violating the AC "today is a recognised market holiday or weekend → exits without
  making any network requests."
- **Not** a data-integrity issue: rows written are well-formed, and the same-day
  overwrite is scoped to the holiday's own UTC date, so prior trading-day snapshots
  are never clobbered. The only residue is an extra snapshot row dated on a
  non-trading day holding a repeat of the last trading day's value.
- The **scheduled** `afterClose` job is unaffected: its cadence keys off the broker's
  `nextClose`, which on a holiday already points to the next trading day, so it does
  not fire on holidays.

## Recommended fix (right altitude)

Add a trading-calendar capability to `BrokerProvider` instead of the local weekend
heuristic:

- `BrokerProvider.isTradingDay(date): Promise<boolean>` (or `getCalendar`).
- `AlpacaBrokerProvider` implements it via the Alpaca SDK calendar endpoint
  (`getCalendar({ start, end })`), which already excludes weekends **and** holidays.
- `FakeBrokerProvider` answers from a fixture/env so e2e and unit tests stay offline.
- `collectIVRSnapshots` asks the broker rather than computing trading days itself
  (removes the special-case calendar logic from the service layer).

## Optional related cleanup

While in this code, consider making `PollingScheduler.runNow` propagate handler
errors so the manual `ivr:collect-now` trigger surfaces the real `BrokerError`
(e.g. "Alpaca credentials not configured") through `handleIpcCall`'s existing
`BrokerError` branch, instead of the generic validation error the US-44 batch-schema
guard now produces. This touches shared US-46 infrastructure, so it was left out of
the US-44 fix.
