import { randomUUID } from 'node:crypto'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import Decimal from 'decimal.js'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { logger } from '../logger'
import { isKnownPmccPhase } from '../pmcc-phase'
import type {
  CreatePmccPositionPayload,
  CreatePositionPayload,
  LegRecord,
  PmccListItem,
  PmccListSummary,
  PmccLongLegSummary,
  PmccShortLegSummary
} from '../schemas'
import { makeTestDb, isoDate } from '../test-utils'
import { saveAlertDefaults } from './alert-defaults'
import { assignCspPosition } from './assign-csp-position'
import { closeCspPosition } from './close-csp-position'
import { openCoveredCallPosition } from './open-covered-call-position'
import { readPmccListItem } from './list-positions'
import { appendPmccSnapshot } from './pmcc-ledger'
import { insertPosition } from './position-rows'
import { createPmccPosition, createPosition, listPositions } from './positions'
import { rollCspPosition } from './roll-csp-position'
import {
  insertLegs,
  makePmccLeg,
  pmccFixtures,
  recordPmccLegEvent
} from './test-fixtures/pmcc-legs'

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
    // Local calendar-day basis, matching computeDte (differenceInCalendarDays +
    // parseISO). Mixing a UTC "today" against a local expiration was off-by-one
    // in the evening at negative UTC offsets.
    const expectedDte = differenceInCalendarDays(parseISO(expiration), new Date())
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
    const expectedDte = differenceInCalendarDays(parseISO(newExpiration), new Date())
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

// ---------------------------------------------------------------------------
// US-33 Area 3 — profit_target_percent column
// ---------------------------------------------------------------------------

describe('listPositions — profit target column', () => {
  it('returns profitTargetPercent: null when not set', () => {
    const db = makeTestDb()
    createPosition(db, VALID_PAYLOAD)
    const items = listPositions(db)
    expect(items).toHaveLength(1)
    expect(items[0].profitTargetPercent).toBeNull()
  })

  it('returns profitTargetPercent: 25 when override is set', () => {
    const db = makeTestDb()
    const { position } = createPosition(db, VALID_PAYLOAD)

    db.prepare('UPDATE positions SET profit_target_percent = ? WHERE id = ?').run(25, position.id)

    const items = listPositions(db)
    expect(items).toHaveLength(1)
    expect(items[0].profitTargetPercent).toBe(25)
  })
})

// ---------------------------------------------------------------------------
// US-33 Area 4 — instrumentType, contracts, entryPremiumPerContract
// ---------------------------------------------------------------------------

describe('listPositions — option leg fields (US-33 Area 4)', () => {
  it('returns instrumentType "PUT" for an open CSP', () => {
    const db = makeTestDb()
    createPosition(db, VALID_PAYLOAD)
    const items = listPositions(db)
    expect(items).toHaveLength(1)
    expect(items[0].instrumentType).toBe('PUT')
  })

  it('returns instrumentType "CALL" for an open CC', () => {
    const db = makeTestDb()
    const created = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 3.5,
      fillDate: '2026-01-03'
    })
    assignCspPosition(db, created.position.id, {
      positionId: created.position.id,
      assignmentDate: '2026-01-17'
    })
    openCoveredCallPosition(db, created.position.id, {
      positionId: created.position.id,
      strike: 182,
      expiration: isoDate(45),
      contracts: 1,
      premiumPerContract: 2.3,
      fillDate: isoDate(0)
    })

    const items = listPositions(db)
    expect(items).toHaveLength(1)
    expect(items[0].instrumentType).toBe('CALL')
  })

  it('returns instrumentType null for HOLDING_SHARES', () => {
    const db = makeTestDb()
    const created = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 3.5,
      fillDate: '2026-01-03'
    })
    assignCspPosition(db, created.position.id, {
      positionId: created.position.id,
      assignmentDate: '2026-01-17'
    })

    const items = listPositions(db)
    expect(items).toHaveLength(1)
    expect(items[0].phase).toBe('HOLDING_SHARES')
    expect(items[0].instrumentType).toBeNull()
    expect(items[0].contracts).toBeNull()
    expect(items[0].entryPremiumPerContract).toBeNull()
  })

  it('returns instrumentType null for closed positions', () => {
    const db = makeTestDb()
    const { position } = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 2.5,
      fillDate: isoDate(0)
    })
    closeCspPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 1.0,
      fillDate: isoDate(5)
    })

    const items = listPositions(db)
    expect(items).toHaveLength(1)
    expect(items[0].instrumentType).toBeNull()
    expect(items[0].contracts).toBeNull()
    expect(items[0].entryPremiumPerContract).toBeNull()
  })

  it('returns contracts and entryPremiumPerContract from the active leg', () => {
    const db = makeTestDb()
    createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 3.5
    })
    const items = listPositions(db)
    expect(items).toHaveLength(1)
    expect(items[0].contracts).toBe(1)
    expect(items[0].entryPremiumPerContract).toBe('3.5000')
  })
})

