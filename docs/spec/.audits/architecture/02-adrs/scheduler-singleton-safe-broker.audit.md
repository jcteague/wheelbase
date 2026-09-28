---
page: docs/spec/architecture/02-adrs/scheduler-singleton-safe-broker.md
audited_at: 2026-09-28
findings: 2
---

# Audit: scheduler-singleton-safe-broker.md

## Verified (8)

- ✓ Superseded-in-part banner: `getSafeBroker`, `fallbackBroker`, `brokerFactory` import are gone — grep of `src/` finds no `getSafeBroker`/`fallbackBroker`; `scheduler-instance.ts` imports only `marketDataFactory` (`src/main/services/scheduler-instance.ts:1-8`).
- ✓ `createPollingScheduler(getStatusSource: () => MarketStatusSource, ...)` — `src/main/services/polling-scheduler.ts:111-114`; `MarketStatusSource = Pick<MarketDataProvider, 'getMarketStatus'>` — `market-data-provider.ts:154`.
- ✓ `export const scheduler = createPollingScheduler(() => statusSource)` at module load — `scheduler-instance.ts:37`.
- ✓ `statusSource.getMarketStatus` wraps `marketDataFactory.create().getMarketStatus()` — `scheduler-instance.ts:23-35`.
- ✓ Only `MarketDataError` with code `auth_failed` degrades to `{ isOpen: false, session: 'closed' }`, logged at `debug`; others rethrow — `scheduler-instance.ts:13-18,28-32`.
- ✓ Other failures hit the scheduler's "falling back to default cadence" branch — `polling-scheduler.ts:171-182`.
- ✓ Known limitation: synthetic `nextOpen` stamped at module load (`scheduler-instance.ts:16`); `parkUntilNextOpen` takes a `warn` + `scheduleTick(state, marketOpenMs)` fallback for a non-positive delay — `polling-scheduler.ts:152-167`; `decideNextCadenceMs` returns `number | null` — line 53.
- ✓ Links `./market-status-pill.md`, `../../features/us-116-market-facts-from-market-data-provider.md`, `../../features/us-46-polling-scheduler.md`, `../../.extracts/us-116.md` all exist.

## Drift (1)

- ✗ Alternatives (line 31) refers to the current test ergonomics as `resetSchedulerForTests()`, but no symbol by that name exists in `src/` or `e2e/` (grep returns nothing). Suggested fix: name the actual reset mechanism or drop the reference.

## Unverifiable (1)

- ? "worked through 1228 tests" and deferred Area H1 from `plans/us-35/code-review-fixes.md` — historical/narrative; plan dir not present (by design).

## Missing files (0)

None.
