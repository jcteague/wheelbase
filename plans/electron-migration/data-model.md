# Data Model: Electron Migration

## Schema Translation (PostgreSQL → SQLite)

All three tables carry over with minor type adaptations. Schema is defined in plain SQL migration files managed by `ley`.

---

### Migration file: `migrations/001_initial_schema.sql`

```sql
CREATE TABLE positions (
  id             TEXT PRIMARY KEY,
  ticker         TEXT NOT NULL,
  strategy_type  TEXT NOT NULL,   -- 'WHEEL' | 'PMCC'
  status         TEXT NOT NULL,   -- 'ACTIVE' | 'CLOSED'
  phase          TEXT NOT NULL,   -- 'CSP_OPEN' | 'HOLDING_SHARES' | 'CC_OPEN' | 'WHEEL_COMPLETE'
  opened_date    TEXT NOT NULL,   -- ISO date string
  closed_date    TEXT,
  account_id     TEXT,
  notes          TEXT,
  thesis         TEXT,
  tags           TEXT,            -- JSON-serialized string[]
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX idx_positions_status_phase ON positions (status, phase);
CREATE INDEX idx_positions_ticker ON positions (ticker);

CREATE TABLE legs (
  id                    TEXT PRIMARY KEY,
  position_id           TEXT NOT NULL REFERENCES positions(id),
  leg_role              TEXT NOT NULL,  -- 'CSP_OPEN' | 'CSP_CLOSE' | 'CC_OPEN' | 'CC_CLOSE' | 'ASSIGN' | 'ROLL_FROM' | 'ROLL_TO' | 'EXPIRE'
  action                TEXT NOT NULL,  -- 'SELL' | 'BUY'
  option_type           TEXT NOT NULL,  -- 'PUT' | 'CALL'
  strike                TEXT NOT NULL,  -- Decimal string e.g. "45.0000"
  expiration            TEXT NOT NULL,  -- ISO date string
  contracts             INTEGER NOT NULL,
  premium_per_contract  TEXT NOT NULL,  -- Decimal string
  fill_price            TEXT,
  fill_date             TEXT,
  order_id              TEXT,
  roll_chain_id         TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX idx_legs_position_fill_date ON legs (position_id, fill_date);

CREATE TABLE cost_basis_snapshots (
  id                      TEXT PRIMARY KEY,
  position_id             TEXT NOT NULL REFERENCES positions(id),
  basis_per_share         TEXT NOT NULL,  -- Decimal string
  total_premium_collected TEXT NOT NULL,  -- Decimal string
  final_pnl               TEXT,
  annualized_return       TEXT,
  snapshot_at             TEXT NOT NULL,
  created_at              TEXT NOT NULL
);
```

**Changes from PostgreSQL:**
- `UUID` → `TEXT` (generate with `crypto.randomUUID()`)
- `ARRAY(String)` for tags → `TEXT` (JSON serialized: `JSON.stringify(tags)`)
- PostgreSQL ENUM types → `TEXT` (validated by Zod at the service layer)
- `NUMERIC(12,4)` → `TEXT` for money values; parse with `decimal.js` on read
- Timestamps → ISO string (`new Date().toISOString()`)

---

## DB Access Pattern (raw parameterized SQL)

```ts
// src/main/db/index.ts
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'

const dbPath = app.isPackaged
  ? path.join(app.getPath('userData'), 'wheelbase.db')
  : path.join(app.getPath('userData'), 'wheelbase-dev.db')

export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
```

```ts
// Example query usage
const stmt = db.prepare(`
  SELECT p.*, l.strike, l.expiration, l.premium_per_contract, cbs.basis_per_share
  FROM positions p
  LEFT JOIN legs l ON l.position_id = p.id AND l.leg_role = 'CSP_OPEN'
  LEFT JOIN cost_basis_snapshots cbs ON cbs.position_id = p.id
  WHERE p.status = 'ACTIVE'
  ORDER BY l.expiration ASC NULLS LAST
`)
const rows = stmt.all() as PositionRow[]
```

---

## Enum Values (enforced by Zod, not DB)

```ts
// src/main/core/types.ts
export const StrategyType  = z.enum(['WHEEL', 'PMCC'])
export const WheelStatus   = z.enum(['ACTIVE', 'CLOSED'])
export const WheelPhase    = z.enum(['CSP_OPEN', 'HOLDING_SHARES', 'CC_OPEN', 'WHEEL_COMPLETE'])
export const LegRole       = z.enum(['CSP_OPEN', 'CSP_CLOSE', 'CC_OPEN', 'CC_CLOSE', 'ASSIGN', 'ROLL_FROM', 'ROLL_TO', 'EXPIRE'])
export const LegAction     = z.enum(['SELL', 'BUY'])
export const OptionType    = z.enum(['PUT', 'CALL'])
```

---

## Project Structure

```
wheelbase-electron/
├── electron.vite.config.ts
├── package.json
├── src/
│   ├── main/                        # Electron main process
│   │   ├── index.ts                 # App bootstrap, window creation, run migrations
│   │   ├── db/
│   │   │   ├── index.ts             # better-sqlite3 setup, WAL mode, foreign keys
│   │   │   └── migrate.ts           # ley migration runner (called at app startup)
│   │   ├── core/                    # Pure functions — no DB or broker imports
│   │   │   ├── types.ts             # Zod enums and shared types
│   │   │   ├── lifecycle.ts         # openWheel() — TS port of lifecycle.py
│   │   │   ├── costbasis.ts         # calculateInitialCspBasis() — TS port
│   │   │   └── alerts.ts            # Stub
│   │   ├── services/
│   │   │   └── positions.ts         # listPositions(), createPosition() — DB + core logic
│   │   ├── ipc/
│   │   │   └── positions.ts         # ipcMain.handle registrations (thin wrappers)
│   │   ├── schemas.ts               # Zod request/response schemas (shared)
│   │   ├── integrations/
│   │   │   └── alpaca.ts            # All @alpacahq/typescript-sdk calls isolated here
│   │   └── logger.ts                # pino setup
│   ├── preload/
│   │   └── index.ts                 # contextBridge: expose window.api to renderer
│   └── renderer/                    # React frontend (current frontend/src/)
│       ├── main.tsx
│       ├── app.tsx
│       ├── pages/
│       ├── components/
│       ├── hooks/
│       ├── api/
│       ├── schemas/
│       └── lib/
├── drizzle/                         # Drizzle Kit output (migration SQL files)
└── resources/
    └── migrations/ -> symlink or copy of drizzle/ for asar-unpack
```

---

## Cost Basis Math — TypeScript Port

```ts
import Decimal from 'decimal.js'

Decimal.set({ rounding: Decimal.ROUND_HALF_UP })

export function calculateInitialCspBasis(input: CspLegInput): CostBasisResult {
  const strike  = new Decimal(input.strike)
  const premium = new Decimal(input.premiumPerContract)
  const basisPerShare        = strike.minus(premium).toDecimalPlaces(4)
  const totalPremiumCollected = premium.times(input.contracts).times(100).toDecimalPlaces(4)
  return {
    basisPerShare:          basisPerShare.toString(),
    totalPremiumCollected:  totalPremiumCollected.toString(),
  }
}
```
