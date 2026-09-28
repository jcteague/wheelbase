---
page: docs/spec/schema/tables.md
audited_at: 2026-09-28
findings: 8
---

# Audit: docs/spec/schema/tables.md

## Verified (30)

- ✓ `positions` columns `id, ticker, strategy_type, status, phase, opened_date, closed_date, account_id, notes, thesis, tags NOT NULL DEFAULT '[]', created_at, updated_at` (`migrations/001_initial_schema.sql`)
- ✓ `positions.profit_target_percent INTEGER` nullable, no CHECK (`migrations/005_add_profit_target_percent.sql`)
- ✓ `positions.management_window_dte_override INTEGER` nullable, no CHECK (`migrations/010_add_management_window_dte_override.sql`)
- ✓ Override ranges 1–99 / 6–45 (`src/main/core/alert-thresholds.ts:6-9`); `DEFAULT_MANAGEMENT_WINDOW_DTE = 21` (`src/main/core/alerts.ts:24`); `DEFAULT_PROFIT_TARGET_PERCENT = 50` (`src/main/core/profit-target.ts:4`); `src/main/services/save-position-alert-overrides.ts` exists
- ✓ `app_settings` keys `alert_default_profit_target_percent` / `alert_default_management_window_dte` (`src/main/services/alert-defaults.ts:15-16`), `screening_criteria` + `isAscending` re-check (`src/main/services/screening-criteria.ts:30,105`), `active_broker_environment` (`settings.ts:89`), `assignments_last_poll_at:${env}` (`detect-assignments.ts:87`)
- ✓ `app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)` (`migrations/006_add_credential_settings.sql`); helper `appSettings` in `src/main/services/app-settings.ts:3`
- ✓ `legs` columns match (migration 001, rebuilt by 003); `instrument_type CHECK IN ('PUT','CALL','STOCK')` after 003 (`migrations/003_rename_option_type_to_instrument_type.sql:6`); FK `position_id → positions(id)`
- ✓ Position-row transitions per event. Close/expire CSP set `status='CLOSED'` + `closed_date` (`close-csp-position.ts:76`, `expire-csp-position.ts:77`); CC close/expire set only `phase='HOLDING_SHARES'` (`close-covered-call-position.ts:79`, `expire-cc-position.ts:65`); call-away sets `WHEEL_COMPLETE/CLOSED` (`record-call-away-position.ts:92-94`); rolls issue no `UPDATE positions`
- ✓ Active-leg subquery orders `fill_date DESC, created_at DESC LIMIT 1` (`src/main/services/active-leg-sql.ts:6-15`)
- ✓ Leg inserts. `CSP_CLOSE` premium = fill = close price (`close-csp-position.ts:61-69`); `EXPIRE` premium `'0.0000'`, fill NULL (`expire-csp-position.ts:62-70`); `ASSIGN/STOCK` premium `'0.0000'`, fill NULL, fill_date = assignment date (`assign-csp-position.ts:106-114`); `CC_CLOSE` premium = fill = close price (`close-covered-call-position.ts:65,72-73`); `CC_EXPIRED` (`expire-cc-position.ts:52`); `CALLED_AWAY/EXERCISE`, fill = CC strike (`record-call-away-position.ts:78-87`); single-contract call-away (`lifecycle.ts:246`); roll pairs PUT/CALL (`roll-csp-position.ts:73,93`; `roll-cc-position.ts:80,100`)
- ✓ `cost_basis_snapshots` base columns (`migrations/001_initial_schema.sql`); CC close/expire write no snapshot
- ✓ `round4` is module-private in `src/main/core/costbasis.ts:23` with `ROUND_HALF_UP` (`:8`)
- ✓ `credential_settings` columns and `PRIMARY KEY (vendor, environment)` (`migrations/006_add_credential_settings.sql`); only `settings.ts` touches the table
- ✓ `pending_assignments` columns, `CHECK (status IN (...))`, `ON DELETE CASCADE` FKs, `detected_at DEFAULT (datetime('now'))`, integer AUTOINCREMENT PK (`migrations/008_create_pending_assignments.sql`)
- ✓ Indexes `idx_pending_assignments_status`, `idx_pending_assignments_position`, `uq_pending_assignments_activity_position (activity_id, position_id)` (`migration 008`); `INSERT OR IGNORE` in `detect-assignments.ts:117`
- ✓ Confirm in `db.transaction`, dismiss idempotent for dismissed rows, `NOT_PENDING` otherwise (`src/main/services/pending-assignments.ts:81-99,124-129`)
- ✓ `iv30_reading` columns, `expiration_tier CHECK`, `method DEFAULT 'daily_vwap'`, PK `(underlying, session, method)`, index `idx_iv30_reading_underlying_session_desc` (`migrations/016_create_iv30_history.sql`)
- ✓ `iv30_gap` columns, `reason CHECK IN ('no_underlying_bar','no_tradeable_pair')`, PK (`migration 016`); `DROP TABLE ivr_snapshot` (`migration 016`)
- ✓ Collect upserts readings and deletes the gap row in one transaction (`src/main/services/iv-history-store.ts:161-177`, `:51-62,84`); `collectIvHistory` runs `recomputeIvHistory` first (`src/main/services/iv-history.ts:200-206,271`); `IV30_ENGINE_VERSION` (`src/main/core/iv30.ts:19`); job name `ivr-collect` (`ivr-collector.ts:16`)
- ✓ 252-session window and 200 coverage gate (`src/main/core/iv-metrics.ts:3-4`)
- ✓ `alerts` columns, `status DEFAULT 'open'`, `idx_alerts_open_unique` partial unique, `idx_alerts_status_urgency` (`migrations/009_create_alerts.sql`); `dismissed_at` + `idx_alerts_dismissed_unique` (`migrations/011_add_alerts_dismissal.sql`)
- ✓ Alerts service: `randomUUID` ids, `upsertOpenAlert` returns `'suppressed'`, `AlertError('NOT_FOUND'|'NOT_OPEN')`, resolve/dismiss UPDATEs (`src/main/services/alerts.ts:5,60-72,104,117,161,203-218`); single persist transaction (`evaluate-alerts.ts:274`); rule codes and `'Review position'` (`src/main/core/alerts.ts:13-14,41`)
- ✓ `watchlist` columns, defaults, `idx_watchlist_added_at_desc` (`migrations/012_create_watchlist.sql`)
- ✓ `earnings_date` columns (`migrations/013_create_earnings_date.sql`), `last_earnings` (`migrations/014_add_last_earnings.sql`); sole writer uses `INSERT … ON CONFLICT (ticker) DO UPDATE` (`src/main/services/earnings-dates.ts:21-23`); `getEarningsCalendar` / `getEarnings` exported (`:255,297`)
- ✓ `trading_session(date PK, close_at nullable, source DEFAULT 'alpaca')` (`migrations/015_create_trading_session.sql`)
- ✓ Trading calendar constants. Refresh 420 back / 400 ahead, at most every 7 days; read 400 back / 70 ahead; 30-day coverage warning; `first_day` refetch; `auth_failed` → `no_market_data` (`src/main/services/trading-calendar-store.ts:29-47,150-160,228-230`)
- ✓ `refreshTradingCalendar` / `readTradingCalendar` exported and called by the IVR collector (`trading-calendar-store.ts:90,192`; `ivr-collector.ts:90-91`)
- ✓ Migration runner `src/main/db/migrate.ts` discovers `.sql` files by filename
- ✓ `ivr_snapshot` section framed as history (dropped by 016); not counted as drift
- ✓ All linked feature, ADR and topic pages exist (us-33, us-35, us-37, us-44, us-46, us-50, us-57-58, us-59, us-63, us-67, us-70, us-98, us-121; ADRs iv30-series-with-inputs-metrics-on-read, iv30-gap-rows-except-newest-session, barchart-retired-from-code-and-schema)

