# Wheelbase Code Patterns — Reference for US-5 Implementation

This document shows the exact patterns used in US-1 that should be replicated for US-5.

---

## Pattern 1: Pure Lifecycle Engine Function

### Template (openWheel):

```typescript
// Location: src/main/core/lifecycle.ts

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
  // 1. Validate each field
  if (!TICKER_RE.test(input.ticker)) {
    throw new ValidationError('ticker', 'invalid_format', 'Ticker must be 1–5 uppercase letters')
  }

  if (new Decimal(input.strike).lte(0)) {
    throw new ValidationError('strike', 'must_be_positive', 'Strike must be positive')
  }

  // 2. Return result
  return { phase: 'CSP_OPEN' }
}
```

### For US-5 (expireCSP):

```typescript
// NEEDED: src/main/core/lifecycle.ts

export interface ExpireCSPInput {
  position: PositionRecord // or just phase, strike, expiration fields
  currentDate: string // ISO date for testing
}

export interface ExpireCSPResult {
  phase: WheelPhase // Will be WHEEL_COMPLETE
}

export function expireCSP(input: ExpireCSPInput): ExpireCSPResult {
  // 1. Validate phase is CSP_OPEN
  if (input.position.phase !== 'CSP_OPEN') {
    throw new ValidationError('phase', 'invalid_phase', 'Position is not in CSP_OPEN phase')
  }

  // 2. Validate currentDate >= expirationDate
  if (input.currentDate < input.position.expirationDate) {
    throw new ValidationError(
      'currentDate',
      'before_expiration',
      'Cannot record expiration before the expiration date'
    )
  }

  // 3. Return new phase
  return { phase: 'WHEEL_COMPLETE' }
}
```

---

## Pattern 2: Pure Cost Basis Calculation

### Template (calculateInitialCspBasis):

```typescript
// Location: src/main/core/costbasis.ts

export interface CspLegInput {
  strike: string
  premiumPerContract: string
  contracts: number
}

export interface CostBasisResult {
  basisPerShare: string
  totalPremiumCollected: string
}

function round4(value: Decimal): Decimal {
  return value.toDecimalPlaces(4)
}

export function calculateInitialCspBasis(leg: CspLegInput): CostBasisResult {
  const strike = new Decimal(leg.strike)
  const premium = new Decimal(leg.premiumPerContract)

  const basisPerShare = round4(strike.minus(premium))
  const totalPremiumCollected = round4(premium.times(leg.contracts).times(100))

  return {
    basisPerShare: basisPerShare.toString(),
    totalPremiumCollected: totalPremiumCollected.toString()
  }
}
```

### For US-5 (expiration calculation):

```typescript
// NEEDED: src/main/core/costbasis.ts

export interface CspExpirationInput {
  totalPremiumCollected: string // Already calculated at open
  contracts: number
}

export function calculateCspExpiration(
  input: CspExpirationInput
): Pick<CostBasisResult, 'finalPnl'> {
  // At expiration, final P&L = total premium collected (100% profit)
  const total = new Decimal(input.totalPremiumCollected)
  const finalPnl = round4(total)

  return {
    finalPnl: finalPnl.toString()
  }
}
```

---

## Pattern 3: Service Layer Composition

### Template (createPosition):

```typescript
// Location: src/main/services/positions.ts

export function createPosition(
  db: Database.Database,
  payload: CreatePositionPayload
): CreatePositionResult {
  const today = new Date().toISOString().slice(0, 10)
  const fillDate = payload.fillDate ?? today
  const now = new Date().toISOString()

  // 1. Call lifecycle engine
  const lifecycleResult = openWheel({
    ticker: payload.ticker,
    strike: strikeStr,
    expiration: payload.expiration,
    contracts: payload.contracts,
    premiumPerContract: premiumStr,
    fillDate,
    referenceDate: today
  })

  // 2. Call cost basis engine
  const basisResult = calculateInitialCspBasis({
    strike: strikeStr,
    premiumPerContract: premiumStr,
    contracts: payload.contracts
  })

  // 3. Generate IDs
  const positionId = randomUUID()
  const legId = randomUUID()
  const snapshotId = randomUUID()

  // 4. Format values
  const strikeFormatted = new Decimal(strikeStr).toFixed(4)
  const premiumFormatted = new Decimal(premiumStr).toFixed(4)

  // 5. Transactional DB inserts
  db.transaction(() => {
    db.prepare(
      `INSERT INTO positions (...) VALUES (...)`
    ).run(...)

    db.prepare(
      `INSERT INTO legs (...) VALUES (...)`
    ).run(...)

    db.prepare(
      `INSERT INTO cost_basis_snapshots (...) VALUES (...)`
    ).run(...)
  })()

  // 6. Return constructed result
  return {
    position: { ... },
    leg: { ... },
    costBasisSnapshot: { ... }
  }
}
```

### For US-5 (expirePosition):

