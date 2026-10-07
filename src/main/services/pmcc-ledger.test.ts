// [US-103] PMCC cost basis — ledger service: contributions, current LEAPS strike, the one
// snapshot writer and its transaction contract.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { logger } from '../logger'
import type { LegRecord } from '../schemas'
import { makeTestDb } from '../test-utils'
import { readLegs } from './leg-rows'
import {
  appendPmccSnapshot,
  buildPmccContributions,
  currentLeapsLeg,
  currentLongStrike,
  currentShortCallLeg,
  isShortCallRoll,
  leapsContracts,
  pmccLedgerFromLegs,
  pmccOpenLegs
} from './pmcc-ledger'
import { insertPosition } from './position-rows'
import { groupRollChains } from './roll-chains'
import { FIXED_DAY, insertLegs, makePmccLeg, pmccFixtures } from './test-fixtures/pmcc-legs'

const POSITION_ID = 'pmcc-1'
const NOW = '2026-09-14T15:00:00.000Z'
const F = pmccFixtures(POSITION_ID)
const THROUGH_LEAPS_ROLL = [
  ...F.OPEN,
  ...F.EXPIRE_1,
  ...F.SHORT_2,
  ...F.SHORT_ROLL,
  ...F.LEAPS_ROLL
]

function seedPmcc(db: Database.Database): void {
  insertPosition(db, {
    id: POSITION_ID,
    ticker: 'XYZ',
    strategyType: 'PMCC',
    phase: 'PMCC_OPEN',
    openedDate: FIXED_DAY(0),
    accountId: null,
    notes: null,
    thesis: null,
    now: NOW
  })
}

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

interface SnapshotRow {
  id: string
  position_id: string
  basis_per_share: string
  total_premium_collected: string
  final_pnl: string | null
  trigger_event: string
  snapshot_at: string
  created_at: string
}

