// [US-115] sellPmccShortPosition — records the next short call against a PMCC's open LEAPS: one
// SHORT_CALL_OPEN sell leg and one PMCC_SHORT_OPEN snapshot in one transaction, phase unchanged.

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { ValidationError } from '../core/lifecycle'
import { logger } from '../logger'
import type { LegRecord, SellPmccShortPayload } from '../schemas'
import { makeTestDb } from '../test-utils'
import { getPosition } from './get-position'
import { createPosition } from './positions'
import { sellPmccShortPosition } from './sell-pmcc-short-position'
import type { CallLegFields } from './test-leg-rows'
import { seedPmccPosition } from './test-pmcc-seed'
import { xyzBackgroundWithoutCycle9 } from './test-fixtures/pmcc-legs'

// ── Background ──────────────────────────────────────────────────────────────────
// US-109's XYZ with cycle 9 removed (data-model.md § 5): LEAPS $85 · 2028-01-21, 1 contract,
// basis $8.50 / share; cycle 8 expired 2027-07-16, no short open. Valued 2027-07-23.

const TODAY = '2027-07-23'
const SEEDED_AT = new Date('2027-07-22T20:00:00.000Z')
const NOW = '2027-07-23T15:30:00.000Z'

function seedLeg(leg: LegRecord): CallLegFields {
  return {
    legRole: leg.legRole,
    action: leg.action,
    strike: leg.strike,
    expiration: leg.expiration,
    contracts: leg.contracts,
    premiumPerContract: leg.premiumPerContract,
    fillDate: leg.fillDate,
    fees: leg.fees,
    rollChainId: leg.rollChainId
  }
}

/** Cycle 9 of the full Background, still open: $118 · 2027-08-20 sold 2027-07-23 at $1.95. */
const CYCLE_9_SELL: CallLegFields = {
  legRole: 'SHORT_CALL_OPEN',
  action: 'SELL',
  strike: '118.0000',
  expiration: '2027-08-20',
  contracts: 1,
  premiumPerContract: '1.9500',
  fillDate: '2027-07-23',
  fees: '0.0000',
  rollChainId: null
}

/** A second LEAPS roll on 2027-07-19: the $85 · 2028-01-21 sold, $85 · 2028-06-16 bought. */
const LEAPS_ROLL_TO_JUNE: CallLegFields[] = [
  {
    legRole: 'ROLL_FROM',
    action: 'SELL',
    strike: '85.0000',
    expiration: '2028-01-21',
    contracts: 1,
    premiumPerContract: '24.0000',
    fillDate: '2027-07-19',
    fees: '0.0000',
    rollChainId: 'rc-l2'
  },
  {
    legRole: 'ROLL_TO',
    action: 'BUY',
    strike: '85.0000',
    expiration: '2028-06-16',
    contracts: 1,
    premiumPerContract: '26.0000',
    fillDate: '2027-07-19',
    fees: '0.0000',
    rollChainId: 'rc-l2'
  }
]

/** The Background (cycle 9 removed) plus `extra` legs. Returns the position id. */
function seedBackground(db: Database.Database, extra: CallLegFields[] = []): string {
  const legs = [...xyzBackgroundWithoutCycle9('seed').map(seedLeg), ...extra]
  return seedPmccPosition(db, { ticker: 'XYZ', closedDate: null, legs }, SEEDED_AT).positionId
}

/** AC 1: the $118 · 2027-08-20 call sold at $1.95, 1 contract, no fees, filled 2027-07-23. */
function sellNext(positionId: string): SellPmccShortPayload {
  return {
    positionId,
    strike: 118,
    expiration: '2027-08-20',
    contracts: 1,
    fillPrice: 1.95,
    fillDate: TODAY,
    fees: 0
  }
}

function sell(
  db: Database.Database,
  positionId: string,
  payload: SellPmccShortPayload = sellNext(positionId)
): ReturnType<typeof sellPmccShortPosition> {
  return sellPmccShortPosition(db, positionId, payload, { today: TODAY, now: NOW })
}

