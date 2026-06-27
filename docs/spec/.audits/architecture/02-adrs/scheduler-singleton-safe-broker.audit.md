---
page: docs/spec/architecture/02-adrs/scheduler-singleton-safe-broker.md
audited_at: 2026-06-27
findings: 2
---

# Audit: scheduler-singleton-safe-broker.md

## Verified (4)

- ✓ `src/main/services/scheduler-instance.ts` exports a module-level `scheduler` const — `scheduler-instance.ts:26`.
- ✓ `getSafeBroker()` wraps `brokerFactory.create()` in try/catch and returns a stub on failure — `scheduler-instance.ts:18-24`.
- ✓ Safe-broker stub returns `[]` from `getActivities` — `scheduler-instance.ts:14` (`getActivities: () => Promise.resolve([])`).
- ✓ Safe-broker stub reports `session: 'closed'` — via `getMarketStatus` returning `closedMarketStatus` with `session: 'closed'` (`scheduler-instance.ts:7`).

## Drift (2)

- ✗ Page claims `const scheduler = createPollingScheduler(getSafeBroker())` (calling the function), but the code passes the function reference uninvoked: `createPollingScheduler(getSafeBroker)` (`scheduler-instance.ts:26`). The scheduler receives a broker _factory_, not a constructed broker. Suggested fix: update the ADR to `createPollingScheduler(getSafeBroker)`.
- ✗ Page describes the stub as returning `session: 'closed'` as if it were a direct broker property; in code `session: 'closed'` lives inside the `closedMarketStatus` object returned by `getMarketStatus`, and the stub's `getAccountInfo` _rejects_ (`Promise.reject(new Error('Broker not configured'))`) — a behavior the ADR does not mention. Minor; suggested fix: note the getAccountInfo rejection.

## Unverifiable (3)

- ? "Node's module cache guarantees singleton semantics across imports" — runtime/narrative claim.
- ? "the current singleton has worked through 1228 tests" — historical metric, not auditable.
- ? Alternative `resetSchedulerForTests()` / lazy `getScheduler()` deferral (code-review Area H1) — narrative on deferred work; `resetSchedulerForTests` not found in `scheduler-instance.ts`.

## Missing files (0)

- `plans/us-35/...` cited as source — plan references, not code claims.
