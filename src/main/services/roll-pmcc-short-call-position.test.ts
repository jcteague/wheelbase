// [US-104] rollPmccShortCallPosition — records a PMCC short-call roll as a linked ROLL_FROM /
// ROLL_TO pair and appends US-103's PMCC_SHORT_ROLL snapshot, all in one transaction.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { parseISO } from 'date-fns'
import { ValidationError } from '../core/lifecycle'
import { localToday } from '../dates'
import { logger } from '../logger'
import type { RollPmccShortCallPayload } from '../schemas'
import { isoDate, makeTestDb } from '../test-utils'
import { getPosition } from './get-position'
import { createPmccPosition, createPosition } from './positions'
import { rollPmccLeapsPosition } from './roll-pmcc-leaps-position'
import { rollPmccShortCallPosition } from './roll-pmcc-short-call-position'
import { pmccFixtures, pmccOpenPayload, recordPmccLegEvent } from './test-fixtures/pmcc-legs'

// ── Background ──────────────────────────────────────────────────────────────────
// The AC's XYZ PMCC: LEAPS $80 (+368d), first short $110 expired, second short $108 (+67d)
// sold at $1.80 — basis $21.20 / share before the roll.

/** OPEN → EXPIRE_1, and (unless `withShort` is false) → SHORT_2. Returns the position id. */
function seedBackground(db: Database.Database, { withShort = true } = {}): string {
  const { position } = createPmccPosition(db, pmccOpenPayload(isoDate))
  const F = pmccFixtures(position.id, isoDate)
  recordPmccLegEvent(db, position.id, F.EXPIRE_1, 'PMCC_SHORT_EXPIRED')
  if (withShort) recordPmccLegEvent(db, position.id, F.SHORT_2, 'PMCC_SHORT_OPEN')
  return position.id
}

function upAndOut(positionId: string): RollPmccShortCallPayload {
  return {
    positionId,
    costToClosePerContract: 3.0,
    newPremiumPerContract: 2.4,
    newStrike: 112,
    newExpiration: isoDate(95),
    fillDate: isoDate(63)
  }
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
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── Happy path ──────────────────────────────────────────────────────────────────

describe('rollPmccShortCallPosition — roll up & out (US-104)', () => {
  it('returns a ROLL_FROM buy-to-close of the open $108 short at the cost to close', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { rollFromLeg } = rollPmccShortCallPosition(db, positionId, upAndOut(positionId))

    expect(rollFromLeg).toMatchObject({
      positionId,
      legRole: 'ROLL_FROM',
      action: 'BUY',
      instrumentType: 'CALL',
      strike: '108.0000',
      expiration: isoDate(67),
      contracts: 1,
      premiumPerContract: '3.0000',
      fillPrice: '3.0000',
      fillDate: isoDate(63),
      fees: '0.0000'
    })
  })

  it('returns a ROLL_TO sell-to-open of the $112 replacement at the new premium', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { rollToLeg } = rollPmccShortCallPosition(db, positionId, upAndOut(positionId))

    expect(rollToLeg).toMatchObject({
      positionId,
      legRole: 'ROLL_TO',
      action: 'SELL',
      instrumentType: 'CALL',
      strike: '112.0000',
      expiration: isoDate(95),
      contracts: 1,
      premiumPerContract: '2.4000',
      fillPrice: '2.4000',
      fillDate: isoDate(63),
      fees: '0.0000'
    })
  })

  it('links both legs by one non-null roll chain id', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const result = rollPmccShortCallPosition(db, positionId, upAndOut(positionId))

    expect(result.rollChainId).toEqual(expect.any(String))
    expect(result.rollFromLeg.rollChainId).toBe(result.rollChainId)
    expect(result.rollToLeg.rollChainId).toBe(result.rollChainId)
  })

  it('returns the PMCC_SHORT_ROLL snapshot at $21.80 basis and $320 premium collected', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { costBasisSnapshot } = rollPmccShortCallPosition(db, positionId, upAndOut(positionId))

    expect(costBasisSnapshot).toMatchObject({
      positionId,
      triggerEvent: 'PMCC_SHORT_ROLL',
      basisPerShare: '21.8000',
      totalPremiumCollected: '320.0000',
      finalPnl: null
    })
  })

  it('returns the recomputed ledger — basis $2,180.00, effective share cost $101.80', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { ledger } = rollPmccShortCallPosition(db, positionId, upAndOut(positionId))

    expect(ledger.basisTotal).toBe('2180.0000')
    expect(ledger.effectiveShareCost).toBe('101.8000')
  })

  it('numbers the first short-call roll 1 and keeps the position PMCC_OPEN / ACTIVE', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const result = rollPmccShortCallPosition(db, positionId, upAndOut(positionId))

    expect(result.shortCallRollNumber).toBe(1)
    expect(result.position).toEqual({
      id: positionId,
      ticker: 'XYZ',
      phase: 'PMCC_OPEN',
      status: 'ACTIVE'
    })
  })
})