function snapshotRows(db: Database.Database): SnapshotRow[] {
  return db
    .prepare(
      `SELECT id, position_id, basis_per_share, total_premium_collected, final_pnl, trigger_event,
              snapshot_at, created_at
       FROM cost_basis_snapshots WHERE position_id = ? ORDER BY snapshot_at ASC, created_at ASC`
    )
    .all(POSITION_ID) as SnapshotRow[]
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildPmccContributions', () => {
  it('turns the opening legs into a LONG debit and a SHORT credit', () => {
    expect(buildPmccContributions(F.OPEN)).toEqual([
      { side: 'LONG', cashPerShare: '25.0000', contracts: 1, fees: '0.0000' },
      { side: 'SHORT', cashPerShare: '-2.0000', contracts: 1, fees: '0.0000' }
    ])
  })

  it("carries each leg's own fees", () => {
    expect(buildPmccContributions(F.FEES)).toEqual([
      { side: 'LONG', cashPerShare: '25.0000', contracts: 1, fees: '1.0000' },
      { side: 'SHORT', cashPerShare: '-2.0000', contracts: 1, fees: '1.0000' }
    ])
  })

  it("carries each leg's contracts", () => {
    expect(buildPmccContributions(F.THREE).map((c) => c.contracts)).toEqual([3, 3])
  })

  it('records a short-call expiration as a zero SHORT contribution', () => {
    expect(buildPmccContributions(F.EXPIRE_1)).toEqual([
      { side: 'SHORT', cashPerShare: '0.0000', contracts: 1, fees: '0.0000' }
    ])
  })

  it('records a short-call buyback as a positive SHORT contribution', () => {
    const close = makePmccLeg(POSITION_ID, {
      legRole: 'SHORT_CALL_CLOSE',
      action: 'BUY',
      strike: '110.0000',
      expiration: FIXED_DAY(32),
      fillDate: FIXED_DAY(20),
      premiumPerContract: '0.5500'
    })
    expect(buildPmccContributions([close])).toEqual([
      { side: 'SHORT', cashPerShare: '0.5500', contracts: 1, fees: '0.0000' }
    ])
  })

  it('records a LEAPS sale as a negative LONG contribution', () => {
    const close = makePmccLeg(POSITION_ID, {
      legRole: 'LEAPS_CLOSE',
      action: 'SELL',
      strike: '80.0000',
      expiration: FIXED_DAY(368),
      fillDate: FIXED_DAY(200),
      premiumPerContract: '24.1000'
    })
    expect(buildPmccContributions([close])).toEqual([
      { side: 'LONG', cashPerShare: '-24.1000', contracts: 1, fees: '0.0000' }
    ])
  })

  it('records a short roll as one net SHORT debit, summing both halves’ fees', () => {
    const withFees = F.SHORT_ROLL.map((l) => ({ ...l, fees: '0.6500' }))
    expect(buildPmccContributions(withFees)).toEqual([
      { side: 'SHORT', cashPerShare: '0.6000', contracts: 1, fees: '1.3000' }
    ])
  })

  it('records a LEAPS roll as one net LONG credit (side from ROLL_FROM SELL)', () => {
    expect(buildPmccContributions(F.LEAPS_ROLL)).toEqual([
      { side: 'LONG', cashPerShare: '-2.5000', contracts: 1, fees: '0.0000' }
    ])
  })

  it("uses the roll's ROLL_TO contracts for the chain", () => {
    const legs = F.LEAPS_ROLL.map((l) => (l.legRole === 'ROLL_TO' ? { ...l, contracts: 2 } : l))
    expect(buildPmccContributions(legs)[0].contracts).toBe(2)
  })

  it('orders contributions by fill date then created_at, whatever the input order', () => {
    const shuffled = [...F.LEAPS_ROLL, ...F.SHORT_2, ...[...F.OPEN].reverse(), ...F.SHORT_ROLL]
    expect(buildPmccContributions(shuffled)).toEqual([
      { side: 'LONG', cashPerShare: '25.0000', contracts: 1, fees: '0.0000' },
      { side: 'SHORT', cashPerShare: '-2.0000', contracts: 1, fees: '0.0000' },
      { side: 'SHORT', cashPerShare: '-1.8000', contracts: 1, fees: '0.0000' },
      { side: 'SHORT', cashPerShare: '0.6000', contracts: 1, fees: '0.0000' },
      { side: 'LONG', cashPerShare: '-2.5000', contracts: 1, fees: '0.0000' }
    ])
  })

  it('places a roll chain at its earliest leg', () => {
    // Chain opened on day 63 but closed out on day 70; a short sold on day 65 sits after it.
    const chain = F.SHORT_ROLL.map((l) =>
      l.legRole === 'ROLL_TO' ? { ...l, fillDate: FIXED_DAY(70) } : l
    )
    const between = makePmccLeg(POSITION_ID, {
      legRole: 'SHORT_CALL_OPEN',
      action: 'SELL',
      strike: '115.0000',
      expiration: FIXED_DAY(90),
      fillDate: FIXED_DAY(65),
      premiumPerContract: '1.0000'
    })
    expect(buildPmccContributions([between, ...chain]).map((c) => c.cashPerShare)).toEqual([
      '0.6000',
      '-1.0000'
    ])
  })

  it('excludes a leg with a non-PMCC role and warns pmcc_ledger_unknown_leg_role', () => {
    const warnSpy = vi.spyOn(logger, 'warn')
    const csp = makePmccLeg(POSITION_ID, {
      legRole: 'CSP_OPEN',
      action: 'SELL',
      strike: '75.0000',
      expiration: FIXED_DAY(30),
      fillDate: FIXED_DAY(1),
      premiumPerContract: '1.0000'
    })

    expect(buildPmccContributions([...F.OPEN, csp])).toEqual(buildPmccContributions(F.OPEN))
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ legRole: 'CSP_OPEN' }),
      'pmcc_ledger_unknown_leg_role'
    )
  })

  it('does not warn for roll legs or any PMCC role', () => {
    const warnSpy = vi.spyOn(logger, 'warn')
    buildPmccContributions(THROUGH_LEAPS_ROLL)
    expect(warnSpy).not.toHaveBeenCalledWith(expect.anything(), 'pmcc_ledger_unknown_leg_role')
  })

  it('returns no contributions for no legs', () => {
    expect(buildPmccContributions([])).toEqual([])
  })
})