// ---------------------------------------------------------------------------
// US-101 Area 7 — PMCC list summary
// ---------------------------------------------------------------------------

// The PMCC sections run on FIXED_DAY's calendar: opened 2026-09-14 (day 0), at local noon.
const PMCC_NOW = new Date(2026, 8, 14, 12, 0)

function pinPmccClock(): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(PMCC_NOW)
}

/** Opened on day 0; the LEAPS expires on day 368, the short call on day 32. */
function makePmccPayload(contracts = 1): CreatePmccPositionPayload {
  const leg = {
    underlying: 'XYZ',
    instrumentType: 'CALL' as const,
    deliverableShares: 100,
    contracts,
    fillDate: '2026-09-14',
    fees: 0
  }
  return {
    strategy: 'PMCC',
    ticker: 'XYZ',
    long: { ...leg, strike: 80, expiration: '2027-09-17', fillPrice: 25.0 },
    short: { ...leg, strike: 110, expiration: '2026-10-16', fillPrice: 2.0 }
  }
}

describe('listPositions — PMCC summary (US-101)', () => {
  beforeEach(pinPmccClock)

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('lists a PMCC with strategyType PMCC, its legs and the opening ledger (US-108)', () => {
    const db = makeTestDb()
    const { longLeg, shortLeg } = createPmccPosition(db, makePmccPayload())

    const [item] = listPositions(db)

    expect(item.strategyType).toBe('PMCC')
    expect(item.pmcc).toEqual({
      legs: [
        {
          legId: longLeg.id,
          side: 'LONG',
          strike: '80.0000',
          expiration: '2027-09-17',
          dte: 368,
          contracts: 1,
          fillPerShare: '25.0000'
        },
        {
          legId: shortLeg.id,
          side: 'SHORT',
          strike: '110.0000',
          expiration: '2026-10-16',
          dte: 32,
          contracts: 1,
          fillPerShare: '2.0000'
        }
      ],
      cycles: 1,
      entryDebit: { perShare: '23.0000', total: '2300.0000' },
      openedAt: '2026-09-14',
      managementWindowDte: 21,
      basisPerShare: '23.0000',
      basisTotal: '2300.0000',
      leapsCostPerShare: '25.0000',
      shortCreditsPerShare: '2.0000',
      shortCreditsTotal: '200.0000',
      premiumRecoveredPercent: '8.0000'
    })
    expect(item).toMatchObject({
      strike: null,
      expiration: null,
      dte: null,
      instrumentType: null,
      contracts: null,
      entryPremiumPerContract: null,
      premiumCollected: '200.0000',
      effectiveCostBasis: '23.0000'
    })
  })

  it('marks a wheel item with strategyType WHEEL and pmcc null', () => {
    const db = makeTestDb()
    createPosition(db, VALID_PAYLOAD)
    const [item] = listPositions(db)
    expect(item.strategyType).toBe('WHEEL')
    expect(item.pmcc).toBeNull()
    expect(item.strike).toBe('180.0000')
  })

  it('sorts a PMCC by its short call DTE and reads both PMCC summaries in one query', () => {
    const db = makeTestDb()
    const first = createPmccPosition(db, makePmccPayload())
    createPosition(db, { ...VALID_PAYLOAD, ticker: 'LATE', expiration: '2026-11-13' })
    const second = createPmccPosition(db, makePmccPayload(2))
    createPosition(db, { ...VALID_PAYLOAD, ticker: 'SOON', expiration: '2026-09-24' })
    const debug = vi.spyOn(logger, 'debug')

    const items = listPositions(db)

    // Short calls expire in 32 days: between the 10-day and 60-day puts.
    expect(items.map((i) => i.ticker)).toEqual(['SOON', 'XYZ', 'XYZ', 'LATE'])
    const summaryCalls = debug.mock.calls.filter((call) => call[1] === 'legs_by_position_read')
    expect(summaryCalls).toHaveLength(1)
    expect((summaryCalls[0][0] as { ids: string[] }).ids).toEqual(
      expect.arrayContaining([first.position.id, second.position.id])
    )
  })

  it('does not run the summary query when no PMCC exists', () => {
    const db = makeTestDb()
    createPosition(db, VALID_PAYLOAD)
    const debug = vi.spyOn(logger, 'debug')
    listPositions(db)
    expect(debug.mock.calls.some((call) => call[1] === 'legs_by_position_read')).toBe(false)
  })

  it('scales the basis total by contracts (3 contracts → 6900.0000)', () => {
    const db = makeTestDb()
    createPmccPosition(db, makePmccPayload(3))
    const [item] = listPositions(db)
    expect(item.pmcc?.basisTotal).toBe('6900.0000')
    expect(item.pmcc?.basisPerShare).toBe('23.0000')
    expect(item.pmcc?.legs.map((leg) => leg.contracts)).toEqual([3, 3])
  })

  it('computes the basis total from the legs, not basis_per_share × 300 (3 contracts, $0.01 fees → 6900.0200)', () => {
    const db = makeTestDb()
    const payload = makePmccPayload(3)
    createPmccPosition(db, {
      ...payload,
      long: { ...payload.long, fees: 0.01 },
      short: { ...payload.short, fees: 0.01 }
    })
    const [item] = listPositions(db)
    expect(item.pmcc?.basisTotal).toBe('6900.0200')
    // basis_per_share rounds to 4 dp, so × 300 would drift away from the legs' cash total.
    expect(item.pmcc?.basisTotal).not.toBe(
      new Decimal(item.effectiveCostBasis).times(300).toFixed(4)
    )
  })

  it('carries the entry net debit total from the legs, not entryDebit.perShare × 300 (3 contracts, $25.00 / $1.80, $0.65 fees → 6961.3000)', () => {
    const db = makeTestDb()
    const payload = makePmccPayload(3)
    createPmccPosition(db, {
      ...payload,
      long: { ...payload.long, fees: 0.65 },
      short: { ...payload.short, fillPrice: 1.8, fees: 0.65 }
    })

    const [item] = listPositions(db)

    // The per-share figure rounds 23.20433… to 23.2043, which × 300 would read 6961.2900.
    expect(item.pmcc?.entryDebit).toEqual({ perShare: '23.2043', total: '6961.3000' })
  })

  it('lists a PMCC whose short leg row is missing with the LEAPS leg only', () => {
    const db = makeTestDb()
    const { position, shortLeg } = createPmccPosition(db, makePmccPayload())
    db.prepare('DELETE FROM legs WHERE id = ?').run(shortLeg.id)

    const [item] = listPositions(db)

    expect(item.id).toBe(position.id)
    expect(item.pmcc?.legs.map((leg) => [leg.side, leg.strike])).toEqual([['LONG', '80.0000']])
  })

  it('lists a PMCC whose leg fill price is missing, with the basis from its premiums (US-103)', () => {
    const db = makeTestDb()
    const { position, shortLeg } = createPmccPosition(db, makePmccPayload())
    db.prepare('UPDATE legs SET fill_price = NULL WHERE id = ?').run(shortLeg.id)
    const warn = vi.spyOn(logger, 'warn')

    const [item] = listPositions(db)

    expect(item.id).toBe(position.id)
    expect(item.pmcc?.basisPerShare).toBe('23.0000')
    expect(item.pmcc?.basisTotal).toBe('2300.0000')
    expect(item.pmcc).toMatchObject({ entryDebit: null })
    expect(warn).not.toHaveBeenCalledWith(
      { positionId: position.id },
      'pmcc_list_summary_incomplete'
    )
  })

  it('omits a PMCC whose LEAPS expiration cannot be parsed into a DTE', () => {
    const db = makeTestDb()
    const { position, longLeg } = createPmccPosition(db, makePmccPayload())
    db.prepare("UPDATE legs SET expiration = 'not-a-date' WHERE id = ?").run(longLeg.id)
    const warn = vi.spyOn(logger, 'warn')

    expect(listPositions(db)).toEqual([])
    expect(warn).toHaveBeenCalledWith({ positionId: position.id }, 'pmcc_list_summary_incomplete')
  })

  it('lists a PMCC with zeroed snapshot money fields (basis still from its legs) when its cost-basis snapshot is missing', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())
    db.prepare('DELETE FROM cost_basis_snapshots WHERE position_id = ?').run(position.id)

    const [item] = listPositions(db)

    expect(item.id).toBe(position.id)
    expect(item.pmcc?.basisPerShare).toBe('23.0000')
    expect(item.pmcc?.basisTotal).toBe('2300.0000')
    expect(item.premiumCollected).toBe('0.0000')
    expect(item.effectiveCostBasis).toBe('0.0000')
  })

  it('omits a PMCC with no legs at all and warns pmcc_list_summary_incomplete', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())
    db.prepare('DELETE FROM legs WHERE position_id = ?').run(position.id)
    const warn = vi.spyOn(logger, 'warn')

    expect(listPositions(db)).toEqual([])
    expect(warn).toHaveBeenCalledWith({ positionId: position.id }, 'pmcc_list_summary_incomplete')
  })
})

