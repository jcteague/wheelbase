# ADR: Non-trading-day IVR guard lives in the collector

<!-- generated:from us-44,us-98 -->

## Decision

The weekend/holiday guard runs at the top of `collectIVRSnapshots(...)`, short-circuiting
the batch before any network fetch and returning `skippedReason = 'market_closed'`.

**Amended by [us-98](../../features/us-98-ivr-staleness-tiers.md):** the verdict now comes
from the cached exchange calendar, not from the broker's clock. The collector refreshes
`trading_session` when a broker is configured, then calls `getTradingSession` for today's
Eastern date:

| Calendar verdict | Behaviour                                             |
| ---------------- | ----------------------------------------------------- |
| `closed`         | skip, with the existing `market_closed` batch summary |
| `unavailable`    | warn and collect best-effort                          |
| `open`           | collect                                               |

`BrokerProvider.getMarketStatus()` is no longer consulted here, and `isTradingDay` and
`fetchMarketStatusOrNull` are deleted. The broker argument is now **optional** and is used
only to refresh the calendar.

## Why

US-44 requires the guard to protect both the scheduled after-close path and the manual
Settings trigger. Keeping the check in the collector means both entry points share one
code path, one batch-summary shape, and one logging decision.

US-98 changed the _source_ of the verdict because the old one was wrong in the case that
mattered. A missing or failing broker was treated as "assume trading day", so a holiday
run still fetched and overwrote the previous good reading — and a UTC weekday check
disagrees with the exchange's own calendar for part of every evening. Reading the cached
calendar also means a brokerless watchlist-only trader gets a correct guard rather than an
optimistic one.

## Alternatives considered

- **Rely only on `afterClose` scheduling** — rejected because the manual trigger must also
  be safe on weekends and holidays.
- **Put the guard only in the IPC handler** — rejected because that would leave the
  scheduled path with different behavior.
- **Keep the broker market-status check** (us-98) — rejected: it cannot answer for a
  brokerless install, and its fallback silently collected on closures.

## Source

- `plans/us-44/research.md`
- [extract: us-98](../../.extracts/us-98.md) — ADR "The collector's non-trading-day guard moves from the broker clock to the calendar"
- `src/main/services/ivr-collector.ts`
- `src/main/services/trading-calendar-store.ts`
- `src/main/index.ts`
- Feature pages: [us-44](../../features/us-44-ivr-snapshot-store-and-scheduler.md),
[us-98](../../features/us-98-ivr-staleness-tiers.md)
<!-- /generated -->
