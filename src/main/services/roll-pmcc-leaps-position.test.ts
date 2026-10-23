// [US-105] rollPmccLeapsPosition — records a PMCC LEAPS roll as a linked ROLL_FROM (SELL) /
// ROLL_TO (BUY) pair and appends US-103's PMCC_LEAPS_ROLL snapshot, all in one transaction.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { format, parseISO } from 'date-fns'
import { ValidationError } from '../core/lifecycle'
import { localToday } from '../dates'
import { logger } from '../logger'
import type { RollPmccLeapsPayload } from '../schemas'
import { isoDate, makeTestDb } from '../test-utils'
import { getPosition } from './get-position'
import { createPmccPosition, createPosition } from './positions'
import { rollPmccLeapsPosition } from './roll-pmcc-leaps-position'
import { rollPmccShortCallPosition } from './roll-pmcc-short-call-position'
import { pmccFixtures, pmccOpenPayload, recordPmccLegEvent } from './test-fixtures/pmcc-legs'

// ── Background ──────────────────────────────────────────────────────────────────
// The AC's XYZ PMCC: LEAPS $80 (+368d) bought at $25.00, first short $110 expired, second short
// $108 sold at $1.80, rolled up & out to $112 (+95d) — basis $21.80 / share before the LEAPS roll.

/** OPEN → EXPIRE_1 → SHORT_2 → SHORT_ROLL (→ EXPIRE_2 when `withShort` is false). */
function seedBackground(db: Database.Database, { withShort = true } = {}): string {
  const { position } = createPmccPosition(db, pmccOpenPayload(isoDate))
  const F = pmccFixtures(position.id, isoDate)
  recordPmccLegEvent(db, position.id, F.EXPIRE_1, 'PMCC_SHORT_EXPIRED')
  recordPmccLegEvent(db, position.id, F.SHORT_2, 'PMCC_SHORT_OPEN')
  recordPmccLegEvent(db, position.id, F.SHORT_ROLL, 'PMCC_SHORT_ROLL')
  if (!withShort) recordPmccLegEvent(db, position.id, F.EXPIRE_2, 'PMCC_SHORT_EXPIRED')
  return position.id
}

function upAndOut(positionId: string): RollPmccLeapsPayload {
  return {
    positionId,
    proceedsPerContract: 26.0,
    replacementDebitPerContract: 23.5,
    newStrike: 85,
    newExpiration: isoDate(494),
    fillDate: isoDate(84)
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

describe('rollPmccLeapsPosition — roll up & out (US-105)', () => {
  it('returns a ROLL_FROM sell-to-close of the open $80 LEAPS at the proceeds', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { rollFromLeg } = rollPmccLeapsPosition(db, positionId, upAndOut(positionId))

    expect(rollFromLeg).toMatchObject({
      positionId,
      legRole: 'ROLL_FROM',
      action: 'SELL',
      instrumentType: 'CALL',
      strike: '80.0000',
      expiration: isoDate(368),
      contracts: 1,
      premiumPerContract: '26.0000',
      fillPrice: '26.0000',
      fillDate: isoDate(84),
      fees: '0.0000'
    })
  })

  it('returns a ROLL_TO buy-to-open of the $85 replacement at the debit', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { rollToLeg } = rollPmccLeapsPosition(db, positionId, upAndOut(positionId))

    expect(rollToLeg).toMatchObject({
      positionId,
      legRole: 'ROLL_TO',
      action: 'BUY',
      instrumentType: 'CALL',
      strike: '85.0000',
      expiration: isoDate(494),
      contracts: 1,
      premiumPerContract: '23.5000',
      fillPrice: '23.5000',
      fillDate: isoDate(84),
      fees: '0.0000'
    })
  })

  it('links both legs by one non-null roll chain id', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const result = rollPmccLeapsPosition(db, positionId, upAndOut(positionId))

    expect(result.rollChainId).toEqual(expect.any(String))
    expect(result.rollFromLeg.rollChainId).toBe(result.rollChainId)
    expect(result.rollToLeg.rollChainId).toBe(result.rollChainId)
  })

  it('returns the PMCC_LEAPS_ROLL snapshot at $19.30 basis and $320 premium collected', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { costBasisSnapshot } = rollPmccLeapsPosition(db, positionId, upAndOut(positionId))

    expect(costBasisSnapshot).toMatchObject({
      positionId,
      triggerEvent: 'PMCC_LEAPS_ROLL',
      basisPerShare: '19.3000',
      totalPremiumCollected: '320.0000',
      finalPnl: null
    })
  })

  it('returns the re-anchored ledger — basis $1,930.00, LEAPS cost $22.50, effective $104.30', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { ledger } = rollPmccLeapsPosition(db, positionId, upAndOut(positionId))

    expect(ledger.basisTotal).toBe('1930.0000')
    expect(ledger.leapsCostPerShare).toBe('22.5000')
    expect(ledger.effectiveShareCost).toBe('104.3000')
  })

  it('numbers the first LEAPS roll 1 — the short-side chain does not count', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const result = rollPmccLeapsPosition(db, positionId, upAndOut(positionId))

    expect(result.leapsRollNumber).toBe(1)
  })

  it('keeps the position PMCC_OPEN / ACTIVE', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const result = rollPmccLeapsPosition(db, positionId, upAndOut(positionId))

    expect(result.position).toEqual({
      id: positionId,
      ticker: 'XYZ',
      phase: 'PMCC_OPEN',
      status: 'ACTIVE'
    })
  })
})

