import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isoDate, makeTestDb } from '../test-utils'
import type { CreatePmccPositionPayload, LegRecord } from '../schemas'
import { createPmccPosition, createPosition } from './positions'
import { assignCspPosition } from './assign-csp-position'
import { openCoveredCallPosition } from './open-covered-call-position'
import { getPosition } from './get-position'
import { rollCspPosition } from './roll-csp-position'
import { appendPmccSnapshot } from './pmcc-ledger'
import { insertLegs, pmccFixtures } from './test-fixtures/pmcc-legs'
import type Database from 'better-sqlite3'

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
      INSERT INTO legs (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts, premium_per_contract, fill_price, fill_date, created_at, updated_at)
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

  it("returns fees = '0.0000' on legs and activeLeg for a wheel position from createPosition", () => {
    const db = makeTestDb()
    const created = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 2.5,
      fillDate: isoDate(0)
    })

    const detail = getPosition(db, created.position.id)

    expect(detail!.legs[0].fees).toBe('0.0000')
    expect(detail!.activeLeg!.fees).toBe('0.0000')
  })

  it('returns the stored fees on a seeded leg', () => {
    const db = makeTestDb()
    const positionId = randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO positions
        (id, ticker, strategy_type, status, phase, opened_date, tags, created_at, updated_at)
       VALUES (?, 'AAPL', 'WHEEL', 'ACTIVE', 'CSP_OPEN', ?, '[]', ?, ?)`
    ).run(positionId, isoDate(0), now, now)
    db.prepare(
      `INSERT INTO legs (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts, premium_per_contract, fill_price, fill_date, fees, created_at, updated_at)
       VALUES (?, ?, 'CSP_OPEN', 'SELL', 'PUT', '180.0000', ?, 1, '2.5000', '2.5000', ?, '1.0000', ?, ?)`
    ).run(randomUUID(), positionId, isoDate(30), isoDate(0), now, now)

    const detail = getPosition(db, positionId)

    expect(detail!.legs[0].fees).toBe('1.0000')
    expect(detail!.activeLeg!.fees).toBe('1.0000')
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

  it('returns ROLL_TO leg as activeLeg after a CSP roll', () => {
    const db = makeTestDb()
    const created = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 2.5,
      fillDate: isoDate(0)
    })

    rollCspPosition(db, created.position.id, {
      positionId: created.position.id,
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: isoDate(60),
      newStrike: 175
    })

    const detail = getPosition(db, created.position.id)

    expect(detail).not.toBeNull()
    expect(detail!.activeLeg).not.toBeNull()
    expect(detail!.activeLeg!.legRole).toBe('ROLL_TO')
    expect(detail!.activeLeg!.strike).toBe('175.0000')
    expect(detail!.activeLeg!.expiration).toBe(isoDate(60))
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

  it('getPosition returns allSnapshots as empty array when position has no snapshots', () => {
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
    expect(detail!.allSnapshots).toEqual([])
  })

  it('getPosition returns allSnapshots ordered snapshot_at ASC for a CSP_OPEN position', () => {
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
    expect(detail!.allSnapshots).toHaveLength(1)
    expect(detail!.allSnapshots[0].basisPerShare).toBe('177.5000')
  })

  it('getPosition returns allSnapshots with multiple snapshots after assign and CC open', () => {
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

    assignCspPosition(db, positionId, { positionId, assignmentDate: isoDate(30) })
    openCoveredCallPosition(db, positionId, {
      positionId,
      strike: 185,
      expiration: isoDate(60),
      contracts: 1,
      premiumPerContract: 3.0,
      fillDate: isoDate(31)
    })

    const detail = getPosition(db, positionId)

    expect(detail).not.toBeNull()
    expect(detail!.allSnapshots).toHaveLength(3)

    // Snapshots should be in snapshot_at ASC order (first created first)
    const snapshots = detail!.allSnapshots
    expect(new Date(snapshots[0].snapshotAt).getTime()).toBeLessThanOrEqual(
      new Date(snapshots[1].snapshotAt).getTime()
    )
    expect(new Date(snapshots[1].snapshotAt).getTime()).toBeLessThanOrEqual(
      new Date(snapshots[2].snapshotAt).getTime()
    )

    // basisPerShare should decrease after CC_OPEN (CC premium reduces the basis)
    const firstBasis = parseFloat(snapshots[0].basisPerShare)
    const lastBasis = parseFloat(snapshots[2].basisPerShare)
    expect(lastBasis).toBeLessThan(firstBasis)
  })

  it('getPosition returns rollChainId on ROLL_FROM and ROLL_TO legs after a CSP roll', () => {
    const db = makeTestDb()
    const created = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 2.5,
      fillDate: isoDate(0)
    })

    rollCspPosition(db, created.position.id, {
      positionId: created.position.id,
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: isoDate(60)
    })

    const detail = getPosition(db, created.position.id)

    expect(detail).not.toBeNull()
    const rollFromLeg = detail!.legs.find((l) => l.legRole === 'ROLL_FROM')
    const rollToLeg = detail!.legs.find((l) => l.legRole === 'ROLL_TO')

    expect(rollFromLeg).toBeDefined()
    expect(rollToLeg).toBeDefined()
    expect(rollFromLeg!.rollChainId).toBeDefined()
    expect(rollFromLeg!.rollChainId).not.toBeNull()
    expect(rollToLeg!.rollChainId).toBeDefined()
    expect(rollToLeg!.rollChainId).not.toBeNull()
    expect(rollFromLeg!.rollChainId).toBe(rollToLeg!.rollChainId)
  })

  it('getPosition returns rollChainId as null for a non-roll leg (CSP_OPEN)', () => {
    const db = makeTestDb()
    const created = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 2.5,
      fillDate: isoDate(0)
    })

    const detail = getPosition(db, created.position.id)

    expect(detail).not.toBeNull()
    const cspOpenLeg = detail!.legs.find((l) => l.legRole === 'CSP_OPEN')
    expect(cspOpenLeg).toBeDefined()
    expect(cspOpenLeg!.rollChainId).toBeNull()
  })

  it('returns profitTargetPercent and managementWindowDteOverride when both columns are set', () => {
    const db = makeTestDb()
    const positionId = randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO positions
        (id, ticker, strategy_type, status, phase, opened_date, account_id, notes, thesis, tags, profit_target_percent, management_window_dte_override, created_at, updated_at)
       VALUES (?, 'TSLA', 'WHEEL', 'ACTIVE', 'CSP_OPEN', ?, NULL, NULL, NULL, '[]', 25, 10, ?, ?)`
    ).run(positionId, isoDate(0), now, now)

    const detail = getPosition(db, positionId)

    expect(detail).not.toBeNull()
    expect(detail!.position.profitTargetPercent).toBe(25)
    expect(detail!.position.managementWindowDteOverride).toBe(10)
  })

  it('returns profitTargetPercent and managementWindowDteOverride as null when both columns are NULL', () => {
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
    expect(detail!.position.profitTargetPercent).toBeNull()
    expect(detail!.position.managementWindowDteOverride).toBeNull()
  })
})

