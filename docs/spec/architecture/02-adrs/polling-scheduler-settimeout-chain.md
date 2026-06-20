# ADR: PollingScheduler uses a setTimeout chain, not setInterval

<!-- generated:from us-35 -->

## Decision

Each registered scheduler job manages its own `setTimeout` chain: after `handler` settles, schedule the next tick with `setTimeout(..., cadenceMs)`. No `setInterval` is used.

## Why

`setInterval` does not respect async handlers and can stack runs if a tick takes longer than the interval. setTimeout chains naturally serialise — the next tick is only queued once the previous one resolves (or rejects, with a logged WARN). The pattern also composes cleanly with per-tick decisions like "what cadence applies right now given current market session?", because each tick can re-read state before scheduling its successor.

A side benefit: system sleep cannot accumulate missed ticks. When the OS suspends a process, only one pending setTimeout exists per job at any moment, so wake-up fires at most one belated tick — no burst of catch-up runs.

## Alternatives considered

- **`node-cron`** — overkill for the use case, adds a dependency, and is a weak fit for "interval, but only during market hours."
- **rxjs `interval()`** — would work, but the project does not already use rxjs; chose plain primitives to keep cognitive load low.

## Source

- `plans/us-35/research.md`, `plans/us-35/green-phase-results.md`
- Feature page: `../../features/us-46-polling-scheduler.md`
<!-- /generated -->
