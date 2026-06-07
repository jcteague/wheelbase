# Migrations

<!-- generated:from us-6,us-33,us-35 -->

## Overview

SQLite schema for Wheelbase is built up by a sequence of plain `.sql` files in
the repo's top-level `migrations/` directory. A small runner in
`src/main/db/migrate.ts` discovers every file in that directory, sorts them
by filename, and applies any that have not yet been recorded against a
tracking table inside the database itself. The runner is invoked once at
app startup before any service touches the connection.

Migrations are **filename-ordered** and, once shipped, **append-only**. New
schema work normally adds a numbered file (`NNN_short_description.sql`) — never
edits an existing one. The numeric prefix is the sort key, so the runner
replays the same sequence in the same order on every fresh database.
Idempotency comes from the tracking table: a migration that has already been
applied to this database is skipped, so it is always safe to start the app
against an existing database without manually pruning files.

> **Pre-ship in-place edits are allowed.** While the product has not shipped,
> a migration that is still in the same release as its corresponding feature
> may be edited in place rather than superseded by a follow-up migration. The
> bar is that no user database depends on the prior shape. Once any user is
> running the migration in production, the append-only rule is absolute and
> changes must go in a new numbered file. See the migration-006 entry below
> for a worked example (compound UNIQUE swap during US-35 code review).

See [`schema/tables.md`](./tables.md) for the row-level catalogue produced
by these migrations.

<!-- /generated -->

<!-- generated:from us-6,us-33,us-35 -->

## Migration runner

Implementation: `src/main/db/migrate.ts`.

- **Discovery:** read every `*.sql` file from `migrations/` at the repo
  root.
- **Order:** sort by filename (string sort). The convention is
  `NNN_short_description.sql`; the zero-padded prefix is what determines
  apply order, so always add new migrations with a fresh higher number.
- **Idempotency:** the runner maintains a migrations tracking table inside
  the same database. Before applying a file it checks the tracking table;
  if the file is already recorded, it is skipped. On a successful apply
  the runner inserts a row recording the filename.
- **When it runs:** once at app startup, before any service or IPC handler
  is registered. A failure here aborts startup — the renderer never sees a
  partially-migrated database.
- **Test coverage:** `src/main/db/migrate.test.ts`.

> The native `better-sqlite3` binding must be built against the runtime
> Node ABI before the runner can open a database. Running `pnpm test` and
> `pnpm dev` use **different** ABIs, so a rebuild dance is required when
> switching modes; this is environmental, not a property of the runner
> itself. See `CLAUDE.md` for the `electron-rebuild` / `pnpm rebuild`
> recipe.

<!-- /generated -->

<!-- generated:from us-6,us-33,us-35 -->

## Migration catalogue

### `migrations/003_rename_option_type_to_instrument_type.sql` — rename `option_type` → `instrument_type`, add `STOCK`

- **Driven by:** [us-6 — Record Assignment](../features/us-6-record-assignment.md)
- **Change scope:** the `legs` table only.
- **Field-level diff:**

  | Field            | Before                           | After                                         |
  | ---------------- | -------------------------------- | --------------------------------------------- |
  | column name      | `option_type`                    | `instrument_type`                             |
  | CHECK constraint | `option_type IN ('PUT', 'CALL')` | `instrument_type IN ('PUT', 'CALL', 'STOCK')` |

- **Why:** `OptionType` was semantically wrong once the same `legs` table
  had to carry an `ASSIGN` event marker for stock holdings. `InstrumentType`
  is the standard financial term that covers both options (`PUT`, `CALL`)
  and equities (`STOCK`) in a single discriminated enum. PMCC legs are
  still `CALL`s, so the rename alone future-proofs the field without
  introducing more values.
- **Approach inside the migration file:** SQLite ≥ 3.25.0 supports
  `ALTER TABLE legs RENAME COLUMN option_type TO instrument_type`, which
  handles the column rename in place. SQLite **cannot** modify a CHECK
  constraint in place, however, so the always-safe form (and the form the
  migration file uses) is a table rebuild:

  ```sql
  -- 1. create legs_new with the new column name and the widened CHECK
  -- 2. INSERT INTO legs_new SELECT … FROM legs   -- copies every row
  -- 3. DROP TABLE legs
  -- 4. ALTER TABLE legs_new RENAME TO legs
  -- 5. recreate any indexes that lived on the old legs table
  ```

  The rebuild path is required regardless of SQLite version because of the
  CHECK constraint change; the column rename is folded into step 1.

