# Wheelbase Codebase Analysis — US-5 CSP Expiration Implementation Plan

## 1. Position Models and Types

### Location: `src/main/core/types.ts`
**Phases Defined:**
```typescript
export const WheelPhase = z.enum([
  'CSP_OPEN',
  'HOLDING_SHARES',
  'CC_OPEN',
  'WHEEL_COMPLETE'
])
```

**Critical Gap for US-5:**
- Current types do NOT include `CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, `CC_EXPIRED`, `CC_CLOSED_PROFIT`, `CC_CLOSED_LOSS` phases
- Renderer (`src/renderer/src/api/positions.ts`) has expanded types including these phases, but backend doesn't yet
- US-5 requirement: Transition from `CSP_OPEN` → `WHEEL_COMPLETE` (skips `CSP_EXPIRED` as intermediate)

**Status Values:**
```typescript
export const WheelStatus = z.enum(['ACTIVE', 'CLOSED'])
```
- Used to filter positions; `CLOSED` status indicates final state

**Leg Types:**
```typescript
export const LegRole = z.enum([
  'CSP_OPEN', 'CSP_CLOSE', 'CC_OPEN', 'CC_CLOSE',
  'ASSIGN', 'ROLL_FROM', 'ROLL_TO', 'EXPIRE'
])
export const LegAction = z.enum(['SELL', 'BUY'])
export const OptionType = z.enum(['PUT', 'CALL'])
```

### Location: `src/main/schemas.ts`
**PositionRecord structure:**
```typescript
interface PositionRecord {
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
  strategyType: StrategyType
  openedDate: string
  closedDate: string | null
  accountId: string | null
  notes: string | null
  thesis: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}
```

**LegRecord structure:**
```typescript
interface LegRecord {
  id: string
  positionId: string
  legRole: LegRole
  action: LegAction
  optionType: OptionType
  strike: string
  expiration: string
  contracts: number
  premiumPerContract: string
  fillDate: string
  createdAt: string
  updatedAt: string
}
```

**CostBasisSnapshotRecord structure:**
```typescript
interface CostBasisSnapshotRecord {
  id: string
  positionId: string
  basisPerShare: string
  totalPremiumCollected: string
  snapshotAt: string
  createdAt: string
}
```

**Missing fields in CostBasisSnapshotRecord:**
- `finalPnl` (mentioned in schema as nullable in user story)
- `annualizedReturn` (mentioned in schema as nullable)
- These ARE in the database schema but NOT in the TS schema record

---

## 2. Leg Models and Types

### Current Leg Actions Supported:
- `SELL` (for opening positions)
- `BUY` (for closing positions)

### Current Leg Roles Defined:
- `CSP_OPEN` — Sell a CSP
- `CSP_CLOSE` — Buy to close a CSP
- `CC_OPEN` — Sell a CC
- `CC_CLOSE` — Buy to close a CC
- `ASSIGN` — CSP assigned, receive shares
- `ROLL_FROM` — Close and open in one transaction
- `ROLL_TO` — Close and open in one transaction
- `EXPIRE` — Option expires worthless

### US-5 Requirements:
- New leg needs `action: 'EXPIRE'` (or special action for expiration?)
- `legRole: 'EXPIRE'` or similar
- `optionType: 'PUT'` for CSP expiration
- `fill_price: null` (no price for worthless expiration)
- `fill_date: expiration_date` (date when position expires)

**Note:** Current code uses `SELL`/`BUY` for actions, but `EXPIRE` would need special handling (no action = SELL/BUY, just state change)

---

## 3. Lifecycle Engine

### Location: `src/main/core/lifecycle.ts`

**Current Implementation:**
```typescript
export interface OpenWheelInput {
  ticker: string
  strike: string
  expiration: string
  contracts: number
  premiumPerContract: string
  fillDate: string
  referenceDate: string
}

export interface OpenWheelResult {
  phase: WheelPhase
}

export function openWheel(input: OpenWheelInput): OpenWheelResult {
  // Validates ticker, strike, contracts, premium, fillDate, expiration
  // Returns { phase: 'CSP_OPEN' }
}
```

### Validation Rules in openWheel():
- ✅ Ticker: `^[A-Z]{1,5}$`
- ✅ Strike: must be > 0
- ✅ Contracts: must be integer > 0
- ✅ Premium: must be > 0
- ✅ Fill date: cannot be in future
- ✅ Expiration: must be strictly after fill_date

### Tests Included:
- All validation paths covered in `src/main/core/lifecycle.test.ts`

### MISSING FOR US-5:
- **`expireCSP(position)` function** — Does not exist
- Should validate:
  - Position phase is `CSP_OPEN`
  - Current date >= expiration date (allow on or after expiration date)
  - Return new phase `WHEEL_COMPLETE`
- Pure function, no DB imports

---

## 4. Cost Basis Engine

### Location: `src/main/core/costbasis.ts`

**Current Implementation:**
```typescript
export interface CspLegInput {
  strike: string
  premiumPerContract: string
  contracts: number
}

