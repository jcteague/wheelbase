# ADR: Non-trading-day IVR guard lives in the collector

<!-- generated:from us-44 -->

## Decision

The weekend/holiday guard runs at the top of `collectIVRSnapshots(...)`, using `BrokerProvider.getMarketStatus()` to short-circuit the batch before any network fetches and return `skippedReason = 'market_closed'`.

## Why

US-44 requires the guard to protect both the scheduled after-close path and the manual Settings trigger. Keeping the check in the collector means both entry points share one code path, one batch-summary shape, and one logging decision.

It also keeps the scheduler registration simple: the job handler just resolves the active broker and calls the collector.

## Alternatives considered

- **Rely only on `afterClose` scheduling** — rejected because the manual trigger must also be safe on weekends and holidays.
- **Put the guard only in the IPC handler** — rejected because that would leave the scheduled path with different behavior.

## Source

- `plans/us-44/research.md`
- `src/main/services/ivr-collector.ts`
- `src/main/index.ts`
- Feature page: `../../features/us-44-ivr-snapshot-store-and-scheduler.md`
<!-- /generated -->