// ── DB state ────────────────────────────────────────────────────────────────────

describe('rollPmccShortCallPosition — what it writes (US-104)', () => {
  it('adds exactly two legs and one snapshot', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)

    rollPmccShortCallPosition(db, positionId, upAndOut(positionId))

    expect(counts(db, positionId)).toEqual({
      legs: before.legs + 2,
      snapshots: before.snapshots + 1
    })
  })

  it('stores the newest snapshot row exactly as returned', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { costBasisSnapshot } = rollPmccShortCallPosition(db, positionId, upAndOut(positionId))

    const row = db
      .prepare(
        `SELECT id, basis_per_share, total_premium_collected, trigger_event, snapshot_at
         FROM cost_basis_snapshots WHERE position_id = ?
         ORDER BY snapshot_at DESC, created_at DESC LIMIT 1`
      )
      .get(positionId)
    expect(row).toEqual({
      id: costBasisSnapshot.id,
      basis_per_share: '21.8000',
      total_premium_collected: '320.0000',
      trigger_event: 'PMCC_SHORT_ROLL',
      snapshot_at: costBasisSnapshot.snapshotAt
    })
  })

  it('leaves the positions row untouched', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const readRow = (): unknown =>
      db.prepare('SELECT phase, status, updated_at FROM positions WHERE id = ?').get(positionId)
    const before = readRow()

    rollPmccShortCallPosition(db, positionId, upAndOut(positionId))

    expect(readRow()).toEqual(before)
  })

  it('makes the $112 replacement the open short call getPosition reports', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    rollPmccShortCallPosition(db, positionId, upAndOut(positionId))

    const short = getPosition(db, positionId)?.pmccOpenLegs?.short
    expect(short?.strike).toBe('112.0000')
    expect(short?.expiration).toBe(isoDate(95))
  })
})

// ── Variants ────────────────────────────────────────────────────────────────────

describe('rollPmccShortCallPosition — variants (US-104)', () => {
  it('a credit roll out with the strike omitted keeps $108 and lowers basis to $20.00', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const result = rollPmccShortCallPosition(db, positionId, {
      positionId,
      costToClosePerContract: 1.1,
      newPremiumPerContract: 2.3,
      newExpiration: isoDate(95),
      fillDate: isoDate(63)
    })

    expect(result.rollToLeg.strike).toBe('108.0000')
    expect(result.costBasisSnapshot.basisPerShare).toBe('20.0000')
  })

  it('numbers a second roll on the same position 2, in its own chain', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const first = rollPmccShortCallPosition(db, positionId, upAndOut(positionId))

    const second = rollPmccShortCallPosition(db, positionId, {
      positionId,
      costToClosePerContract: 2.0,
      newPremiumPerContract: 2.5,
      newStrike: 115,
      newExpiration: isoDate(130),
      fillDate: isoDate(80)
    })

    expect(second.shortCallRollNumber).toBe(2)
    expect(second.rollFromLeg.strike).toBe('112.0000')
    expect(second.rollChainId).not.toBe(first.rollChainId)
    const chainIds = db
      .prepare(
        'SELECT DISTINCT roll_chain_id AS id FROM legs WHERE position_id = ? AND roll_chain_id IS NOT NULL'
      )
      .all(positionId)
    expect(chainIds).toHaveLength(2)
  })

  it('defaults both legs to today when fillDate is omitted', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    // SHORT_2 fills on day 35, so "today" must be at least that late for the default to pass.
    const rollDay = isoDate(63)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(parseISO(`${rollDay}T12:00:00`))

    const result = rollPmccShortCallPosition(db, positionId, {
      ...upAndOut(positionId),
      fillDate: undefined
    })

    expect(localToday()).toBe(rollDay)
    expect(result.rollFromLeg.fillDate).toBe(rollDay)
    expect(result.rollToLeg.fillDate).toBe(rollDay)
  })
})