// ── DB state ────────────────────────────────────────────────────────────────────

describe('rollPmccLeapsPosition — what it writes (US-105)', () => {
  it('adds exactly two legs and one snapshot', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)

    rollPmccLeapsPosition(db, positionId, upAndOut(positionId))

    expect(counts(db, positionId)).toEqual({
      legs: before.legs + 2,
      snapshots: before.snapshots + 1
    })
  })

  it('stores the newest snapshot row exactly as returned', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { costBasisSnapshot } = rollPmccLeapsPosition(db, positionId, upAndOut(positionId))

    const row = db
      .prepare(
        `SELECT id, basis_per_share, total_premium_collected, trigger_event, snapshot_at
         FROM cost_basis_snapshots WHERE position_id = ?
         ORDER BY snapshot_at DESC, created_at DESC LIMIT 1`
      )
      .get(positionId)
    expect(row).toEqual({
      id: costBasisSnapshot.id,
      basis_per_share: '19.3000',
      total_premium_collected: '320.0000',
      trigger_event: 'PMCC_LEAPS_ROLL',
      snapshot_at: costBasisSnapshot.snapshotAt
    })
  })

  it('leaves the positions row untouched', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const readRow = (): unknown =>
      db.prepare('SELECT phase, status, updated_at FROM positions WHERE id = ?').get(positionId)
    const before = readRow()

    rollPmccLeapsPosition(db, positionId, upAndOut(positionId))

    expect(readRow()).toEqual(before)
  })

  it('makes the $85 replacement the open LEAPS and leaves the $112 short untouched', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const shortBefore = getPosition(db, positionId)?.pmccOpenLegs?.short

    rollPmccLeapsPosition(db, positionId, upAndOut(positionId))

    const openLegs = getPosition(db, positionId)?.pmccOpenLegs
    expect(openLegs?.long.strike).toBe('85.0000')
    expect(openLegs?.long.legRole).toBe('ROLL_TO')
    expect(openLegs?.short?.strike).toBe('112.0000')
    expect(openLegs?.short?.id).toBe(shortBefore?.id)
  })
})

// ── Variants ────────────────────────────────────────────────────────────────────

describe('rollPmccLeapsPosition — variants (US-105)', () => {
  it('a debit roll out with the strike omitted keeps $80 and raises basis to $25.00', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const result = rollPmccLeapsPosition(db, positionId, {
      positionId,
      proceedsPerContract: 26.0,
      replacementDebitPerContract: 29.2,
      newExpiration: isoDate(494),
      fillDate: isoDate(84)
    })

    expect(result.rollToLeg.strike).toBe('80.0000')
    expect(result.costBasisSnapshot.basisPerShare).toBe('25.0000')
    expect(result.ledger.effectiveShareCost).toBe('105.0000')
  })

  it('numbers a second LEAPS roll on the same position 2, in its own chain', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const first = rollPmccLeapsPosition(db, positionId, upAndOut(positionId))

    const second = rollPmccLeapsPosition(db, positionId, {
      positionId,
      proceedsPerContract: 24.0,
      replacementDebitPerContract: 25.0,
      newStrike: 90,
      newExpiration: isoDate(600),
      fillDate: isoDate(90)
    })

    expect(second.leapsRollNumber).toBe(2)
    expect(second.rollFromLeg.strike).toBe('85.0000')
    expect(second.rollFromLeg.expiration).toBe(isoDate(494))
    expect(second.rollChainId).not.toBe(first.rollChainId)
  })

  it('defaults both legs to today when fillDate is omitted', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const rollDay = isoDate(84)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(parseISO(`${rollDay}T12:00:00`))

    const result = rollPmccLeapsPosition(db, positionId, {
      ...upAndOut(positionId),
      fillDate: undefined
    })

    expect(localToday()).toBe(rollDay)
    expect(result.rollFromLeg.fillDate).toBe(rollDay)
    expect(result.rollToLeg.fillDate).toBe(rollDay)
  })

  it('with no short open, accepts a $112 strike expiring on day 97 at $19.30 basis', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db, { withShort: false })

    const result = rollPmccLeapsPosition(db, positionId, {
      ...upAndOut(positionId),
      newStrike: 112,
      newExpiration: isoDate(97),
      fillDate: isoDate(96)
    })

    expect(result.rollToLeg.strike).toBe('112.0000')
    expect(result.rollToLeg.expiration).toBe(isoDate(97))
    expect(result.costBasisSnapshot.basisPerShare).toBe('19.3000')
  })
})