// ---------------------------------------------------------------------------
// US-103 Area 7 — running cost basis on PmccListSummary
// ---------------------------------------------------------------------------

describe('listPositions — PMCC running basis (US-103)', () => {
  beforeEach(pinPmccClock)

  afterEach(() => {
    vi.useRealTimers()
  })

  it('drops initialNetDebit from the PMCC summary', () => {
    const db = makeTestDb()
    createPmccPosition(db, makePmccPayload())
    const [item] = listPositions(db)
    expect(item.pmcc).not.toHaveProperty('initialNetDebit')
  })

  it('reads the running basis after an expiration, a new short and a short-call roll (21.8000 / 2180.0000)', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())
    const [before] = listPositions(db)
    const F = pmccFixtures(position.id)
    const record = (
      legs: typeof F.OPEN,
      triggerEvent: 'PMCC_SHORT_EXPIRED' | 'PMCC_SHORT_OPEN' | 'PMCC_SHORT_ROLL'
    ): void =>
      db.transaction(() => {
        insertLegs(db, legs)
        appendPmccSnapshot(db, position.id, {
          triggerEvent,
          eventDate: legs[0].fillDate,
          now: PMCC_NOW.toISOString()
        })
      })()
    record(F.EXPIRE_1, 'PMCC_SHORT_EXPIRED')
    record(F.SHORT_2, 'PMCC_SHORT_OPEN')
    record(F.SHORT_ROLL, 'PMCC_SHORT_ROLL')

    const [after] = listPositions(db)

    expect(after.pmcc?.basisPerShare).toBe('21.8000')
    expect(after.pmcc?.basisTotal).toBe('2180.0000')
    expect(after.effectiveCostBasis).toBe('21.8000')
    // No LEAPS roll, so the long summary is unchanged.
    expect(after.pmcc?.legs[0]).toEqual(before.pmcc?.legs[0])
    // The short-call roll's ROLL_TO is the open short, not the rolled-away SHORT_2.
    const [, rollTo] = F.SHORT_ROLL
    expect(after.pmcc?.legs[1]).toEqual({
      legId: rollTo.id,
      side: 'SHORT',
      strike: '112.0000',
      expiration: '2026-12-18',
      dte: 95,
      contracts: 1,
      fillPerShare: '2.4000'
    })
  })

  it('leaves wheel items deep-equal to their pre-US-103 shape alongside a PMCC', () => {
    const db = makeTestDb()
    createPmccPosition(db, makePmccPayload())
    const { position } = createPosition(db, { ...VALID_PAYLOAD, expiration: '2026-10-21' })

    const wheel = listPositions(db).find((i) => i.id === position.id)

    expect(wheel).toEqual({
      id: position.id,
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      status: 'ACTIVE',
      premiumCollected: '250.0000',
      effectiveCostBasis: '177.5000',
      profitTargetPercent: null,
      strategyType: 'WHEEL',
      pmcc: null,
      strike: '180.0000',
      expiration: '2026-10-21',
      dte: 37,
      instrumentType: 'PUT',
      contracts: 1,
      entryPremiumPerContract: '2.5000',
      nextEarnings: null
    })
  })
})

