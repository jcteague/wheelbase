---
page: docs/spec/architecture/02-adrs/pending-assignments-compound-unique.md
audited_at: 2026-09-28
findings: 1
---

# Audit: pending-assignments-compound-unique.md

## Verified (4)

- ✓ `CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_assignments_activity_position ON pending_assignments(activity_id, position_id)` — `migrations/008_create_pending_assignments.sql:19-20`.
- ✓ No column-level `UNIQUE` on `activity_id` — `migrations/008_create_pending_assignments.sql:5` (`activity_id TEXT NOT NULL`).
- ✓ Writes use `INSERT OR IGNORE INTO pending_assignments` — `src/main/services/detect-assignments.ts:117`.
- ✓ Schema page `../../schema/tables.md` has a `pending_assignments` section (`tables.md:397`); feature page `us-35-assignment-detection.md` exists.

## Drift (0)

None.

## Unverifiable (2)

- ? Multi-CSP collision scenario rationale — design intent.
- ? "Fixed in-place via migration 008 edit (no shipped data to preserve)" — history.

## Missing files (1)

- ✗ Source `plans/us-35/code-review-fixes.md` — `plans/us-35/` no longer exists.