function countRows(db: Database.Database, table: string, positionId: string): number {
  return (
    db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE position_id = ?`).get(positionId) as {
      n: number
    }
  ).n
}

interface Counts {
  legs: number
  snapshots: number
}

function counts(db: Database.Database, positionId: string): Counts {
  return {
    legs: countRows(db, 'legs', positionId),
    snapshots: countRows(db, 'cost_basis_snapshots', positionId)
  }
}

function captureValidationError(fn: () => unknown): ValidationError {
  try {
    fn()
  } catch (err) {
    if (err instanceof ValidationError) return err
    throw err
  }
  throw new Error('expected a ValidationError')
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Happy path ──────────────────────────────────────────────────────────────────

describe('sellPmccShortPosition — sell the next short call (US-115)', () => {
  it('returns cycle 9 and the ledger after the sale — $6.55 basis, $91.55, 70.8889%', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const result = sell(db, positionId)

    expect(result.cycleNumber).toBe(9)
    expect(result.ledger).toMatchObject({
      basisPerShare: '6.5500',
      effectiveShareCost: '91.5500',
      premiumRecoveredPercent: '70.8889'
    })
  })

  it('keeps the position PMCC_OPEN / ACTIVE in the result', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { position } = sell(db, positionId)

    expect(position).toEqual({
      id: positionId,
      ticker: 'XYZ',
      phase: 'PMCC_OPEN',
      status: 'ACTIVE'
    })
  })

  it('returns one SHORT_CALL_OPEN sell leg at the sale price, stamped with now', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { shortLeg } = sell(db, positionId)

    expect(shortLeg).toEqual({
      id: expect.any(String),
      positionId,
      legRole: 'SHORT_CALL_OPEN',
      action: 'SELL',
      instrumentType: 'CALL',
      strike: '118.0000',
      expiration: '2027-08-20',
      contracts: 1,
      premiumPerContract: '1.9500',
      fillPrice: '1.9500',
      fillDate: '2027-07-23',
      rollChainId: null,
      fees: '0.0000',
      createdAt: NOW,
      updatedAt: NOW
    })
  })

  it('stores exactly the returned leg row', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { shortLeg } = sell(db, positionId)

    const row = db
      .prepare(
        `SELECT leg_role, action, instrument_type, strike, expiration, contracts,
                premium_per_contract, fill_price, fees, fill_date, roll_chain_id
         FROM legs WHERE id = ?`
      )
      .get(shortLeg.id)
    expect(row).toEqual({
      leg_role: 'SHORT_CALL_OPEN',
      action: 'SELL',
      instrument_type: 'CALL',
      strike: '118.0000',
      expiration: '2027-08-20',
      contracts: 1,
      premium_per_contract: '1.9500',
      fill_price: '1.9500',
      fees: '0.0000',
      fill_date: '2027-07-23',
      roll_chain_id: null
    })
  })

  it('writes one PMCC_SHORT_OPEN snapshot on the fill date at $6.55 basis', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { snapshot } = sell(db, positionId)

    const rows = db
      .prepare(
        `SELECT id, trigger_event, date(snapshot_at) AS event_date, basis_per_share,
                total_premium_collected, final_pnl
         FROM cost_basis_snapshots WHERE position_id = ?`
      )
      .all(positionId)
    expect(rows).toEqual([
      {
        id: snapshot.id,
        trigger_event: 'PMCC_SHORT_OPEN',
        event_date: '2027-07-23',
        basis_per_share: '6.5500',
        total_premium_collected: '1595.0000',
        final_pnl: null
      }
    ])
  })

  it('adds exactly one leg and one snapshot', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)

    sell(db, positionId)

    expect(counts(db, positionId)).toEqual({
      legs: before.legs + 1,
      snapshots: before.snapshots + 1
    })
  })

  it('leaves the positions row untouched', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const readRow = (): unknown =>
      db.prepare('SELECT * FROM positions WHERE id = ?').get(positionId)
    const before = readRow()

    sell(db, positionId)

    expect(readRow()).toEqual(before)
  })

  it('defaults the fill date to today when fillDate is omitted', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { shortLeg, snapshot } = sell(db, positionId, {
      ...sellNext(positionId),
      fillDate: undefined
    })

    expect(shortLeg.fillDate).toBe('2027-07-23')
    expect(snapshot.snapshotAt.startsWith('2027-07-23T')).toBe(true)
  })

  it('makes the new leg the open short call getPosition reports', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { shortLeg } = sell(db, positionId)

    expect(getPosition(db, positionId)?.pmccOpenLegs?.short).toMatchObject({
      id: shortLeg.id,
      legRole: 'SHORT_CALL_OPEN',
      strike: '118.0000',
      expiration: '2027-08-20'
    })
  })
})

// ── Live LEAPS ──────────────────────────────────────────────────────────────────

describe('sellPmccShortPosition — coverage follows the live LEAPS (US-115)', () => {
  it('rejects a short expiring on the rolled LEAPS expiration 2028-06-16', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db, LEAPS_ROLL_TO_JUNE)
    const before = counts(db, positionId)

    const err = captureValidationError(() =>
      sell(db, positionId, { ...sellNext(positionId), expiration: '2028-06-16' })
    )

    expect(err).toMatchObject({
      field: 'expiration',
      code: 'short_not_before_long',
      message: 'Short call must expire before the LEAPS call.'
    })
    expect(counts(db, positionId)).toEqual(before)
  })

  it('accepts a short on the pre-roll LEAPS expiration 2028-01-21 once the LEAPS is rolled', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db, LEAPS_ROLL_TO_JUNE)

    const { shortLeg } = sell(db, positionId, { ...sellNext(positionId), expiration: '2028-01-21' })

    expect(shortLeg.expiration).toBe('2028-01-21')
    expect(getPosition(db, positionId)?.pmccOpenLegs).toMatchObject({
      long: { legRole: 'ROLL_TO', expiration: '2028-06-16' },
      short: { id: shortLeg.id, expiration: '2028-01-21' }
    })
  })
})

// ── Rejections ──────────────────────────────────────────────────────────────────

describe('sellPmccShortPosition — rejections write nothing (US-115)', () => {
  it('rejects a sale while cycle 9 is still open as short_call_already_open', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db, [CYCLE_9_SELL])
    const before = counts(db, positionId)

    const err = captureValidationError(() => sell(db, positionId))

    expect(err).toMatchObject({
      field: '__root__',
      code: 'short_call_already_open',
      message: 'This PMCC already has an open short call — roll it instead.'
    })
    expect(counts(db, positionId)).toEqual(before)
  })

  it.each<{
    name: string
    change: Partial<SellPmccShortPayload>
    field: string
    code: string
    message: string
  }>([
    {
      name: 'more contracts than the LEAPS holds',
      change: { contracts: 2 },
      field: 'contracts',
      code: 'exceeds_leaps_contracts',
      message: 'Cannot sell more short calls than LEAPS contracts held (1).'
    },
    {
      name: 'a fill before cycle 8 expired',
      change: { fillDate: '2027-07-15' },
      field: 'fillDate',
      code: 'before_previous_short',
      message: 'Fill date cannot be before the previous short call was retired (2027-07-16).'
    },
    {
      name: 'an expiration on the LEAPS expiration',
      change: { expiration: '2028-01-21' },
      field: 'expiration',
      code: 'short_not_before_long',
      message: 'Short call must expire before the LEAPS call.'
    },
    {
      name: 'a strike at the LEAPS strike',
      change: { strike: 85 },
      field: 'strike',
      code: 'strike_not_above_long',
      message: 'Short-call strike must be above the LEAPS strike.'
    }
  ])('rejects $name with $code', ({ change, field, code, message }) => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)

    const err = captureValidationError(() =>
      sell(db, positionId, { ...sellNext(positionId), ...change })
    )

    expect(err).toMatchObject({ field, code, message })
    expect(counts(db, positionId)).toEqual(before)
  })

  it('rejects an unknown position id as not_found', () => {
    const db = makeTestDb()
    const missing = '00000000-0000-4000-8000-000000000000'

    const err = captureValidationError(() => sell(db, missing))

    expect(err).toMatchObject({
      field: '__root__',
      code: 'not_found',
      message: 'Position not found'
    })
  })

  it('rejects a wheel position id as invalid_phase', () => {
    // `createPosition` judges its dates by the system clock: pin it to the sale day.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(NOW))
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const db = makeTestDb()
    const { position } = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: '2027-08-20',
      contracts: 1,
      premiumPerContract: 2.5,
      fillDate: TODAY
    })
    const before = counts(db, position.id)

    const err = captureValidationError(() => sell(db, position.id))

    expect(err).toMatchObject({
      field: '__phase__',
      code: 'invalid_phase',
      message: 'Position is not in PMCC_OPEN phase'
    })
    expect(counts(db, position.id)).toEqual(before)
  })
})

// ── Atomicity ───────────────────────────────────────────────────────────────────

describe('sellPmccShortPosition — atomicity (US-115)', () => {
  it('rolls back the leg when the snapshot write fails', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)
    db.exec(`CREATE TRIGGER fail_snapshot BEFORE INSERT ON cost_basis_snapshots
             BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;`)

    expect(() => sell(db, positionId)).toThrow('simulated storage failure')

    expect(counts(db, positionId)).toEqual(before)
    expect(getPosition(db, positionId)?.pmccOpenLegs?.short).toBeNull()
  })
})

// ── Logging ─────────────────────────────────────────────────────────────────────

describe('sellPmccShortPosition — logging (US-115)', () => {
  it('logs pmcc_short_call_sold at INFO with the cycle, contracts and basis', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const infoSpy = vi.spyOn(logger, 'info')

    sell(db, positionId)

    expect(infoSpy).toHaveBeenCalledWith(
      { positionId, cycleNumber: 9, contracts: 1, basisPerShare: '6.5500' },
      'pmcc_short_call_sold'
    )
  })

  it('logs pmcc_sell_short_rejected at INFO with the field and code', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db, [CYCLE_9_SELL])
    const infoSpy = vi.spyOn(logger, 'info')

    expect(() => sell(db, positionId)).toThrow(ValidationError)

    expect(infoSpy).toHaveBeenCalledWith(
      { positionId, field: '__root__', code: 'short_call_already_open' },
      'pmcc_sell_short_rejected'
    )
  })
})