// ---------------------------------------------------------------------------
// US-105 — the PMCC row's leg summaries follow rolls and expirations
// ---------------------------------------------------------------------------

describe('listPositions — PMCC open legs (US-105)', () => {
  beforeEach(pinPmccClock)

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('reports the LEAPS roll ROLL_TO as the long leg ($80 → $85, new expiration)', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())
    const F = pmccFixtures(position.id)
    recordPmccLegEvent(db, position.id, F.LEAPS_ROLL, 'PMCC_LEAPS_ROLL')

    const [item] = listPositions(db)

    const [, rollTo] = F.LEAPS_ROLL
    expect(item.pmcc?.legs[0]).toEqual({
      legId: rollTo.id,
      side: 'LONG',
      strike: '85.0000',
      expiration: '2028-01-21',
      dte: 494,
      contracts: 1,
      fillPerShare: '23.5000'
    })
    expect(item.pmcc?.legs[1]?.strike).toBe('110.0000')
  })

  it('reports no short leg once the short call expired, and still lists the LEAPS', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())
    const warn = vi.spyOn(logger, 'warn')
    recordPmccLegEvent(db, position.id, pmccFixtures(position.id).EXPIRE_1, 'PMCC_SHORT_EXPIRED')

    const [item] = listPositions(db)

    expect(item.id).toBe(position.id)
    expect(item.pmcc?.legs.map((leg) => [leg.side, leg.strike])).toEqual([['LONG', '80.0000']])
    expect(warn).not.toHaveBeenCalledWith(
      { positionId: position.id },
      'pmcc_list_summary_incomplete'
    )
  })
})

