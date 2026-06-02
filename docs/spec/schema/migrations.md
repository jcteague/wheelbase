# Migrations

<!-- generated:from us-6,us-33 -->

## Overview

SQLite schema for Wheelbase is built up by a sequence of plain `.sql` files in
the repo's top-level `migrations/` directory. A small runner in
`src/main/db/migrate.ts` discovers every file in that directory, sorts them
by filename, and applies any that have not yet been recorded against a
tracking table inside the database itself. The runner is invoked once at
app startup before any service touches the connection.

Migrations are **append-only** and **filename-ordered**. New schema work
adds a numbered file (`NNN_short_description.sql`) — never edits an existing
one. The numeric prefix is the sort key, so the runner replays the same
sequence in the same order on every fresh database. Idempotency comes from
the tracking table: a migration that has already been applied to this
database is skipped, so it is always safe to start the app against an
existing database without manually pruning files.

See [`schema/tables.md`](./tables.md) for the row-level catalogue produced
by these migrations.

<!-- /generated -->

<!-- generated:from us-6,us-33 -->

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

<!-- generated:from us-6,us-33 -->

## Migration catalogue

### `migrations/003_rename_option_type_to_instrument_type.sql` — rename `option_type` → `instrument_type`, add `STOCK`

- **Driven by:** [us-6 — Record Assignment](../features/us-6-record-assignment.md)
- **Change scope:** the `legs` table only.
- **Field-level diff:**

  | Field           | Before                                       | After                                                                |
  | --------------- | -------------------------------------------- | -------------------------------------------------------------------- |
  | column name     | `option_type`                                | `instrument_type`                                                    |
  | CHECK constraint | `option_type IN ('PUT', 'CALL')`            | `instrument_type IN ('PUT', 'CALL', 'STOCK')`                        |

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

  | Field                   | Before          | After                                              |
  | ----------------------- | --------------- | -------------------------------------------------- |
  | `profit_target_percent` | (column absent) | `INTEGER`, nullable, no default                    |

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

<!-- /generated -->

<!-- generated:from us-6,us-33 -->

## Gaps

Migrations `001_initial_schema.sql` and `002_*.sql` are referenced
throughout the codebase (the initial table layout and the `LegRole` CHECK
constraint that already includes `'ASSIGN'` both come from `001`) but no
plan extract in the current set documents them — they predate the spec
wiki. Future `/build-spec` or `/audit-spec` runs should backfill these
entries by reading the migration files directly from `migrations/`.

Migration `004_add_trigger_event_to_snapshots.sql` is mentioned on
[`domain/cost-basis.md`](../domain/cost-basis.md) (the
`cost_basis_snapshots.trigger_event` column) but has not yet been
extracted into a dedicated entry here.

<!-- /generated -->

<!-- generated:from us-6,us-33 -->

## See also

- [`schema/tables.md`](./tables.md) — row-level catalogue of every table
  produced by these migrations
- [us-6 — Record Assignment](../features/us-6-record-assignment.md) —
  the feature that introduced migration `003`
- [us-33 — Option Mid & Unrealized P&L](../features/us-33-option-mid-pnl.md) —
  the feature that introduced migration `005`

<!-- /generated -->

<!-- Hand-written sections below this line are preserved across regeneration. -->
