import type Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { makeTestDb } from '../test-utils'
import { readLegs, readLegsByPosition } from './leg-rows'

const NOW = '2026-06-01T00:00:00.000Z'

function insertPosition(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO positions
       (id, ticker, strategy_type, status, phase, opened_date, tags, created_at, updated_at)
     VALUES (?, 'XYZ', 'WHEEL', 'ACTIVE', 'CSP_OPEN', '2026-06-01', '[]', ?, ?)`
  ).run(id, NOW, NOW)
}

interface LegSeed {
  id: string
  positionId: string
  fillDate: string
  createdAt: string
  rollChainId?: string | null
  fees?: string
}

function insertLeg(db: Database.Database, leg: LegSeed): void {
  db.prepare(
    `INSERT INTO legs
       (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts,
        premium_per_contract, fill_price, fill_date, roll_chain_id, fees, created_at, updated_at)
     VALUES (?, ?, 'CSP_OPEN', 'SELL', 'PUT', '180.0000', '2026-07-17', 2,
             '2.5000', '2.5000', ?, ?, ?, ?, ?)`
  ).run(
    leg.id,
    leg.positionId,
    leg.fillDate,
    leg.rollChainId ?? null,
    leg.fees ?? '0.0000',
    leg.createdAt,
    leg.createdAt
  )
}

function seedTwoPositions(db: Database.Database): void {
  insertPosition(db, 'pos-a')
  insertPosition(db, 'pos-b')
  insertPosition(db, 'pos-empty')
  // Inserted out of order so the ORDER BY, not insertion order, decides.
  insertLeg(db, {
    id: 'a-3',
    positionId: 'pos-a',
    fillDate: '2026-06-10',
    createdAt: '2026-06-10T00:00:00.000Z'
  })
  insertLeg(db, {
    id: 'a-2',
    positionId: 'pos-a',
    fillDate: '2026-06-01',
    createdAt: '2026-06-01T00:00:02.000Z',
    rollChainId: 'chain-1',
    fees: '0.6500'
  })
  insertLeg(db, {
    id: 'a-1',
    positionId: 'pos-a',
    fillDate: '2026-06-01',
    createdAt: '2026-06-01T00:00:01.000Z'
  })
  insertLeg(db, {
    id: 'b-2',
    positionId: 'pos-b',
    fillDate: '2026-06-05',
    createdAt: '2026-06-05T00:00:00.000Z'
  })
  insertLeg(db, {
    id: 'b-1',
    positionId: 'pos-b',
    fillDate: '2026-06-02',
    createdAt: '2026-06-02T00:00:00.000Z'
  })
}

describe('readLegs', () => {
  it('returns every leg of the position as a LegRecord, ordered by fill_date then created_at', () => {
    const db = makeTestDb()
    seedTwoPositions(db)

    const legs = readLegs(db, 'pos-a')

    expect(legs.map((leg) => leg.id)).toEqual(['a-1', 'a-2', 'a-3'])
    expect(legs[1]).toEqual({
      id: 'a-2',
      positionId: 'pos-a',
      legRole: 'CSP_OPEN',
      action: 'SELL',
      instrumentType: 'PUT',
      strike: '180.0000',
      expiration: '2026-07-17',
      contracts: 2,
      premiumPerContract: '2.5000',
      fillPrice: '2.5000',
      fillDate: '2026-06-01',
      rollChainId: 'chain-1',
      fees: '0.6500',
      createdAt: '2026-06-01T00:00:02.000Z',
      updatedAt: '2026-06-01T00:00:02.000Z'
    })
    expect(legs[0].rollChainId).toBeNull()
    expect(legs[0].fees).toBe('0.0000')
  })

  it('returns an empty array for a position with no legs', () => {
    const db = makeTestDb()
    seedTwoPositions(db)

    expect(readLegs(db, 'pos-empty')).toEqual([])
  })
})

describe('readLegsByPosition', () => {
  it('returns each position’s legs keyed by id, in the same order as readLegs', () => {
    const db = makeTestDb()
    seedTwoPositions(db)

    const byPosition = readLegsByPosition(db, ['pos-a', 'pos-b', 'pos-empty'])

    expect(byPosition.get('pos-a')).toEqual(readLegs(db, 'pos-a'))
    expect(byPosition.get('pos-b')?.map((leg) => leg.id)).toEqual(['b-1', 'b-2'])
    expect(byPosition.has('pos-empty')).toBe(false)
    expect([...byPosition.keys()].sort()).toEqual(['pos-a', 'pos-b'])
  })

  it('returns only the requested positions', () => {
    const db = makeTestDb()
    seedTwoPositions(db)

    const byPosition = readLegsByPosition(db, ['pos-b'])

    expect([...byPosition.keys()]).toEqual(['pos-b'])
  })

  it('returns an empty map for no ids without querying', () => {
    const db = makeTestDb()
    const prepare = vi.spyOn(db, 'prepare')

    expect(readLegsByPosition(db, [])).toEqual(new Map())
    expect(prepare).not.toHaveBeenCalled()
  })
})
