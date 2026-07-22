// [US-63] Watchlist service — add / list / remove
import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { makeTestDb } from '../test-utils'
import { addWatchlistEntry, listWatchlist, removeWatchlistEntry } from './watchlist'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('addWatchlistEntry', () => {
  it('inserts and returns the created record with addedAt, mapped booleans, and 4dp price', () => {
    const db = makeTestDb()

    const entry = addWatchlistEntry(db, {
      ticker: 'AAPL',
      notes: 'strong balance sheet',
      ownBelowPrice: 38,
      ivrTrigger: 50,
      postEarningsOnly: true,
      coreHolding: true
    })

    expect(entry).toEqual({
      ticker: 'AAPL',
      notes: 'strong balance sheet',
      ownBelowPrice: '38.0000',
      ivrTrigger: 50,
      postEarningsOnly: true,
      coreHolding: true,
      addedAt: expect.any(String)
    })
    expect(entry.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('normalizes a lowercase ticker to uppercase', () => {
    const db = makeTestDb()

    const entry = addWatchlistEntry(db, {
      ticker: 'nvda',
      postEarningsOnly: false,
      coreHolding: false
    })

    expect(entry.ticker).toBe('NVDA')
  })

  it('throws a duplicate ValidationError when the normalized ticker already exists', () => {
    const db = makeTestDb()
    addWatchlistEntry(db, { ticker: 'AAPL', postEarningsOnly: false, coreHolding: false })

    try {
      addWatchlistEntry(db, { ticker: 'aapl', postEarningsOnly: false, coreHolding: false })
      expect.unreachable('expected duplicate ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const ve = err as ValidationError
      expect(ve.field).toBe('ticker')
      expect(ve.code).toBe('duplicate')
      expect(ve.message).toBe('AAPL is already on the watchlist')
    }
  })

  it('stores null notes/conditions and false booleans when omitted', () => {
    const db = makeTestDb()

    const entry = addWatchlistEntry(db, {
      ticker: 'MSFT',
      postEarningsOnly: false,
      coreHolding: false
    })

    expect(entry).toMatchObject({
      ticker: 'MSFT',
      notes: null,
      ownBelowPrice: null,
      ivrTrigger: null,
      postEarningsOnly: false,
      coreHolding: false
    })

    const row = db
      .prepare(
        'SELECT own_below_price, ivr_trigger, post_earnings_only, core_holding FROM watchlist WHERE ticker = ?'
      )
      .get('MSFT') as {
      own_below_price: string | null
      ivr_trigger: number | null
      post_earnings_only: number
      core_holding: number
    }
    expect(row.own_below_price).toBeNull()
    expect(row.ivr_trigger).toBeNull()
    expect(row.post_earnings_only).toBe(0)
    expect(row.core_holding).toBe(0)
  })
})

describe('listWatchlist', () => {
  it('returns entries ordered by addedAt DESC (newest first)', () => {
    const db = makeTestDb()
    db.prepare(
      'INSERT INTO watchlist (ticker, added_at, post_earnings_only, core_holding) VALUES (?, ?, 0, 0)'
    ).run('AAPL', '2026-01-01T00:00:00.000Z')
    db.prepare(
      'INSERT INTO watchlist (ticker, added_at, post_earnings_only, core_holding) VALUES (?, ?, 0, 0)'
    ).run('MSFT', '2026-02-01T00:00:00.000Z')
    db.prepare(
      'INSERT INTO watchlist (ticker, added_at, post_earnings_only, core_holding) VALUES (?, ?, 0, 0)'
    ).run('NVDA', '2026-03-01T00:00:00.000Z')

    const tickers = listWatchlist(db).map((e) => e.ticker)

    expect(tickers).toEqual(['NVDA', 'MSFT', 'AAPL'])
  })

  it('maps stored 0/1 integers back to booleans', () => {
    const db = makeTestDb()
    addWatchlistEntry(db, { ticker: 'AAPL', postEarningsOnly: true, coreHolding: false })

    const [entry] = listWatchlist(db)

    expect(entry.postEarningsOnly).toBe(true)
    expect(entry.coreHolding).toBe(false)
  })
})

describe('removeWatchlistEntry', () => {
  it('deletes the matching row', () => {
    const db = makeTestDb()
    addWatchlistEntry(db, { ticker: 'AAPL', postEarningsOnly: false, coreHolding: false })

    removeWatchlistEntry(db, 'AAPL')

    expect(listWatchlist(db)).toEqual([])
  })

  it('normalizes the ticker before deleting', () => {
    const db = makeTestDb()
    addWatchlistEntry(db, { ticker: 'AAPL', postEarningsOnly: false, coreHolding: false })

    removeWatchlistEntry(db, 'aapl')

    expect(listWatchlist(db)).toEqual([])
  })

  it('throws a not_found ValidationError when the ticker is absent', () => {
    const db = makeTestDb()

    try {
      removeWatchlistEntry(db, 'TSLA')
      expect.unreachable('expected not_found ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const ve = err as ValidationError
      expect(ve.field).toBe('ticker')
      expect(ve.code).toBe('not_found')
      expect(ve.message).toBe('TSLA is not on the watchlist')
    }
  })
})
