// Dev-only IPC channels the e2e suite drives the fake IV series, the persisted IV30 history
// and the calendar caches through. Registered only when NODE_ENV === 'test', so nothing here
// reaches a packaged app — but the channels still answer for real, and a spec three files away
// cannot tell a broken handler from a broken feature.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { makeTestDb, seedIv30Series, seedTradingCalendar } from '../test-utils'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

vi.mock('../integrations/fake-clock', () => ({ setFakeNow: vi.fn() }))

vi.mock('../integrations/fake-market-data', () => ({
  marketCalendarFetchCount: vi.fn(() => 3),
  setFakeIvSeries: vi.fn(),
  dailyBarRequests: vi.fn(() => [
    { kind: 'stock', underlying: 'KO', start: '2026-09-01', end: null }
  ])
}))

type Handler = (...a: never[]) => unknown

async function handlersFor(db: Database.Database): Promise<Map<string, Handler>> {
  const { ipcMain } = await import('electron')
  const { registerTestIvHistoryIpc } = await import('./test-iv-history')

  registerTestIvHistoryIpc(db)

  return new Map(vi.mocked(ipcMain.handle).mock.calls as Array<[string, Handler]>)
}

function call(handlers: Map<string, Handler>, channel: string, ...args: unknown[]): unknown {
  const handler = handlers.get(channel)
  if (handler === undefined) throw new Error(`${channel} was not registered`)
  return handler(null as never, ...(args as never[]))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('registerTestIvHistoryIpc', () => {
  it('replaces the fake IV series fixture (which also resets the request log)', async () => {
    const { setFakeIvSeries } = await import('../integrations/fake-market-data')
    const handlers = await handlersFor(makeTestDb())
    const fixture = { KO: { price: 60, sessions: { '2026-09-24': 0.21 } } }

    expect(call(handlers, '_test:iv-series-set', fixture)).toEqual({ ok: true })
    expect(setFakeIvSeries).toHaveBeenCalledWith(fixture)
  })

  it('refuses a fixture that is not an object', async () => {
    const { setFakeIvSeries } = await import('../integrations/fake-market-data')
    const handlers = await handlersFor(makeTestDb())

    expect(call(handlers, '_test:iv-series-set', 'nope')).toMatchObject({ ok: false })
    expect(setFakeIvSeries).not.toHaveBeenCalled()
  })

  it('accepts a valid fake clock and rejects anything that is not a timestamp', async () => {
    const { setFakeNow } = await import('../integrations/fake-clock')
    const handlers = await handlersFor(makeTestDb())

    expect(call(handlers, '_test:ivr-set-now', '2026-09-11T20:10:00Z')).toEqual({ ok: true })
    expect(setFakeNow).toHaveBeenCalledWith('2026-09-11T20:10:00Z')

    expect(call(handlers, '_test:ivr-set-now', 'not-a-date')).toMatchObject({ ok: false })
    expect(call(handlers, '_test:ivr-set-now', 42)).toMatchObject({ ok: false })
    expect(setFakeNow).toHaveBeenCalledTimes(1)
  })

  it('reads every iv30_reading row ordered by underlying, then session', async () => {
    const db = makeTestDb()
    seedIv30Series(db, 'MSFT', [['2026-09-23', '0.3100']])
    seedIv30Series(db, 'KO', [
      ['2026-09-24', '0.2200'],
      ['2026-09-23', '0.2100']
    ])
    const handlers = await handlersFor(db)

    const rows = call(handlers, '_test:iv30-history') as Array<Record<string, unknown>>

    expect(rows.map((row) => [row.underlying, row.session, row.iv30])).toEqual([
      ['KO', '2026-09-23', '0.2100'],
      ['KO', '2026-09-24', '0.2200'],
      ['MSFT', '2026-09-23', '0.3100']
    ])
  })

  it('reads every iv30_gap row', async () => {
    const db = makeTestDb()
    db.prepare(
      `INSERT INTO iv30_gap (underlying, session, method, reason, attempted_at)
       VALUES ('KO', '2026-09-23', 'daily_vwap', 'no_tradeable_pair', '2026-09-24T21:00:00.000Z')`
    ).run()
    const handlers = await handlersFor(db)

    expect(call(handlers, '_test:iv30-gaps')).toEqual([
      {
        underlying: 'KO',
        session: '2026-09-23',
        method: 'daily_vwap',
        reason: 'no_tradeable_pair',
        attempted_at: '2026-09-24T21:00:00.000Z'
      }
    ])
  })

  it('serves the fake provider daily-bar request log', async () => {
    const handlers = await handlersFor(makeTestDb())

    expect(call(handlers, '_test:daily-bar-requests')).toEqual([
      { kind: 'stock', underlying: 'KO', start: '2026-09-01', end: null }
    ])
  })

  it('overwrites a reading with a defective value stamped engine_version 0', async () => {
    const db = makeTestDb()
    seedIv30Series(db, 'KO', [['2026-09-23', '0.2600']])
    const handlers = await handlersFor(db)

    expect(
      call(handlers, '_test:iv30-corrupt', { ticker: 'ko', session: '2026-09-23', iv30: '0.5200' })
    ).toEqual({ ok: true })

    expect(
      db.prepare('SELECT iv30, engine_version FROM iv30_reading WHERE underlying = ?').get('KO')
    ).toEqual({ iv30: '0.5200', engine_version: 0 })
  })

  it('recomputes stale-version readings through the real service', async () => {
    const db = makeTestDb()
    const handlers = await handlersFor(db)

    expect(call(handlers, '_test:iv-history-recompute', { force: true })).toEqual({
      recomputed: 0,
      unrecomputable: 0
    })
  })

  it('answers whether a table exists from sqlite_master', async () => {
    const handlers = await handlersFor(makeTestDb())

    expect(call(handlers, '_test:table-exists', 'iv30_reading')).toBe(true)
    expect(call(handlers, '_test:table-exists', 'ivr_snapshot')).toBe(false)
  })

  it('counts the cached trading sessions, so a spec can see a fresh install', async () => {
    const db = makeTestDb()
    const handlers = await handlersFor(db)

    expect(call(handlers, '_test:trading-session-count')).toBe(0)

    seedTradingCalendar(db, '2026-09-07', '2026-09-11')
    expect(call(handlers, '_test:trading-session-count')).toBe(5)
  })

  it('reports the fake provider calendar fetch count', async () => {
    const handlers = await handlersFor(makeTestDb())

    expect(call(handlers, '_test:market-calendar-fetch-count')).toBe(3)
  })

  it('registers none of the retired Barchart channels', async () => {
    const handlers = await handlersFor(makeTestDb())

    expect(handlers.has('_test:ivr-set-outcomes')).toBe(false)
    expect(handlers.has('_test:ivr-fetch-log')).toBe(false)
    expect(handlers.has('_test:ivr-snapshots')).toBe(false)
  })
})