## Drift (8)

- ✗ Line 64: `positions.contracts INTEGER NOT NULL` is documented, but no migration adds it. `positions` is defined in `migrations/001_initial_schema.sql` and extended only by 005 and 010, and no service reads `p.contracts`. Suggested fix: remove the row. Contracts live on legs.
- ✗ Lines 33-34 and 125-133: "CHECK constraints enforce enum membership on `legs.leg_role`, `legs.action`…" and a "CHECK constraints" subsection listing `leg_role IN (...)` / `action IN (...)`. Neither column has a CHECK (`migrations/001_initial_schema.sql` `leg_role TEXT NOT NULL`, `action TEXT NOT NULL`; the same in `003_…sql:4-5`). Only `instrument_type` has one. Lines 128 and 131 of the page themselves say the values are enforced via Zod.
- ✗ Lines 138-145: legs indexes are given as "Foreign-key index on `position_id`… No additional secondary indexes are declared". Two secondary indexes exist: `idx_legs_position_fill_date (position_id, fill_date)` (`migrations/001_initial_schema.sql`) and `idx_legs_position_role_date (position_id, leg_role, fill_date DESC, created_at DESC)` (`migrations/002_add_query_indexes.sql`). SQLite creates no implicit FK index. The page also leaves out `idx_positions_status_phase`, `idx_positions_ticker` (001) and `idx_snapshots_position_at` (002).
- ✗ Lines 248-257: the `cost_basis_snapshots` column table omits `trigger_event TEXT NOT NULL DEFAULT 'UNKNOWN'` (`migrations/004_add_trigger_event_to_snapshots.sql:1`), which every service writes (e.g. `'CALL_AWAY'` at `record-call-away-position.ts:100`).
- ✗ Line 254: `final_pnl` "**only** set on terminal events (CSP close, CSP expiry)". Call-away also sets it (`record-call-away-position.ts:97-101`), as the page's own table at line 271 says.
- ✗ Lines 242, 288-294: "the new row's `snapshot_at` is bumped by 1 ms" and "latest wins via `ORDER BY snapshot_at DESC LIMIT 1`". There is no 1 ms bump. `snapshot_at` is `makeSnapshotAt(eventDate)`, the event date plus the current wall-clock time (`src/main/dates.ts:24-26`, used at `expire-csp-position.ts:55`). Ties are broken by `ORDER BY snapshot_at DESC, rowid DESC` (`get-position.ts:208`, `list-positions.ts:50`).
- ✗ Lines 212-213: `CC_OPEN` is written "with `fill_price=NULL`". `open-covered-call-position.ts:73-80` writes `premiumFormatted` to both `premium_per_contract` and `fill_price`.
- ✗ Line 336: "Massive does not use this table; shared Massive configuration remains outside user settings." This is a present-tense reference to the retired Massive vendor. Market data is Alpaca (`src/main/integrations/market-data-factory.ts:21`), resolving the saved Alpaca credentials, which take priority over env (`alpaca-credentials.ts` docblock; `market-data-factory.ts:7-13`). Suggested fix: drop the sentence, or say market data reuses the Alpaca rows.

## Unverifiable (5)

- ? Lines 680-683: `earnings_date` "a deliberate contrast with `ivr_snapshot`, whose composite key exists because IVR's history _is_ the product". The comparison is to a table dropped by 016. It is rationale prose, but the present tense reads as stale.
- ? Line 667: the watchlist conditions drive "the future US-96 Signal". Whether US-96 has shipped (`src/main/core/watchlist-signal.ts` exists) is a product-status judgement.
- ? Lines 462-465: history of the green phase correcting an early INTEGER FK spec (narrative).
- ? Line 302: "The renderer formats to 2 dp for display" was not checked across all formatters.
- ? Line 27 / 49: "never deleted", "Alpaca is the execution layer only": invariants not mechanically provable by grep (no `DELETE FROM positions` found in services).

## Missing files (0)

- (none)
