import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openPmcc, ValidationError } from '../core/lifecycle'
import { logger } from '../logger'
import type { CreatePmccPositionPayload } from '../schemas'
import { isoDate, makeTestDb } from '../test-utils'
import { createPmccPosition, getPosition, listPositions } from './positions'
import type { IvrOnDemand } from './ivr-on-demand'

vi.mock('../core/lifecycle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/lifecycle')>()
  return { ...actual, openPmcc: vi.fn(actual.openPmcc) }
})

const TODAY = isoDate(0)

function makePayload(
  overrides: {
    long?: Partial<CreatePmccPositionPayload['long']>
    short?: Partial<CreatePmccPositionPayload['short']>
  } = {}
): CreatePmccPositionPayload {
  return {
    strategy: 'PMCC',
    ticker: 'XYZ',
    long: {
      underlying: 'XYZ',
      instrumentType: 'CALL',
      deliverableShares: 100,
      strike: 80,
      expiration: isoDate(368),
      contracts: 1,
      fillPrice: 25.0,
      fillDate: TODAY,
      fees: 0,
      ...overrides.long
    },
    short: {
      underlying: 'XYZ',
      instrumentType: 'CALL',
      deliverableShares: 100,
      strike: 110,
      expiration: isoDate(32),
      contracts: 1,
      fillPrice: 2.0,
      fillDate: TODAY,
      fees: 0,
      ...overrides.short
    }
  }
}

const INVALID_PAYLOAD = makePayload({ short: { expiration: isoDate(400) } })

