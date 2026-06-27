---
page: docs/spec/architecture/02-adrs/ivr-same-day-overwrite-delete-then-insert.md
audited_at: 2026-06-27
findings: 0
---

# Audit: ivr-same-day-overwrite-delete-then-insert.md

## Verified (4)

- ✓ `ivr_snapshot` PRIMARY KEY is `(underlying, observed_at)` (`migrations/007_create_ivr_snapshot.sql:8`).
- ✓ Collector deletes existing rows for the same underlying on the same UTC calendar date: `DELETE FROM ivr_snapshot WHERE underlying = ? AND observed_at >= ? AND observed_at < ?` using `utcDayBounds(result.data.observedAt)` (`src/main/services/ivr-collector.ts:74-78`).
- ✓ Delete-then-insert runs inside one transaction: `db.transaction(() => { deleteExisting.run(...); insertSnapshot.run(...) })()` (`ivr-collector.ts:85-95`).
- ✓ Insert preserves the precise winning `observed_at` (`result.data.observedAt` passed to INSERT, `ivr-collector.ts:88`), matching "preserving the exact observation timestamp."

## Drift (0)

## Unverifiable (0)

## Missing files (0)

- ✓ `src/main/services/ivr-collector.ts` and `../../features/us-44-ivr-snapshot-store-and-scheduler.md` exist.

One-line: Audited ivr-same-day-overwrite-delete-then-insert.md: 4 verified, 0 drift, 0 unverifiable, 0 missing.
