// [US-65] ivr-snapshots — read path for the latest IVR per underlying
import { describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { makeTestDb } from '../test-utils'
import { getLatestIvrByUnderlying } from './ivr-snapshots'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

function insertSnapshot(
  db: Database.Database,
  underlying: string,
  observedAt: string,
  ivr: string
): void {
  db.prepare(
    `INSERT INTO ivr_snapshot (underlying, observed_at, ivr, source)
     VALUES (?, ?, ?, 'barchart')`
  ).run(underlying, observedAt, ivr)
}

describe('getLatestIvrByUnderlying', () => {
  it('returns the most recently observed ivr when a ticker has several snapshots', () => {
    const db = makeTestDb()
    insertSnapshot(db, 'AAPL', '2026-08-03T20:00:00.000Z', '38.0')
    insertSnapshot(db, 'AAPL', '2026-08-05T20:00:00.000Z', '44.0')

    expect(getLatestIvrByUnderlying(db, ['AAPL'])).toEqual(
      new Map([['AAPL', { value: '44.0', observedAt: '2026-08-05T20:00:00.000Z' }]])
    )
  })

  it('carries the observation time so callers can judge how stale the reading is', () => {
    const db = makeTestDb()
    insertSnapshot(db, 'AAPL', '2026-08-05T20:00:00.000Z', '44.0')

    expect(getLatestIvrByUnderlying(db, ['AAPL']).get('AAPL')?.observedAt).toBe(
      '2026-08-05T20:00:00.000Z'
    )
  })

  it('omits an underlying that has no snapshot rather than mapping it to null or zero', () => {
    const db = makeTestDb()
    insertSnapshot(db, 'AAPL', '2026-08-05T20:00:00.000Z', '44.0')

    const ivrs = getLatestIvrByUnderlying(db, ['AAPL', 'MSFT'])

    expect(ivrs.has('MSFT')).toBe(false)
    expect(ivrs.size).toBe(1)
  })

  it('upper-cases the requested underlying to match how the collector stores it', () => {
    const db = makeTestDb()
    insertSnapshot(db, 'AAPL', '2026-08-05T20:00:00.000Z', '44.0')

    expect(getLatestIvrByUnderlying(db, ['aapl'])).toEqual(
      new Map([['AAPL', { value: '44.0', observedAt: '2026-08-05T20:00:00.000Z' }]])
    )
  })

  it('returns an empty map without preparing a statement when no underlyings are requested', () => {
    const db = makeTestDb()
    const prepare = vi.spyOn(db, 'prepare')

    expect(getLatestIvrByUnderlying(db, [])).toEqual(new Map())
    expect(prepare).not.toHaveBeenCalled()
  })
})