// ── Rejections ──────────────────────────────────────────────────────────────────

describe('rollPmccLeapsPosition — rejections write nothing (US-105)', () => {
  it('rejects a replacement expiring on the open short call expiration', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)

    const err = captureValidationError(() =>
      rollPmccLeapsPosition(db, positionId, {
        ...upAndOut(positionId),
        newExpiration: isoDate(95)
      })
    )

    expect(err).toMatchObject({ field: 'newExpiration', code: 'long_not_after_short' })
    expect(counts(db, positionId)).toEqual(before)
    expect(getPosition(db, positionId)?.pmccOpenLegs?.long.strike).toBe('80.0000')
  })

  it('rejects a replacement strike at the open short call strike', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)

    const err = captureValidationError(() =>
      rollPmccLeapsPosition(db, positionId, { ...upAndOut(positionId), newStrike: 112 })
    )

    expect(err).toMatchObject({ field: 'newStrike', code: 'strike_not_below_short' })
    expect(counts(db, positionId)).toEqual(before)
  })

  it('rejects a fill date before the open LEAPS was filled, leaving it the open LEAPS', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)

    const err = captureValidationError(() =>
      rollPmccLeapsPosition(db, positionId, { ...upAndOut(positionId), fillDate: isoDate(-1) })
    )

    expect(err).toMatchObject({ field: 'fillDate', code: 'before_last_event' })
    expect(counts(db, positionId)).toEqual(before)
    expect(getPosition(db, positionId)?.pmccOpenLegs?.long.strike).toBe('80.0000')
  })

  it('rejects a fill date after the LEAPS fill but before the day-63 short roll, writing nothing', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)

    const err = captureValidationError(() =>
      rollPmccLeapsPosition(db, positionId, { ...upAndOut(positionId), fillDate: isoDate(62) })
    )

    expect(err).toMatchObject({
      field: 'fillDate',
      code: 'before_last_event',
      message: `Fill date cannot be before the last recorded event (${format(parseISO(isoDate(63)), 'MMM d, yyyy')})`
    })
    expect(counts(db, positionId)).toEqual(before)
    expect(getPosition(db, positionId)?.pmccOpenLegs?.long.strike).toBe('80.0000')
  })

  it('accepts a fill date on the day of the last recorded event', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)

    const { rollToLeg } = rollPmccLeapsPosition(db, positionId, {
      ...upAndOut(positionId),
      fillDate: isoDate(63)
    })

    expect(rollToLeg.fillDate).toBe(isoDate(63))
  })

  it('rejects a fill date after the open LEAPS expired', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db, { withShort: false })
    const before = counts(db, positionId)

    const err = captureValidationError(() =>
      rollPmccLeapsPosition(db, positionId, {
        ...upAndOut(positionId),
        newExpiration: isoDate(700),
        fillDate: isoDate(369)
      })
    )

    expect(err).toMatchObject({ field: 'fillDate', code: 'close_date_after_expiration' })
    expect(counts(db, positionId)).toEqual(before)
  })

  it.each([95, 96])(
    'with no short open, rejects a replacement expiring on day %i, on/before the day-96 fill',
    (day) => {
      const db = makeTestDb()
      const positionId = seedBackground(db, { withShort: false })
      const before = counts(db, positionId)

      const err = captureValidationError(() =>
        rollPmccLeapsPosition(db, positionId, {
          ...upAndOut(positionId),
          newExpiration: isoDate(day),
          fillDate: isoDate(96)
        })
      )

      expect(err).toMatchObject({ field: 'newExpiration', code: 'expiration_not_after_fill' })
      expect(counts(db, positionId)).toEqual(before)
    }
  )

  it('rejects an unknown position id as not_found', () => {
    const db = makeTestDb()
    const missing = '00000000-0000-4000-8000-000000000000'

    const err = captureValidationError(() => rollPmccLeapsPosition(db, missing, upAndOut(missing)))

    expect(err).toMatchObject({ field: '__root__', code: 'not_found' })
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
      rollPmccLeapsPosition(db, position.id, upAndOut(position.id))
    )

    expect(err).toMatchObject({ field: '__phase__', code: 'invalid_phase' })
    expect(counts(db, position.id)).toEqual(before)
  })

  it('rejects a PMCC_OPEN position with no LEAPS leg row as no_active_leg', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    db.prepare('DELETE FROM legs WHERE position_id = ?').run(positionId)
    const before = counts(db, positionId)

    const err = captureValidationError(() =>
      rollPmccLeapsPosition(db, positionId, upAndOut(positionId))
    )

    expect(err).toMatchObject({
      field: '__root__',
      code: 'no_active_leg',
      message: 'Position has no active leg'
    })
    expect(counts(db, positionId)).toEqual(before)
  })
})

