# Migrations

<!-- generated:from us-6,us-33,us-35,us-37,us-44,us-50 -->

## Overview

SQLite schema for Wheelbase is built up by a sequence of plain `.sql` files in
the repo's top-level `migrations/` directory. A small runner in
`src/main/db/migrate.ts` discovers every file in that directory, sorts them
by filename, and applies any that have not yet been recorded against a
tracking table inside the database itself. The runner is invoked once at
app startup before any service touches the connection.

Migrations are **filename-ordered** and, once shipped, **append-only**. New
schema work adds a numbered file (`NNN_short_description.sql`); the numeric
prefix is the sort key, so the runner replays the same sequence in the same
order on every fresh database. Idempotency comes from the tracking table: a
migration that has already been applied to this database is skipped, so it is
always safe to start the app against an existing database without manually
pruning files.

The one pragmatic carve-out is the **edit-in-place pre-ship policy** — a
migration that has not yet been merged to `main` and reached real user
machines may still be edited or renumbered in-place. Once a migration ships,
the rule reverts to strict append-only. See
[Migration authoring policy](#migration-authoring-policy) below.

See [`schema/tables.md`](./tables.md) for the row-level catalogue produced
by these migrations.

<!-- /generated -->

<!-- generated:from us-6,us-33,us-35,us-37,us-44,us-50 -->

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

<!-- generated:from us-35 -->

## Migration authoring policy

Wheelbase distinguishes between **pre-ship** and **post-ship** migrations and
applies different rules to each.

### Pre-ship (not yet merged to `main`)

A migration is "pre-ship" while it lives only on a feature branch and the
story that introduced it has not yet been merged. Devs running the branch
can rebuild their local database trivially by deleting the SQLite file, so
the cost of editing the migration is the cost of one `rm` for each dev.

While pre-ship, it is acceptable to:

- **Edit the migration file in place** — rename columns, change CHECK
  constraints, switch a column-level UNIQUE to a compound index, fix typed
  primary-key choice, etc.
- **Renumber the migration** when merging with `main` would otherwise cause
  a filename collision with another in-flight story.

### Post-ship (merged to `main`)

Once a migration has shipped, treat it as immutable. Schema changes ride a
**new** numbered file that mutates the table forward (`ALTER TABLE`, table
rebuild, drop+recreate). The runner replays history in order; rewriting
history would diverge the schema across users who have already applied the
old version.

### Worked example — US-35's `008_create_pending_assignments.sql`

The pending-assignments work for US-35 hit both halves of the policy:

1. **Pre-merge in-place correction.** The migration originally declared
   `activity_id TEXT NOT NULL UNIQUE`. Code review caught that a single
   `OPASN` activity can legitimately match multiple open CSP positions
   on the same OCC symbol (two CSP positions on AAPL `$180 2026-01-19 P`),
   and the single-column UNIQUE would silently drop the second pending
   row. The fix replaced the column-level UNIQUE with a compound
   `CREATE UNIQUE INDEX uq_pending_assignments_activity_position ON
pending_assignments(activity_id, position_id)`. Because the migration
   had not yet shipped, the file was **edited in place** rather than
   followed by a `00X_fix_pending_assignments_unique.sql`.

2. **Pre-merge renumber.** The story originally numbered its migration
   `006_create_pending_assignments.sql`. While the branch was in review,
   [us-37](../features/us-37-paper-live-broker-environment-toggle.md)
   merged to `main` first and claimed `006` for `credential_settings`.
   On the rebase, the pending-assignments migration was renumbered to
   `008_create_pending_assignments.sql` (skipping `007`; see
   [Gaps](#gaps)). Both the file name and any test fixtures referencing
   the old number were updated in the same commit.

The combined upshot: in `main`, US-35 contributes one new migration file
(`008_create_pending_assignments.sql`) and **consumes** the `app_settings`
table that US-37's `006_add_credential_settings.sql` creates. There is no
separate "US-35 app_settings migration" in tree.

<!-- /generated -->

<!-- generated:from us-6,us-33,us-35,us-37,us-44,us-50,us-57-58 -->

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
- **Approach inside the migration file:** SQLite >= 3.25.0 supports
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

- **Semantics:** `NULL` means "inherit the global default" (the
  `alert_default_profit_target_percent` `app_settings` key from
  [us-57-58 — Configurable Alert Thresholds](../features/us-57-58-configurable-alert-thresholds.md),
  else the hardcoded `DEFAULT_PROFIT_TARGET_PERCENT = 50` from
  `src/main/core/profit-target.ts`). Valid values when non-null are
  `1..99` inclusive. There is no DB-level `CHECK` constraint —
  validation lives in the service layer, enforced by the
  `positions:save-alert-overrides` IPC
  (`src/main/services/save-position-alert-overrides.ts`), which shipped
  in us-57-58. For US-33 itself the column was read-only and seeded only
  via tests/dev; no edit UI existed until us-57-58.
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

### `migrations/006_add_credential_settings.sql` — add encrypted credential storage and app settings

- **Driven by:** [us-37 — Paper/Live Broker Environment Toggle](../features/us-37-paper-live-broker-environment-toggle.md)
- **Rationale:** Persist user-specific Alpaca paper/live credentials securely
  and remember the active broker environment across launches without storing
  Massive credentials in user settings.
- **Change scope:** introduces two new tables, `credential_settings` and
  `app_settings`.
- **Field-level summary:**

  | Table                 | Columns                                                                                                                                                | Primary key             |
  | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
  | `credential_settings` | `vendor`, `environment`, `key_id_encrypted` (BLOB), `secret_encrypted` (BLOB), `last_verified_at`, `account_number_masked`, `created_at`, `updated_at` | `(vendor, environment)` |
  | `app_settings`        | `key`, `value`, `updated_at`                                                                                                                           | `key`                   |

- **Highlights:**
  - `credential_settings` stores encrypted key/secret pairs, masked
    account number, and verification metadata keyed by
    `(vendor, environment)`. Encryption uses Electron's
    `safeStorage.encryptString` on the way in and `decryptString` on
    the way out — the renderer never sees plaintext.
  - `app_settings` stores non-secret key/value state. US-37 writes
    `active_broker_environment`; US-35 later writes
    `assignments_last_poll_at:paper` and `assignments_last_poll_at:live`
    against the same table.
- **Why generic names?** The schema is intentionally vendor-agnostic so
  future broker vendors can reuse it, even though US-37 writes Alpaca
  rows only.
- **Cross-story note:** US-35 consumes `app_settings` (poll watermark)
  but contributes no migration to create it; see
  [Migration authoring policy](#migration-authoring-policy).
- **Downstream code touches (no further schema change):**
  - `src/main/services/settings.ts`
  - `src/main/services/settings-connections.ts`
  - `src/main/services/app-settings.ts` (US-35; reads/writes
    `app_settings`)
  - `src/main/integrations/broker-factory.ts`
  - `src/main/ipc/settings.ts`
  - `src/renderer/src/api/settings.ts`
- **Source:** `migrations/006_add_credential_settings.sql`

### `migrations/007_create_ivr_snapshot.sql` — create `ivr_snapshot` for daily IVR storage

- **Driven by:** [us-44 — IVR Snapshot Store & Scheduler](../features/us-44-ivr-snapshot-store-and-scheduler.md)
- **Rationale:** First persisted IVR storage path. A post-close collector
  batches active-position underlyings through the Barchart scraper and writes
  one snapshot row per ticker per market day; downstream reads (US-45) want the
  latest snapshot per underlying.
- **Change scope:** introduces one new table and one secondary index.
- **Field-level summary:**

  | Field         | Type   | Required | Notes                                                                 |
  | ------------- | ------ | -------- | --------------------------------------------------------------------- |
  | `underlying`  | `TEXT` | Yes      | Uppercase ticker from `positions.ticker`.                             |
  | `observed_at` | `TEXT` | Yes      | ISO-8601 timestamp from `fetchIVR(...).data.observedAt`.              |
  | `ivr`         | `TEXT` | Yes      | Decimal string, 1 dp; `0..100` via `IVRDataSchema`.                   |
  | `ivp`         | `TEXT` | No       | Decimal string, 1 dp, when Barchart returns percentile.               |
  | `iv30`        | `TEXT` | No       | Decimal string for 30-day historical volatility when provided.        |
  | `source`      | `TEXT` | Yes      | `source TEXT NOT NULL DEFAULT 'barchart'`; persisted as `'barchart'`. |
  - Primary key: `(underlying, observed_at)`.
  - Secondary index: `(underlying, observed_at DESC)` for latest-snapshot
    lookups in US-45.

- **Same-day overwrite:** because the primary key includes the exact
  `observed_at` timestamp, a second run on the same day with a later
  timestamp does **not** replace the earlier row. The collector's persist
  step therefore deletes any existing row for the same `underlying` whose
  `observed_at` falls on the same UTC calendar date before inserting the
  fresh row — the latest same-day value wins. This is service-layer logic,
  not a schema constraint.
- **Approach inside the migration file:** straight `CREATE TABLE` plus one
  `CREATE INDEX`. No table rebuild, no data backfill.
- **Numbering note:** this file deliberately fills the `007` gap. The repo
  already had `006_add_credential_settings.sql` and
  `008_create_pending_assignments.sql` with no `007` (see [Gaps](#gaps));
  the lexicographic runner applies the new file in sequence between them,
  keeping the numbering contiguous rather than appending `009`.
- **Downstream code touches (no further schema change):**
  - `src/main/services/ivr-collector.ts` (`collectIVRSnapshots` — batch,
    throttle, delete-then-insert)
  - `src/main/ipc/ivr.ts` (`ivr:collect-now` manual trigger)
  - `src/main/index.ts` (registers the `ivr-collect` scheduler job,
    `afterClose` cadence)
- **Source:** `migrations/007_create_ivr_snapshot.sql`

### `migrations/008_create_pending_assignments.sql` — create `pending_assignments` for assignment-detection notifications

- **Driven by:** [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md)
- **Rationale:** Persist OPASN assignments detected from Alpaca polling so
  the renderer can surface a notification banner that survives app
  restarts. A row in this table _is_ the notification — confirm and
  dismiss are state transitions on the same row, not a separate inbox.
- **Change scope:** introduces one new table and three indexes.
- **SQL (verbatim from the migration file):**

  ```sql
  CREATE TABLE IF NOT EXISTS pending_assignments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id     TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    leg_id          TEXT NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
    activity_id     TEXT NOT NULL,
    broker_symbol   TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    transaction_time TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'dismissed')),
    detected_at     TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed_at    TEXT,
    dismissed_at    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_pending_assignments_status   ON pending_assignments(status);
  CREATE INDEX IF NOT EXISTS idx_pending_assignments_position ON pending_assignments(position_id);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_assignments_activity_position
    ON pending_assignments(activity_id, position_id);
  ```

- **Field-level notes:**
  - `position_id` and `leg_id` are `TEXT` (UUID) to match the existing
    schema's `positions.id` / `legs.id` primary keys. The plan
    originally specified `INTEGER`; this was corrected in the green
    phase before merge to preserve FK referential integrity.
  - `status` is a CHECK-bounded enum (`pending` / `confirmed` /
    `dismissed`); the service layer enforces legal transitions on top
    of the CHECK.
  - `detected_at` defaults to `datetime('now')` so polling code does
    not need to set it explicitly.
- **Dedupe key — compound UNIQUE.** The unique index on
  `(activity_id, position_id)` is intentional. A single OPASN activity
  can match more than one open CSP position on the same OCC symbol
  (e.g. two AAPL `$180 2026-01-19 P` CSPs); the compound key allows one
  pending row per `(activity, position)` pair while `INSERT OR IGNORE`
  still keeps the poll job idempotent. See [Migration authoring
  policy](#migration-authoring-policy) for the in-place edit that
  introduced this from a single-column UNIQUE before merge.
- **Approach inside the migration file:** straight `CREATE TABLE` plus
  three `CREATE INDEX` statements. No table rebuild, no data
  backfill.
- **Renumbering note:** this file was numbered `006` on the feature
  branch and renumbered to `008` during merge with `main`, which had
  already claimed `006` for [credential
  settings](#migrations006_add_credential_settingssql--add-encrypted-credential-storage-and-app-settings).
  `007` was skipped (see [Gaps](#gaps)). The renumber is the only
  reason `006` and `008` are non-contiguous in tree.
- **Downstream code touches (no further schema change):**
  - `src/main/services/detect-assignments.ts` (poll job; `INSERT OR
IGNORE` on the compound key)
  - `src/main/services/pending-assignments.ts` (`listPending`,
    `confirmPending`, `dismissPending`; `PendingAssignmentError`)
  - `src/main/ipc/assignments.ts` (`assignments:list-pending`,
    `assignments:confirm`, `assignments:dismiss`,
    `assignments:run-detection-now`)
- **Source:** `migrations/008_create_pending_assignments.sql`

### `migrations/009_create_alerts.sql` — create `alerts` for the management-alert evaluation engine

- **Driven by:** [us-50 — Alert Evaluation Engine](../features/us-50-alert-evaluation-engine.md)
- **Rationale:** First persistence for Epic 07 management alerts. A scheduled
  job evaluates active CSP/CC positions against built-in DTE rules and maintains
  a deduplicated, restart-safe alert set. A row in this table _is_ the alert;
  re-evaluation updates the open row in place and cleared conditions resolve it
  without deleting history (audit trail). The schema is designed so the
  remaining Classic Wheel rules slot in without further migrations.
- **Change scope:** introduces one new table and two indexes.
- **Field-level summary:**

  | Field               | Type   | Required | Notes                                                                    |
  | ------------------- | ------ | -------- | ------------------------------------------------------------------------ |
  | `id`                | `TEXT` | Yes      | UUID PK, generated in the service layer (`crypto.randomUUID()`).         |
  | `position_id`       | `TEXT` | Yes      | `NOT NULL REFERENCES positions(id)`.                                     |
  | `rule_code`         | `TEXT` | Yes      | Rule that fired (`EXPIRATION_IMMINENT`, `MANAGEMENT_WINDOW`, …).         |
  | `urgency`           | `TEXT` | Yes      | `high` / `medium` / `low`.                                               |
  | `summary`           | `TEXT` | Yes      | Human-readable queue text (e.g. `Expires in 5 days at $180.00 strike`).  |
  | `quick_action`      | `TEXT` | Yes      | Queue button label (Phase 3: always `Review position`).                  |
  | `status`            | `TEXT` | Yes      | `NOT NULL DEFAULT 'open'`; `open` / `resolved` / `dismissed`.            |
  | `triggered_at`      | `TEXT` | Yes      | ISO timestamp of first firing; never mutated while the alert stays open. |
  | `last_evaluated_at` | `TEXT` | Yes      | ISO timestamp of the most recent re-matching evaluation.                 |
  | `resolved_at`       | `TEXT` | No       | Set when status transitions to `resolved`.                               |
  | `created_at`        | `TEXT` | Yes      | Row creation timestamp.                                                  |
  | `updated_at`        | `TEXT` | Yes      | Last write timestamp.                                                    |
  - Partial unique index:
    `CREATE UNIQUE INDEX idx_alerts_open_unique ON alerts (position_id, rule_code) WHERE status = 'open'` —
    at most one open alert per `(position, rule)`, while any number of
    historical resolved/dismissed rows for the same pair are allowed.
  - Secondary index:
    `CREATE INDEX idx_alerts_status_urgency ON alerts (status, urgency)` —
    the open management-queue read path (US-51 consumes).

- **Partial unique index — the central invariant.** Re-evaluation must update
  the existing open alert in place rather than insert a duplicate; resolution
  must never delete (audit trail); and a _later_ re-firing of the same rule must
  create a new open row, leaving the old resolved row intact. A partial unique
  index keyed on `status = 'open'` expresses exactly that at the DB layer — full
  uniqueness on `(position_id, rule_code)` would block re-firing after
  resolution and lose the distinct `triggered_at` history. See
  [`schema/tables.md`](./tables.md) for the row-level catalogue.
- **State transitions:** `(none) → open` (rule matches); `open → open`
  (re-match: `triggered_at` preserved, `last_evaluated_at` + `summary`
  advanced); `open → resolved` (no longer matches: `resolved_at` set, row
  retained, excluded from open-queue reads); `resolved → (new) open row`
  (matches again later, old resolved row retained); `open → dismissed`
  (US-59, out of scope; status domain reserved). Rows are never deleted.
- **Approach inside the migration file:** straight `CREATE TABLE` plus two
  `CREATE INDEX` statements. No table rebuild, no data backfill.
- **Numbering note:** straight append after `008`; the `007` gap was already
  filled by US-44 (see [Gaps](#gaps)), so the sequence is contiguous.
- **Downstream code touches (no further schema change):**
  - `src/main/services/alerts.ts` (persistence primitives `upsertOpenAlert`,
    `resolveAlertsNotIn`, `listOpenAlerts`, `alertKey`, `mapAlertRow`)
  - `src/main/services/evaluate-alerts.ts` (`evaluateAlerts` orchestration;
    compute-then-persist in a single `db.transaction`; `ALERT_EVAL_JOB_NAME`)
  - `src/main/core/alerts.ts` (pure rule engine + registry) and
    `src/main/core/dte.ts` (shared pure `computeDte`)
  - `src/main/index.ts` (registers the `alert-evaluation` interval job, not
    broker-gated, before `scheduler.start()`)
- **Source:** `migrations/009_create_alerts.sql`

### `migrations/010_add_management_window_dte_override.sql` — add nullable per-position management-window override

- **Driven by:** [us-57-58 — Configurable Alert Thresholds](../features/us-57-58-configurable-alert-thresholds.md)
- **Rationale:** Adds a nullable per-position override for the management-window DTE threshold, mirroring the existing `profit_target_percent` override column so both configurable alert thresholds follow the same override-then-global-default shape.
- **Change scope:** the `positions` table only.
- **SQL:**

  ```sql
  ALTER TABLE positions
    ADD COLUMN management_window_dte_override INTEGER;
  ```

- **Field-level diff:**

  | Field                            | Before          | After                           |
  | -------------------------------- | --------------- | ------------------------------- |
  | `management_window_dte_override` | (column absent) | `INTEGER`, nullable, no default |

- **Semantics:** `NULL` means "inherit the global default" (the
  `alert_default_management_window_dte` `app_settings` key, else the
  hardcoded `DEFAULT_MANAGEMENT_WINDOW_DTE = 21` from
  `src/main/core/alerts.ts`). There is no DB-level `CHECK` constraint —
  validation lives in the service layer, enforced by the
  `positions:save-alert-overrides` IPC
  (`src/main/services/save-position-alert-overrides.ts`). Valid values
  when non-null are `6..45` inclusive, matching this migration's exact
  single-statement pattern from migration `005`.
- **Approach inside the migration file:** plain `ALTER TABLE ... ADD
COLUMN`, matching migration `005`'s pattern exactly (per the plan's own
  Refactor note) — no table rebuild required because there is no
  constraint change.
- **Downstream code touches (no further schema change):**
  - `src/main/services/save-position-alert-overrides.ts` (new service;
    validates and writes both override columns together)
  - `src/main/services/get-position.ts` (SELECT extended to surface
    `management_window_dte_override`)
  - `src/main/core/alerts.ts` (`resolveManagementWindowDte`,
    `AlertEvaluationInput.managementWindowDteOverride`)
- **Source:** `migrations/010_add_management_window_dte_override.sql`

<!-- /generated -->

<!-- generated:from us-6,us-33,us-35,us-37,us-44,us-50 -->

## Gaps

Migrations `001_initial_schema.sql` and `002_add_query_indexes.sql` are
referenced throughout the codebase (the initial table layout and the
`LegRole` CHECK constraint that already includes `'ASSIGN'` both come from
`001`) but no plan extract in the current set documents them — they
predate the spec wiki. Future `/build-spec` or `/audit-spec` runs should
backfill these entries by reading the migration files directly from
`migrations/`.

Migration `004_add_trigger_event_to_snapshots.sql` is mentioned on
[`domain/cost-basis.md`](../domain/cost-basis.md) (the
`cost_basis_snapshots.trigger_event` column) but has not yet been
extracted into a dedicated entry here.

The `007` slot was once an intentional gap. The number had been reserved on a
US-35 working branch for a standalone `create_app_settings` migration and then
dropped during merge resolution when `006_add_credential_settings.sql` turned
out to create `app_settings` already (see [Migration authoring
policy](#migration-authoring-policy)), leaving `006` and `008` non-contiguous.
[us-44](../features/us-44-ivr-snapshot-store-and-scheduler.md) later filled the
slot with `007_create_ivr_snapshot.sql`; the runner's filename sort applies it
between `006` and `008` without issue. The sequence is now contiguous again.

<!-- /generated -->

<!-- generated:from us-6,us-33,us-35,us-37,us-44,us-50 -->

## Driven by

- [us-6 — Record Assignment](../features/us-6-record-assignment.md) —
  migration `003`
- [us-33 — Option Mid & Unrealized P&L](../features/us-33-option-mid-pnl.md) —
  migration `005`
- [us-37 — Paper/Live Broker Environment Toggle](../features/us-37-paper-live-broker-environment-toggle.md) —
  migration `006`
- [us-44 — IVR Snapshot Store & Scheduler](../features/us-44-ivr-snapshot-store-and-scheduler.md) —
  migration `007`
- [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md) —
  migration `008` (and consumer of `006`'s `app_settings` table)
- [us-50 — Alert Evaluation Engine](../features/us-50-alert-evaluation-engine.md) —
  migration `009`

<!-- /generated -->

<!-- generated:from us-6,us-33,us-35,us-37,us-44,us-50 -->

## See also

- [`schema/tables.md`](./tables.md) — row-level catalogue of every table
  produced by these migrations
- [us-6 — Record Assignment](../features/us-6-record-assignment.md) —
  the feature that introduced migration `003`
- [us-33 — Option Mid & Unrealized P&L](../features/us-33-option-mid-pnl.md) —
  the feature that introduced migration `005`
- [us-37 — Paper/Live Broker Environment Toggle](../features/us-37-paper-live-broker-environment-toggle.md) —
  the feature that introduced migration `006`
- [us-44 — IVR Snapshot Store & Scheduler](../features/us-44-ivr-snapshot-store-and-scheduler.md) —
  the feature that introduced migration `007`
- [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md) —
  the feature that introduced migration `008`
- [us-50 — Alert Evaluation Engine](../features/us-50-alert-evaluation-engine.md) —
  the feature that introduced migration `009`

<!-- /generated -->

<!-- Hand-written sections below this line are preserved across regeneration. -->
