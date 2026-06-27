# ADR: Alert evaluation reuses the US-46 scheduler with an interval cadence

<!-- generated:from us-50 -->

## Decision

A single job `alert-evaluation` (`ALERT_EVAL_JOB_NAME`) is registered on the shared `scheduler` singleton in `src/main/index.ts` with cadence `{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }`. The handler resolves `db` (already in scope) and calls `evaluateAlerts`. Because the DTE rules require no broker credentials, the job is **not** broker-gated — unlike `detect-assignments`.

## Why

The epic and story both mandate reusing the [US-46 polling scheduler](../../features/us-46-polling-scheduler.md) rather than introducing a second scheduling mechanism. The interval cadence matches the market-data polling cadence; `marketClosedMs: null` parks the job while the market is closed and the scheduler resumes it on the next open.

## Alternatives considered

- **A second `afterClose` cadence like the IVR collector** — rejected; alerts must reflect intraday state on the polling cadence, not once after close.

## Source

- `plans/us-50/plan.md`, `plans/us-50/research.md`
- Feature pages: `../../features/us-50-alert-engine.md`, `../../features/us-46-polling-scheduler.md`
<!-- /generated -->
