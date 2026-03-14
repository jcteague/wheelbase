# Database Architecture

SQLite via `better-sqlite3`. Single file: `wheelbase.db` (prod) or `wheelbase-dev.db` (dev).

## Pragmas

- `journal_mode = WAL` (concurrent reads)
- `foreign_keys = ON` (enforced referential integrity)

## Schema

### positions

The top-level wheel entry. One row per wheel cycle.

```
id              TEXT PK     UUID
ticker          TEXT NN     Stock symbol (1-5 uppercase letters)
strategy_type   TEXT NN     'WHEEL' | 'PMCC' (default 'WHEEL')
status          TEXT NN     'ACTIVE' | 'CLOSED' (default 'ACTIVE')
phase           TEXT NN     WheelPhase enum (see wheel-lifecycle.md)
opened_date     TEXT NN     ISO date (YYYY-MM-DD), first leg fill date
closed_date     TEXT        ISO date, set when position exits
account_id      TEXT        Broker account ID (future)
notes           TEXT        User notes
thesis          TEXT        Trade thesis
tags            TEXT NN     JSON array stored as text (default '[]')
created_at      TEXT NN     ISO timestamp
updated_at      TEXT NN     ISO timestamp
```

Indexes: `(status, phase)`, `(ticker)`

### legs

Individual option transactions. Immutable — never updated after insert.

```
id                    TEXT PK     UUID
position_id           TEXT NN FK  → positions(id)
leg_role              TEXT NN     LegRole enum (see wheel-lifecycle.md)
action                TEXT NN     'SELL' | 'BUY' | 'EXPIRE'
option_type           TEXT NN     'PUT' | 'CALL'
strike                TEXT NN     Decimal, 4 dp (e.g. "150.0000")
expiration            TEXT NN     ISO date
contracts             INT  NN     Number of contracts
premium_per_contract  TEXT NN     Decimal, 4 dp
fill_price            TEXT        Actual execution price (null for expirations)
fill_date             TEXT NN     ISO date (business date, not timestamp)
order_id              TEXT        Alpaca order ID (future)
roll_chain_id         TEXT        Links ROLL_FROM ↔ ROLL_TO pairs
created_at            TEXT NN     ISO timestamp
updated_at            TEXT NN     ISO timestamp
```

Indexes: `(position_id, fill_date)`, `(position_id, leg_role, fill_date DESC, created_at DESC)`

### cost_basis_snapshots

Immutable snapshots — new row inserted after every leg event, never updated.

```
id                      TEXT PK     UUID
position_id             TEXT NN FK  → positions(id)
basis_per_share         TEXT NN     Decimal, 4 dp
total_premium_collected TEXT NN     Decimal, 4 dp
final_pnl               TEXT        Decimal, 4 dp (null while active)
annualized_return        TEXT        Future use
snapshot_at              TEXT NN     ISO timestamp
created_at               TEXT NN     ISO timestamp
```

Index: `(position_id, snapshot_at DESC)`

Latest snapshot query: `WHERE position_id = ? ORDER BY snapshot_at DESC LIMIT 1`

## Entity relationships

```
positions 1──* legs                (position_id FK)
positions 1──* cost_basis_snapshots (position_id FK)
legs      *──* legs                (roll_chain_id links ROLL_FROM ↔ ROLL_TO)
```

## Money math

- Library: `decimal.js` with `ROUND_HALF_UP`
- Storage: TEXT columns, always 4 decimal places via `.toFixed(4)`
- Premium totals: `premium_per_contract × contracts × 100` (options are 100 shares each)
- Never use JavaScript floats for financial math

## Migration system

- Files: `migrations/*.sql`, applied alphabetically
- Runner: `src/main/db/migrate.ts`
- Tracking: `_migrations` table (filename + applied timestamp)
- Idempotent: skips already-applied migrations
- Runs on app startup via `initDb()`