function countRows(db: ReturnType<typeof makeTestDb>, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

function makeIvr(): IvrOnDemand & { collect: ReturnType<typeof vi.fn> } {
  return { collect: vi.fn().mockResolvedValue(undefined) }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createPmccPosition', () => {
  it('returns the PMCC position, both legs, the opening snapshot and the opening debit', () => {
    const db = makeTestDb()
    const result = createPmccPosition(db, makePayload())

    expect(result.position).toMatchObject({
      ticker: 'XYZ',
      strategyType: 'PMCC',
      phase: 'PMCC_OPEN',
      status: 'ACTIVE',
      openedDate: TODAY,
      closedDate: null
    })
    expect(result.longLeg).toMatchObject({
      positionId: result.position.id,
      legRole: 'LEAPS_OPEN',
      action: 'BUY',
      instrumentType: 'CALL',
      strike: '80.0000',
      expiration: isoDate(368),
      contracts: 1,
      premiumPerContract: '25.0000',
      fillPrice: '25.0000',
      fillDate: TODAY,
      fees: '0.0000',
      rollChainId: null
    })
    expect(result.shortLeg).toMatchObject({
      positionId: result.position.id,
      legRole: 'SHORT_CALL_OPEN',
      action: 'SELL',
      instrumentType: 'CALL',
      strike: '110.0000',
      expiration: isoDate(32),
      premiumPerContract: '2.0000',
      fillPrice: '2.0000',
      fees: '0.0000',
      rollChainId: null
    })
    expect(result.costBasisSnapshot).toMatchObject({
      positionId: result.position.id,
      triggerEvent: 'PMCC_OPEN',
      basisPerShare: '23.0000',
      totalPremiumCollected: '200.0000',
      finalPnl: null
    })
    expect(result.openingDebit.initialNetDebit).toBe('2300.0000')
  })

  it('persists one position, two legs (LEAPS first) and one snapshot', () => {
    const db = makeTestDb()
    const { position, longLeg, shortLeg } = createPmccPosition(db, makePayload())

    expect(countRows(db, 'positions')).toBe(1)
    expect(countRows(db, 'legs')).toBe(2)
    expect(countRows(db, 'cost_basis_snapshots')).toBe(1)

    const posRow = db
      .prepare('SELECT strategy_type, phase, status, opened_date FROM positions WHERE id = ?')
      .get(position.id)
    expect(posRow).toEqual({
      strategy_type: 'PMCC',
      phase: 'PMCC_OPEN',
      status: 'ACTIVE',
      opened_date: TODAY
    })

    const legRows = db
      .prepare(
        `SELECT id, leg_role, fill_price, fees, roll_chain_id FROM legs
         WHERE position_id = ? ORDER BY fill_date ASC, created_at ASC`
      )
      .all(position.id)
    expect(legRows).toEqual([
      {
        id: longLeg.id,
        leg_role: 'LEAPS_OPEN',
        fill_price: '25.0000',
        fees: '0.0000',
        roll_chain_id: null
      },
      {
        id: shortLeg.id,
        leg_role: 'SHORT_CALL_OPEN',
        fill_price: '2.0000',
        fees: '0.0000',
        roll_chain_id: null
      }
    ])

    const snapRow = db
      .prepare(
        'SELECT trigger_event, basis_per_share, total_premium_collected, final_pnl FROM cost_basis_snapshots WHERE position_id = ?'
      )
      .get(position.id)
    expect(snapRow).toEqual({
      trigger_event: 'PMCC_OPEN',
      basis_per_share: '23.0000',
      total_premium_collected: '200.0000',
      final_pnl: null
    })
  })

  it('carries per-leg fees into the legs, the snapshot and the opening debit', () => {
    const db = makeTestDb()
    const result = createPmccPosition(db, makePayload({ long: { fees: 1 }, short: { fees: 1 } }))

    expect(result.longLeg.fees).toBe('1.0000')
    expect(result.shortLeg.fees).toBe('1.0000')
    expect(result.costBasisSnapshot.basisPerShare).toBe('23.0200')
    expect(result.costBasisSnapshot.totalPremiumCollected).toBe('199.0000')
    expect(result.openingDebit.initialNetDebit).toBe('2302.0000')

    const fees = db
      .prepare('SELECT fees FROM legs WHERE position_id = ?')
      .all(result.position.id) as { fees: string }[]
    expect(fees.map((r) => r.fees)).toEqual(['1.0000', '1.0000'])
  })

  it('rejects an invalid entry with a dotted-field ValidationError and writes nothing', () => {
    const db = makeTestDb()
    let caught: unknown
    try {
      createPmccPosition(db, INVALID_PAYLOAD)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ValidationError)
    expect((caught as ValidationError).field).toBe('short.expiration')

    expect(countRows(db, 'positions')).toBe(0)
    expect(countRows(db, 'legs')).toBe(0)
    expect(countRows(db, 'cost_basis_snapshots')).toBe(0)
  })

  it('rethrows a non-ValidationError from openPmcc without logging a rejection or writing rows', () => {
    const db = makeTestDb()
    const infoSpy = vi.spyOn(logger, 'info')
    vi.mocked(openPmcc).mockImplementationOnce(() => {
      throw new Error('boom')
    })

    expect(() => createPmccPosition(db, makePayload())).toThrow('boom')

    expect(infoSpy).not.toHaveBeenCalledWith(expect.anything(), 'pmcc_entry_rejected')
    expect(countRows(db, 'positions')).toBe(0)
    expect(countRows(db, 'legs')).toBe(0)
    expect(countRows(db, 'cost_basis_snapshots')).toBe(0)
  })

  it('rolls back the position and both legs when the snapshot insert fails', () => {
    const db = makeTestDb()
    db.exec('DROP TABLE cost_basis_snapshots')

    expect(() => createPmccPosition(db, makePayload())).toThrow()

    expect(countRows(db, 'positions')).toBe(0)
    expect(countRows(db, 'legs')).toBe(0)
  })

  it('fires the on-demand IV collection once with the ticker after commit', () => {
    const db = makeTestDb()
    const ivr = makeIvr()
    ivr.collect.mockImplementation(async () => {
      expect(countRows(db, 'positions')).toBe(1)
    })

    createPmccPosition(db, makePayload(), ivr)

    expect(ivr.collect).toHaveBeenCalledTimes(1)
    expect(ivr.collect).toHaveBeenCalledWith('XYZ')
  })

  it('does not fire the on-demand IV collection when validation rejects', () => {
    const db = makeTestDb()
    const ivr = makeIvr()

    expect(() => createPmccPosition(db, INVALID_PAYLOAD, ivr)).toThrow(ValidationError)
    expect(ivr.collect).not.toHaveBeenCalled()
  })

  it('reads back through getPosition with both legs, no active leg and the PMCC snapshot', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePayload())

    const detail = getPosition(db, position.id)

    expect(detail).not.toBeNull()
    expect(detail!.activeLeg).toBeNull()
    expect(detail!.legs).toHaveLength(2)
    expect(detail!.costBasisSnapshot?.triggerEvent).toBe('PMCC_OPEN')
  })

  it('still lists through listPositions', () => {
    const db = makeTestDb()
    createPmccPosition(db, makePayload())

    const items = listPositions(db)

    expect(items).toHaveLength(1)
    expect(items[0].ticker).toBe('XYZ')
  })

  it('logs pmcc_position_created on success', () => {
    const db = makeTestDb()
    const infoSpy = vi.spyOn(logger, 'info')

    const { position } = createPmccPosition(db, makePayload())

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: position.id,
        ticker: 'XYZ',
        phase: 'PMCC_OPEN',
        initialNetDebit: '2300.0000'
      }),
      'pmcc_position_created'
    )
  })

  it('logs pmcc_entry_rejected with field and code on rejection', () => {
    const db = makeTestDb()
    const infoSpy = vi.spyOn(logger, 'info')

    expect(() => createPmccPosition(db, INVALID_PAYLOAD)).toThrow(ValidationError)

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'XYZ',
        field: 'short.expiration',
        code: 'short_not_before_long'
      }),
      'pmcc_entry_rejected'
    )
    expect(infoSpy).not.toHaveBeenCalledWith(expect.anything(), 'pmcc_position_created')
  })

  it('imports no broker or integration module (no order is submitted)', () => {
    const source = readFileSync(path.join(__dirname, 'create-pmcc-position.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"][^'"]*integrations\//)
  })
})
