---
page: docs/spec/schema/tables.md
audited_at: 2026-06-27
findings: 6
---

# Audit: docs/spec/schema/tables.md

## Verified (18)

- ✓ `positions` table created in `migrations/001_initial_schema.sql` with
  `id`, `ticker`, `strategy_type`, `status`, `phase`, `opened_date`,
  `closed_date`, `notes`, `thesis`, `created_at`, `updated_at` — all documented
  columns present.
- ✓ `positions.profit_target_percent INTEGER` (nullable, no CHECK) added by
  `migrations/005_add_profit_target_percent.sql` — matches.
- ✓ `legs` table created in `001` and rebuilt in `003`; documented columns
  `id`, `position_id`, `leg_role`, `action`, `instrument_type`, `strike`,
  `expiration`, `contracts`, `premium_per_contract`, `fill_price`, `fill_date`,
  `roll_chain_id`, `created_at`, `updated_at` all exist.
- ✓ `legs.position_id` FK → `positions(id)` — `001` and `003`.
- ✓ `legs` CHECK claims accurate: only `instrument_type IN ('PUT','CALL','STOCK')`
  has a SQL CHECK (added in `003`); `leg_role` and `action` have **no** SQL
  CHECK — confirmed by grepping `migrations/` (page states exactly this).
- ✓ `cost_basis_snapshots` created in `001` with `id`, `position_id`,
  `basis_per_share`, `total_premium_collected`, `final_pnl`,
  `annualized_return`, `snapshot_at`, `created_at` — all documented columns
  present; FK on `position_id`.
- ✓ Index `idx_legs_position_fill_date` (FK index on `position_id`) exists in
  `001`/`003`; latest-snapshot index `idx_snapshots_position_at` in `002`.
- ✓ `credential_settings` columns and unique key `(vendor, environment)` match
  `006` exactly; `key_id_encrypted`/`secret_encrypted` are BLOB.
- ✓ `app_settings` columns (`key` PK, `value`, `updated_at`) match `006`.
- ✓ `appSettings.get/set` lives in `src/main/services/app-settings.ts:3`.
- ✓ `pending_assignments` columns, `status` CHECK enum, both FK
  `ON DELETE CASCADE` clauses, `detected_at DEFAULT datetime('now')`, and
  `id INTEGER PRIMARY KEY AUTOINCREMENT` match `008`.
- ✓ `pending_assignments` indexes match `008`: `idx_pending_assignments_status`,
  `idx_pending_assignments_position`, compound UNIQUE
  `uq_pending_assignments_activity_position (activity_id, position_id)`.
- ✓ `ivr_snapshot` columns, PK `(underlying, observed_at)`, secondary index
  on `(underlying, observed_at DESC)`, and `source DEFAULT 'barchart'` match
  `007`; no DB-level CHECK constraints (validation in service layer) — correct.
- ✓ `alerts` columns match `009`; FK `position_id REFERENCES positions(id)`;
  `status NOT NULL DEFAULT 'open'`.
- ✓ `alerts` indexes match `009`: partial UNIQUE `idx_alerts_open_unique`
  `WHERE status='open'`; secondary `idx_alerts_status_urgency (status, urgency)`.
- ✓ Active-leg query lives in `src/main/services/active-leg-sql.ts` (file
  exists) — supports the "Rolls — linked leg pairs" section's claim.
- ✓ Rolls stored as paired INSERTs sharing `roll_chain_id`: confirmed in
  `services/roll-csp-position.ts` and `roll-cc-position.ts` (two leg IDs minted
  per roll, one transaction).
- ✓ Migration cross-references in "See also" (003/005/006/007/008) all map to
  real files.

## Drift (4)

- ✗ **`legs` column list invents two non-existent columns.** The page's `legs`
  column table lists `roll_from_leg_id` (FK → `legs.id`) and `roll_to_leg_id`
  (FK → `legs.id`). Neither column exists in any migration (`001` and `003`
  define only `roll_chain_id` plus `order_id`), and `grep -rn` finds no
  `roll_from_leg_id`/`roll_to_leg_id` anywhere in `src/`. The `rollFromLegId`/
  `rollToLegId` identifiers in `services/roll-*-position.ts` are local UUID
  variables used as the legs' `id`, not columns. The "Rolls" prose repeats this:
  "The `roll_from_leg_id` / `roll_to_leg_id` columns provide direct forward and
  reverse pointers" — there are no such columns; the only linkage column is
  `roll_chain_id`. Suggested fix: remove both rows from the `legs` column table
  and correct the prose to reference `roll_chain_id` only (plus the shared
  `id`/order semantics).

- ✗ **`legs` column table omits `order_id`.** `001`/`003` define
  `order_id TEXT` (nullable) on `legs`, but it is absent from the page's column
  list. Suggested fix: add an `order_id` row (nullable; broker order id).

- ✗ **`positions` column table omits `account_id` and `tags`.** `001` defines
  `account_id TEXT` (nullable) and `tags TEXT NOT NULL DEFAULT '[]'` on
  `positions`; both are used in `services/positions.ts`, `get-position.ts`, and
  `schemas.ts`, but neither appears in the page's `positions` column list.
  Suggested fix: add `account_id` and `tags` rows.

- ✗ **`round4` documented as a "shared helper" but is not exported.** Money-math
  section says arithmetic uses "the shared `round4` helper in
  `src/main/core/costbasis.ts`". `round4` exists at `costbasis.ts:23` but is a
  **private** (non-exported) function, so it is not shared across modules.
  Suggested fix: drop "shared" or export it if cross-module reuse is intended.

## Unverifiable (3)

- ? Snapshot-writing matrix ("which events write a snapshot", `final_pnl`
  formulas per event) — these are per-service behavioural claims spanning many
  files; the table is plausible but each cell would need a dedicated service
  audit, out of scope for a schema-page check.
- ? "1 ms tie-break bump on simultaneous `snapshot_at`" (US-5) — service-layer
  behaviour, not a schema property; not mechanically verified here.
- ? `alerts` "carries no IPC surface in US-50 (the `alerts:list` read path is
  US-51)" — forward-looking and now slightly stale: `alerts:list` is already
  registered in `src/main/ipc/alerts.ts:7`. Not a schema/column error, but the
  parenthetical is no longer accurate. Flag for human review.

## Missing files (0)

- All cited `migrations/*.sql`, `src/main/services/`, and `src/main/core/`
  paths exist.
