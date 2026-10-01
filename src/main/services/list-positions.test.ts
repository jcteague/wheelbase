import { randomUUID } from 'node:crypto'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeDte } from '../core/dte'
import { logger } from '../logger'
import type { CreatePmccPositionPayload, CreatePositionPayload } from '../schemas'
import { makeTestDb, isoDate } from '../test-utils'
import { assignCspPosition } from './assign-csp-position'
import { closeCspPosition } from './close-csp-position'
import { openCoveredCallPosition } from './open-covered-call-position'
import { createPmccPosition, createPosition, listPositions } from './positions'
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

function makePmccPayload(contracts = 1): CreatePmccPositionPayload {
  const leg = {
    underlying: 'XYZ',
    instrumentType: 'CALL' as const,
    deliverableShares: 100,
    contracts,
    fillDate: isoDate(0),
    fees: 0
  }
  return {
    strategy: 'PMCC',
    ticker: 'XYZ',
    long: { ...leg, strike: 80, expiration: isoDate(368), fillPrice: 25.0 },
    short: { ...leg, strike: 110, expiration: isoDate(32), fillPrice: 2.0 }
  }
}

describe('listPositions — PMCC summary (US-101)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists a PMCC with strategyType PMCC, both leg summaries and the initial net debit', () => {
    const db = makeTestDb()
    createPmccPosition(db, makePmccPayload())

    const [item] = listPositions(db)
    const longExpiration = isoDate(368)
    const shortExpiration = isoDate(32)

    expect(item.strategyType).toBe('PMCC')
    expect(item.pmcc).toEqual({
      long: {
        strike: '80.0000',
        expiration: longExpiration,
        dte: computeDte(longExpiration),
        contracts: 1
      },
      short: {
        strike: '110.0000',
        expiration: shortExpiration,
        dte: computeDte(shortExpiration),
        contracts: 1
      },
      initialNetDebit: '2300.0000'
    })
    expect(item.pmcc?.long.dte).toBeTypeOf('number')
    expect(item.pmcc?.short.dte).toBeTypeOf('number')
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
    createPosition(db, { ...VALID_PAYLOAD, ticker: 'LATE', expiration: isoDate(60) })
    const second = createPmccPosition(db, makePmccPayload(2))
    createPosition(db, { ...VALID_PAYLOAD, ticker: 'SOON', expiration: isoDate(10) })
    const debug = vi.spyOn(logger, 'debug')

    const items = listPositions(db)

    // Short calls expire in 32 days: between the 10-day and 60-day puts.
    expect(items.map((i) => i.ticker)).toEqual(['SOON', 'XYZ', 'XYZ', 'LATE'])
    const summaryCalls = debug.mock.calls.filter((call) => call[1] === 'pmcc_opening_legs_read')
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
    expect(debug.mock.calls.some((call) => call[1] === 'pmcc_opening_legs_read')).toBe(false)
  })

  it('scales the initial net debit by contracts (3 contracts → 6900.0000)', () => {
    const db = makeTestDb()
    createPmccPosition(db, makePmccPayload(3))
    const [item] = listPositions(db)
    expect(item.pmcc?.initialNetDebit).toBe('6900.0000')
    expect(item.pmcc?.long.contracts).toBe(3)
    expect(item.pmcc?.short.contracts).toBe(3)
  })

  it('computes the initial net debit from the leg fills, not the rounded basis (3 contracts, $0.01 fees → 6900.0200)', () => {
    const db = makeTestDb()
    const payload = makePmccPayload(3)
    createPmccPosition(db, {
      ...payload,
      long: { ...payload.long, fees: 0.01 },
      short: { ...payload.short, fees: 0.01 }
    })
    const [item] = listPositions(db)
    expect(item.pmcc?.initialNetDebit).toBe('6900.0200')
  })

  it('omits a PMCC whose short leg row is missing and warns pmcc_list_summary_incomplete', () => {
    const db = makeTestDb()
    const { position, shortLeg } = createPmccPosition(db, makePmccPayload())
    db.prepare('DELETE FROM legs WHERE id = ?').run(shortLeg.id)
    const warn = vi.spyOn(logger, 'warn')

    expect(listPositions(db)).toEqual([])
    expect(warn).toHaveBeenCalledWith({ positionId: position.id }, 'pmcc_list_summary_incomplete')
  })

  it('omits a PMCC whose leg fill price is missing and warns pmcc_list_summary_incomplete', () => {
    const db = makeTestDb()
    const { position, shortLeg } = createPmccPosition(db, makePmccPayload())
    db.prepare('UPDATE legs SET fill_price = NULL WHERE id = ?').run(shortLeg.id)
    const warn = vi.spyOn(logger, 'warn')

    expect(listPositions(db)).toEqual([])
    expect(warn).toHaveBeenCalledWith({ positionId: position.id }, 'pmcc_list_summary_incomplete')
  })

  it('omits a PMCC whose LEAPS expiration cannot be parsed into a DTE', () => {
    const db = makeTestDb()
    const { position, longLeg } = createPmccPosition(db, makePmccPayload())
    db.prepare("UPDATE legs SET expiration = 'not-a-date' WHERE id = ?").run(longLeg.id)
    const warn = vi.spyOn(logger, 'warn')

    expect(listPositions(db)).toEqual([])
    expect(warn).toHaveBeenCalledWith({ positionId: position.id }, 'pmcc_list_summary_incomplete')
  })

  it('lists a PMCC with zeroed snapshot money fields (debit still from its legs) when its cost-basis snapshot is missing', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, makePmccPayload())
    db.prepare('DELETE FROM cost_basis_snapshots WHERE position_id = ?').run(position.id)

    const [item] = listPositions(db)

    expect(item.id).toBe(position.id)
    expect(item.pmcc?.initialNetDebit).toBe('2300.0000')
    expect(item.premiumCollected).toBe('0.0000')
    expect(item.effectiveCostBasis).toBe('0.0000')
  })
})