- **Downstream code touches (no further schema change):** every service
  SQL `INSERT` and `SELECT` against `legs` must use the new column name.
  Specifically:
  - `src/main/services/positions.ts` (`createPosition` — INSERT)
  - `src/main/services/close-csp-position.ts` (INSERT)
  - `src/main/services/expire-csp-position.ts` (INSERT)
  - `src/main/services/get-position.ts` (SELECT alias updated from
    `option_type AS optionType` to `instrument_type AS instrumentType`)
  - New service `src/main/services/assign-csp-position.ts` writes the
    `ASSIGN` leg with `instrument_type = 'STOCK'`.
- **Type-system effect:** the Zod enum `OptionType` is renamed to
  `InstrumentType` and gains `'STOCK'`; `LegRecord.optionType` becomes
  `LegRecord.instrumentType` across `src/main/schemas.ts` and every IPC
  response.
- **Source:** `migrations/003_rename_option_type_to_instrument_type.sql`

### `migrations/005_add_profit_target_percent.sql` — add nullable per-position profit-target override

- **Driven by:** [us-33 — Option Mid & Unrealized P&L](../features/us-33-option-mid-pnl.md)
- **Rationale:** Adds nullable per-position profit-target override; `NULL` = use 50% default constant.
- **Change scope:** the `positions` table only.
- **SQL:**

  ```sql
  ALTER TABLE positions
    ADD COLUMN profit_target_percent INTEGER;
  ```

- **Field-level diff:**

  | Field                   | Before          | After                           |
  | ----------------------- | --------------- | ------------------------------- |
  | `profit_target_percent` | (column absent) | `INTEGER`, nullable, no default |

- **Semantics:** `NULL` means "use the global default constant"
  (`DEFAULT_PROFIT_TARGET_PERCENT = 50` from
  `src/main/core/profit-target.ts`). Valid values when non-null are
  `1..100` inclusive. There is no DB-level `CHECK` constraint —
  validation is deferred to the service layer if/when an edit IPC ships.
  For US-33 the column is read-only and seeded only via tests/dev; no
  edit UI exists yet.
- **Approach inside the migration file:** plain `ALTER TABLE ... ADD
COLUMN`. No table rebuild required because there is no constraint
  change.
- **Downstream code touches (no further schema change):**
  - `src/main/services/list-positions.ts` (`LIST_QUERY` SELECT extended
    to include `p.profit_target_percent`; row mapper exposes
    `profitTargetPercent`).
  - `src/main/schemas.ts` extends `PositionListItem` with
    `profitTargetPercent: number | null`.
  - Renderer reads `profitTargetPercent` per row and resolves the
    effective target via `resolveProfitTarget(override)` from
    `src/main/core/profit-target.ts`.
- **Source:** `migrations/005_add_profit_target_percent.sql`

### `migrations/006_create_pending_assignments.sql` — pending assignments table + compound UNIQUE

- **Driven by:** [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md)
- **Change scope:** new table `pending_assignments` plus three indexes.
- **SQL (final shape after the in-place edit, see note below):**

  ```sql
  CREATE TABLE IF NOT EXISTS pending_assignments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id     TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    leg_id          TEXT NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
    activity_id     TEXT NOT NULL,
    broker_symbol   TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    transaction_time TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('pending','confirmed','dismissed')),
    detected_at     TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed_at    TEXT,
    dismissed_at    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_pending_assignments_status
    ON pending_assignments(status);
  CREATE INDEX IF NOT EXISTS idx_pending_assignments_position
    ON pending_assignments(position_id);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_assignments_activity_position
    ON pending_assignments(activity_id, position_id);
  ```

- **Why:** the detection job (`detect-assignments`) needs a durable place
  to record OPASN activities it matched to open CSP legs so that the
  notification banner survives app restarts and so that subsequent polls
  can `INSERT OR IGNORE` against already-seen activities. A "pending" row
  **is** the notification — confirm/dismiss are status transitions on the
  same row.
- **Key-type note:** `position_id` and `leg_id` are `TEXT` (UUIDs) to
  match the existing positions/legs schema, which uses TEXT primary keys.
  The plan originally specified INTEGER; this was corrected during the
  green phase to preserve FK referential integrity.
