---
page: docs/spec/schema/migrations.md
audited_at: 2026-09-28
findings: 3
---

# Audit: docs/spec/schema/migrations.md

## Verified (34)

- ✓ Runner `runMigrations` in `src/main/db/migrate.ts:13` reads `*.sql` from the directory, sorts by filename, and skips names recorded in the `_migrations` tracking table, recording each applied file (`migrate.ts:5-11,16-32`)
- ✓ Runs at startup via `initDb()` (`src/main/db/index.ts:6-19`), called at `src/main/index.ts:135` before any `register*Ipc` call (first at `:195`); migrations dir is repo-root `migrations/` in dev (`db/index.ts:14-16`)
- ✓ Test coverage file `src/main/db/migrate.test.ts` exists
- ✓ `migrations/` contains 001–016 with the names cited on the page
- ✓ 003 rebuilds `legs` via `legs_new` with `instrument_type … CHECK (instrument_type IN ('PUT','CALL','STOCK'))`, then DROP, RENAME and index recreation (`003_rename_option_type_to_instrument_type.sql:1-17`, tail)
- ✓ `assign-csp-position.ts` writes the ASSIGN leg with `instrument_type = 'STOCK'` (`src/main/services/assign-csp-position.ts:106`)
- ✓ 005 is exactly `ALTER TABLE positions ADD COLUMN profit_target_percent INTEGER;` with no CHECK
- ✓ Profit target default key `alert_default_profit_target_percent` falls back to `DEFAULT_PROFIT_TARGET_PERCENT = 50` (`src/main/services/alert-defaults.ts:15,32`; `src/main/core/profit-target.ts:4`); range 1..99 (`src/main/core/alert-thresholds.ts:6-7`)
- ✓ `list-positions.ts` selects `p.profit_target_percent` (`:29,39`); `save-position-alert-overrides.ts` exists
- ✓ 006 `credential_settings` columns, BLOB key/secret, and PK `(vendor, environment)`; `app_settings(key PK, value, updated_at)`, all matching the page table
- ✓ `safeStorage` is used by `src/main/services/settings.ts:71,155`; `settings-connections.ts`, `app-settings.ts`, `broker-factory.ts`, `ipc/settings.ts` and `renderer/src/api/settings.ts` exist
- ✓ Watermark keys `assignments_last_poll_at:${env}` (`detect-assignments.ts:87`) and `active_broker_environment` (`settings.ts:89`)
- ✓ 007 `ivr_snapshot` columns, `source DEFAULT 'barchart'`, PK `(underlying, observed_at)` and DESC index all match the page. The entry is correctly framed as history, dropped by 016.
- ✓ 008 SQL block matches `migrations/008_create_pending_assignments.sql` verbatim, apart from an inline comment
- ✓ `INSERT OR IGNORE INTO pending_assignments` (`detect-assignments.ts:117`); `listPending`, `confirmPending`, `dismissPending`, `PendingAssignmentError` (`src/main/services/pending-assignments.ts:6,54,88,118`)
- ✓ `assignments:list-pending|confirm|dismiss|run-detection-now` registered in `src/main/ipc/assignments.ts`
- ✓ 009 `alerts` columns, `status DEFAULT 'open'`, partial unique `idx_alerts_open_unique … WHERE status = 'open'`, and `idx_alerts_status_urgency`, all matching
- ✓ `upsertOpenAlert`, `resolveAlertsNotIn`, `listOpenAlerts`, `alertKey`, `mapAlertRow` in `src/main/services/alerts.ts:37,41,80,176,231`
- ✓ `ALERT_EVAL_JOB_NAME = 'alert-evaluation'` and a single `db.transaction` persist (`src/main/services/evaluate-alerts.ts:28,274`); `computeDte` in `src/main/core/dte.ts:13`
- ✓ 010 is exactly `ALTER TABLE positions ADD COLUMN management_window_dte_override INTEGER;`
- ✓ `DEFAULT_MANAGEMENT_WINDOW_DTE = 21` and `resolveManagementWindowDte` (`src/main/core/alerts.ts:24,28`); `AlertEvaluationInput.managementWindowDteOverride` (`:59`); key `alert_default_management_window_dte` (`alert-defaults.ts:16`); range 6..45 (`alert-thresholds.ts:8-9`)
- ✓ `get-position.ts` selects `p.management_window_dte_override` (`:32,180`)
- ✓ 011 SQL (`dismissed_at TEXT` + `idx_alerts_dismissed_unique … WHERE status = 'dismissed'`) matches
- ✓ `AlertError`, `dismissAlert`, `clearStaleDismissals`, `'suppressed'` outcome (`alerts.ts:59,72,104,190,203`); `clearStaleDismissals` called inside the persist transaction (`evaluate-alerts.ts:283`); `AlertRecord.dismissedAt` (`src/main/schemas.ts:602`)
- ✓ 012 `watchlist` keyed by `ticker TEXT PRIMARY KEY` + `idx_watchlist_added_at_desc`
- ✓ 013 `earnings_date` keyed by `ticker`, with `checked_through`
- ✓ 014 is exactly `ALTER TABLE earnings_date ADD COLUMN last_earnings TEXT;`
- ✓ 015 `trading_session(date TEXT PRIMARY KEY, close_at TEXT NULL = closed, …)`, with no secondary index
- ✓ 016 `iv30_reading` PK `(underlying, session, method)`, `method DEFAULT 'daily_vwap'`, `expiration_tier CHECK IN ('weekly','monthly')`, six nullable `far_*` columns, and `engine_version`/`observed_at`/`rate`/`dividend_yield`
- ✓ 016 index `idx_iv30_reading_underlying_session_desc (underlying, session DESC)`
- ✓ 016 `iv30_gap` with `reason CHECK IN ('no_underlying_bar','no_tradeable_pair')` + `attempted_at`
- ✓ 016 ends with `DROP TABLE ivr_snapshot;`, with a header comment block
- ✓ e2e scenario `'Barchart readings are removed on upgrade'` exists (`e2e/iv-history.spec.ts:573`)
- ✓ All linked feature pages and the `iv30-series-with-inputs-metrics-on-read` ADR exist

