# Red Phase Results: Area 2 — Migrations (pending_assignments + app_settings)

## Feature Context

- **Feature directory**: `plans/us-35/`
- **Plan file**: `plans/us-35/plan.md`
- **Data model**: `plans/us-35/data-model.md`

## Test Files Modified

- `src/main/db/migrate.test.ts` — extended with 3 new tests for migrations 006 and 007

## Interfaces Under Test

```sql
-- migrations/006_create_pending_assignments.sql
CREATE TABLE IF NOT EXISTS pending_assignments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id     INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  leg_id          INTEGER NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  activity_id     TEXT NOT NULL UNIQUE,
  broker_symbol   TEXT NOT NULL,
  qty             INTEGER NOT NULL,
  transaction_time TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending','confirmed','dismissed')),
  detected_at     TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at    TEXT,
  dismissed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_pending_assignments_status ON pending_assignments(status);
CREATE INDEX IF NOT EXISTS idx_pending_assignments_position ON pending_assignments(position_id);

-- migrations/007_create_app_settings.sql
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## Test Coverage

- [x] Migration 006 creates `pending_assignments` table
- [x] `activity_id` UNIQUE constraint is enforced
- [x] `idx_pending_assignments_status` index exists on `pending_assignments`
- [x] `idx_pending_assignments_position` index exists on `pending_assignments`
- [x] Migration 007 creates `app_settings` table
- [x] `key` PRIMARY KEY constraint is enforced (duplicate key throws)

## Test Execution Results

```
FAIL src/main/db/migrate.test.ts (11 tests | 3 failed)
  ✓ creates all three domain tables
  ✓ records applied migrations
  ✓ is idempotent — running twice does not error
  ✓ accepts STOCK as a valid instrument_type in legs after all migrations
  ✓ rejects BOND as an invalid instrument_type in legs after all migrations
  ✓ cost_basis_snapshots has trigger_event column after migration 004
  ✓ removes the option_type column from legs after all migrations
  ✓ migration 005 adds profit_target_percent column to positions table
  × migration 006 creates pending_assignments table with UNIQUE(activity_id) constraint
    AssertionError: expected undefined to be defined
  × migration 006 creates index on status and on position_id
    AssertionError: expected [] to include 'idx_pending_assignments_status'
  × migration 007 creates app_settings table with PRIMARY KEY(key)
    AssertionError: expected undefined to be defined
```

## Verification

- ✅ All 3 new tests fail because migration files don't exist yet
- ✅ All 8 pre-existing tests continue to pass
- ✅ No syntax errors or test bugs

## Notes

- Foreign keys are not enabled in the test db (`PRAGMA foreign_keys` is off by default), so the UNIQUE constraint tests insert rows with arbitrary integer `position_id`/`leg_id` values without needing real parent rows.
- The `records applied migrations` test will need updating in Green phase to include `006_create_pending_assignments.sql` and `007_create_app_settings.sql`.