// ── Rejections ──────────────────────────────────────────────────────────────────

describe('rollPmccShortCallPosition — rejections write nothing (US-104)', () => {
  it('rejects a PMCC with no open short call with the engine rule', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db, { withShort: false })
    const before = counts(db, positionId)

    const err = captureValidationError(() =>
      rollPmccShortCallPosition(db, positionId, upAndOut(positionId))
    )

    expect(err).toMatchObject({
      field: '__root__',
      code: 'no_open_short_call',
      message: 'This PMCC has no open short call to roll.'
    })
    expect(counts(db, positionId)).toEqual(before)
  })

  it('rejects a fill date before the open short call was filled', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)

    const err = captureValidationError(() =>
      rollPmccShortCallPosition(db, positionId, { ...upAndOut(positionId), fillDate: isoDate(34) })
    )

    expect(err).toMatchObject({
      field: 'fillDate',
      code: 'close_date_before_open',
      message: 'Fill date cannot be before the short call open date'
    })
    expect(counts(db, positionId)).toEqual(before)
    expect(getPosition(db, positionId)?.pmccOpenLegs?.short?.strike).toBe('108.0000')
  })

  it('rejects a replacement expiring on the LEAPS expiration', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)

    const err = captureValidationError(() =>
      rollPmccShortCallPosition(db, positionId, {
        ...upAndOut(positionId),
        newExpiration: isoDate(368)
      })
    )

    expect(err).toMatchObject({ field: 'newExpiration', code: 'short_not_before_long' })
    expect(counts(db, positionId)).toEqual(before)
  })

  it('rejects a fill date after the open short call expired', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)

    const err = captureValidationError(() =>
      rollPmccShortCallPosition(db, positionId, { ...upAndOut(positionId), fillDate: isoDate(68) })
    )

    expect(err).toMatchObject({
      field: 'fillDate',
      code: 'close_date_after_expiration',
      message: 'Fill date cannot be after the short call expiration date'
    })
    expect(counts(db, positionId)).toEqual(before)
    expect(getPosition(db, positionId)?.pmccOpenLegs?.short?.strike).toBe('108.0000')
  })

  it('rejects a replacement expiring on the roll fill date', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)

    // SHORT_2 expires on day 67, so a day-67 fill and a day-67 replacement is the only way
    // the replacement can fail to outlast the fill.
    const err = captureValidationError(() =>
      rollPmccShortCallPosition(db, positionId, {
        ...upAndOut(positionId),
        fillDate: isoDate(67),
        newExpiration: isoDate(67)
      })
    )

    expect(err).toMatchObject({
      field: 'newExpiration',
      code: 'expiration_not_after_fill',
      message: 'Expiration must be after the fill date.'
    })
    expect(counts(db, positionId)).toEqual(before)
    expect(getPosition(db, positionId)?.pmccOpenLegs?.short?.strike).toBe('108.0000')
  })

  it('rejects an unknown position id as not_found', () => {
    const db = makeTestDb()
    const missing = '00000000-0000-4000-8000-000000000000'

    const err = captureValidationError(() =>
      rollPmccShortCallPosition(db, missing, upAndOut(missing))
    )

    expect(err).toMatchObject({ field: '__root__', code: 'not_found' })
  })

  it('rejects a PMCC_OPEN position with no LEAPS leg row as no_active_leg', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    db.prepare('DELETE FROM legs WHERE position_id = ?').run(positionId)

    const err = captureValidationError(() =>
      rollPmccShortCallPosition(db, positionId, upAndOut(positionId))
    )

    expect(err).toMatchObject({
      field: '__root__',
      code: 'no_active_leg',
      message: 'Position has no active leg'
    })
    expect(countRows(db, 'legs', positionId)).toBe(0)
  })

  it('rejects a wheel position id as invalid_phase', () => {
    const db = makeTestDb()
    const { position } = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 2.5,
      fillDate: isoDate(0)
    })
    const before = counts(db, position.id)

    const err = captureValidationError(() =>
      rollPmccShortCallPosition(db, position.id, upAndOut(position.id))
    )

    expect(err).toMatchObject({ field: '__phase__', code: 'invalid_phase' })
    expect(counts(db, position.id)).toEqual(before)
  })
})

