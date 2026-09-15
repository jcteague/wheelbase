// Dev-only IPC channels the e2e suite drives the fake IVR scraper and the calendar
// caches through. Registered only when NODE_ENV === 'test', so nothing here reaches a
// packaged app — but the channels still answer for real, and a spec three files away
// cannot tell a broken handler from a broken feature.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { makeTestDb, seedTradingCalendar } from '../test-utils'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

vi.mock('../integrations/fake-ivr', () => ({
  setFakeIvrNow: vi.fn(),
  setFakeIvrOutcomes: vi.fn()
}))

vi.mock('../integrations/fake-market-data', () => ({
  marketCalendarFetchCount: vi.fn(() => 3)
}))

async function handlersFor(
  db: Database.Database
): Promise<Map<string, (...a: never[]) => unknown>> {
  const { ipcMain } = await import('electron')
  const { registerTestIvrIpc } = await import('./test-ivr')

  registerTestIvrIpc(db)

  return new Map(
    vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...a: never[]) => unknown]>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('registerTestIvrIpc', () => {
  it('programs the fake scraper outcomes', async () => {
    const { setFakeIvrOutcomes } = await import('../integrations/fake-ivr')
    const handlers = await handlersFor(makeTestDb())
    const outcomes = { KO: { status: 'ok' } }

    expect(handlers.get('_test:ivr-set-outcomes')!(null as never, outcomes as never)).toEqual({
      ok: true
    })
    expect(setFakeIvrOutcomes).toHaveBeenCalledWith(outcomes)
  })

  it('accepts a valid fake clock and rejects anything that is not a timestamp', async () => {
    const { setFakeIvrNow } = await import('../integrations/fake-ivr')
    const handlers = await handlersFor(makeTestDb())
    const setNow = handlers.get('_test:ivr-set-now')!

    expect(setNow(null as never, '2026-09-11T20:10:00Z' as never)).toEqual({ ok: true })
    expect(setFakeIvrNow).toHaveBeenCalledWith('2026-09-11T20:10:00Z')

    expect(setNow(null as never, 'not-a-date' as never)).toMatchObject({ ok: false })
    expect(setNow(null as never, 42 as never)).toMatchObject({ ok: false })
    expect(setFakeIvrNow).toHaveBeenCalledTimes(1)
  })

  it('counts the cached trading sessions, so a spec can see a fresh install', async () => {
    const db = makeTestDb()
    const handlers = await handlersFor(db)
    const count = handlers.get('_test:trading-session-count')!

    expect(count()).toBe(0)

    seedTradingCalendar(db, '2026-09-07', '2026-09-11')
    expect(count()).toBe(5)
  })

  it('reports the fake provider calendar fetch count', async () => {
    const handlers = await handlersFor(makeTestDb())

    expect(handlers.get('_test:market-calendar-fetch-count')!()).toBe(3)
  })

  it('reads back persisted ivr_snapshot rows in underlying order', async () => {
    const db = makeTestDb()
    db.prepare('INSERT INTO ivr_snapshot (underlying, observed_at, ivr) VALUES (?, ?, ?)').run(
      'KO',
      '2026-09-10T20:10:00Z',
      '58.0'
    )
    const handlers = await handlersFor(db)

    expect(handlers.get('_test:ivr-snapshots')!()).toEqual([
      expect.objectContaining({ underlying: 'KO', ivr: '58.0' })
    ])
  })
})