describe('currentLongStrike', () => {
  it('is the LEAPS strike after the opening legs', () => {
    expect(currentLongStrike(F.OPEN)).toBe('80.0000')
  })

  it('is the new LEAPS strike after a LEAPS roll (the ROLL_TO BUY)', () => {
    expect(currentLongStrike(THROUGH_LEAPS_ROLL)).toBe('85.0000')
  })

  it("ignores a short roll's BUY half", () => {
    expect(currentLongStrike([...F.OPEN, ...F.SHORT_ROLL])).toBe('80.0000')
  })

  it('is null when there is no long BUY leg', () => {
    expect(currentLongStrike([...F.SHORT_2, ...F.SHORT_ROLL])).toBeNull()
    expect(currentLongStrike([])).toBeNull()
  })
})

describe('leapsContracts', () => {
  it("is the LEAPS leg's contracts", () => {
    expect(leapsContracts(F.OPEN)).toBe(1)
    expect(leapsContracts(F.THREE)).toBe(3)
  })

  it('is the newest long BUY leg’s contracts after a LEAPS roll', () => {
    const roll = F.LEAPS_ROLL.map((l) => (l.legRole === 'ROLL_TO' ? { ...l, contracts: 2 } : l))
    expect(leapsContracts([...F.OPEN, ...roll])).toBe(2)
  })
})

