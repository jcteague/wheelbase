# Follow-up: IVR collector should detect weekday market holidays

**Status:** Backlog (deferred from US-44)
**Source:** US-44 code review, 2026-06-20
**Area:** `src/main/services/ivr-collector.ts`, `src/main/integrations/broker-provider.ts`

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