```typescript
// NEEDED: src/main/services/positions.ts

export function expirePosition(
  db: Database.Database,
  positionId: string,
  expirationDateOverride?: string
): CreatePositionResult {
  // or return type with updated position + leg

  // 1. Query position from DB
  const position = db.prepare(`SELECT * FROM positions WHERE id = ?`).get(positionId) as
    | PositionRecord
    | undefined

  if (!position) {
    throw new Error('Position not found')
  }

  // 2. Get latest legs and cost basis to pass to engine
  const latestLeg = db
    .prepare(`SELECT * FROM legs WHERE position_id = ? ORDER BY fill_date DESC LIMIT 1`)
    .get(positionId) as LegRecord | undefined

  const latestSnapshot = db
    .prepare(
      `SELECT * FROM cost_basis_snapshots WHERE position_id = ? ORDER BY snapshot_at DESC LIMIT 1`
    )
    .get(positionId) as CostBasisSnapshotRecord | undefined

  // 3. Call lifecycle engine
  const lifecycleResult = expireCSP({
    position,
    currentDate: expirationDateOverride ?? new Date().toISOString().slice(0, 10)
  })

  // 4. Call cost basis engine
  const expirationResult = calculateCspExpiration({
    totalPremiumCollected: latestSnapshot?.totalPremiumCollected ?? '0',
    contracts: latestLeg?.contracts ?? 0
  })

  // 5. Generate IDs and timestamps
  const expireLegId = randomUUID()
  const snapshotId = randomUUID()
  const now = new Date().toISOString()

  // 6. Transactional DB updates
  db.transaction(() => {
    // Create EXPIRE leg
    db.prepare(
      `INSERT INTO legs (id, position_id, leg_role, action, option_type, strike, expiration, contracts, premium_per_contract, fill_date, created_at, updated_at)
       VALUES (?, ?, 'EXPIRE', 'EXPIRE', 'PUT', ?, ?, ?, '0', ?, ?, ?)`
    ).run(
      expireLegId,
      positionId,
      latestLeg?.strike ?? '0',
      latestLeg?.expiration ?? '',
      latestLeg?.contracts ?? 0,
      latestLeg?.expiration ?? expirationDateOverride ?? new Date().toISOString().slice(0, 10),
      now,
      now
    )

    // Create final cost basis snapshot
    db.prepare(
      `INSERT INTO cost_basis_snapshots (id, position_id, basis_per_share, total_premium_collected, final_pnl, snapshot_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      snapshotId,
      positionId,
      latestSnapshot?.basisPerShare ?? '0',
      latestSnapshot?.totalPremiumCollected ?? '0',
      expirationResult.finalPnl,
      now,
      now
    )

    // Update position to closed
    db.prepare(
      `UPDATE positions SET phase = ?, status = 'CLOSED', closed_date = ?, updated_at = ? WHERE id = ?`
    ).run('WHEEL_COMPLETE', now, now, positionId)
  })()

  // 7. Return constructed result
  return {
    position: {
      ...position,
      phase: 'WHEEL_COMPLETE',
      status: 'CLOSED',
      closedDate: now,
      updatedAt: now
    },
    leg: {
      id: expireLegId,
      positionId,
      legRole: 'EXPIRE',
      action: 'EXPIRE',
      optionType: 'PUT',
      strike: latestLeg?.strike ?? '0',
      expiration: latestLeg?.expiration ?? '',
      contracts: latestLeg?.contracts ?? 0,
      premiumPerContract: '0',
      fillDate:
        latestLeg?.expiration ?? expirationDateOverride ?? new Date().toISOString().slice(0, 10),
      createdAt: now,
      updatedAt: now
    },
    costBasisSnapshot: {
      id: snapshotId,
      positionId,
      basisPerShare: latestSnapshot?.basisPerShare ?? '0',
      totalPremiumCollected: latestSnapshot?.totalPremiumCollected ?? '0',
      snapshotAt: now,
      createdAt: now
    }
  }
}
```

---

## Pattern 4: IPC Handler Registration

### Template (positions handlers):

```typescript
// Location: src/main/ipc/positions.ts

