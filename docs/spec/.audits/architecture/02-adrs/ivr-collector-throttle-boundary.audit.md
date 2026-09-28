---
page: docs/spec/architecture/02-adrs/ivr-collector-throttle-boundary.md
audited_at: 2026-09-28
findings: 4
---

# Audit: docs/spec/architecture/02-adrs/ivr-collector-throttle-boundary.md

## Verified (1)

- ✓ Cited `plans/us-44/research.md`, `src/main/services/ivr-collector.ts` and `docs/spec/features/us-44-ivr-snapshot-store-and-scheduler.md` exist.

## Drift (2)

- ✗ The page states in the present tense that `collectIVRSnapshots(...)` enforces a 1 request/second rule at the collector layer via "an explicit sleep boundary", on top of `fetchIVR`'s limiter. None of this exists: the collector is `collectIvHistoryBatch` (`src/main/services/ivr-collector.ts:65`), its loop has no sleep/delay (`:108-140`), and `fetchIVR` / the Barchart scraper are retired (US-121). The collector-level sleep was already removed under US-97, as recorded in `./ivr-collector-per-ticker-failure-isolation.md` lines 34-38. The page carries no superseded banner. Suggested fix: add a "Superseded" status pointing at `ivr-collector-per-ticker-failure-isolation.md` (US-97, pacing moved to the scraper) and US-121 (scraper retired).
- ✗ Rationale "guarantees the request spacing across scheduled and manual invocations alike" describes current behaviour that no longer holds; there is no spacing guarantee in `ivr-collector.ts` or `iv-history.ts` (grep for `sleep`/`delay`/`setTimeout` empty in both).

## Unverifiable (1)

- ? "US-44 requires the collector itself to own the cadence" — story-requirement history.

## Missing files (0)

None.
