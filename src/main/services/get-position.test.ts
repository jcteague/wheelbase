import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isoDate, makeTestDb } from '../test-utils'
import { createPosition } from './positions'
import { getPosition } from './get-position'

describe('getPosition', () => {
  it('returns position with activeLeg and costBasisSnapshot for a CSP_OPEN position', () => {
    const db = makeTestDb()
    const result = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 2.5,
      fillDate: isoDate(0)
    })
    const positionId = result.position.id

    const detail = getPosition(db, positionId)

    expect(detail).not.toBeNull()
    expect(detail!.position.id).toBe(positionId)
    expect(detail!.position.ticker).toBe('AAPL')
    expect(detail!.position.phase).toBe('CSP_OPEN')
    expect(detail!.position.status).toBe('ACTIVE')
    expect(detail!.position.openedDate).toBe(isoDate(0))
    expect(detail!.position.closedDate).toBeNull()

    expect(detail!.activeLeg).not.toBeNull()
    expect(detail!.activeLeg!.legRole).toBe('CSP_OPEN')
    expect(detail!.activeLeg!.premiumPerContract).toBe('2.5000')
    expect(detail!.activeLeg!.strike).toBe('180.0000')
    expect(detail!.activeLeg!.expiration).toBe(isoDate(30))
    expect(detail!.activeLeg!.contracts).toBe(1)

    expect(detail!.costBasisSnapshot).not.toBeNull()
    expect(detail!.costBasisSnapshot!.finalPnl).toBeNull()
    expect(detail!.costBasisSnapshot!.totalPremiumCollected).toBe('250.0000')
  })

  it('returns null for an unknown positionId', () => {
    const db = makeTestDb()
    const result = getPosition(db, randomUUID())
    expect(result).toBeNull()
  })

  it('returns legs array with all legs in chronological order', () => {
    const db = makeTestDb()
    const created = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 2.5,
      fillDate: isoDate(0)
    })
    const positionId = created.position.id
    const openLegId = created.leg.id

    // Insert a close leg manually (later date)
    const closeLegId = randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `
      INSERT INTO legs (id, position_id, leg_role, action, option_type, strike, expiration, contracts, premium_per_contract, fill_price, fill_date, created_at, updated_at)
      VALUES (?, ?, 'CSP_CLOSE', 'BUY', 'PUT', '180.0000', ?, 1, '1.0000', '1.0000', ?, ?, ?)
    `
    ).run(closeLegId, positionId, isoDate(30), isoDate(10), now, now)

    const detail = getPosition(db, positionId)

    expect(detail).not.toBeNull()
    expect(detail!.legs).toHaveLength(2)
    expect(detail!.legs[0].id).toBe(openLegId)
    expect(detail!.legs[0].legRole).toBe('CSP_OPEN')
    expect(detail!.legs[1].id).toBe(closeLegId)
    expect(detail!.legs[1].legRole).toBe('CSP_CLOSE')
  })

  it('returns empty legs array when position has no legs', () => {
    const db = makeTestDb()
    const positionId = randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO positions
        (id, ticker, strategy_type, status, phase, opened_date, account_id, notes, thesis, tags, created_at, updated_at)
       VALUES (?, 'TSLA', 'WHEEL', 'ACTIVE', 'CSP_OPEN', ?, NULL, NULL, NULL, '[]', ?, ?)`
    ).run(positionId, isoDate(0), now, now)

    const detail = getPosition(db, positionId)

    expect(detail).not.toBeNull()
    expect(detail!.legs).toEqual([])
  })

  it('returns activeLeg as null when no open leg exists', () => {
    const db = makeTestDb()
    const positionId = randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO positions
        (id, ticker, strategy_type, status, phase, opened_date, account_id, notes, thesis, tags, created_at, updated_at)
       VALUES (?, 'TSLA', 'WHEEL', 'ACTIVE', 'CSP_OPEN', ?, NULL, NULL, NULL, '[]', ?, ?)`
    ).run(positionId, isoDate(0), now, now)

    const detail = getPosition(db, positionId)

    expect(detail).not.toBeNull()
    expect(detail!.activeLeg).toBeNull()
    expect(detail!.costBasisSnapshot).toBeNull()
  })
})
