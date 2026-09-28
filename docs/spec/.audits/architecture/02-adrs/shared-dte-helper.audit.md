---
page: docs/spec/architecture/02-adrs/shared-dte-helper.md
audited_at: 2026-09-28
findings: 1
---

# Audit: shared-dte-helper.md

## Verified (5)

- ✓ `src/main/core/dte.ts` exports `computeDte(expiration: string | null, now: Date = new Date()): number | null` — line 13.
- ✓ Implemented with `date-fns` `differenceInCalendarDays` — `dte.ts:4,15`.
- ✓ `list-positions.ts` imports it (`src/main/services/list-positions.ts:6`) and has no private copy.
- ✓ Alert engine input builder consumes it — `src/main/services/evaluate-alerts.ts:15,137` (also reused by `src/main/core/screener.ts:8,448`).
- ✓ Feature link `../../features/us-50-alert-engine.md` exists.

## Drift (0)

None.

## Unverifiable (1)

- ? US-52 consistency rationale — narrative; source `plans/us-50/research.md` is historical (dir not present, by design).

## Missing files (0)

None.
