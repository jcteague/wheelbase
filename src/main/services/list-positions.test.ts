import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { CreatePositionPayload } from '../schemas'
import { makeTestDb, isoDate } from '../test-utils'
import { createPosition, listPositions } from './positions'
import { rollCspPosition } from './roll-csp-position'

const EXPIRATION = isoDate(37)

const VALID_PAYLOAD: CreatePositionPayload = {
  ticker: 'AAPL',
  strike: 180,
  expiration: EXPIRATION,
  contracts: 1,
  premiumPerContract: 2.5
}

// ---------------------------------------------------------------------------
// T001 — Schema + basic response shape
// ---------------------------------------------------------------------------

describe('listPositions', () => {
  it('returns empty array when no positions exist', () => {
    const db = makeTestDb()
    expect(listPositions(db)).toEqual([])
  })

  it('returns correct shape for a single CSP_OPEN position', () => {
    const db = makeTestDb()
    createPosition(db, VALID_PAYLOAD)
    const items = listPositions(db)
    expect(items).toHaveLength(1)
    const item = items[0]
    const expectedKeys: (keyof typeof item)[] = [
      'id',
      'ticker',
      'phase',
      'status',
      'strike',
      'expiration',
      'dte',
      'premiumCollected',
      'effectiveCostBasis'
    ]
    for (const key of expectedKeys) {
      expect(item).toHaveProperty(key)
    }
  })

  it('computes DTE as days from today to expiration', () => {
    const db = makeTestDb()
    const expiration = isoDate(37)
    createPosition(db, { ...VALID_PAYLOAD, expiration })
    const [item] = listPositions(db)
    const today = new Date()
    const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    const [ey, em, ed] = expiration.split('-').map(Number)
    const expectedDte = Math.round((Date.UTC(ey, em - 1, ed) - todayMs) / 86_400_000)
    expect(item.dte).toBe(expectedDte)
  })

  it('formats decimal values to 4 places', () => {
    const db = makeTestDb()
    createPosition(db, VALID_PAYLOAD)
    const [item] = listPositions(db)
    // strike=180, premium=2.5, contracts=1 → basis=177.5, total=250
    expect(item.strike).toBe('180.0000')
    expect(item.premiumCollected).toBe('250.0000')
    expect(item.effectiveCostBasis).toBe('177.5000')
  })

  // ---------------------------------------------------------------------------
  // T004 — Sort order and edge cases
  // ---------------------------------------------------------------------------

  it('sorts by DTE ascending', () => {
    const db = makeTestDb()
    createPosition(db, { ...VALID_PAYLOAD, ticker: 'TSLA', expiration: isoDate(66) })
    createPosition(db, { ...VALID_PAYLOAD, ticker: 'AAPL', expiration: isoDate(37) })
    createPosition(db, { ...VALID_PAYLOAD, ticker: 'MSFT', expiration: isoDate(24) })

    const tickers = listPositions(db).map((i) => i.ticker)
    expect(tickers).toEqual(['MSFT', 'AAPL', 'TSLA'])
  })

  it('includes all positions', () => {
    const db = makeTestDb()
    createPosition(db, VALID_PAYLOAD)
    createPosition(db, { ...VALID_PAYLOAD, ticker: 'MSFT' })
    expect(listPositions(db)).toHaveLength(2)
  })

  it('returns null strike, expiration, and DTE for a position with no active leg', () => {
    const db = makeTestDb()
    const positionId = randomUUID()
    const snapshotId = randomUUID()
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO positions (id, ticker, strategy_type, status, phase, opened_date, tags, created_at, updated_at)
       VALUES (?, 'SPY', 'WHEEL', 'CLOSED', 'WHEEL_COMPLETE', '2026-01-01', '[]', ?, ?)`
    ).run(positionId, now, now)

    db.prepare(
      `INSERT INTO cost_basis_snapshots (id, position_id, basis_per_share, total_premium_collected, snapshot_at, created_at)
       VALUES (?, ?, '400.0000', '540.0000', ?, ?)`
    ).run(snapshotId, positionId, now, now)

    const items = listPositions(db)
    const spy = items.find((i) => i.ticker === 'SPY')!
    expect(spy.dte).toBeNull()
    expect(spy.strike).toBeNull()
    expect(spy.expiration).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // T005 — Rolled CSP position shows ROLL_TO leg data
  // ---------------------------------------------------------------------------

  it('returns correct strike and expiration for a rolled CSP position', () => {
    const db = makeTestDb()
    const { position } = createPosition(db, VALID_PAYLOAD)
    const newExpiration = isoDate(60)
    rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.0,
      newPremiumPerContract: 2.5,
      newExpiration,
      newStrike: 185
    })
    const [item] = listPositions(db)
    expect(item.strike).toBe('185.0000')
    expect(item.expiration).toBe(newExpiration)
  })

  it('returns updated DTE after CSP roll', () => {
    const db = makeTestDb()
    const { position } = createPosition(db, VALID_PAYLOAD)
    const newExpiration = isoDate(60)
    rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.0,
      newPremiumPerContract: 2.5,
      newExpiration,
      newStrike: 185
    })
    const [item] = listPositions(db)
    const today = new Date()
    const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    const [ey, em, ed] = newExpiration.split('-').map(Number)
    const expectedDte = Math.round((Date.UTC(ey, em - 1, ed) - todayMs) / 86_400_000)
    expect(item.dte).toBe(expectedDte)
  })

  it('sorts null-DTE positions last', () => {
    const db = makeTestDb()
    createPosition(db, VALID_PAYLOAD) // has DTE

    const positionId = randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO positions (id, ticker, strategy_type, status, phase, opened_date, tags, created_at, updated_at)
       VALUES (?, 'SPY', 'WHEEL', 'CLOSED', 'WHEEL_COMPLETE', '2026-01-01', '[]', ?, ?)`
    ).run(positionId, now, now)
    db.prepare(
      `INSERT INTO cost_basis_snapshots (id, position_id, basis_per_share, total_premium_collected, snapshot_at, created_at)
       VALUES (?, ?, '400.0000', '540.0000', ?, ?)`
    ).run(randomUUID(), positionId, now, now)

    const items = listPositions(db)
    expect(items[items.length - 1].dte).toBeNull()
    expect(items[0].dte).toBeTypeOf('number')
  })
})
