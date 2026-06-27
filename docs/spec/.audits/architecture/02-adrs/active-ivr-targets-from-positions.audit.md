---
page: docs/spec/architecture/02-adrs/active-ivr-targets-from-positions.md
audited_at: 2026-06-27
findings: 0
---

# Audit: active-ivr-targets-from-positions.md

## Verified (4)

- ✓ Collector lives at `src/main/services/ivr-collector.ts` (cited).
- ✓ Targets derived from `positions` via `SELECT ticker ... WHERE status != 'CLOSED'` — `ivr-collector.ts:32-34`.
- ✓ Normalizes to uppercase and de-duplicates: `[...new Set(rows.map((row) => row.ticker.toUpperCase()))]` — `ivr-collector.ts:52`.
- ✓ Sorted for deterministic order: `.sort(...)` applied after de-dup — `ivr-collector.ts:52`.

## Drift (0)

None.

## Unverifiable (1)

- ? Rationale about avoiding `listPositions()` derived fields — design narrative; the negative ("does not reuse listPositions") is consistent with the direct query observed, no drift.

## Missing files (0)

None.
