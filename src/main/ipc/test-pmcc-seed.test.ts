// [US-109] Dev-only `_test:pmcc-seed-position` seam. Registered only when NODE_ENV === 'test';
// e2e specs use it to insert a PMCC position and its legs exactly as given, including timeline
// states no shipped story can record yet. Contract: plans/us-109/contracts/
// test-pmcc-seed-position.md.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { getPosition } from '../services/get-position'
import { makeTestDb } from '../test-utils'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const CHANNEL = '_test:pmcc-seed-position'
const NOW = '2026-11-11T15:00:00.000Z'

type Handler = (...a: never[]) => unknown

async function handlersFor(db: Database.Database): Promise<Map<string, Handler>> {
  const { ipcMain } = await import('electron')
  const { registerTestPmccSeedIpc } = await import('./test-pmcc-seed')

  registerTestPmccSeedIpc(db)

  return new Map(vi.mocked(ipcMain.handle).mock.calls as Array<[string, Handler]>)
}

async function call(handlers: Map<string, Handler>, payload: unknown): Promise<unknown> {
  const handler = handlers.get(CHANNEL)
  if (handler === undefined) throw new Error(`${CHANNEL} was not registered`)
  return handler(null as never, payload as never)
}

async function seed(db: Database.Database, payload: unknown): Promise<string> {
  const result = await call(await handlersFor(db), payload)
  expect(result).toEqual({ ok: true, positionId: expect.any(String) })
  return (result as { positionId: string }).positionId
}

const LEAPS = {
  legRole: 'LEAPS_OPEN',
  action: 'BUY',
  strike: '80.0000',
  expiration: '2027-09-17',
  contracts: 1,
  premiumPerContract: '25.0000',
  fillDate: '2026-09-14'
}

const SHORT = {
  legRole: 'SHORT_CALL_OPEN',
  action: 'SELL',
  strike: '110.0000',
  expiration: '2026-10-16',
  contracts: 1,
  premiumPerContract: '2.0000',
  fillDate: '2026-09-14'
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('registerTestPmccSeedIpc', () => {
  it('registers exactly one channel, _test:pmcc-seed-position', async () => {
    const handlers = await handlersFor(makeTestDb())

    expect([...handlers.keys()]).toEqual([CHANNEL])
  })

  it('seeds an ACTIVE PMCC_OPEN PMCC with its legs in the given order, one ms apart', async () => {
    const db = makeTestDb()

    const positionId = await seed(db, { ticker: 'XYZ', legs: [LEAPS, SHORT] })

    const detail = getPosition(db, positionId)
    expect(detail?.position).toMatchObject({
      ticker: 'XYZ',
      strategyType: 'PMCC',
      phase: 'PMCC_OPEN',
      status: 'ACTIVE',
      closedDate: null
    })
    expect(
      detail?.legs.map(({ legRole, strike, createdAt }) => ({ legRole, strike, createdAt }))
    ).toEqual([
      { legRole: 'LEAPS_OPEN', strike: '80.0000', createdAt: '2026-11-11T15:00:00.000Z' },
      { legRole: 'SHORT_CALL_OPEN', strike: '110.0000', createdAt: '2026-11-11T15:00:00.001Z' }
    ])
  })

  it('closedDate sets status CLOSED and that closed date', async () => {
    const db = makeTestDb()

    const positionId = await seed(db, {
      ticker: 'XYZ',
      closedDate: '2027-08-20',
      legs: [LEAPS, SHORT]
    })

    expect(getPosition(db, positionId)?.position).toMatchObject({
      status: 'CLOSED',
      closedDate: '2027-08-20'
    })
  })

  it('opens the position on the earliest leg fillDate, not the first leg in the array', async () => {
    const db = makeTestDb()

    const positionId = await seed(db, {
      ticker: 'XYZ',
      legs: [
        { ...SHORT, fillDate: '2026-10-23', expiration: '2026-11-20' },
        { ...LEAPS, fillDate: '2026-09-14' }
      ]
    })

    expect(getPosition(db, positionId)?.position.openedDate).toBe('2026-09-14')
  })

  it('accepts a LEAPS filled after today and a short that expires after the LEAPS', async () => {
    const db = makeTestDb()

    const positionId = await seed(db, {
      ticker: 'XYZ',
      legs: [
        { ...LEAPS, fillDate: '2027-01-04', expiration: '2027-06-17' },
        { ...SHORT, fillDate: '2027-01-04', expiration: '2027-07-16' }
      ]
    })

    expect(
      getPosition(db, positionId)?.legs.map(({ fillDate, expiration }) => ({
        fillDate,
        expiration
      }))
    ).toEqual([
      { fillDate: '2027-01-04', expiration: '2027-06-17' },
      { fillDate: '2027-01-04', expiration: '2027-07-16' }
    ])
  })

  it('rejects an empty legs array on the legs field and writes no position', async () => {
    const db = makeTestDb()
    const handlers = await handlersFor(db)

    const result = await call(handlers, { ticker: 'XYZ', legs: [] })

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'legs', code: 'too_small' })]
    })
    expect(db.prepare('SELECT COUNT(*) AS n FROM positions').get()).toEqual({ n: 0 })
  })
})