// ---------------------------------------------------------------------------
// US-108 — the PMCC card's list shape: legs, ledger figures, earnings, management window
// ---------------------------------------------------------------------------

// The AC's valuation date, 2026-11-06, at local noon so the ET day is the same.
const US108_NOW = new Date(2026, 10, 6, 12, 0)

type LegFields = Parameters<typeof makePmccLeg>[1]

/** The AC Background: LEAPS $80 @ $25.00 opened 2026-04-17, three expired short calls
 *  ($1.80 entry, then $0.10 and $0.10), and the open $108 call @ $1.80 expiring 2026-11-20.
 *  Credits $3.80, basis $21.20, entry debit $23.20, 4 cycles. */
function backgroundLegFields(): LegFields[] {
  const shortCycle = (
    strike: string,
    premium: string,
    opened: string,
    expires: string
  ): LegFields[] => [
    {
      legRole: 'SHORT_CALL_OPEN',
      action: 'SELL',
      strike,
      expiration: expires,
      fillDate: opened,
      premiumPerContract: premium
    },
    {
      legRole: 'SHORT_CALL_EXPIRED',
      action: 'EXPIRE',
      strike,
      expiration: expires,
      fillDate: expires,
      premiumPerContract: '0.0000'
    }
  ]
  return [
    {
      legRole: 'LEAPS_OPEN',
      action: 'BUY',
      strike: '80.0000',
      expiration: '2027-09-17',
      fillDate: '2026-04-17',
      premiumPerContract: '25.0000'
    },
    ...shortCycle('105.0000', '1.8000', '2026-04-17', '2026-05-15'),
    ...shortCycle('106.0000', '0.1000', '2026-05-18', '2026-06-19'),
    ...shortCycle('107.0000', '0.1000', '2026-06-22', '2026-07-17'),
    {
      legRole: 'SHORT_CALL_OPEN',
      action: 'SELL',
      strike: '108.0000',
      expiration: '2026-11-20',
      fillDate: '2026-10-23',
      premiumPerContract: '1.8000'
    }
  ]
}

