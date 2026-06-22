# ADR: The IVR collector owns the batch throttle boundary

<!-- generated:from us-44 -->

## Decision

`collectIVRSnapshots(...)` enforces the 1 request/second politeness rule at the collector layer, even though `fetchIVR` already rate-limits internally.

## Why

US-44 requires the collector itself to own the cadence so concurrent callers cannot bypass spacing guarantees by interleaving scraper calls. A sequential collector loop with an explicit sleep boundary makes the whole batch deterministic and guarantees the request spacing across scheduled and manual invocations alike.

This keeps the batch semantics visible at the orchestration layer, where success/error/skipped counters are also computed.

## Alternatives considered

- **Rely only on the scraper's module-level limiter** — rejected because separate collector invocations could still interleave in ways the story forbids.
- **Parallelize the batch and trust vendor tolerance** — rejected because the explicit requirement is a polite 1 request/second cadence.

## Source

- `plans/us-44/research.md`
- `src/main/services/ivr-collector.ts`
- Feature page: `../../features/us-44-ivr-snapshot-store-and-scheduler.md`
<!-- /generated -->