// ── Atomicity ───────────────────────────────────────────────────────────────────

describe('rollPmccLeapsPosition — atomicity (US-105)', () => {
  it('rolls back both legs when the snapshot write fails', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const before = counts(db, positionId)
    db.exec(`CREATE TRIGGER fail_snapshot BEFORE INSERT ON cost_basis_snapshots
             BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;`)

    expect(() => rollPmccLeapsPosition(db, positionId, upAndOut(positionId))).toThrow(
      'simulated storage failure'
    )

    expect(counts(db, positionId)).toEqual(before)
    const orphans = db
      .prepare(
        `SELECT COUNT(*) AS n FROM legs
         WHERE position_id = ? AND leg_role = 'ROLL_FROM' AND action = 'SELL'`
      )
      .get(positionId)
    expect(orphans).toEqual({ n: 0 })
  })
})

// [US-102] The service must cover the replacement short, including after another roll.
describe('rollPmccLeapsPosition — live expiration coverage (US-102)', () => {
  it.each([130, 110])(
    'rejects replacement day %i against the rolled short without changing persisted state',
    (day) => {
      const db = makeTestDb()
      const positionId = seedBackground(db)
      rollPmccShortCallPosition(db, positionId, {
        positionId,
        costToClosePerContract: 2,
        newPremiumPerContract: 2.5,
        newExpiration: isoDate(130),
        fillDate: isoDate(80)
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
        rollPmccLeapsPosition(db, positionId, {
          ...upAndOut(positionId),
          newExpiration: isoDate(day)
        })
      )

      expect(err).toMatchObject({
        field: 'newExpiration',
        code: 'long_not_after_short',
        message: 'LEAPS call must expire after the short call.'
      })
      expect(readState()).toEqual(before)
      db.close()
    }
  )
})

// ── Logging ─────────────────────────────────────────────────────────────────────

describe('rollPmccLeapsPosition — logging (US-105)', () => {
  it('logs pmcc_leaps_rolled at INFO with the chain, net, basis and effective cost', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const infoSpy = vi.spyOn(logger, 'info')

    const result = rollPmccLeapsPosition(db, positionId, upAndOut(positionId))

    expect(infoSpy).toHaveBeenCalledWith(
      {
        positionId,
        rollChainId: result.rollChainId,
        netCreditPerShare: '2.5000',
        basisPerShare: '19.3000',
        effectiveShareCost: '104.3000',
        leapsRollNumber: 1
      },
      'pmcc_leaps_rolled'
    )
  })

  it('logs pmcc_leaps_roll_rejected at INFO with the field and code', () => {
    const db = makeTestDb()
    const positionId = seedBackground(db)
    const infoSpy = vi.spyOn(logger, 'info')

    expect(() =>
      rollPmccLeapsPosition(db, positionId, { ...upAndOut(positionId), newStrike: 112 })
    ).toThrow(ValidationError)

    expect(infoSpy).toHaveBeenCalledWith(
      { positionId, field: 'newStrike', code: 'strike_not_below_short' },
      'pmcc_leaps_roll_rejected'
    )
  })
})
