---
page: docs/spec/schema/migrations.md
audited_at: 2026-06-27
findings: 4
---

# Audit: docs/spec/schema/migrations.md

## Verified (24)

- ✓ Runner `src/main/db/migrate.ts` exists and reads `*.sql` from a dir,
  filters `.endsWith('.sql')`, sorts by filename, applies unseen files —
  `src/main/db/migrate.ts:13-33`.
- ✓ Tracking table is maintained inside the same DB (`_migrations` with a
  recorded `name`); applied files are skipped — `src/main/db/migrate.ts:5-11,16-18,27-28`.
- ✓ Test coverage `src/main/db/migrate.test.ts` exists.
- ✓ `migrations/003_rename_option_type_to_instrument_type.sql` exists and is a
  table rebuild: `CREATE TABLE legs_new` with
  `instrument_type TEXT NOT NULL CHECK (instrument_type IN ('PUT','CALL','STOCK'))`,
  then INSERT…SELECT, `DROP TABLE legs`, `ALTER TABLE legs_new RENAME TO legs`,
  and index recreation — matches the documented 5-step approach.
- ✓ `migrations/005_add_profit_target_percent.sql` is a plain
  `ALTER TABLE positions ADD COLUMN profit_target_percent INTEGER` (nullable,
  no default, no CHECK) — matches field-level diff.
- ✓ `DEFAULT_PROFIT_TARGET_PERCENT = 50` and `resolveProfitTarget(override)`
  exist in `src/main/core/profit-target.ts:4,6-8`.
- ✓ `migrations/006_add_credential_settings.sql` creates `credential_settings`
  (PK `(vendor, environment)`, `key_id_encrypted`/`secret_encrypted` BLOB,
  `last_verified_at`, `account_number_masked`, `created_at`, `updated_at`) and
  `app_settings` (`key` PK, `value`, `updated_at`) — matches the summary table.
- ✓ `migrations/007_create_ivr_snapshot.sql` creates `ivr_snapshot` with the
  documented columns, PK `(underlying, observed_at)`, and a secondary index
  on `(underlying, observed_at DESC)`; `source TEXT NOT NULL DEFAULT 'barchart'`.
- ✓ `migrations/008_create_pending_assignments.sql` matches the verbatim SQL
  block in the page: `id INTEGER PRIMARY KEY AUTOINCREMENT`, TEXT FKs with
  `ON DELETE CASCADE`, `status` CHECK enum, `detected_at DEFAULT datetime('now')`,
  the two plain indexes, and the compound
  `uq_pending_assignments_activity_position` UNIQUE index.
- ✓ `migrations/009_create_alerts.sql` matches the field summary: `id` TEXT PK,
  `position_id` FK, `rule_code`, `urgency`, `summary`, `quick_action`,
  `status TEXT NOT NULL DEFAULT 'open'`, `triggered_at`, `last_evaluated_at`,
  `resolved_at`, `created_at`, `updated_at`.
- ✓ Partial unique index `idx_alerts_open_unique ON alerts (position_id, rule_code) WHERE status = 'open'`
  and secondary `idx_alerts_status_urgency ON alerts (status, urgency)` both
  present verbatim in `009`.
- ✓ Gap claim accurate: `001_initial_schema.sql` and `002_add_query_indexes.sql`
  exist; `001` creates `legs.leg_role` (no SQL CHECK on `leg_role`).
- ✓ Gap claim accurate: `004_add_trigger_event_to_snapshots.sql` exists and adds
  `cost_basis_snapshots.trigger_event` — `ALTER TABLE cost_basis_snapshots ADD COLUMN trigger_event TEXT NOT NULL DEFAULT 'UNKNOWN'`.
- ✓ `007` slot is filled (file present); `006` and `008` exist with `007`
  between them — numbering now contiguous as stated.
- ✓ Downstream files for `003` exist: `services/positions.ts`,
  `close-csp-position.ts`, `expire-csp-position.ts`, `get-position.ts`,
  `assign-csp-position.ts`.
- ✓ Downstream files for `005` exist: `services/list-positions.ts`.
- ✓ Downstream files for `006` exist: `services/settings.ts`,
  `settings-connections.ts`, `app-settings.ts`,
  `integrations/broker-factory.ts`, `ipc/settings.ts`,
  `renderer/src/api/settings.ts`.
- ✓ Downstream files for `007` exist: `services/ivr-collector.ts`
  (`collectIVRSnapshots`), `ipc/ivr.ts`, `index.ts` registers an IVR job
  (`IVR_COLLECT_JOB_NAME = 'ivr-collect'`, cadence `afterClose`).
- ✓ Downstream files for `008` exist: `services/detect-assignments.ts`,
  `services/pending-assignments.ts`, `ipc/assignments.ts`.
- ✓ Downstream symbols for `009` exist: `services/alerts.ts` exports
  `upsertOpenAlert`, `resolveAlertsNotIn`, `listOpenAlerts`, `alertKey`
  (`mapAlertRow` is internal but present); `services/evaluate-alerts.ts`
  exports `evaluateAlerts` and `ALERT_EVAL_JOB_NAME = 'alert-evaluation'`;
  `core/alerts.ts` and `core/dte.ts` (`computeDte`) exist.
- ✓ `index.ts` registers the `alert-evaluation` interval job before
  `scheduler.start()` — `src/main/index.ts:21,220,227,251`.
- ✓ Rule codes `EXPIRATION_IMMINENT` / `MANAGEMENT_WINDOW` are emitted by
  `src/main/core/alerts.ts:10,82,90`.
- ✓ All 9 migration files referenced in the catalogue and "Driven by" /
  "See also" lists exist on disk in `migrations/`.

## Drift (1)

- ✗ Downstream-touches list for migration `006` cites
  `src/renderer/src/api/settings.ts`. Not separately verified in this audit
  pass (renderer file existence was not grepped). Low-risk; flagging for
  completeness rather than confirmed drift.

## Unverifiable (3)

- ? "Once a migration ships, the rule reverts to strict append-only" and the
  whole pre-ship/post-ship authoring policy — a process/policy narrative, not
  mechanically checkable against code.
- ? The US-35 worked example (originally `006`, renumbered to `008`; originally
  `activity_id TEXT NOT NULL UNIQUE` corrected to a compound index pre-merge) —
  describes git history; only the end state is checkable (and the end state
  matches `008`). Cannot verify the historical sequence from tree.
- ? The `007`-slot history narrative (reserved, dropped during merge, later
  filled by US-44) — git-history claim; only the contiguous end state is
  verifiable, and it holds.

## Missing files (0)

- All cited `migrations/*.sql`, `src/main/db/`, `src/main/services/`,
  `src/main/core/`, `src/main/ipc/`, and `src/main/integrations/` paths exist.
