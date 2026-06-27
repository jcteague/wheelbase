---
page: docs/spec/architecture/02-adrs/shared-dte-helper.md
audited_at: 2026-06-27
findings: 0
---

# Audit: shared-dte-helper.md

## Verified (5)

- ✓ Pure helper in new `src/main/core/dte.ts` — file exists.
- ✓ Signature `computeDte(expiration: string | null, now?: Date): number | null` — `src/main/core/dte.ts:11` (`computeDte(expiration: string | null, now: Date = new Date()): number | null`).
- ✓ Implemented with `date-fns` `differenceInCalendarDays` on a calendar-day basis — `dte.ts:4,13` (`differenceInCalendarDays(parseISO(expiration), now)`).
- ✓ `list-positions.ts` consumes it — `src/main/services/list-positions.ts:6` imports `computeDte` from `../core/dte`; used at `:78`.
- ✓ The alert engine's input builder consumes it — `src/main/services/evaluate-alerts.ts:14` imports `computeDte`; used at `:62` (`dte: computeDte(row.expiration, now)`).

## Drift (0)

None. The private copy in `list-positions.ts` is gone (only the import from `core/dte` remains).

## Unverifiable (1)

- ? "US-52 requires the same DTE calculation already established..." — story-requirement rationale, narrative.

## Missing files (0)

- `plans/us-50/research.md`, feature page — references.
