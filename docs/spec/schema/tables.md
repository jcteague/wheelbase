# Database Tables

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-14,us-33,us-35,us-37,us-44,us-50 -->

## Overview

Wheelbase persists every wheel position, every option/stock leg, and every
basis-changing event in a single SQLite database. The wheel-domain core is
three tables deep — **`positions`** owns one row per wheel, **`legs`** owns
one row per sold/bought/expired/assigned option (and one row per
stock-assignment marker), and **`cost_basis_snapshots`** owns an append-only
history of effective per-share basis and final P&L. Three supporting tables
sit alongside the domain core: **`pending_assignments`** records broker-detected
assignments awaiting trader confirmation, **`credential_settings`** holds
encrypted broker credentials, and **`app_settings`** is a generic key/value
store for non-secret settings (broker environment selection, poll watermarks).
A separate market-data table sits outside the wheel domain entirely:
**`ivr_snapshot`** stores one daily IV-rank observation per active-position
underlying, written by the after-close IVR collection job. Finally,
**`alerts`** holds the management-alert set produced by the scheduled
evaluation job: at most one **open** alert per `(position, rule)`, with cleared
conditions resolved in place (rows are never deleted, so the table doubles as
an audit trail).
SQLite is the source of truth; Alpaca is the execution layer only.

Money values are stored as `TEXT` at 4 dp and converted to/from `decimal.js`
at the boundary using `ROUND_HALF_UP` via the `round4` helper. Dates
are ISO `YYYY-MM-DD` strings; timestamps are ISO 8601 strings. Foreign keys
on `legs.position_id` and `cost_basis_snapshots.position_id` reference
`positions.id`. CHECK constraints enforce enum membership on `legs.leg_role`,
`legs.action`, and (post-migration 003) `legs.instrument_type`.

Migrations are SQL files in `migrations/` discovered by filename order via
`src/main/db/migrate.ts`. See [Migrations](./migrations.md) for the change
log; see [Wheel Lifecycle](../domain/wheel-lifecycle.md) for how the tables
move together through `CSP_OPEN → HOLDING_SHARES → CC_OPEN → WHEEL_COMPLETE`
and [Cost Basis](../domain/cost-basis.md) for how snapshots are produced.

<!-- /generated -->

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-14,us-33,us-57-58 -->

## `positions`

One row per wheel. The row is created at CSP open, updated on phase
transition, and never deleted — closed positions stay in the table so the
list view can render an "Active" / "Closed" split.

### Columns

