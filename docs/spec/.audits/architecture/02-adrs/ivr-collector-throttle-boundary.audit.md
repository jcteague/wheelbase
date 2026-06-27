---
page: docs/spec/architecture/02-adrs/ivr-collector-throttle-boundary.md
audited_at: 2026-06-27
findings: 0
---

# Audit: ivr-collector-throttle-boundary.md

## Verified (3)

- ✓ `collectIVRSnapshots(...)` exists in `src/main/services/ivr-collector.ts:104`.
- ✓ The collector enforces 1 req/sec at its own layer: `sleepBetweenRequests(clock, index, total)` calls `clock.sleep(1000)` (`ivr-collector.ts:98-100`) and is invoked once per underlying in a sequential loop (`:152`).
- ✓ `fetchIVR` (the scraper, `src/main/integrations/barchart-ivr-scraper`) is imported and called per-underlying, consistent with the ADR's "even though fetchIVR already rate-limits internally" framing.

## Drift (0)

## Unverifiable (0)

- The "concurrent callers cannot bypass spacing" rationale is design narrative supported by the sequential-loop-with-sleep implementation; the mechanical claim (sleep boundary in collector) is verified above.

## Missing files (0)

- ✓ `src/main/services/ivr-collector.ts` exists. `../../features/us-44-ivr-snapshot-store-and-scheduler.md` exists.

One-line: Audited ivr-collector-throttle-boundary.md: 3 verified, 0 drift, 0 unverifiable, 0 missing.