## Drift (3)

- ✗ Line 136 (003 field-level diff): the "Before" CHECK constraint is given as `option_type IN ('PUT', 'CALL')`. `migrations/001_initial_schema.sql` declares `option_type TEXT NOT NULL` with **no** CHECK. 003 _adds_ the CHECK rather than widening one. Suggested fix: Before = "no CHECK".
- ✗ Lines 144-159: "SQLite **cannot** modify a CHECK constraint in place… The rebuild path is required regardless of SQLite version because of the CHECK constraint change". This rests on the same false premise: no CHECK existed to modify. The rebuild was needed to _add_ one.
- ✗ Lines 534-536: "the `LegRole` CHECK constraint that already includes `'ASSIGN'` … come[s] from `001`". `001_initial_schema.sql:23` declares `leg_role TEXT NOT NULL` with no CHECK, and no migration adds one. This also contradicts `domain/wheel-lifecycle.md`, which correctly says the enums are type-only. Suggested fix: drop the CHECK claim.

## Unverifiable (5)

- ? Lines 49-50: "A failure here aborts startup — the renderer never sees a partially-migrated database." A throw from `db.exec` would propagate out of `initDb`. However, `runMigrations` wraps neither each file nor the batch in a transaction (`migrate.ts:27-31`), so a multi-statement file that fails midway could leave partial DDL. Flag for human review.
- ? Lines 66-119: the pre-ship/post-ship authoring policy and the US-35 renumber/in-place-edit history are process narrative.
- ? Lines 141-143 and 245-247: rationale for naming (PMCC future-proofing, vendor-agnostic tables).
- ? Line 225: "without storing Massive credentials in user settings" is historical rationale; the Massive vendor has been retired (US-99). Not counted as drift because it describes the motive at the time.
- ? Lines 533-544 ("Gaps"): meta-notes about which migrations lack extract entries (001, 002, 004). They are accurate as a description of the page itself.

## Missing files (0)

- None. Every linked feature page, ADR and cited source file exists. The 007 entry's downstream list (`collectIVRSnapshots`, Barchart scraper) sits under the "Dropped by migration 016 … kept as history" banner and is not counted as drift.
