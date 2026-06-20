# ADR: PollingScheduler is stateless — handlers own their own watermarks

<!-- generated:from us-35 -->

## Decision

The `PollingScheduler` keeps no persisted state. No `last_run_at` column, no settings rows, no on-disk registry. Each handler is responsible for its own cross-poll memory.

## Why

Mixing scheduler state with handler state would couple every consumer to the scheduler's storage layout. Today's first consumer (US-35 detect-assignments) needs an `assignments_last_poll_at` watermark; tomorrow's IVR collector (US-44) needs a different shape entirely. Keeping the scheduler dumb means it composes with arbitrary handlers without dictating their persistence model.

The scheduler's only in-memory state is the per-job timer id and an invocation counter (visible via `getRegistry()` for tests and diagnostics).

## Alternatives considered

- **Universal `last_run_at` per job** — pushed back; not every handler cares, and the ones that do need richer state than a single timestamp (US-35 needs a per-environment watermark; future jobs may need cursors).

## Source

- `plans/us-35/research.md`
- Feature pages: `../../features/us-46-polling-scheduler.md`, `../../features/us-35-assignment-detection.md`
<!-- /generated -->