describe('pmccLedgerFromLegs', () => {
  it('opens at $23.00 / $2,300.00 with effective share cost $103.00', () => {
    expect(pmccLedgerFromLegs(F.OPEN)).toEqual({
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

  it('reaches $19.30 with effective share cost $104.30 after the LEAPS roll', () => {
    expect(pmccLedgerFromLegs(THROUGH_LEAPS_ROLL)).toMatchObject({
      basisPerShare: '19.3000',
      basisTotal: '1930.0000',
      leapsCostPerShare: '22.5000',
      effectiveShareCost: '104.3000'
    })
  })

  it('goes negative without clamping after enough short credits', () => {
    expect(pmccLedgerFromLegs([...THROUGH_LEAPS_ROLL, ...F.CYCLES])).toMatchObject({
      basisPerShare: '-0.4000',
      basisTotal: '-40.0000',
      effectiveShareCost: '84.6000',
      premiumRecoveredPercent: '101.7778'
    })
  })

  it('counts fees once on their own leg', () => {
    expect(pmccLedgerFromLegs(F.FEES)).toMatchObject({
      basisPerShare: '23.0200',
      basisTotal: '2302.0000',
      shortCreditsTotal: '199.0000'
    })
  })

  it('reports per share of the LEAPS contracts', () => {
    expect(pmccLedgerFromLegs(F.THREE)).toMatchObject({
      basisPerShare: '23.0000',
      basisTotal: '6900.0000'
    })
  })

  it('is null for no legs', () => {
    expect(pmccLedgerFromLegs([])).toBeNull()
  })

  it('is null when there is no long BUY leg', () => {
    expect(pmccLedgerFromLegs(F.SHORT_2)).toBeNull()
  })
})

describe('appendPmccSnapshot', () => {
  const SHORT_2_DATE = F.SHORT_2[0].fillDate

  function seedOpenAndExpired(): Database.Database {
    const db = makeTestDb()
    seedPmcc(db)
    insertLegs(db, [...F.OPEN, ...F.EXPIRE_1])
    return db
  }

  it('inserts one snapshot row for the leg event', () => {
    const db = seedOpenAndExpired()
    insertLegs(db, F.SHORT_2)

    appendPmccSnapshot(db, POSITION_ID, {
      triggerEvent: 'PMCC_SHORT_OPEN',
      eventDate: SHORT_2_DATE,
      now: NOW
    })

    const rows = snapshotRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      position_id: POSITION_ID,
      basis_per_share: '21.2000',
      total_premium_collected: '380.0000',
      final_pnl: null,
      trigger_event: 'PMCC_SHORT_OPEN',
      created_at: NOW
    })
    expect(rows[0].snapshot_at.startsWith(SHORT_2_DATE)).toBe(true)
  })

  it('throws and writes no snapshot when the position has no LEAPS leg', () => {
    const db = makeTestDb()
    seedPmcc(db)
    insertLegs(db, F.SHORT_2)

    expect(() =>
      appendPmccSnapshot(db, POSITION_ID, {
        triggerEvent: 'PMCC_SHORT_OPEN',
        eventDate: SHORT_2_DATE,
        now: NOW
      })
    ).toThrow(`PMCC position ${POSITION_ID} has no LEAPS leg`)
    expect(countRows(db, 'cost_basis_snapshots')).toBe(0)
  })

  it('returns the ledger and the snapshot record it wrote', () => {
    const db = seedOpenAndExpired()
    insertLegs(db, F.SHORT_2)

    const { ledger, snapshot } = appendPmccSnapshot(db, POSITION_ID, {
      triggerEvent: 'PMCC_SHORT_OPEN',
      eventDate: SHORT_2_DATE,
      now: NOW
    })

    expect(ledger).toMatchObject({ basisPerShare: '21.2000', shortCreditsTotal: '380.0000' })
    expect(snapshot).toEqual({
      id: snapshotRows(db)[0].id,
      positionId: POSITION_ID,
      basisPerShare: ledger.basisPerShare,
      totalPremiumCollected: ledger.shortCreditsTotal,
      finalPnl: null,
      triggerEvent: 'PMCC_SHORT_OPEN',
      snapshotAt: snapshotRows(db)[0].snapshot_at,
      createdAt: NOW
    })
  })

  it('sees a leg inserted earlier in the same db.transaction', () => {
    const db = seedOpenAndExpired()

    const { ledger } = db.transaction(() => {
      insertLegs(db, F.SHORT_2)
      return appendPmccSnapshot(db, POSITION_ID, {
        triggerEvent: 'PMCC_SHORT_OPEN',
        eventDate: SHORT_2_DATE,
        now: NOW
      })
    })()

    expect(ledger.basisPerShare).toBe('21.2000')
    expect(snapshotRows(db).map((r) => r.basis_per_share)).toEqual(['21.2000'])
  })

  it('records one net snapshot for a two-leg roll', () => {
    const db = seedOpenAndExpired()
    insertLegs(db, F.SHORT_2)

    db.transaction(() => {
      insertLegs(db, F.SHORT_ROLL)
      appendPmccSnapshot(db, POSITION_ID, {
        triggerEvent: 'PMCC_SHORT_ROLL',
        eventDate: F.SHORT_ROLL[0].fillDate,
        now: NOW
      })
    })()

    expect(snapshotRows(db)).toEqual([
      expect.objectContaining({
        basis_per_share: '21.8000',
        total_premium_collected: '320.0000',
        trigger_event: 'PMCC_SHORT_ROLL'
      })
    ])
  })

  it('rolls back the leg and the snapshot when the caller’s transaction throws', () => {
    const db = seedOpenAndExpired()
    const legsBefore = countRows(db, 'legs')
    const snapshotsBefore = countRows(db, 'cost_basis_snapshots')

    expect(() =>
      db.transaction(() => {
        insertLegs(db, F.SHORT_2)
        appendPmccSnapshot(db, POSITION_ID, {
          triggerEvent: 'PMCC_SHORT_OPEN',
          eventDate: SHORT_2_DATE,
          now: NOW
        })
        throw new Error('boom')
      })()
    ).toThrow('boom')

    expect(countRows(db, 'legs')).toBe(legsBefore)
    expect(countRows(db, 'cost_basis_snapshots')).toBe(snapshotsBefore)
  })

  it('rolls back the leg when the snapshot insert itself fails', () => {
    const db = seedOpenAndExpired()
    const legsBefore = countRows(db, 'legs')

    expect(() =>
      db.transaction(() => {
        insertLegs(db, F.SHORT_2)
        db.exec('DROP TABLE cost_basis_snapshots')
        appendPmccSnapshot(db, POSITION_ID, {
          triggerEvent: 'PMCC_SHORT_OPEN',
          eventDate: SHORT_2_DATE,
          now: NOW
        })
      })()
    ).toThrow()

    expect(countRows(db, 'legs')).toBe(legsBefore)
  })

  it('logs pmcc_basis_recalculated at INFO and its inputs at DEBUG', () => {
    const db = seedOpenAndExpired()
    insertLegs(db, [...F.SHORT_2, ...F.SHORT_ROLL])
    const infoSpy = vi.spyOn(logger, 'info')
    const debugSpy = vi.spyOn(logger, 'debug')

    appendPmccSnapshot(db, POSITION_ID, {
      triggerEvent: 'PMCC_SHORT_ROLL',
      eventDate: F.SHORT_ROLL[0].fillDate,
      now: NOW
    })

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: POSITION_ID,
        triggerEvent: 'PMCC_SHORT_ROLL',
        basisPerShare: '21.8000',
        basisTotal: '2180.0000'
      }),
      'pmcc_basis_recalculated'
    )
    expect(debugSpy).toHaveBeenCalledWith(expect.anything(), 'pmcc_ledger_contributions')
    expect(debugSpy).toHaveBeenCalledWith(expect.anything(), 'pmcc_roll_chains')
  })

  it('agrees with pmccLedgerFromLegs(readLegs(...)) after every leg event', () => {
    const db = makeTestDb()
    seedPmcc(db)
    const events = [
      { legs: F.OPEN, triggerEvent: 'PMCC_OPEN' },
      { legs: F.EXPIRE_1, triggerEvent: 'PMCC_SHORT_EXPIRED' },
      { legs: F.SHORT_2, triggerEvent: 'PMCC_SHORT_OPEN' },
      { legs: F.SHORT_ROLL, triggerEvent: 'PMCC_SHORT_ROLL' },
      { legs: F.LEAPS_ROLL, triggerEvent: 'PMCC_LEAPS_ROLL' },
      { legs: F.CYCLES, triggerEvent: 'PMCC_SHORT_OPEN' }
    ] as const

    const newestBases = events.map(({ legs, triggerEvent }) => {
      db.transaction(() => {
        insertLegs(db, legs)
        appendPmccSnapshot(db, POSITION_ID, { triggerEvent, eventDate: legs[0].fillDate, now: NOW })
      })()
      const newest = snapshotRows(db).at(-1)
      expect(newest).toBeDefined()
      if (!newest) throw new Error(`no snapshot after ${triggerEvent}`)
      const ledger = pmccLedgerFromLegs(readLegs(db, POSITION_ID))
      expect(ledger).not.toBeNull()
      if (!ledger) throw new Error(`no PMCC ledger after ${triggerEvent}`)
      expect(newest.basis_per_share).toBe(ledger.basisPerShare)
      return newest.basis_per_share
    })

    expect(newestBases).toEqual(['23.0000', '23.0000', '21.2000', '21.8000', '19.3000', '-0.4000'])
  })
})

