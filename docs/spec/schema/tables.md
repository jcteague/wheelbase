# Database Tables

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-14,us-33 -->

## Overview

Wheelbase persists every wheel position, every option/stock leg, and every
basis-changing event in a single SQLite database. The schema is three tables
deep — **`positions`** owns one row per wheel, **`legs`** owns one row per
sold/bought/expired/assigned option (and one row per stock-assignment marker),
and **`cost_basis_snapshots`** owns an append-only history of effective
per-share basis and final P&L. SQLite is the source of truth; Alpaca (when
wired in) is the execution layer only.

Money values are stored as `TEXT` at 4 dp and converted to/from `decimal.js`
at the boundary using `ROUND_HALF_UP` via the shared `round4` helper. Dates
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

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-14,us-33 -->

## `positions`

One row per wheel. The row is created at CSP open, updated on phase
transition, and never deleted — closed positions stay in the table so the
list view can render an "Active" / "Closed" split.

### Columns

| Column                   | Type    | Nullable | Purpose                                                                   |
| ------------------------ | ------- | -------- | ------------------------------------------------------------------------- |
| `id`                     | TEXT    | No       | UUID primary key                                                          |
| `ticker`                 | TEXT    | No       | Equity symbol, uppercase                                                  |
| `strategy_type`          | TEXT    | No       | Strategy identifier (Phase 1: wheel)                                      |
| `phase`                  | TEXT    | No       | Lifecycle phase (`CSP_OPEN`, `HOLDING_SHARES`, `CC_OPEN`, `WHEEL_COMPLETE`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`) |
| `status`                 | TEXT    | No       | `ACTIVE`, `PAUSED`, or `CLOSED`                                           |
| `opened_date`            | TEXT    | No       | ISO date when the wheel was opened                                        |
| `closed_date`            | TEXT    | Yes      | ISO date set when the position transitions to a terminal phase            |
| `contracts`              | INTEGER | No       | Contracts on the original CSP (shares held after assignment = `× 100`)    |
| `notes`                  | TEXT    | Yes      | Free-form trader notes                                                    |
| `thesis`                 | TEXT    | Yes      | Free-form trade thesis                                                    |
| `profit_target_percent`  | INTEGER | Yes      | Per-position profit-target override (1..100); `NULL` → use the global default constant `DEFAULT_PROFIT_TARGET_PERCENT = 50`. Added by migration `005`. No DB `CHECK` — validation is deferred to the service layer if/when an edit IPC ships. Read-only in US-33 (seeded only via tests/dev). See [us-33 — Option Mid & Unrealized P&L](../features/us-33-option-mid-pnl.md). |
| `created_at`             | TEXT    | No       | ISO timestamp at row insert                                               |
| `updated_at`             | TEXT    | No       | ISO timestamp, refreshed on every phase transition                        |

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

| Column                 | Type    | Nullable | Purpose                                                                                 |
| ---------------------- | ------- | -------- | --------------------------------------------------------------------------------------- |
| `id`                   | TEXT    | No       | UUID primary key                                                                        |
| `position_id`          | TEXT    | No       | FK → `positions.id`                                                                     |
| `leg_role`             | TEXT    | No       | One of `CSP_OPEN`, `CSP_CLOSE`, `CC_OPEN`, `CC_CLOSE`, `CC_EXPIRED`, `CALLED_AWAY`, `ROLL_FROM`, `ROLL_TO`, `ASSIGN`, `EXPIRE` |
| `action`               | TEXT    | No       | `SELL`, `BUY`, `EXPIRE`, `ASSIGN`, or `EXERCISE` (see enum evolution below)             |
| `instrument_type`      | TEXT    | No       | `PUT`, `CALL`, or `STOCK` (renamed from `option_type` in migration 003)                 |
| `strike`               | TEXT    | No       | 4-dp Decimal string                                                                     |
| `expiration`           | TEXT    | No       | ISO date                                                                                |
| `contracts`            | INTEGER | No       | Contract count for this leg                                                             |
| `premium_per_contract` | TEXT    | No       | 4-dp Decimal string; `'0.0000'` for `EXPIRE` and `ASSIGN` event markers                 |
| `fill_price`           | TEXT    | Yes      | 4-dp Decimal string; `NULL` for `EXPIRE` and `ASSIGN` legs (no broker fill occurs)      |
| `fill_date`            | TEXT    | No       | ISO date                                                                                |
| `roll_from_leg_id`     | TEXT    | Yes      | FK → `legs.id`; set on the `ROLL_TO` leg, points back at its paired `ROLL_FROM`         |
| `roll_to_leg_id`       | TEXT    | Yes      | FK → `legs.id`; set on the `ROLL_FROM` leg, points forward at its paired `ROLL_TO`      |
| `roll_chain_id`        | TEXT    | Yes      | Shared UUID stamped on both legs of a roll pair; lets the chain be queried as a unit    |
| `created_at`           | TEXT    | No       | ISO timestamp                                                                           |
| `updated_at`           | TEXT    | No       | ISO timestamp                                                                           |

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
`fill_date DESC, created_at DESC`. The `roll_from_leg_id` / `roll_to_leg_id`
columns provide direct forward and reverse pointers between the paired
legs. The CSP and CC roll paths write identical row shapes apart from
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

| Event                              | Writes row? | `final_pnl`                          |
| ---------------------------------- | ----------- | ------------------------------------ |
| CSP open (US-1)                    | Yes         | `NULL`                               |
| Roll CSP (US-12)                   | Yes         | `NULL`                               |
| Close CSP early (US-4)             | Yes         | `(openPremium − closePrice) × contracts × 100` |
| Expire CSP worthless (US-5)        | Yes         | equals `total_premium_collected` (100% captured) |
| Record assignment (US-6)           | Yes         | `NULL` (position still active)       |
| Open covered call (US-7)           | Yes         | `NULL`                               |
| **Close CC early (US-8)**          | **No**      | n/a — CC_OPEN snapshot unchanged; `ccLegPnl` returned via IPC only |
| **CC expires worthless (US-9)**    | **No**      | n/a — CC_OPEN snapshot unchanged     |
| Shares called away (US-10)         | Yes         | `(ccStrike − basisPerShare) × contracts × 100` — terminal |
| Roll CC (US-14)                    | Yes         | `NULL`                               |

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
- All arithmetic uses `decimal.js` with `ROUND_HALF_UP` via the shared
  `round4` helper in `src/main/core/costbasis.ts`. No native float math is
  used anywhere in the core engines.
- IPC payloads accept numbers (validated by Zod) and the service layer
  converts to Decimal strings before the SQL INSERT.

<!-- /generated -->

<!-- generated:from us-37 -->

## `credential_settings`

Generic encrypted credential storage for external vendors. US-37 writes Alpaca rows only, one per environment (`paper`, `live`), but the table name stays vendor-agnostic so future brokerages can reuse the model.

### Columns

| Column | Type | Nullable | Purpose |
| --- | --- | --- | --- |
| `vendor` | TEXT | No | Vendor identifier; US-37 writes `'alpaca'` |
| `environment` | TEXT | No | Environment key (`'paper'` or `'live'`) |
| `key_id_encrypted` | BLOB | No | Encrypted Alpaca key ID |
| `secret_encrypted` | BLOB | No | Encrypted Alpaca secret |
| `last_verified_at` | TEXT | Yes | ISO timestamp of the last successful verification |
| `account_number_masked` | TEXT | Yes | Masked account identity like `PA…ABC` |
| `created_at` | TEXT | No | ISO timestamp at insert |
| `updated_at` | TEXT | No | ISO timestamp at last update |

### Constraints and semantics

- Unique key on `(vendor, environment)` guarantees at most one Alpaca paper row and one Alpaca live row.
- Plaintext secrets never persist in SQLite; encryption and decryption are confined to `src/main/services/settings.ts`.
- Massive does not use this table; shared Massive configuration remains outside user settings.

<!-- /generated -->

<!-- generated:from us-37 -->

## `app_settings`

Lightweight key/value persistence for non-secret application settings. US-37 uses it to remember the active broker environment across launches.

### Columns

| Column | Type | Nullable | Purpose |
| --- | --- | --- | --- |
| `key` | TEXT | No | Setting key, e.g. `active_broker_environment` |
| `value` | TEXT | No | Stored value, e.g. `'paper'`, `'live'`, or `'none'` |
| `updated_at` | TEXT | No | ISO timestamp of the last write |

### Semantics

- The stored value may be `'paper'`, `'live'`, or `'none'`.
- Effective active environment is derived through settings service logic: if the stored environment no longer has credentials, the effective value collapses to `'none'`.
- The current implementation uses this table only for broker-environment state, but the shape is generic enough for future non-secret settings.

<!-- /generated -->

## See also

- [Migrations](./migrations.md) — chronological change log for the schema
  including migration 003 (`option_type → instrument_type`), migration
  005 (`positions.profit_target_percent`), and migration 006
  (`credential_settings` / `app_settings`).
- [Cost Basis](../domain/cost-basis.md) — how the append-only snapshot
  pattern is produced by each lifecycle event.
- [Wheel Lifecycle](../domain/wheel-lifecycle.md) — phase transitions that
  drive INSERTs into `legs` and UPDATEs to `positions.phase`.
- [us-33 — Option Mid & Unrealized P&L](../features/us-33-option-mid-pnl.md) —
  the feature that introduced `positions.profit_target_percent`.
- [us-37 — Paper/Live Broker Environment Toggle](../features/us-37-paper-live-broker-environment-toggle.md) —
  the feature that introduced `credential_settings` and `app_settings`.