export function registerPositionsHandlers(db: Database.Database): void {
  ipcMain.handle('positions:list', () => listPositions(db))

  ipcMain.handle('positions:create', (_, payload: CreatePositionPayload) => {
    try {
      const result = createPosition(db, payload)
      return { ok: true, ...result }
    } catch (err) {
      if (err instanceof ValidationError) {
        return {
          ok: false,
          errors: [{ field: err.field, code: err.code, message: err.message }]
        }
      }
      logger.error({ err }, 'positions_create_unhandled_error')
      return {
        ok: false,
        errors: [
          { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
        ]
      }
    }
  })

  // NEEDED for US-5:
  ipcMain.handle(
    'positions:expire',
    (_, payload: { positionId: string; expirationDateOverride?: string }) => {
      try {
        const result = expirePosition(db, payload.positionId, payload.expirationDateOverride)
        return { ok: true, ...result }
      } catch (err) {
        if (err instanceof ValidationError) {
          return {
            ok: false,
            errors: [{ field: err.field, code: err.code, message: err.message }]
          }
        }
        logger.error({ err }, 'positions_expire_unhandled_error')
        return {
          ok: false,
          errors: [
            { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
          ]
        }
      }
    }
  )
}
```

---

## Pattern 5: Frontend API Layer Adapter

### Template (positions API):

```typescript
// Location: src/renderer/src/api/positions.ts

export async function listPositions(): Promise<PositionListItem[]> {
  const items = await window.api.listPositions()
  return items.map((item) => ({
    // Transform camelCase → snake_case
    id: item.id,
    ticker: item.ticker,
    phase: item.phase as WheelPhase,
    status: item.status as WheelStatus,
    // ... map other fields
  }))
}

export async function createPosition(
  payload: CreatePositionPayload
): Promise<CreatePositionResponse> {
  const result = await window.api.createPosition({
    // Transform snake_case → camelCase
    ticker: payload.ticker,
    strike: payload.strike,
    // ... map other fields
  })

  if (!result.ok) {
    throw apiError(400, {
      detail: result.errors.map((e) => ({
        field: IPC_TO_FORM_FIELD[e.field] ?? e.field,
        code: e.code,
        message: e.message
      }))
    })
  }

  return {
    position: { ... },
    leg: { ... },
    cost_basis_snapshot: { ... }
  }
}

// NEEDED for US-5:
export async function expirePosition(
  positionId: string
): Promise<ExpirePositionResponse> {
  const result = await window.api.expirePosition({
    positionId
  })

  if (!result.ok) {
    throw apiError(400, {
      detail: result.errors.map((e) => ({
        field: e.field,
        code: e.code,
        message: e.message
      }))
    })
  }

  return {
    position: {
      id: result.position.id,
      ticker: result.position.ticker,
      phase: result.position.phase as WheelPhase,
      status: result.position.status as WheelStatus
    },
    leg: { ... },
    cost_basis_snapshot: { ... }
  }
}
```

---

## Pattern 6: Testing Pattern

### Lifecycle Engine Tests:

```typescript
// Location: src/main/core/lifecycle.test.ts

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function validInput(overrides: Partial<OpenWheelInput> = {}): OpenWheelInput {
  return {
    ticker: 'AAPL',
    strike: '150.00',
    expiration: isoDate(30),
    contracts: 1,
    premiumPerContract: '3.50',
    fillDate: isoDate(0),
    referenceDate: isoDate(0),
    ...overrides
  }
}

describe('openWheel', () => {
  it('returns CSP_OPEN phase for valid input', () => {
    const result = openWheel(validInput())
    expect(result.phase).toBe('CSP_OPEN')
  })

  it('rejects empty ticker', () => {
    expect(() => openWheel(validInput({ ticker: '' }))).toThrow(ValidationError)
  })
})
```

### For US-5 Tests:

```typescript
// NEEDED: Add to src/main/core/lifecycle.test.ts

describe('expireCSP', () => {
  it('returns WHEEL_COMPLETE for valid expiration', () => {
    const position = {
      phase: 'CSP_OPEN' as const,
      expirationDate: isoDate(0) // today
      // ... other fields
    }
    const result = expireCSP({
      position,
      currentDate: isoDate(0)
    })
    expect(result.phase).toBe('WHEEL_COMPLETE')
  })

  it('rejects when phase is not CSP_OPEN', () => {
    const position = {
      phase: 'HOLDING_SHARES' as const,
      expirationDate: isoDate(0)
    }
    expect(() => expireCSP({ position, currentDate: isoDate(0) })).toThrow(ValidationError)
  })

  it('rejects when current date is before expiration', () => {
    const position = {
      phase: 'CSP_OPEN' as const,
      expirationDate: isoDate(5) // 5 days from now
    }
    expect(() => expireCSP({ position, currentDate: isoDate(0) })).toThrow(ValidationError)
  })

  it('allows expiration on the expiration date itself', () => {
    const position = {
      phase: 'CSP_OPEN' as const,
      expirationDate: isoDate(0)
    }
    const result = expireCSP({ position, currentDate: isoDate(0) })
    expect(result.phase).toBe('WHEEL_COMPLETE')
  })

  it('allows expiration after the expiration date', () => {
    const position = {
      phase: 'CSP_OPEN' as const,
      expirationDate: isoDate(-1) // yesterday
    }
    const result = expireCSP({ position, currentDate: isoDate(0) })
    expect(result.phase).toBe('WHEEL_COMPLETE')
  })
})
```

---

## Summary Table

| Component         | Status            | File                                | Pattern       |
| ----------------- | ----------------- | ----------------------------------- | ------------- |
| Lifecycle Engine  | ✅ Exists         | `src/main/core/lifecycle.ts`        | Pure function |
| Cost Basis Engine | ✅ Exists         | `src/main/core/costbasis.ts`        | Pure function |
| Service Layer     | ✅ Pattern exists | `src/main/services/positions.ts`    | Composition   |
| IPC Handlers      | ✅ Pattern exists | `src/main/ipc/positions.ts`         | Registration  |
| Frontend API      | ✅ Pattern exists | `src/renderer/src/api/positions.ts` | Adapter       |
| Testing           | ✅ Pattern exists | `src/main/core/*.test.ts`           | Vitest        |

For US-5, replicate these patterns exactly — just add the missing functions and handlers.