- **Deduplication / compound UNIQUE — in-place edit during code review:**
  the original draft used a **column-level** `UNIQUE` on `activity_id`
  alone. Code review for US-35 caught that a single OPASN activity can
  legitimately match more than one open CSP position on the same OCC
  symbol (e.g. two CSP positions on `AAPL 2026-01-19 $180 PUT`); the
  single-column UNIQUE would silently lose the second row on
  `INSERT OR IGNORE`. The fix was to drop the column-level UNIQUE and
  introduce the compound

  ```sql
  CREATE UNIQUE INDEX uq_pending_assignments_activity_position
    ON pending_assignments(activity_id, position_id);
  ```

  Because US-35 had not yet shipped and no user database held real
  `pending_assignments` rows, this change was made **in place** in
  `migrations/006_create_pending_assignments.sql` rather than as a
  follow-up `008_*.sql`. This is the project's stated policy while
  pre-release: edit the migration in place if no shipped data depends on
  the prior shape. Developers with a local sqlite file simply delete it
  and let the migration runner rebuild. Once the product ships, the
  append-only rule becomes absolute.
- **Approach inside the migration file:** plain `CREATE TABLE` + three
  `CREATE INDEX` statements. No table rebuild needed — the table is new.
- **Downstream code touches (no further schema change):**
  - `src/main/services/pending-assignments.ts` — `listPending`,
    `confirmPending` (outer transaction wrapping `assignCspPosition` +
    status update), `dismissPending` (rejects non-pending rows with
    `PendingAssignmentError('NOT_PENDING')`).
  - `src/main/services/detect-assignments.ts` —
    `INSERT OR IGNORE INTO pending_assignments ...` per match returned by
    `matchActivityToLegs`.
  - `src/main/ipc/assignments.ts` — `assignments:list-pending`,
    `assignments:confirm`, `assignments:dismiss`,
    `assignments:run-detection-now`.
- **Source:** `migrations/006_create_pending_assignments.sql`

### `migrations/007_create_app_settings.sql` — generic key/value settings table

- **Driven by:** [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md)
- **Change scope:** new table `app_settings`.
- **SQL:**

  ```sql
  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  ```

- **Why:** US-35 needs a per-environment "last poll" watermark so that
  the detection job can ask Alpaca for activities `since X` rather than
  re-scanning the entire history every tick. The watermark is captured
  at **poll start** (not poll end) so activities that arrive during the
  broker call are replayed on the next tick and the compound UNIQUE
  handles dedupe. Keys used today:
  - `assignments_last_poll_at:paper`
  - `assignments_last_poll_at:live`
- **Why a generic table, not a watermark-specific column:** the same
  shape is expected to host other small singletons (feature flags,
  one-off cursors) without further migrations. Keeping it intentionally
  thin — string key, string value — defers any schema work to a future
  story that genuinely needs typed columns.
- **Approach inside the migration file:** plain `CREATE TABLE`.
- **Downstream code touches:** `src/main/services/app-settings.ts`
  exposes `appSettings.get(db, key)` / `appSettings.set(db, key, value)`;
  `detectAssignments` reads/writes the two watermark keys.
- **Source:** `migrations/007_create_app_settings.sql`

<!-- /generated -->

<!-- generated:from us-6,us-33,us-35 -->

## Gaps

Migrations `001_initial_schema.sql` and `002_add_query_indexes.sql` are
referenced throughout the codebase (the initial table layout and the
`LegRole` CHECK constraint that already includes `'ASSIGN'` both come from
`001`; the secondary indexes for list/by-position lookups come from `002`)
but no plan extract in the current set documents them — they predate the
spec wiki. Future `/build-spec` or `/audit-spec` runs should backfill
these entries by reading the migration files directly from `migrations/`.

Migration `004_add_trigger_event_to_snapshots.sql` is mentioned on
[`domain/cost-basis.md`](../domain/cost-basis.md) (the
`cost_basis_snapshots.trigger_event` column) but has not yet been
extracted into a dedicated entry here.

<!-- /generated -->

<!-- generated:from us-6,us-33,us-35 -->

## See also

- [`schema/tables.md`](./tables.md) — row-level catalogue of every table
  produced by these migrations
- [us-6 — Record Assignment](../features/us-6-record-assignment.md) —
  introduced migration `003`
- [us-33 — Option Mid & Unrealized P&L](../features/us-33-option-mid-pnl.md) —
  introduced migration `005`
- [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md) —
  introduced migrations `006` and `007`
- [us-46 — Polling Scheduler](../features/us-46-polling-scheduler.md) —
  the scheduler that drives the `detect-assignments` job (no schema of
  its own; included for cross-reference)

<!-- /generated -->

<!-- Hand-written sections below this line are preserved across regeneration. -->
</content>
</invoke>