// [US-63] Watchlist service — add / list / remove; update is [US-69]
import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import type { WatchlistEntryPayload, WatchlistEntryRecord } from '../schemas'
import { makeTestDb } from '../test-utils'
import {
  addWatchlistEntry,
  listWatchlist,
  removeWatchlistEntry,
  updateWatchlistEntry
} from './watchlist'

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

// [US-69] An update is a full replacement of every editable column, keyed by the ticker.
// The identity columns — `ticker` and `added_at` — are what these tests most want to see
// left alone: an edit that quietly reordered the bench would be a bug no rendering test
// could catch.
describe('updateWatchlistEntry', () => {
  function seedAapl(db: ReturnType<typeof makeTestDb>): WatchlistEntryRecord {
    return addWatchlistEntry(db, {
      ticker: 'AAPL',
      notes: 'Would own below $170',
      ownBelowPrice: 170,
      ivrTrigger: null,
      postEarningsOnly: false,
      coreHolding: false
    })
  }

  it('replaces the editable fields and returns the updated record', () => {
    const db = makeTestDb()
    const added = seedAapl(db)

    const updated = updateWatchlistEntry(db, {
      ticker: 'AAPL',
      notes: 'Would own below $165 after the split',
      ownBelowPrice: 165,
      ivrTrigger: null,
      postEarningsOnly: false,
      coreHolding: false
    })

    expect(updated).toEqual({
      ticker: 'AAPL',
      notes: 'Would own below $165 after the split',
      ownBelowPrice: '165.0000',
      ivrTrigger: null,
      postEarningsOnly: false,
      coreHolding: false,
      addedAt: added.addedAt
    })
  })

  it('leaves addedAt and the bench order untouched', () => {
    const db = makeTestDb()
    const added = seedAapl(db)
    addWatchlistEntry(db, { ticker: 'KO', postEarningsOnly: false, coreHolding: false })
    const orderBefore = listWatchlist(db).map((e) => e.ticker)

    const updated = updateWatchlistEntry(db, {
      ticker: 'AAPL',
      notes: 'Edited',
      ownBelowPrice: null,
      ivrTrigger: null,
      postEarningsOnly: false,
      coreHolding: false
    })

    expect(updated.addedAt).toBe(added.addedAt)
    // The bench is ordered `added_at DESC`, so the check that matters is that editing the
    // older entry did not move it — not what the order happens to be.
    expect(listWatchlist(db).map((e) => e.ticker)).toEqual(orderBefore)
  })

  it('stores NULL for a cleared thesis, whether null or an empty string', () => {
    const db = makeTestDb()
    seedAapl(db)

    const cleared = updateWatchlistEntry(db, {
      ticker: 'AAPL',
      notes: null,
      ownBelowPrice: 170,
      ivrTrigger: null,
      postEarningsOnly: false,
      coreHolding: false
    })
    expect(cleared.notes).toBeNull()

    updateWatchlistEntry(db, {
      ticker: 'AAPL',
      notes: 'back',
      ownBelowPrice: 170,
      ivrTrigger: null,
      postEarningsOnly: false,
      coreHolding: false
    })
    const emptied = updateWatchlistEntry(db, {
      ticker: 'AAPL',
      notes: '',
      ownBelowPrice: 170,
      ivrTrigger: null,
      postEarningsOnly: false,
      coreHolding: false
    })

    expect(emptied.notes).toBeNull()
    const raw = db.prepare('SELECT notes FROM watchlist WHERE ticker = ?').get('AAPL') as {
      notes: string | null
    }
    expect(raw.notes).toBeNull()
  })

  it('adds a condition that was not set before', () => {
    const db = makeTestDb()
    seedAapl(db)

    const updated = updateWatchlistEntry(db, {
      ticker: 'AAPL',
      notes: 'Would own below $170',
      ownBelowPrice: 170,
      ivrTrigger: 50,
      postEarningsOnly: false,
      coreHolding: false
    })

    expect(updated.ivrTrigger).toBe(50)
    const raw = db.prepare('SELECT ivr_trigger FROM watchlist WHERE ticker = ?').get('AAPL') as {
      ivr_trigger: number | null
    }
    expect(raw.ivr_trigger).toBe(50)
  })

  it('removes one condition while leaving the other in place', () => {
    const db = makeTestDb()
    seedAapl(db)
    updateWatchlistEntry(db, {
      ticker: 'AAPL',
      notes: null,
      ownBelowPrice: 170,
      ivrTrigger: 50,
      postEarningsOnly: false,
      coreHolding: false
    })

    const updated = updateWatchlistEntry(db, {
      ticker: 'AAPL',
      notes: null,
      ownBelowPrice: 170,
      ivrTrigger: null,
      postEarningsOnly: false,
      coreHolding: false
    })

    expect(updated.ivrTrigger).toBeNull()
    expect(updated.ownBelowPrice).toBe('170.0000')
  })

  it('round-trips the boolean flags as 0/1', () => {
    const db = makeTestDb()
    seedAapl(db)

    const updated = updateWatchlistEntry(db, {
      ticker: 'AAPL',
      notes: null,
      ownBelowPrice: null,
      ivrTrigger: null,
      postEarningsOnly: true,
      coreHolding: true
    })

    expect(updated.postEarningsOnly).toBe(true)
    expect(updated.coreHolding).toBe(true)
    const raw = db
      .prepare('SELECT post_earnings_only, core_holding FROM watchlist WHERE ticker = ?')
      .get('AAPL') as { post_earnings_only: number; core_holding: number }
    expect(raw).toEqual({ post_earnings_only: 1, core_holding: 1 })
  })

  it('normalizes the ticker before keying the row', () => {
    const db = makeTestDb()
    seedAapl(db)

    const updated = updateWatchlistEntry(db, {
      ticker: 'aapl',
      notes: 'lowercased key',
      ownBelowPrice: null,
      ivrTrigger: null,
      postEarningsOnly: false,
      coreHolding: false
    })

    expect(updated.ticker).toBe('AAPL')
    expect(updated.notes).toBe('lowercased key')
  })

  it('throws a not_found ValidationError and writes nothing when the ticker is absent', () => {
    const db = makeTestDb()
    seedAapl(db)

    try {
      updateWatchlistEntry(db, {
        ticker: 'TSLA',
        notes: 'nope',
        ownBelowPrice: null,
        ivrTrigger: null,
        postEarningsOnly: false,
        coreHolding: false
      })
      expect.unreachable('expected not_found ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const ve = err as ValidationError
      expect(ve.field).toBe('ticker')
      expect(ve.code).toBe('not_found')
      expect(ve.message).toBe('TSLA is not on the watchlist')
    }

    expect(listWatchlist(db).map((e) => e.ticker)).toEqual(['AAPL'])
  })
})

function basePayload(ticker: string): WatchlistEntryPayload {
  return { ticker, postEarningsOnly: false, coreHolding: false }
}

describe('addWatchlistEntry — on-demand IVR trigger', () => {
  it('collects the normalised ticker once, after the row exists', () => {
    const db = makeTestDb()
    const seen: Array<{ ticker: string; rowExists: boolean }> = []
    const ivrOnDemand = {
      collect: async (ticker: string): Promise<void> => {
        const row = db.prepare('SELECT ticker FROM watchlist WHERE ticker = ?').get('AAPL')
        seen.push({ ticker, rowExists: row !== undefined })
      }
    }

    addWatchlistEntry(db, basePayload('aapl'), ivrOnDemand)

    expect(seen).toEqual([{ ticker: 'AAPL', rowExists: true }])
  })

  it('never collects for an add that was rejected as a duplicate', () => {
    const db = makeTestDb()
    const collect = vi.fn(async () => {})
    addWatchlistEntry(db, basePayload('AAPL'))

    expect(() => addWatchlistEntry(db, basePayload('AAPL'), { collect })).toThrow(ValidationError)
    expect(collect).not.toHaveBeenCalled()
  })
})