export interface CostBasisResult {
  basisPerShare: string
  totalPremiumCollected: string
}

export function calculateInitialCspBasis(leg: CspLegInput): CostBasisResult {
  // basis_per_share = strike - premium_per_contract
  // total_premium_collected = premium_per_contract × contracts × 100
}
```

### Decimal Handling:
- Uses `Decimal.js` for precision
- Rounding: `ROUND_HALF_UP` to 4 decimal places
- Results returned as strings

### Tests:
- Happy path: basis calculation, total premium scaling, rounding
- Edge cases: negative basis, high precision inputs
- All tests in `src/main/core/costbasis.test.ts`

### MISSING FOR US-5:
- **`calculateCspExpiration(totalPremiumCollected, contracts)` function** (or similar)
- Should calculate:
  - `finalPnl = total_premium_collected` (100% profit on expiration)
  - Return as new CostBasisResult or extended type with finalPnl
- Pure function
- **No mention of annualized_return calculation yet**

---

## 5. IPC Handlers

### Location: `src/main/ipc/positions.ts`

**Current Handlers Registered:**
```typescript
export function registerPositionsHandlers(db: Database.Database): void {
  ipcMain.handle('positions:list', () => listPositions(db))
  
  ipcMain.handle('positions:create', (_, payload: CreatePositionPayload) => {
    // Creates position + CSP_OPEN leg + cost basis snapshot
    // Returns { ok: true, position, leg, costBasisSnapshot }
    // or { ok: false, errors: [] } on validation failure
  })
}
```

### MISSING FOR US-5:
- **`positions:expire` handler** — Does not exist
- Should:
  - Accept position ID and optional expiration_date_override
  - Call lifecycle engine to validate phase and date
  - Create new EXPIRE leg
  - Update cost basis snapshot with finalPnl
  - Update position phase to `WHEEL_COMPLETE` and status to `CLOSED`
  - Return updated position in transaction

---

## 6. Frontend Integration

### Location: `src/renderer/src/api/positions.ts`

**Expanded WheelPhase Type (Renderer Only):**
```typescript
export type WheelPhase =
  | 'CSP_OPEN'
  | 'CSP_EXPIRED'           // ← Renderer knows about these
  | 'CSP_CLOSED_PROFIT'
  | 'CSP_CLOSED_LOSS'
  | 'HOLDING_SHARES'
  | 'CC_OPEN'
  | 'CC_EXPIRED'
  | 'CC_CLOSED_PROFIT'
  | 'CC_CLOSED_LOSS'
  | 'WHEEL_COMPLETE'
