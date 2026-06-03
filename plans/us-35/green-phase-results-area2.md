# Green Phase Results: Area 2 — Migrations (pending_assignments + app_settings)

## Feature Context

- **Feature directory**: `plans/us-35/`
- **Plan file**: `plans/us-35/plan.md`
- **Red phase results**: `plans/us-35/red-phase-results-area2.md`

## Implementation Files Created/Modified

- `migrations/006_create_pending_assignments.sql` — new: creates `pending_assignments` table with status/position indexes
- `migrations/007_create_app_settings.sql` — new: creates `app_settings` key/value table
- `src/main/db/migrate.test.ts` — updated: added `insertLeg` helper; updated `records applied migrations` and `creates all three domain tables` assertions to include the two new migrations; fixed UNIQUE constraint test to seed valid FK rows

## Schema Implemented

```sql
-- 006
CREATE TABLE IF NOT EXISTS pending_assignments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id     TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  leg_id          TEXT NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  activity_id     TEXT NOT NULL UNIQUE,
  broker_symbol   TEXT NOT NULL,
  qty             INTEGER NOT NULL,
  transaction_time TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending','confirmed','dismissed')),
  detected_at     TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at    TEXT,
  dismissed_at    TEXT
);

-- 007
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## Key Design Decision

The data-model.md specified `position_id INTEGER` and `leg_id INTEGER`, but the existing schema uses `TEXT` primary keys for `positions` and `legs`. Changed to `TEXT` to maintain FK referential integrity — otherwise every insert would fail the FK constraint enforced by better-sqlite3's default `PRAGMA foreign_keys = ON`.

## Test Execution Results

```
PASS src/main/db/migrate.test.ts (11 tests) — 11 passed
PASS (full suite) — 1187 passed, 106 test files
```

## Quality Checks

- ✅ `pnpm test` — 1187/1187 passed
- ✅ `pnpm lint` — 0 errors, 0 warnings
- ✅ `pnpm typecheck` — clean

## Known Limitations / Tech Debt

None — migrations are SQL files with no logic to refactor.