// [US-104] Open-leg selectors — which LEAPS and which short call are open now.
describe('currentShortCallLeg', () => {
  const role = (legs: LegRecord[], legRole: string): LegRecord => {
    const found = legs.find((l) => l.legRole === legRole)
    if (!found) throw new Error(`fixture has no ${legRole}`)
    return found
  }

  it('is the SHORT_CALL_OPEN after the opening legs', () => {
    expect(currentShortCallLeg(F.OPEN)).toEqual(role(F.OPEN, 'SHORT_CALL_OPEN'))
  })

  it('is null after the short call expires', () => {
    expect(currentShortCallLeg([...F.OPEN, ...F.EXPIRE_1])).toBeNull()
  })

  it('is the $108 SHORT_CALL_OPEN after a new short opens', () => {
    const short = currentShortCallLeg([...F.OPEN, ...F.EXPIRE_1, ...F.SHORT_2])
    expect(short).toEqual(F.SHORT_2[0])
    expect(short?.strike).toBe('108.0000')
  })

  it("is the short roll's $112 ROLL_TO after a short roll", () => {
    const short = currentShortCallLeg([...F.OPEN, ...F.EXPIRE_1, ...F.SHORT_2, ...F.SHORT_ROLL])
    expect(short).toEqual(role(F.SHORT_ROLL, 'ROLL_TO'))
    expect(short?.strike).toBe('112.0000')
  })

  it('is unchanged by a LEAPS roll (a long-side chain)', () => {
    expect(currentShortCallLeg(THROUGH_LEAPS_ROLL)).toEqual(role(F.SHORT_ROLL, 'ROLL_TO'))
  })

  it('does not depend on input order', () => {
    expect(currentShortCallLeg([...THROUGH_LEAPS_ROLL].reverse())).toEqual(
      role(F.SHORT_ROLL, 'ROLL_TO')
    )
  })

  it.each([
    ['SHORT_CALL_CLOSE', 'BUY', '0.5000'],
    ['SHORT_CALL_ASSIGNED', 'ASSIGN', '0.0000']
  ] as const)('is null after a %s row closes it', (legRole, action, premium) => {
    const close = makePmccLeg(POSITION_ID, {
      legRole,
      action,
      strike: '110.0000',
      expiration: FIXED_DAY(32),
      fillDate: FIXED_DAY(20),
      premiumPerContract: premium
    })
    expect(currentShortCallLeg([...F.OPEN, close])).toBeNull()
  })

  it('is null for no legs', () => {
    expect(currentShortCallLeg([])).toBeNull()
  })
})