// ── Atomicity ───────────────────────────────────────────────────────────────────

describe('rollPmccShortCallPosition — atomicity (US-104)', () => {
  it('rolls back both legs when the snapshot write fails', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)
    db.exec(`CREATE TRIGGER fail_snapshot BEFORE INSERT ON cost_basis_snapshots
             BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;`)

    expect(() => rollPmccShortCallPosition(db, positionId, upAndOut(positionId))).toThrow(
      'simulated storage failure'
    )

    expect(counts(db, positionId)).toEqual(before)
    const orphans = db
      .prepare(`SELECT COUNT(*) AS n FROM legs WHERE position_id = ? AND leg_role = 'ROLL_FROM'`)
      .get(positionId)
    expect(orphans).toEqual({ n: 0 })
  })
})

// [US-102] Coverage follows the live LEAPS after it rolls, rather than entry context.
describe('rollPmccShortCallPosition — live expiration coverage (US-102)', () => {
  it.each([494, 520])(
    'rejects replacement day %i against the rolled LEAPS without changing persisted state',
    (day) => {
      const db = makeTestDb()
      const positionId = seedBackground(db)
      rollPmccLeapsPosition(db, positionId, {
        positionId,
        proceedsPerContract: 26,
        replacementDebitPerContract: 23.5,
        newExpiration: isoDate(494),
        fillDate: isoDate(50)
      })
      const readState = (): unknown => ({
        position: db.prepare('SELECT * FROM positions WHERE id = ?').get(positionId),
        legs: db.prepare('SELECT * FROM legs WHERE position_id = ? ORDER BY id').all(positionId),
        snapshots: db
          .prepare('SELECT * FROM cost_basis_snapshots WHERE position_id = ? ORDER BY id')
          .all(positionId),
        openLegs: getPosition(db, positionId)?.pmccOpenLegs
      })
      const before = readState()

      const err = captureValidationError(() =>
        rollPmccShortCallPosition(db, positionId, {
          ...upAndOut(positionId),
          newExpiration: isoDate(day)
        })
      )

      expect(err).toMatchObject({
        field: 'newExpiration',
        code: 'short_not_before_long',
        message: 'Short call must expire before the LEAPS call.'
      })
      expect(readState()).toEqual(before)
      db.close()
    }
  )

  it('accepts a short after the original LEAPS expiration when the rolled LEAPS covers it', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const leapsRoll = rollPmccLeapsPosition(db, positionId, {
      positionId,
      proceedsPerContract: 26,
      replacementDebitPerContract: 23.5,
      newExpiration: isoDate(494),
      fillDate: isoDate(50)
    })

    const result = rollPmccShortCallPosition(db, positionId, {
      ...upAndOut(positionId),
      newExpiration: isoDate(400)
    })

    expect(result.rollFromLeg.rollChainId).toBe(result.rollToLeg.rollChainId)
    expect(result.rollToLeg.expiration).toBe(isoDate(400))
    expect(getPosition(db, positionId)?.pmccOpenLegs).toMatchObject({
      long: { id: leapsRoll.rollToLeg.id, expiration: isoDate(494) },
      short: { id: result.rollToLeg.id, expiration: isoDate(400) }
    })
    db.close()
  })
})

// ── Logging ─────────────────────────────────────────────────────────────────────

describe('rollPmccShortCallPosition — logging (US-104)', () => {
  it('logs pmcc_short_call_rolled at INFO with the chain, net and basis', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const infoSpy = vi.spyOn(logger, 'info')

    const result = rollPmccShortCallPosition(db, positionId, upAndOut(positionId))

    expect(infoSpy).toHaveBeenCalledWith(
      {
        positionId,
        rollChainId: result.rollChainId,
        netCreditPerShare: '-0.6000',
        basisPerShare: '21.8000',
        shortCallRollNumber: 1
      },
      'pmcc_short_call_rolled'
    )
  })

  it('logs pmcc_short_roll_rejected at INFO with the field and code', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db, { withShort: false })
    const infoSpy = vi.spyOn(logger, 'info')

    expect(() => rollPmccShortCallPosition(db, positionId, upAndOut(positionId))).toThrow(
      ValidationError
    )

    expect(infoSpy).toHaveBeenCalledWith(
      { positionId, field: '__root__', code: 'no_open_short_call' },
      'pmcc_short_roll_rejected'
    )
  })
})
