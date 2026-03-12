import { describe, expect, it } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import type { CreatePositionPayload } from '../schemas'
import { makeTestDb, isoDate } from '../test-utils'
import { createPosition } from './positions'

const TOMORROW = isoDate(1)
const NEXT_MONTH = isoDate(37)

const VALID_PAYLOAD: CreatePositionPayload = {
  ticker: 'AAPL',
  strike: 150,
  expiration: NEXT_MONTH,
  contracts: 1,
  premiumPerContract: 3.5
}

// ---------------------------------------------------------------------------
// Happy path — result structure
// ---------------------------------------------------------------------------

describe('createPosition', () => {
  it('returns position, leg, and costBasisSnapshot', () => {
    const db = makeTestDb()
    const result = createPosition(db, VALID_PAYLOAD)
    expect(result).toHaveProperty('position')
    expect(result).toHaveProperty('leg')
    expect(result).toHaveProperty('costBasisSnapshot')
  })

  it('position has correct fields', () => {
    const db = makeTestDb()
    const { position } = createPosition(db, VALID_PAYLOAD)
    expect(position.id).toBeTypeOf('string')
    expect(position.ticker).toBe('AAPL')
    expect(position.phase).toBe('CSP_OPEN')
    expect(position.status).toBe('ACTIVE')
  })

  it('leg has correct fields', () => {
    const db = makeTestDb()
    const { leg } = createPosition(db, VALID_PAYLOAD)
    expect(leg.strike).toBe('150.0000')
    expect(leg.premiumPerContract).toBe('3.5000')
    expect(leg.contracts).toBe(1)
    expect(leg.expiration).toBe(NEXT_MONTH)
  })

  it('costBasisSnapshot has correct fields', () => {
    const db = makeTestDb()
    const { costBasisSnapshot } = createPosition(db, VALID_PAYLOAD)
    expect(costBasisSnapshot.basisPerShare).toBe('146.5000')
    expect(costBasisSnapshot.totalPremiumCollected).toBe('350.0000')
  })

  it('persists all three rows to the database', () => {
    const db = makeTestDb()
    const { position, leg, costBasisSnapshot } = createPosition(db, VALID_PAYLOAD)

    const posRow = db.prepare('SELECT id FROM positions WHERE id = ?').get(position.id)
    const legRow = db.prepare('SELECT id FROM legs WHERE id = ?').get(leg.id)
    const snapRow = db
      .prepare('SELECT id FROM cost_basis_snapshots WHERE id = ?')
      .get(costBasisSnapshot.id)

    expect(posRow).toBeDefined()
    expect(legRow).toBeDefined()
    expect(snapRow).toBeDefined()
  })

  it('fillDate defaults to today when omitted', () => {
    const db = makeTestDb()
    const today = new Date().toISOString().slice(0, 10)
    const { leg } = createPosition(db, VALID_PAYLOAD)
    expect(leg.fillDate).toBe(today)
  })

  it('uses provided fillDate when supplied', () => {
    const db = makeTestDb()
    const yesterday = isoDate(-1)
    const { leg } = createPosition(db, { ...VALID_PAYLOAD, fillDate: yesterday })
    expect(leg.fillDate).toBe(yesterday)
  })

  // ---------------------------------------------------------------------------
  // Validation errors propagate from lifecycle engine
  // ---------------------------------------------------------------------------

  it('throws ValidationError for invalid ticker', () => {
    const db = makeTestDb()
    expect(() => createPosition(db, { ...VALID_PAYLOAD, ticker: '123' })).toThrow(ValidationError)
    try {
      createPosition(db, { ...VALID_PAYLOAD, ticker: '123' })
    } catch (e) {
      expect((e as ValidationError).field).toBe('ticker')
      expect((e as ValidationError).code).toBe('invalid_format')
    }
  })

  it('throws ValidationError for zero strike', () => {
    const db = makeTestDb()
    try {
      createPosition(db, { ...VALID_PAYLOAD, strike: 0 })
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError)
      expect((e as ValidationError).field).toBe('strike')
      expect((e as ValidationError).code).toBe('must_be_positive')
    }
  })

  it('throws ValidationError for future fill date', () => {
    const db = makeTestDb()
    try {
      createPosition(db, { ...VALID_PAYLOAD, fillDate: TOMORROW })
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError)
      expect((e as ValidationError).field).toBe('fillDate')
      expect((e as ValidationError).code).toBe('cannot_be_future')
    }
  })

  it('does not write to DB when validation fails', () => {
    const db = makeTestDb()
    try {
      createPosition(db, { ...VALID_PAYLOAD, ticker: 'bad ticker!' })
    } catch {
      // expected
    }
    const count = (db.prepare('SELECT COUNT(*) as n FROM positions').get() as { n: number }).n
    expect(count).toBe(0)
  })
})