const SHORT_ROLL_FIELDS: LegFields[] = [
  {
    legRole: 'ROLL_FROM',
    action: 'BUY',
    strike: '108.0000',
    expiration: '2026-11-20',
    fillDate: '2026-11-04',
    premiumPerContract: '1.2000',
    rollChainId: 'rc-108'
  },
  {
    legRole: 'ROLL_TO',
    action: 'SELL',
    strike: '110.0000',
    expiration: '2026-12-18',
    fillDate: '2026-11-04',
    premiumPerContract: '2.1000',
    rollChainId: 'rc-108'
  }
]

/** A PMCC written straight to the tables, as US-104/105/115's recording services would —
 *  createPmccPosition would reject the past-dated entry short against the pinned clock. */
function seedPmcc(
  db: ReturnType<typeof makeTestDb>,
  fields: LegFields[],
  ticker = 'XYZ'
): { positionId: string; legs: LegRecord[] } {
  const positionId = randomUUID()
  insertPosition(db, {
    id: positionId,
    ticker,
    strategyType: 'PMCC',
    phase: 'PMCC_OPEN',
    openedDate: '2026-04-17',
    accountId: null,
    notes: null,
    thesis: null,
    now: US108_NOW.toISOString()
  })
  // seq orders legs that share a fill date (the entry pair, a roll's two halves).
  const legs = fields.map((f, i) => makePmccLeg(positionId, f, i))
  insertLegs(db, legs)
  appendPmccSnapshot(db, positionId, {
    triggerEvent: 'PMCC_OPEN',
    eventDate: '2026-04-17',
    now: US108_NOW.toISOString()
  })
  return { positionId, legs }
}

function seedEarningsRow(
  db: ReturnType<typeof makeTestDb>,
  ticker: string,
  next: string | null
): void {
  db.prepare(
    `INSERT INTO earnings_date (ticker, next_earnings, checked_through, checked_at, source)
     VALUES (?, ?, '2026-12-31', ?, 'finnhub')`
  ).run(ticker, next, US108_NOW.toISOString())
}

function wheel(
  db: ReturnType<typeof makeTestDb>,
  ticker: string,
  expiration: string
): ReturnType<typeof createPosition> {
  return createPosition(db, { ...VALID_PAYLOAD, ticker, expiration, fillDate: '2026-11-02' })
}

function pmccOf(db: ReturnType<typeof makeTestDb>, positionId: string): PmccListItem {
  const item = listPositions(db).find((i) => i.id === positionId)
  if (item?.strategyType !== 'PMCC') throw new Error(`no PMCC item ${positionId}`)
  return item
}

