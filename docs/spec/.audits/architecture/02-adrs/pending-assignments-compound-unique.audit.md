---
page: docs/spec/architecture/02-adrs/pending-assignments-compound-unique.md
audited_at: 2026-06-27
findings: 1
---

# Audit: pending-assignments-compound-unique.md

## Verified (4)

- ✓ Compound unique index `uq_pending_assignments_activity_position ON pending_assignments(activity_id, position_id)` exists at `migrations/008_create_pending_assignments.sql:19-20`.
- ✓ Not a column-level `UNIQUE(activity_id)` — table definition has no such constraint (`migrations/008_create_pending_assignments.sql:1-13`).
- ✓ `INSERT OR IGNORE INTO pending_assignments` is used at write time (`src/main/services/detect-assignments.ts:117`).
- ✓ Migration test asserts the compound `UNIQUE(activity_id, position_id)` (`src/main/db/migrate.test.ts:180`).

## Drift (1)

- ✗ Alternatives section claims the single-column UNIQUE was "Fixed in-place via migration **006** edit (no shipped data to preserve)." The index actually lives in migration **008** (`migrations/008_create_pending_assignments.sql`); migration 006 is `006_add_credential_settings.sql` (creates `app_settings`). The pending_assignments table was introduced fresh in 008, so the "fixed in 006" reference is wrong. Suggested fix: update the page to reference migration 008.

## Unverifiable (0)

## Missing files (0)