```

**Current API Calls:**
- `listPositions()` — IPC call to `positions:list`
- `createPosition(payload)` — IPC call to `positions:create`

### Renderer Components:

#### PositionCard (`src/renderer/src/components/PositionCard.tsx`)
- Displays position summary with phase badge
- Phase colors and labels mapping exists for all phases including `CSP_EXPIRED`, `WHEEL_COMPLETE`
- Shows: ticker, status, strike, expiration, DTE, premium collected, cost basis
- ✅ Ready for completed positions

#### PositionsListPage (`src/renderer/src/pages/PositionsListPage.tsx`)
- Lists all positions using `usePositions` hook
- Loading, error, empty states
- No filtering by status yet (shows all)

#### PositionDetailPage (`src/renderer/src/pages/PositionDetailPage.tsx`)
- **STUB ONLY** — "coming soon"
- Needs to be implemented for US-10
- Not required for US-5 but related

### MISSING FOR US-5:
- **`expirePosition(positionId)` API function** — No frontend function to call expire endpoint
- **Action button to trigger expiration** — No "Mark Expired" button in UI
- **Expiration confirmation dialog** — Mentioned in US-5 spec but not implemented
- **Post-expiration UX** — "Open new wheel on AAPL" shortcut not implemented

---

## 7. Database Schema

### Location: `migrations/001_initial_schema.sql`

**positions table:**
```sql
CREATE TABLE positions (
  id             TEXT PRIMARY KEY,
  ticker         TEXT NOT NULL,
  strategy_type  TEXT NOT NULL,
  status         TEXT NOT NULL,
  phase          TEXT NOT NULL,
  opened_date    TEXT NOT NULL,
  closed_date    TEXT,
  account_id     TEXT,
  notes          TEXT,
  thesis         TEXT,
  tags           TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX idx_positions_status_phase ON positions (status, phase);
CREATE INDEX idx_positions_ticker ON positions (ticker);
```

**legs table:**
```sql
CREATE TABLE legs (
  id                    TEXT PRIMARY KEY,
  position_id           TEXT NOT NULL REFERENCES positions(id),
  leg_role              TEXT NOT NULL,
  action                TEXT NOT NULL,
  option_type           TEXT NOT NULL,
  strike                TEXT NOT NULL,
  expiration            TEXT NOT NULL,
  contracts             INTEGER NOT NULL,
  premium_per_contract  TEXT NOT NULL,
  fill_price            TEXT,
  fill_date             TEXT,
  order_id              TEXT,
  roll_chain_id         TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX idx_legs_position_fill_date ON legs (position_id, fill_date);
```

**cost_basis_snapshots table:**
```sql
CREATE TABLE cost_basis_snapshots (
  id                      TEXT PRIMARY KEY,
  position_id             TEXT NOT NULL REFERENCES positions(id),
  basis_per_share         TEXT NOT NULL,
  total_premium_collected TEXT NOT NULL,
  final_pnl               TEXT,
  annualized_return       TEXT,
  snapshot_at             TEXT NOT NULL,
  created_at              TEXT NOT NULL
);
```

### Schema Status for US-5:
- ✅ All tables exist and support expiration
- ✅ `legs.fill_price` is nullable (for EXPIRE legs)
- ✅ `cost_basis_snapshots.final_pnl` exists and is nullable
- ✅ `positions.closed_date` exists for marking completion
- No schema migration needed for US-5

### Data Access:
- Using `better-sqlite3` directly (synchronous)
- No ORM
- Transactions supported via `.transaction()` wrapper
- Services layer in `src/main/services/` handles DB operations

---

## Summary: What Exists vs. What's Missing for US-5

### ✅ EXISTING (Ready to use):
1. Database schema with all needed fields
2. Lifecycle engine pattern (`openWheel` as pure function)
3. Cost basis engine pattern (`calculateInitialCspBasis` as pure function)
4. IPC handler registration pattern
5. Frontend API layer with type adapters
6. Component rendering for all phases including WHEEL_COMPLETE
7. Transaction support in database
8. Service layer composition pattern

### ❌ MISSING (Must implement for US-5):

#### Backend Core Engines:
1. **`lifecycle.ts`**: `expireCSP(position)` function
   - Validate phase = CSP_OPEN
   - Validate currentDate >= expirationDate
   - Return phase = WHEEL_COMPLETE
   
2. **`costbasis.ts`**: Expiration P&L calculation
   - Possibly `calculateCspExpiration(totalPremiumCollected)`
   - Return finalPnl = totalPremiumCollected (100% profit)

#### Backend Services:
3. **`services/positions.ts`**: `expirePosition(db, positionId)` function
   - Query position by ID
   - Call lifecycle engine to validate
   - Create EXPIRE leg record
   - Update cost basis snapshot with finalPnl
   - Update position phase and status
   - All in transaction

#### Backend IPC:
4. **`ipc/positions.ts`**: Register `positions:expire` handler
   - Accept positionId and optional override date
   - Call service function
   - Return error or updated position

#### Frontend API:
5. **`api/positions.ts`**: `expirePosition(positionId)` function
   - Call `window.api.expirePosition(positionId)`
   - Handle response/errors

#### Frontend UI:
6. **PositionDetailPage or action button**
   - "Mark Expired" action button
   - Confirmation dialog
   - Call `expirePosition()`
   - Show success/error
   - Navigation hint to open new wheel

#### Types/Schema Updates:
7. **`core/types.ts`**: Optional - add more phases if backend needs them
   - Currently: CSP_OPEN, HOLDING_SHARES, CC_OPEN, WHEEL_COMPLETE
   - Could add: CSP_EXPIRED (intermediate state) - but spec says skip it
   
8. **`schemas.ts`**: Update CostBasisSnapshotRecord
   - Add `finalPnl?: string`
   - Add `annualizedReturn?: string`

---

## Implementation Order Recommended:

1. **Lifecycle engine** (`expireCSP`) — pure, testable, no dependencies
2. **Cost basis engine** (expiration calculation) — pure, testable, no dependencies
3. **Database service** (`expirePosition`) — composes engines + DB calls
4. **IPC handler** — registers the backend endpoint
5. **Frontend API** — IPC wrapper
6. **Frontend UI** — button + dialog + integration
7. **Tests** — unit tests for engines + service tests