describe('isShortCallRoll', () => {
  it('is true for a short roll, whose ROLL_FROM buys back the short call', () => {
    const [chain] = groupRollChains(F.SHORT_ROLL)
    expect(isShortCallRoll(chain)).toBe(true)
  })

  it('is false for a LEAPS roll, whose ROLL_FROM sells the old LEAPS', () => {
    const [chain] = groupRollChains(F.LEAPS_ROLL)
    expect(isShortCallRoll(chain)).toBe(false)
  })
})

describe('currentLeapsLeg', () => {
  it('is the LEAPS_OPEN after the opening legs', () => {
    expect(currentLeapsLeg(F.OPEN)?.legRole).toBe('LEAPS_OPEN')
  })

  it("is the LEAPS roll's $85 ROLL_TO after a LEAPS roll", () => {
    const long = currentLeapsLeg(THROUGH_LEAPS_ROLL)
    expect(long).toEqual(F.LEAPS_ROLL.find((l) => l.legRole === 'ROLL_TO'))
    expect(long?.strike).toBe('85.0000')
  })

  it('is null when there is no long leg', () => {
    expect(currentLeapsLeg([])).toBeNull()
  })
})

describe('pmccOpenLegs', () => {
  it('is null for no legs', () => {
    expect(pmccOpenLegs([])).toBeNull()
  })

  it('is null when there is no long leg', () => {
    expect(pmccOpenLegs([...F.SHORT_2])).toBeNull()
  })

  it('is the LEAPS and the open short after the opening legs', () => {
    expect(pmccOpenLegs(F.OPEN)).toEqual({ long: F.OPEN[0], short: F.OPEN[1] })
  })

  it('has a null short after the short call expires', () => {
    expect(pmccOpenLegs([...F.OPEN, ...F.EXPIRE_1])).toEqual({ long: F.OPEN[0], short: null })
  })
})