function makePmccPayload(contracts = 1, fees = 0): CreatePmccPositionPayload {
  const leg = {
    underlying: 'XYZ',
    instrumentType: 'CALL' as const,
    deliverableShares: 100,
    contracts,
    fillDate: isoDate(0),
    fees
  }
  return {
    strategy: 'PMCC',
    ticker: 'XYZ',
    long: { ...leg, strike: 80, expiration: isoDate(368), fillPrice: 25.0 },
    short: { ...leg, strike: 110, expiration: isoDate(32), fillPrice: 2.0 }
  }
}

describe('getPosition — PMCC initial net debit (US-101)', () => {
  it('returns the initial net debit recomputed from both opening legs', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())
    expect(getPosition(db, position.id)!.initialNetDebit).toBe('2300.0000')
  })

  it('computes the debit from the leg fills, not the rounded basis (3 contracts, $0.01 fees → 6900.0200)', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload(3, 0.01))
    expect(getPosition(db, position.id)!.initialNetDebit).toBe('6900.0200')
  })

  it('returns null when a PMCC opening leg is missing', () => {
    const db = makeTestDb()
    const { position, shortLeg } = createPmccPosition(db, makePmccPayload())
    db.prepare('DELETE FROM legs WHERE id = ?').run(shortLeg.id)
    expect(getPosition(db, position.id)!.initialNetDebit).toBeNull()
  })

  it('returns null for a wheel position', () => {
    const db = makeTestDb()
    const { position } = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 2.5,
      fillDate: isoDate(0)
    })
    expect(getPosition(db, position.id)!.initialNetDebit).toBeNull()
  })
})

// [US-103] The detail read path returns the running PMCC ledger recomputed from the legs.
type PmccTrigger = 'PMCC_SHORT_EXPIRED' | 'PMCC_SHORT_OPEN' | 'PMCC_SHORT_ROLL' | 'PMCC_LEAPS_ROLL'

function recordLegEvent(
  db: Database.Database,
  positionId: string,
  legs: LegRecord[],
  triggerEvent: PmccTrigger
): void {
  db.transaction(() => {
    insertLegs(db, legs)
    appendPmccSnapshot(db, positionId, {
      triggerEvent,
      eventDate: legs[0].fillDate,
      now: new Date().toISOString()
    })
  })()
}

function getDetail(
  db: Database.Database,
  positionId: string
): NonNullable<ReturnType<typeof getPosition>> {
  const detail = getPosition(db, positionId)
  if (!detail) throw new Error(`getPosition returned null for ${positionId}`)
  return detail
}