| Column                           | Type    | Nullable | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                             | TEXT    | No       | UUID primary key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ticker`                         | TEXT    | No       | Equity symbol, uppercase                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `strategy_type`                  | TEXT    | No       | Strategy identifier (Phase 1: wheel)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `phase`                          | TEXT    | No       | Lifecycle phase (`CSP_OPEN`, `HOLDING_SHARES`, `CC_OPEN`, `WHEEL_COMPLETE`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `status`                         | TEXT    | No       | `ACTIVE` or `CLOSED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `opened_date`                    | TEXT    | No       | ISO date when the wheel was opened                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `closed_date`                    | TEXT    | Yes      | ISO date set when the position transitions to a terminal phase                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `account_id`                     | TEXT    | Yes      | Broker account identifier the position belongs to; `NULL` when unassigned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `contracts`                      | INTEGER | No       | Contracts on the original CSP (shares held after assignment = `× 100`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `notes`                          | TEXT    | Yes      | Free-form trader notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `thesis`                         | TEXT    | Yes      | Free-form trade thesis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `tags`                           | TEXT    | No       | JSON-encoded array of trader tags; `NOT NULL DEFAULT '[]'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `profit_target_percent`          | INTEGER | Yes      | Per-position profit-target override (1-99); `NULL` → inherit the global default (the `alert_default_profit_target_percent` `app_settings` key, edited via US-57's Settings page, else hardcoded `DEFAULT_PROFIT_TARGET_PERCENT = 50`). Added by migration `005`. No DB `CHECK` — validation lives in the service layer, enforced by the `positions:save-alert-overrides` IPC (`src/main/services/save-position-alert-overrides.ts`). See [us-33 — Option Mid & Unrealized P&L](../features/us-33-option-mid-pnl.md) and [us-57-58 — Configurable Alert Thresholds](../features/us-57-58-configurable-alert-thresholds.md). |
| `management_window_dte_override` | INTEGER | Yes      | Per-position management-window override, in DTE (6-45); `NULL` → inherit the global default (the `alert_default_management_window_dte` `app_settings` key, edited via US-57's Settings page, else hardcoded `DEFAULT_MANAGEMENT_WINDOW_DTE = 21`). Added by migration `010_add_management_window_dte_override.sql`. No DB `CHECK` — validation lives in the service layer, enforced by the `positions:save-alert-overrides` IPC (`src/main/services/save-position-alert-overrides.ts`). See [us-57-58 — Configurable Alert Thresholds](../features/us-57-58-configurable-alert-thresholds.md).                             |
| `created_at`                     | TEXT    | No       | ISO timestamp at row insert                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `updated_at`                     | TEXT    | No       | ISO timestamp, refreshed on every phase transition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### How rows change

- **Open** (US-1): row INSERT with `phase='CSP_OPEN'`, `status='ACTIVE'`,
  `closed_date=NULL`.
- **Close CSP early** (US-4): UPDATE `phase` to `CSP_CLOSED_PROFIT` or
  `CSP_CLOSED_LOSS`, `status='CLOSED'`, `closed_date=close fill date`.
- **Expire CSP** (US-5): UPDATE `phase='WHEEL_COMPLETE'`, `status='CLOSED'`,
  `closed_date=expiration date`.
- **Assignment** (US-6): UPDATE `phase='HOLDING_SHARES'` only; `status` and
  `closed_date` stay unchanged (wheel still in flight).
- **Open CC** (US-7): UPDATE `phase='CC_OPEN'`.
- **Close CC early** (US-8) or **CC expires** (US-9): UPDATE
  `phase='HOLDING_SHARES'`; wheel stays `ACTIVE`.
- **Shares called away** (US-10): UPDATE `phase='WHEEL_COMPLETE'`,
  `status='CLOSED'`, `closed_date=CC expiration date`. Terminal — no
  further phase transitions are valid from `WHEEL_COMPLETE`.
- **Roll CSP** (US-12): no UPDATE — phase stays `CSP_OPEN`; the new
  `ROLL_TO` leg becomes the effective active leg.
- **Roll CC** (US-14): no UPDATE — phase stays `CC_OPEN`; the new
  `ROLL_TO` leg becomes the effective active CC leg.

<!-- /generated -->

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-14,us-33 -->

## `legs`

One row per option or stock event attached to a position. Every leg is
written once and never mutated — including rolls, which are recorded as a
**linked `ROLL_FROM` / `ROLL_TO` pair** sharing a `roll_chain_id`. This
immutability is what lets cost basis and P&L be re-derived from leg history.

### Columns

| Column                 | Type    | Nullable | Purpose                                                                                                                        |
| ---------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`                   | TEXT    | No       | UUID primary key                                                                                                               |
| `position_id`          | TEXT    | No       | FK → `positions.id`                                                                                                            |
| `leg_role`             | TEXT    | No       | One of `CSP_OPEN`, `CSP_CLOSE`, `CC_OPEN`, `CC_CLOSE`, `CC_EXPIRED`, `CALLED_AWAY`, `ROLL_FROM`, `ROLL_TO`, `ASSIGN`, `EXPIRE` |
| `action`               | TEXT    | No       | `SELL`, `BUY`, `EXPIRE`, `ASSIGN`, or `EXERCISE` (see enum evolution below)                                                    |
| `instrument_type`      | TEXT    | No       | `PUT`, `CALL`, or `STOCK` (renamed from `option_type` in migration 003)                                                        |
| `strike`               | TEXT    | No       | 4-dp Decimal string                                                                                                            |
| `expiration`           | TEXT    | No       | ISO date                                                                                                                       |
| `contracts`            | INTEGER | No       | Contract count for this leg                                                                                                    |
| `premium_per_contract` | TEXT    | No       | 4-dp Decimal string; `'0.0000'` for `EXPIRE` and `ASSIGN` event markers                                                        |
| `fill_price`           | TEXT    | Yes      | 4-dp Decimal string; `NULL` for `EXPIRE` and `ASSIGN` legs (no broker fill occurs)                                             |
| `fill_date`            | TEXT    | No       | ISO date                                                                                                                       |
| `order_id`             | TEXT    | Yes      | Broker order id for the fill; `NULL` for manually entered or event-marker legs                                                 |
| `roll_chain_id`        | TEXT    | Yes      | Shared UUID stamped on both legs of a roll pair; lets the chain be queried as a unit                                           |
| `created_at`           | TEXT    | No       | ISO timestamp                                                                                                                  |
| `updated_at`           | TEXT    | No       | ISO timestamp                                                                                                                  |

### CHECK constraints

- `leg_role IN ('CSP_OPEN', 'CSP_CLOSE', 'CC_OPEN', 'CC_CLOSE', 'CC_EXPIRED', 'CALLED_AWAY', 'ROLL_FROM', 'ROLL_TO', 'ASSIGN', 'EXPIRE')` —
  enforced via the Zod `LegRole` enum; `CC_EXPIRED` and `CALLED_AWAY`
  were added by US-11 as type-only changes (no migration required).
- `action IN ('SELL', 'BUY', 'EXPIRE', 'ASSIGN', 'EXERCISE')` — enforced
  via the Zod `LegAction` enum; no DB CHECK exists on `action` at the SQL
  level (US-5 added `EXPIRE`, US-6 added `ASSIGN`, and US-10 added
  `EXERCISE` as type-only changes for that reason).
- After **migration 003**: `instrument_type IN ('PUT', 'CALL', 'STOCK')`.
  Before the migration the column was named `option_type` with CHECK
  `IN ('PUT', 'CALL')`.

### Indexes

- Implicit primary-key index on `id`.
- Foreign-key index on `position_id` (used by `get-position.ts` and
  `list-positions.ts` to fetch leg history).
- No additional secondary indexes are declared in the extracts; active-leg
  selection is a `LEFT JOIN` with a correlated subquery ordering by
  `fill_date DESC, created_at DESC LIMIT 1`.

### Rolls — linked leg pairs, never in-place updates

A roll closes the current option and opens a new one in the **same
transaction** as two leg INSERTs. The pair is bound by a shared
`roll_chain_id` UUID; the `ROLL_FROM` leg records the buy-to-close
(`action='BUY'`, `premium_per_contract=costToClose`, strike/expiration
copied from the prior leg), and the `ROLL_TO` leg records the sell-to-open
(`action='SELL'`, `premium_per_contract=newPremium`, new `strike` and
`expiration`). The `positions` row is not updated — `phase` stays
`CSP_OPEN` for a CSP roll (US-12) or `CC_OPEN` for a CC roll (US-14). The
active-leg query in `src/main/services/active-leg-sql.ts` therefore resolves
the "current open leg" as the most recent open or `ROLL_TO` leg by
`fill_date DESC, created_at DESC`. The shared `roll_chain_id` UUID is the
only linkage between the paired legs — it lets the `ROLL_FROM` / `ROLL_TO`
pair be queried as a unit. The CSP and CC roll paths write identical row shapes apart from
`instrument_type` (`PUT` vs `CALL`) — the schema and the
`calculateRollBasis()` math are shared (US-14 reuses both unchanged).

### Enum evolution

- **US-1 (initial schema)**: `LegAction = ['SELL', 'BUY']`,
  `OptionType = ['PUT', 'CALL']`.
- **US-5**: `LegAction` extended to `['SELL', 'BUY', 'EXPIRE']` to record
  CSPs that expired worthless. Type-only change — no DB CHECK exists on
  `action`, so no migration was required.
- **US-6**: `LegAction` extended to `['SELL', 'BUY', 'EXPIRE', 'ASSIGN']`
  for the broker-initiated stock-delivery marker (also type-only). The
  same story **renamed** `option_type → instrument_type` and added
  `'STOCK'` to its CHECK constraint via
  `migrations/003_rename_option_type_to_instrument_type.sql`. After this
  point an `ASSIGN` leg writes `instrument_type='STOCK'` while every other
  leg writes `'PUT'` or `'CALL'`.
- **US-10**: `LegAction` extended to
  `['SELL', 'BUY', 'EXPIRE', 'ASSIGN', 'EXERCISE']` for the call-away
  exercise marker. Type-only change — no migration required. `legs.action`
  remains `TEXT`. The `EXERCISE` value is used exclusively for the
  `CC_CLOSE` / `CALLED_AWAY` leg created when shares are called away; it
  is **distinct from `BUY`**, which remains the buy-to-close action in
  US-8.
- **US-11**: `LegRole` extended with `CALLED_AWAY` (written by US-10's
  call-away path in place of a generic `CC_CLOSE`) and `CC_EXPIRED`
  (written by US-9's CC-expiration path in place of a generic `EXPIRE`).
  Type-only change — no migration required. After this point, `CC_CLOSE`
  remains in use **only** for the US-8 buy-to-close path; terminal CC
  events use the distinct `CALLED_AWAY` / `CC_EXPIRED` roles so the
  renderer's leg-history table can label and annotate them per the
  US-11 mockup.

### How rows are inserted

Every lifecycle event inserts exactly one leg row (rolls insert two in one
transaction). The body of each event-specific INSERT is documented per
feature in [the feature pages](../features/); the common shape is:

- `CSP_OPEN` (US-1): `action='SELL'`, `instrument_type='PUT'`, premium and
  fill recorded from the form.
- `CSP_CLOSE` (US-4): `action='BUY'`, `instrument_type='PUT'`, strike /
  expiration / contracts copied from the open leg, `premium_per_contract`
  set to the close price.
- `EXPIRE` (US-5): `action='EXPIRE'`, `premium_per_contract='0.0000'`,
  `fill_price=NULL`, `fill_date` set to the option's expiration date.
  Used for CSPs that expired worthless.
- `ASSIGN` (US-6): `action='ASSIGN'`, `instrument_type='STOCK'`,
  `premium_per_contract='0.0000'`, `fill_price=NULL`, `fill_date` from the
  trader-supplied assignment date.
- `CC_OPEN` (US-7): `action='SELL'`, `instrument_type='CALL'`, manual entry
  with `fill_price=NULL`.
- `CC_CLOSE` (US-8): `action='BUY'`, `instrument_type='CALL'`,
  `fill_price=premium_per_contract` (both = close price), strike /
  expiration / contracts copied from the open CC leg. Used **only** for
  the buy-to-close path.
- `CC_EXPIRED` (US-9): `action='EXPIRE'`, `instrument_type='CALL'`,
  `premium_per_contract='0.0000'`, `fill_price=NULL`, `fill_date` set to
  the CC's expiration date. Distinct leg role per US-11 so the
  worthless-expiry case is labelled and annotated separately from a
  manual buy-to-close in the leg-history table.
- `CALLED_AWAY` (US-10): `action='EXERCISE'`, `instrument_type='CALL'`,
  `premium_per_contract='0.0000'`, `fill_price = CC strike`,
  `fill_date = CC expiration`. Strike, expiration, and contracts (which
  must equal `1` in Phase 1) are copied from the originating `CC_OPEN`
  leg; the trader does not supply them. Terminal — same transaction also
  flips the position to `WHEEL_COMPLETE`/`CLOSED` and writes a final
  cost-basis snapshot with `final_pnl`.
- `ROLL_FROM` / `ROLL_TO` (US-12 for CSP rolls, US-14 for CC rolls): pair
  inserted under one transaction; `instrument_type='PUT'` for the CSP
  roll path and `'CALL'` for the CC roll path. See "Rolls" above.

<!-- /generated -->

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-14,us-33 -->

## `cost_basis_snapshots`

**Append-only** history of effective per-share basis and final P&L. Every
basis-changing event writes a new row; the opening snapshot is never
mutated. The latest row wins via `ORDER BY snapshot_at DESC LIMIT 1`. This
mirrors the immutable leg-pair pattern used for rolls and gives a free
audit trail of how basis evolved over the life of the wheel.

### Columns

| Column                    | Type | Nullable | Purpose                                                                      |
| ------------------------- | ---- | -------- | ---------------------------------------------------------------------------- |
| `id`                      | TEXT | No       | UUID primary key                                                             |
| `position_id`             | TEXT | No       | FK → `positions.id`                                                          |
| `basis_per_share`         | TEXT | No       | 4-dp Decimal string; effective per-share entry price after the event         |
| `total_premium_collected` | TEXT | No       | 4-dp Decimal string; running sum of all premium credits net of debits        |
| `final_pnl`               | TEXT | Yes      | 4-dp Decimal string; **only** set on terminal events (CSP close, CSP expiry) |
| `annualized_return`       | TEXT | Yes      | Reserved for a future story; written as `NULL` today                         |
| `snapshot_at`             | TEXT | No       | ISO timestamp used for "latest wins" ordering                                |
| `created_at`              | TEXT | No       | ISO timestamp                                                                |

### Which events write a snapshot

| Event                           | Writes row? | `final_pnl`                                                        |
| ------------------------------- | ----------- | ------------------------------------------------------------------ |
| CSP open (US-1)                 | Yes         | `NULL`                                                             |
| Roll CSP (US-12)                | Yes         | `NULL`                                                             |
| Close CSP early (US-4)          | Yes         | `(openPremium − closePrice) × contracts × 100`                     |
| Expire CSP worthless (US-5)     | Yes         | equals `total_premium_collected` (100% captured)                   |
| Record assignment (US-6)        | Yes         | `NULL` (position still active)                                     |
| Open covered call (US-7)        | Yes         | `NULL`                                                             |
| **Close CC early (US-8)**       | **No**      | n/a — CC_OPEN snapshot unchanged; `ccLegPnl` returned via IPC only |
| **CC expires worthless (US-9)** | **No**      | n/a — CC_OPEN snapshot unchanged                                   |
| Shares called away (US-10)      | Yes         | `(ccStrike − basisPerShare) × contracts × 100` — terminal          |
| Roll CC (US-14)                 | Yes         | `NULL`                                                             |

The two "no snapshot" cases are deliberate: at CC close / CC expiry the
existing CC_OPEN snapshot already reflects the CC premium reduction, the
wheel is still in flight, and no final P&L has crystallised yet. The CC
leg's P&L is returned in the IPC envelope as `ccLegPnl` but is not
persisted.

The call-away snapshot is the terminal snapshot for the wheel cycle.
It carries the prior CC_OPEN snapshot's `basis_per_share` and
`total_premium_collected` forward unchanged and sets `final_pnl` to the
share-appreciation P&L `(ccStrike − basisPerShare) × sharesHeld`. The
formula uses the **effective** `basisPerShare` from the latest
pre-call-away snapshot — premium reductions are already baked in and
are never re-added (US-10).

### Tie-breaking on simultaneous snapshots

When two snapshots could share the same `snapshot_at` value (e.g. an
expire event recorded against an opening snapshot written milliseconds
earlier), the new row's `snapshot_at` is bumped by 1 ms so the
`ORDER BY snapshot_at DESC LIMIT 1` query reliably returns the newer row
(US-5).

<!-- /generated -->

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-14,us-33 -->

## Money math

- All money is stored as `TEXT` at 4 dp. The renderer formats to 2 dp for
  display.
- All arithmetic uses `decimal.js` with `ROUND_HALF_UP` via the private
  `round4` helper in `src/main/core/costbasis.ts` (not exported; used only
  within that module). No native float math is used anywhere in the core
  engines.
- IPC payloads accept numbers (validated by Zod) and the service layer
  converts to Decimal strings before the SQL INSERT.

<!-- /generated -->

<!-- generated:from us-37 -->

## `credential_settings`

Generic encrypted credential storage for external vendors. US-37 writes Alpaca rows only, one per environment (`paper`, `live`), but the table name stays vendor-agnostic so future brokerages can reuse the model.

### Columns

| Column                  | Type | Nullable | Purpose                                           |
| ----------------------- | ---- | -------- | ------------------------------------------------- |
| `vendor`                | TEXT | No       | Vendor identifier; US-37 writes `'alpaca'`        |
| `environment`           | TEXT | No       | Environment key (`'paper'` or `'live'`)           |
| `key_id_encrypted`      | BLOB | No       | Encrypted Alpaca key ID                           |
| `secret_encrypted`      | BLOB | No       | Encrypted Alpaca secret                           |
| `last_verified_at`      | TEXT | Yes      | ISO timestamp of the last successful verification |
| `account_number_masked` | TEXT | Yes      | Masked account identity like `PA…ABC`             |
| `created_at`            | TEXT | No       | ISO timestamp at insert                           |
| `updated_at`            | TEXT | No       | ISO timestamp at last update                      |

### Constraints and semantics

- Unique key on `(vendor, environment)` guarantees at most one Alpaca paper row and one Alpaca live row.
- Plaintext secrets never persist in SQLite; encryption and decryption are confined to `src/main/services/settings.ts`.
- Massive does not use this table; shared Massive configuration remains outside user settings.

<!-- /generated -->

<!-- generated:from us-37,us-35 -->

## `app_settings`

Lightweight key/value persistence for non-secret application settings. US-37
introduced the table to remember the active broker environment across launches;
US-35 consumes the same table to persist per-environment assignment-detection
poll watermarks.

### Columns

| Column       | Type | Nullable | Purpose                         |
| ------------ | ---- | -------- | ------------------------------- |
| `key`        | TEXT | No       | Setting key (primary key)       |
| `value`      | TEXT | No       | Stored value                    |
| `updated_at` | TEXT | No       | ISO timestamp of the last write |

### Known keys

| Key                              | Owner | Values                           | Purpose                                                                                                                |
| -------------------------------- | ----- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `active_broker_environment`      | US-37 | `'paper'`, `'live'`, or `'none'` | Trader-selected broker environment. Effective value collapses to `'none'` if the stored environment lacks credentials. |
| `assignments_last_poll_at:paper` | US-35 | ISO-8601 timestamp               | High-water mark passed as `since` to `BrokerProvider.getActivities()` on the paper-env assignment poll.                |
| `assignments_last_poll_at:live`  | US-35 | ISO-8601 timestamp               | Same as above for the live environment.                                                                                |

### Semantics

- The table is owned by US-37 (migration 006); US-35 consumes it without
  schema changes — only the set of recognised keys grows.
- Watermark keys follow the convention `<feature>_last_poll_at:<env>` so
  paper and live state never collide. Watermarks are captured at **poll
  start** (not poll end) — see
  [us-35 — Assignment Detection](../features/us-35-assignment-detection.md)
  for the read-then-update race rationale.
- `appSettings.get/set` lives in `src/main/services/app-settings.ts` and
  always writes `updated_at` on `set()`.
- Effective active broker environment is derived through
  `src/main/services/settings.ts` logic, not by reading
  `active_broker_environment` directly.

<!-- /generated -->

<!-- generated:from us-35 -->

## `pending_assignments`

Broker-detected assignment activities awaiting trader confirmation. A
"pending" row IS the notification — the renderer queries this table directly,
which lets banners survive app restart for free and makes confirm/dismiss a
plain status transition on the same row. Rows are written by the
`detect-assignments` poll job that consumes Alpaca `OPASN` activities; rows
are mutated by the `assignments:confirm` and `assignments:dismiss` IPC
handlers. See [us-35 — Assignment Detection](../features/us-35-assignment-detection.md)
and [us-46 — Polling Scheduler](../features/us-46-polling-scheduler.md).

### Columns

| Column             | Type    | Nullable | Purpose                                                                                                  |
| ------------------ | ------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `id`               | INTEGER | No       | Auto-increment primary key. Used as the opaque handle in IPC confirm/dismiss payloads.                   |
| `position_id`      | TEXT    | No       | FK → `positions.id` (`ON DELETE CASCADE`). TEXT because positions use UUID primary keys.                 |
| `leg_id`           | TEXT    | No       | FK → `legs.id` (`ON DELETE CASCADE`). The open CSP leg whose OCC symbol matched the assignment activity. |
| `activity_id`      | TEXT    | No       | Alpaca activity identifier from the OPASN event. Drives dedupe.                                          |
| `broker_symbol`    | TEXT    | No       | OCC option symbol from the activity (e.g. `AAPL260119P00180000`).                                        |
| `qty`              | INTEGER | No       | Contract quantity reported by the activity.                                                              |
| `transaction_time` | TEXT    | No       | ISO-8601 timestamp from the activity.                                                                    |
| `status`           | TEXT    | No       | `'pending'`, `'confirmed'`, or `'dismissed'` — enforced by CHECK constraint.                             |
| `detected_at`      | TEXT    | No       | ISO timestamp when the row was inserted by the poll job (defaults to `datetime('now')`).                 |
| `confirmed_at`     | TEXT    | Yes      | Set when `status` transitions to `'confirmed'`.                                                          |
| `dismissed_at`     | TEXT    | Yes      | Set when `status` transitions to `'dismissed'`.                                                          |

### Constraints

- `CHECK (status IN ('pending','confirmed','dismissed'))`.
- `FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE`.
- `FOREIGN KEY (leg_id) REFERENCES legs(id) ON DELETE CASCADE`.

### Indexes

- `idx_pending_assignments_status` on `status` — supports the
  `listPending` query (`WHERE status='pending'`).
- `idx_pending_assignments_position` on `position_id` — supports the
  position-list page's "which positions have a pending assignment?" set
  computation.
- `uq_pending_assignments_activity_position` — **compound UNIQUE** on
  `(activity_id, position_id)`. The poll job uses `INSERT OR IGNORE` for
  idempotency; the compound key allows a single OPASN activity to match
  multiple open CSP positions on the same OCC symbol (one pending row per
  position) while still preventing duplicate processing of the same
  `(activity, position)` pair on subsequent polls.

### How rows change

- **Detect** (US-35 poll job): `INSERT OR IGNORE` with `status='pending'`,
  `detected_at=datetime('now')`. One row per `(activity_id, position_id)`
  match.
- **Confirm**: `UPDATE` `status='confirmed'`, `confirmed_at=now`. Wrapped in
  an outer `db.transaction()` so the inner `assignCspPosition` call (which
  transitions the position to `HOLDING_SHARES`, inserts an `ASSIGN` stock
  leg, and writes a cost-basis snapshot) and this status flip are atomic.
- **Dismiss**: `UPDATE` `status='dismissed'`, `dismissed_at=now`. Idempotent
  for already-dismissed rows; rejects confirmed rows with
  `PendingAssignmentError('NOT_PENDING')`.

### Why an integer primary key (not a UUID)

`pending_assignments.id` is `INTEGER PRIMARY KEY AUTOINCREMENT` even though
the rest of the schema uses TEXT UUID PKs. The integer is an opaque server-
generated handle passed back via IPC for confirm/dismiss; it never crosses
trust boundaries beyond the renderer and isn't referenced by any other table.
FK columns (`position_id`, `leg_id`) are TEXT to match their referenced
tables — the green phase corrected an early INTEGER spec that would have
broken referential integrity.

<!-- /generated -->

<!-- generated:from us-44 -->

## `ivr_snapshot`

Daily implied-volatility-rank observations, one row per active-position
underlying per market day. Rows are written by the after-close IVR
collection job (`collectIVRSnapshots`), which batches distinct active
tickers through the Barchart scraper. This table sits outside the wheel
domain — it has no foreign key into `positions`; targets are derived by
selecting distinct `ticker` from `positions` where `status != 'CLOSED'`.
Added by migration `007`. See
[us-44 — IVR Snapshot Store and Scheduler](../features/us-44-ivr-snapshot-store-and-scheduler.md).

### Columns

| Column        | Type | Nullable | Purpose                                                                              |
| ------------- | ---- | -------- | ------------------------------------------------------------------------------------ |
| `underlying`  | TEXT | No       | Uppercase ticker symbol, sourced from `positions.ticker`                             |
| `observed_at` | TEXT | No       | ISO-8601 timestamp of the observation (from the scraper's `observedAt`)              |
| `ivr`         | TEXT | No       | IV rank as a Decimal string at 1 dp; constrained to `0..100` via `IVRDataSchema`     |
| `ivp`         | TEXT | Yes      | IV percentile as a Decimal string at 1 dp when Barchart returns it; otherwise `NULL` |
| `iv30`        | TEXT | Yes      | 30-day historical volatility as a Decimal string when provided; otherwise `NULL`     |
| `source`      | TEXT | No       | Data-provider tag; `NOT NULL DEFAULT 'barchart'`, persisted exactly as `'barchart'`  |

### Constraints and indexes

- **Primary key** `(underlying, observed_at)` — a single underlying may hold
  multiple observations distinguished by timestamp.
- **Secondary index** on `(underlying, observed_at DESC)` — supports
  latest-snapshot lookups (the most recent observation per underlying).
- `underlying` is validated non-empty and uppercase before persistence; `ivr`
  is range-checked `0..100` at the schema boundary. There are no DB-level
  CHECK constraints — validation lives in the service layer via
  `IVRDataSchema`.

### Same-day overwrite

The latest same-day value wins. Because the primary key includes the exact
`observed_at` timestamp, a second run on the same day would otherwise insert a
new row rather than replace the earlier one. The collector therefore runs a
delete-then-insert inside one transaction: before inserting the fresh row it
deletes any existing row for the same `underlying` whose `observed_at` falls on
the same **UTC calendar date** as the new observation. This keeps one row per
underlying per UTC day while preserving the precise observation timestamp.

### How rows change

- **Collect** (US-44, scheduled after-close job or manual `ivr:collect-now`
  trigger): for each distinct active-position underlying, delete same-UTC-day
  rows then `INSERT` the fresh observation with `source='barchart'`. A
  `not_available` scraper result writes **no row** (counted as skipped);
  parse/network/rate-limit errors write no row and the batch continues to the
  next ticker. On a non-trading day the whole batch exits before any fetch and
  no rows are written.

<!-- /generated -->

<!-- generated:from us-50,us-59 -->

## `alerts`

Management alerts produced by the scheduled `alert-evaluation` job. The
evaluation engine in `src/main/core/alerts.ts` matches every active CSP/CC
position against the built-in rules; the persistence layer in
`src/main/services/alerts.ts` upserts open alerts in place and resolves
cleared conditions. Rows are **never deleted** — resolution flips status and
stamps `resolved_at`, so the table is a complete audit trail of what fired and
when. US-50 introduced the table with no IPC surface; the `alerts:list` read
path now exists in `src/main/ipc/alerts.ts`, and US-59 added `alerts:dismiss`.
Added by migration `009`; extended by migration `011`. See
[US-50 — Alert Engine](../features/us-50-alert-engine.md),
[US-59 — Dismiss an Alert](../features/us-59-dismiss-alert.md), and
[Management Alerts](../domain/alerts.md).

### Columns

| Column              | Type | Nullable | Purpose                                                                                                         |
| ------------------- | ---- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `id`                | TEXT | No       | UUID primary key, generated in the service layer via `crypto.randomUUID()`                                      |
| `position_id`       | TEXT | No       | FK → `positions.id`                                                                                             |
| `rule_code`         | TEXT | No       | Rule identifier; e.g. `EXPIRATION_IMMINENT` or `MANAGEMENT_WINDOW`                                              |
| `urgency`           | TEXT | No       | `high`, `medium`, or `low`                                                                                       |
| `summary`           | TEXT | No       | Human-readable queue text, e.g. `Expires in 5 days at $180.00 strike`                                           |
| `quick_action`      | TEXT | No       | Queue button label; Phase 3 always `Review position`                                                            |
| `status`            | TEXT | No       | `open`, `resolved`, or `dismissed`; `NOT NULL DEFAULT 'open'`                                                    |
| `triggered_at`      | TEXT | No       | ISO timestamp of first firing; never mutated while the alert stays open                                         |
| `last_evaluated_at` | TEXT | No       | ISO timestamp of the most recent re-matching evaluation                                                         |
| `resolved_at`       | TEXT | Yes      | Set when `status` transitions to `resolved` (including a dismissed row that later clears, US-59)                |
| `dismissed_at`      | TEXT | Yes      | **(US-59, migration 011)** Set once when `status` transitions `open → dismissed`; never cleared, even once the row later moves to `resolved` — permanent audit marker |
| `created_at`        | TEXT | No       | ISO timestamp at row insert                                                                                     |
| `updated_at`        | TEXT | No       | ISO timestamp at last update                                                                                    |

### Indexes

- `idx_alerts_open_unique` — **partial UNIQUE** on `(position_id, rule_code)`
  `WHERE status = 'open'`. Guarantees at most one open alert per
  `(position, rule)` while allowing any number of historical
  `resolved` / `dismissed` rows for the same pair. Full uniqueness on
  `(position_id, rule_code)` was rejected because it would block a rule from
  re-firing after its earlier alert resolved.
- `idx_alerts_status_urgency` on `(status, urgency)` — supports the
  open-management-queue read path (US-51 consumes it).
- `idx_alerts_dismissed_unique` **(US-59, migration 011)** — partial UNIQUE on
  `(position_id, rule_code) WHERE status = 'dismissed'`. Mirrors
  `idx_alerts_open_unique`: at most one _currently_ dismissed row per
  `(position, rule)` at a time, while historical dismissed-then-resolved rows
  accumulate freely.

### State transitions

- `(none) → open` — a rule matches; INSERT with `status='open'`,
  `triggered_at=last_evaluated_at=now`.
- `open → open` — re-match on a later run: in-place UPDATE that preserves
  `triggered_at` and advances `last_evaluated_at` and `summary`.
- `open → resolved` — the condition no longer matches: UPDATE
  `status='resolved'`, `resolved_at=now`; the row is retained and excluded
  from open-queue reads. Resolution is **global** — every open alert whose
  `(position_id, rule_code)` key is absent from the current run's match set is
  resolved, including alerts for positions that have closed, rolled out of
  window, or lost their active option leg.
- `resolved → (new) open row` — if the same rule matches again later, a fresh
  open row is inserted; the old resolved row stays intact (distinct
  `triggered_at` history).
- `open → dismissed` **(US-59)** — the trader dismisses via `alerts:dismiss`:
  UPDATE `status='dismissed'`, `dismissed_at=now`; `triggered_at` untouched.
- `dismissed → dismissed` (blocked re-open, **US-59**) — while a dismissed row
  exists for a key, `upsertOpenAlert` returns `'suppressed'` rather than
  inserting or updating, so a still-true condition can't silently reappear.
- `dismissed → resolved` **(US-59)** — the same global keep-open-key check
  that resolves open rows also retires a dismissed row once its key drops out
  of the current run's match set: UPDATE `status='resolved'`,
  `resolved_at=now`; `dismissed_at` is preserved.
- Dismissing a non-`open` row is rejected (`AlertError`, `NOT_FOUND` or
  `NOT_OPEN`) rather than transitioning the row — **US-59**.

Rows are never deleted. Persistence runs **compute-then-persist**: all pure
engine evaluation happens outside any transaction (per-position `try/catch` so
one bad position cannot abort the run), then every upsert and every resolution
is written inside a single `db.transaction(...)`, so a compute error never
leaves partially written rows.

<!-- /generated -->

## See also

- [Migrations](./migrations.md) — chronological change log for the schema
  including migration 003 (`option_type → instrument_type`), migration
  005 (`positions.profit_target_percent`), migration 006
  (`credential_settings` / `app_settings`), migration 007
  (`ivr_snapshot`), and migration 008
  (`pending_assignments`).
- [Cost Basis](../domain/cost-basis.md) — how the append-only snapshot
  pattern is produced by each lifecycle event.
- [Wheel Lifecycle](../domain/wheel-lifecycle.md) — phase transitions that
  drive INSERTs into `legs` and UPDATEs to `positions.phase`.
- [us-33 — Option Mid & Unrealized P&L](../features/us-33-option-mid-pnl.md) —
  the feature that introduced `positions.profit_target_percent`.
- [us-37 — Paper/Live Broker Environment Toggle](../features/us-37-paper-live-broker-environment-toggle.md) —
  the feature that introduced `credential_settings` and `app_settings`.
- [us-35 — Assignment Detection](../features/us-35-assignment-detection.md) —
  the feature that introduced `pending_assignments` and the
  `assignments_last_poll_at:<env>` watermark keys in `app_settings`.
- [us-46 — Polling Scheduler](../features/us-46-polling-scheduler.md) —
  the in-memory market-aware scheduler that drives the assignment-detection
  poll job (no schema state of its own).
- [us-44 — IVR Snapshot Store and Scheduler](../features/us-44-ivr-snapshot-store-and-scheduler.md) —
  the feature that introduced `ivr_snapshot` (migration 007) and the
  after-close IVR collection job.
