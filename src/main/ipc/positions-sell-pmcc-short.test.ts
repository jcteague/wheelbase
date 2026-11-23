// [US-115] positions:sell-pmcc-short — the real service and handleIpcCall behind the registered
// handler: the envelope the renderer sees for a sale, a domain rejection, a Zod failure and a
// storage failure, and the Eastern-day clock the handler hands the service.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { ipcMain } from 'electron'
import type { SellPmccShortPayload } from '../schemas'
import { makeTestDb } from '../test-utils'
import { seedPmccPosition } from '../services/test-pmcc-seed'
import { xyzBackgroundWithoutCycle9 } from '../services/test-fixtures/pmcc-legs'
import { registerPositionsHandlers } from './positions'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const CHANNEL = 'positions:sell-pmcc-short'

/** Mid-session on 2027-07-23 in New York (15:30 EDT). */
const DURING_SESSION = '2027-07-23T19:30:00.000Z'
/** 23:30 EDT on 2027-07-23: already 2027-07-24 in UTC, still 2027-07-23 in New York. */
const LATE_EVENING_ET = '2027-07-24T03:30:00.000Z'

// ── Background ──────────────────────────────────────────────────────────────────
// US-109's XYZ with cycle 9 removed (data-model.md § 5): LEAPS $85 · 2028-01-21, 1 contract;
// cycle 8 expired 2027-07-16, no short open.

function seedBackground(db: Database.Database): string {
  return seedPmccPosition(
    db,
    { ticker: 'XYZ', closedDate: null, legs: xyzBackgroundWithoutCycle9('seed') },
    new Date('2027-07-22T20:00:00.000Z')
  ).positionId
}

/** AC 1: the $118 · 2027-08-20 call sold at $1.95, 1 contract, no fees, filled 2027-07-23. */
function sellNext(positionId: string): SellPmccShortPayload {
  return {
    positionId,
    strike: 118,
    expiration: '2027-08-20',
    contracts: 1,
    fillPrice: 1.95,
    fillDate: '2027-07-23',
    fees: 0
  }
}

/** Registers the real handlers with the given clock and returns the channel's handler. */
function sellPmccShortChannel(
  db: Database.Database,
  currentInstant: string
): (payload: unknown) => Promise<unknown> {
  registerPositionsHandlers(db, { getCurrentDate: () => new Date(currentInstant) })
  const registration = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === CHANNEL)
  if (registration === undefined) throw new Error(`${CHANNEL} is not registered`)
  const [, listener] = registration
  return async (payload) => listener(null as never, payload)
}

let db: Database.Database

beforeEach(() => {
  // The system clock sits on 2027-07-24 in New York, so only the injected clock can make the
  // 2027-07-24 fill a future date.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2027-07-24T16:00:00.000Z'))
  db = makeTestDb()
})

afterEach(() => {
  db.close()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('positions:sell-pmcc-short (US-115)', () => {
  it('registers the positions:sell-pmcc-short channel', () => {
    registerPositionsHandlers(db)

    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith(CHANNEL, expect.any(Function))
  })

  it('returns the ok envelope carrying cycle 9 for the next short call', async () => {
    const positionId = seedBackground(db)
    const sell = sellPmccShortChannel(db, DURING_SESSION)

    await expect(sell(sellNext(positionId))).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        position: { id: positionId, ticker: 'XYZ', phase: 'PMCC_OPEN', status: 'ACTIVE' },
        cycleNumber: 9
      })
    )
  })

  it('rejects a 2027-07-24 fill as cannot_be_future when the injected clock is 2027-07-24T03:30:00Z (still 2027-07-23 in New York)', async () => {
    const positionId = seedBackground(db)
    const sell = sellPmccShortChannel(db, LATE_EVENING_ET)

    await expect(sell({ ...sellNext(positionId), fillDate: '2027-07-24' })).resolves.toEqual({
      ok: false,
      errors: [
        {
          field: 'fillDate',
          code: 'cannot_be_future',
          message: 'Fill date cannot be in the future.'
        }
      ]
    })
  })

  it('returns the short_not_before_long field envelope for a short expiring with the LEAPS', async () => {
    const positionId = seedBackground(db)
    const sell = sellPmccShortChannel(db, DURING_SESSION)

    await expect(sell({ ...sellNext(positionId), expiration: '2028-01-21' })).resolves.toEqual({
      ok: false,
      errors: [
        {
          field: 'expiration',
          code: 'short_not_before_long',
          message: 'Short call must expire before the LEAPS call.'
        }
      ]
    })
  })

  it('returns a Zod field error for a strike sent as a string', async () => {
    const positionId = seedBackground(db)
    const sell = sellPmccShortChannel(db, DURING_SESSION)

    await expect(sell({ ...sellNext(positionId), strike: '118' })).resolves.toEqual({
      ok: false,
      errors: [
        {
          field: 'strike',
          code: 'invalid_type',
          message: 'Invalid input: expected number, received string'
        }
      ]
    })
  })

  it('returns internal_error at __root__ when the snapshot insert fails', async () => {
    const positionId = seedBackground(db)
    db.exec(`CREATE TRIGGER fail_snapshot BEFORE INSERT ON cost_basis_snapshots
             BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;`)
    const sell = sellPmccShortChannel(db, DURING_SESSION)

    await expect(sell(sellNext(positionId))).resolves.toEqual({
      ok: false,
      errors: [
        { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
      ]
    })
  })
})