describe('getPosition — PMCC ledger (US-103)', () => {
  it('returns the entry ledger right after createPmccPosition', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())

    expect(getDetail(db, position.id).pmccLedger).toEqual({
      basisPerShare: '23.0000',
      basisTotal: '2300.0000',
      leapsCostPerShare: '25.0000',
      leapsCostTotal: '2500.0000',
      shortCreditsPerShare: '2.0000',
      shortCreditsTotal: '200.0000',
      effectiveShareCost: '103.0000',
      premiumRecoveredPercent: '8.0000'
    })
  })

  it('returns the running ledger after an expiration, a new short, a short roll and a LEAPS roll', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())
    const F = pmccFixtures(position.id, isoDate)
    recordLegEvent(db, position.id, F.EXPIRE_1, 'PMCC_SHORT_EXPIRED')
    recordLegEvent(db, position.id, F.SHORT_2, 'PMCC_SHORT_OPEN')
    recordLegEvent(db, position.id, F.SHORT_ROLL, 'PMCC_SHORT_ROLL')
    recordLegEvent(db, position.id, F.LEAPS_ROLL, 'PMCC_LEAPS_ROLL')

    const ledger = getDetail(db, position.id).pmccLedger

    expect(ledger).not.toBeNull()
    if (!ledger) throw new Error('expected a PMCC ledger')
    expect(ledger.basisPerShare).toBe('19.3000')
    expect(ledger.effectiveShareCost).toBe('104.3000')
    expect(ledger.leapsCostPerShare).toBe('22.5000')
  })

  it('keeps initialNetDebit at the entry debit after a later short opens', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())
    const F = pmccFixtures(position.id, isoDate)
    recordLegEvent(db, position.id, F.EXPIRE_1, 'PMCC_SHORT_EXPIRED')
    recordLegEvent(db, position.id, F.SHORT_2, 'PMCC_SHORT_OPEN')

    const detail = getDetail(db, position.id)

    expect(detail.initialNetDebit).toBe('2300.0000')
    expect(detail.pmccLedger?.basisPerShare).toBe('21.2000')
  })

  it('returns pmccLedger null for a wheel position', () => {
    const db = makeTestDb()
    const { position } = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 2.5,
      fillDate: isoDate(0)
    })

    expect(getDetail(db, position.id).pmccLedger).toBeNull()
  })

  it('returns pmccLedger null for a PMCC whose legs were deleted', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())
    db.prepare('DELETE FROM legs WHERE position_id = ?').run(position.id)

    expect(getDetail(db, position.id).pmccLedger).toBeNull()
  })

  it('returns the SHORT_CALL_EXPIRED leg with action EXPIRE in legs (no role filtering)', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())
    const F = pmccFixtures(position.id, isoDate)
    recordLegEvent(db, position.id, F.EXPIRE_1, 'PMCC_SHORT_EXPIRED')

    const detail = getDetail(db, position.id)

    expect(detail.legs.map((l) => l.legRole)).toEqual([
      'LEAPS_OPEN',
      'SHORT_CALL_OPEN',
      'SHORT_CALL_EXPIRED'
    ])
    expect(detail.legs.find((l) => l.legRole === 'SHORT_CALL_EXPIRED')?.action).toBe('EXPIRE')
    // The detail result carries the ledger alongside the expired leg.
    expect(detail.pmccLedger?.basisPerShare).toBe('23.0000')
  })
})

// [US-104] The detail read path returns the PMCC's open LEAPS and open short call.
describe('getPosition — PMCC open legs (US-104)', () => {
  it('returns the LEAPS_OPEN and SHORT_CALL_OPEN right after createPmccPosition', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())

    const openLegs = getDetail(db, position.id).pmccOpenLegs

    expect(openLegs?.long.legRole).toBe('LEAPS_OPEN')
    expect(openLegs?.short?.legRole).toBe('SHORT_CALL_OPEN')
  })

  it("returns the short roll's ROLL_TO as the open short after a short roll", () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())
    const F = pmccFixtures(position.id, isoDate)
    recordLegEvent(db, position.id, F.SHORT_ROLL, 'PMCC_SHORT_ROLL')

    const openLegs = getDetail(db, position.id).pmccOpenLegs

    expect(openLegs?.short?.legRole).toBe('ROLL_TO')
    expect(openLegs?.short?.strike).toBe('112.0000')
    expect(openLegs?.long.legRole).toBe('LEAPS_OPEN')
  })

  it('returns pmccOpenLegs null for a wheel position', () => {
    const db = makeTestDb()
    const { position } = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 2.5,
      fillDate: isoDate(0)
    })

    expect(getDetail(db, position.id).pmccOpenLegs).toBeNull()
  })
})