describe('listPositions — PMCC card shape (US-108)', () => {
  it('types the legs as the LEAPS first, then short calls only — never empty or short-first', () => {
    type Legs = PmccListSummary['legs']
    expectTypeOf<Legs[0]>().toEqualTypeOf<PmccLongLegSummary>()
    expectTypeOf<[]>().not.toExtend<Legs>()
    expectTypeOf<[PmccShortLegSummary]>().not.toExtend<Legs>()
    expectTypeOf<[PmccLongLegSummary, PmccLongLegSummary]>().not.toExtend<Legs>()
    expectTypeOf<[PmccLongLegSummary, PmccShortLegSummary, PmccShortLegSummary]>().toExtend<Legs>()
  })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(US108_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds the Background PMCC: LEAPS then the open short, 4 cycles and the six ledger figures', () => {
    const db = makeTestDb()
    const { positionId, legs } = seedPmcc(db, backgroundLegFields())

    expect(pmccOf(db, positionId).pmcc).toEqual({
      legs: [
        {
          legId: legs[0].id,
          side: 'LONG',
          strike: '80.0000',
          expiration: '2027-09-17',
          dte: 315,
          contracts: 1,
          fillPerShare: '25.0000'
        },
        {
          legId: legs[7].id,
          side: 'SHORT',
          strike: '108.0000',
          expiration: '2026-11-20',
          dte: 14,
          contracts: 1,
          fillPerShare: '1.8000'
        }
      ],
      cycles: 4,
      entryDebit: { perShare: '23.2000', total: '2320.0000' },
      openedAt: '2026-04-17',
      managementWindowDte: 21,
      basisPerShare: '21.2000',
      basisTotal: '2120.0000',
      leapsCostPerShare: '25.0000',
      shortCreditsPerShare: '3.8000',
      shortCreditsTotal: '380.0000',
      premiumRecoveredPercent: '15.2000'
    })
  })

  it('takes the position override over the global default (override 14, default 18 → 14)', () => {
    const db = makeTestDb()
    saveAlertDefaults(db, { profitTargetPercent: 50, managementWindowDte: 18 })
    const { positionId } = seedPmcc(db, backgroundLegFields())
    db.prepare('UPDATE positions SET management_window_dte_override = 14 WHERE id = ?').run(
      positionId
    )

    expect(pmccOf(db, positionId).pmcc.managementWindowDte).toBe(14)
  })

  it('takes the saved global default when the position has no override (18)', () => {
    const db = makeTestDb()
    saveAlertDefaults(db, { profitTargetPercent: 50, managementWindowDte: 18 })
    const { positionId } = seedPmcc(db, backgroundLegFields())

    expect(pmccOf(db, positionId).pmcc.managementWindowDte).toBe(18)
  })

  it('lists one LONG leg once every short call has expired, still counting their cycles', () => {
    const db = makeTestDb()
    const { positionId, legs } = seedPmcc(db, backgroundLegFields().slice(0, 7))

    const { pmcc } = pmccOf(db, positionId)

    expect(pmcc.legs.map((leg) => [leg.legId, leg.side])).toEqual([[legs[0].id, 'LONG']])
    expect(pmcc.cycles).toBe(3)
  })

  it('takes a short roll’s ROLL_TO as the SHORT leg without adding a cycle', () => {
    const db = makeTestDb()
    const { positionId, legs } = seedPmcc(db, [...backgroundLegFields(), ...SHORT_ROLL_FIELDS])

    const { pmcc } = pmccOf(db, positionId)

    expect(pmcc.legs[1]).toEqual({
      legId: legs[9].id,
      side: 'SHORT',
      strike: '110.0000',
      expiration: '2026-12-18',
      dte: 42,
      contracts: 1,
      fillPerShare: '2.1000'
    })
    expect(pmcc.legs).toHaveLength(2)
    expect(pmcc.cycles).toBe(4)
  })

  it('keeps a closed PMCC’s legs and ledger', () => {
    const db = makeTestDb()
    const { positionId } = seedPmcc(db, backgroundLegFields())
    db.prepare("UPDATE positions SET status = 'CLOSED' WHERE id = ?").run(positionId)

    const item = pmccOf(db, positionId)

    expect(item.status).toBe('CLOSED')
    expect(item.pmcc.legs.map((leg) => leg.side)).toEqual(['LONG', 'SHORT'])
    expect(item.pmcc.basisTotal).toBe('2120.0000')
    expect(item.pmcc.shortCreditsTotal).toBe('380.0000')
  })

  it('reads a stored PMCC phase this build does not know as its raw label, with its legs', () => {
    const db = makeTestDb()
    const { positionId } = seedPmcc(db, backgroundLegFields())
    db.prepare("UPDATE positions SET phase = 'PMCC_ASSIGNED' WHERE id = ?").run(positionId)

    const item = pmccOf(db, positionId)

    expect(item.phase).toBe('PMCC_ASSIGNED')
    expect(isKnownPmccPhase(item.phase)).toBe(false)
    expect(item.pmcc.legs.map((leg) => leg.side)).toEqual(['LONG', 'SHORT'])
  })

  it('joins the stored next earnings date onto PMCC and wheel items, null when none is stored', () => {
    const db = makeTestDb()
    seedPmcc(db, backgroundLegFields())
    wheel(db, 'AAPL', '2026-12-06')
    wheel(db, 'MSFT', '2026-11-16')
    wheel(db, 'TSLA', '2026-11-27')
    seedEarningsRow(db, 'XYZ', '2026-11-18')
    seedEarningsRow(db, 'AAPL', '2026-11-10')
    seedEarningsRow(db, 'TSLA', '2026-10-29')

    const earnings = Object.fromEntries(listPositions(db).map((i) => [i.ticker, i.nextEarnings]))

    expect(earnings).toEqual({
      XYZ: '2026-11-18',
      AAPL: '2026-11-10',
      MSFT: null,
      TSLA: null
    })
  })

  it('sorts the Background PMCC by its 14-DTE short between MSFT (10) and AAPL (30)', () => {
    const db = makeTestDb()
    wheel(db, 'AAPL', '2026-12-06')
    seedPmcc(db, backgroundLegFields())
    wheel(db, 'MSFT', '2026-11-16')

    expect(listPositions(db).map((i) => i.ticker)).toEqual(['MSFT', 'XYZ', 'AAPL'])
  })

  it('sorts a LEAPS-only PMCC by its 315-DTE LEAPS after AAPL and before shares held', () => {
    const db = makeTestDb()
    const nvda = createPosition(db, {
      ...VALID_PAYLOAD,
      ticker: 'NVDA',
      expiration: '2026-11-20',
      fillDate: '2026-10-15'
    })
    assignCspPosition(db, nvda.position.id, {
      positionId: nvda.position.id,
      assignmentDate: '2026-11-02'
    })
    seedPmcc(db, backgroundLegFields().slice(0, 7))
    wheel(db, 'AAPL', '2026-12-06')
    wheel(db, 'MSFT', '2026-11-16')

    expect(listPositions(db).map((i) => i.ticker)).toEqual(['MSFT', 'AAPL', 'XYZ', 'NVDA'])
  })
})

describe('readPmccListItem', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(US108_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the PMCC row listPositions lists for that id', () => {
    const db = makeTestDb()
    wheel(db, 'AAPL', '2026-12-06')
    const { positionId } = seedPmcc(db, backgroundLegFields())

    expect(readPmccListItem(db, positionId)).toEqual(pmccOf(db, positionId))
  })

  it('returns null for a wheel position id', () => {
    const db = makeTestDb()
    const { position } = wheel(db, 'AAPL', '2026-12-06')
    seedPmcc(db, backgroundLegFields())

    expect(readPmccListItem(db, position.id)).toBeNull()
  })

  it('returns null for an id with no position', () => {
    const db = makeTestDb()
    seedPmcc(db, backgroundLegFields())

    expect(readPmccListItem(db, randomUUID())).toBeNull()
  })
})
