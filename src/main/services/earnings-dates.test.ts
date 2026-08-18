// [US-70] earnings-dates — the read-through store over the Finnhub calendar. The
// table is the cache: a fetch happens only when the row is missing, past, too
// shallow for the caller's horizon, or older than the staleness backstop.
import type Database from 'better-sqlite3'
import { parseISO, subDays, subHours } from 'date-fns'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { EarningsLookup } from '../integrations/finnhub-earnings'
import { logger } from '../logger'
import { makeTestDb } from '../test-utils'
import { getEarnings, type EarningsFetcher } from './earnings-dates'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

beforeEach(() => {
  vi.clearAllMocks()
})

// 2026-08-17, with a horizon 50 days out — the screener's ~45 DTE window plus buffer.
const NOW = parseISO('2026-08-17T12:00:00')
const HORIZON = parseISO('2026-10-06')

type SeedRow = {
  ticker: string
  nextEarnings: string | null
  checkedThrough: string
  checkedAt?: string
}

function seedEarnings(db: Database.Database, rows: SeedRow[]): void {
  const insert = db.prepare(
    `INSERT INTO earnings_date (ticker, next_earnings, checked_through, checked_at, source)
     VALUES (?, ?, ?, ?, 'finnhub')`
  )
  for (const row of rows) {
    insert.run(row.ticker, row.nextEarnings, row.checkedThrough, row.checkedAt ?? NOW.toISOString())
  }
}

type StoredRow = {
  ticker: string
  next_earnings: string | null
  checked_through: string
  checked_at: string
  source: string
}

function readAllRows(db: Database.Database): StoredRow[] {
  return db.prepare('SELECT * FROM earnings_date ORDER BY ticker').all() as StoredRow[]
}

/** Stubs the feed with a fixed verdict per ticker, mirroring `fetchNextEarnings`'s
 *  contract that every requested ticker gets an entry. */
function stubFetch(result: Record<string, EarningsLookup>): Mock<EarningsFetcher> {
  return vi.fn<EarningsFetcher>(async (tickers) =>
    Object.fromEntries(
      tickers.map((ticker) => [ticker, result[ticker] ?? { status: 'unavailable' }])
    )
  )
}

describe('getEarnings', () => {
  it('fetches a ticker with no row, writes the answer back, and serves the next call from the table', async () => {
    const db = makeTestDb()
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-09-04' } })

    const first = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })
    expect(first.get('AAPL')).toEqual({ status: 'found', date: '2026-09-04' })
    expect(fetch).toHaveBeenCalledTimes(1)

    const second = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })
    expect(second.get('AAPL')).toEqual({ status: 'found', date: '2026-09-04' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('serves a future date inside checked_through from the table without fetching', async () => {
    const db = makeTestDb()
    seedEarnings(db, [{ ticker: 'AAPL', nextEarnings: '2026-09-04', checkedThrough: '2026-10-06' }])
    const fetch = stubFetch({})

    const earnings = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(earnings.get('AAPL')).toEqual({ status: 'found', date: '2026-09-04' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refetches a stored date earlier than today because that print has already happened', async () => {
    const db = makeTestDb()
    // Aged past MIN_REFETCH_HOURS: a passed print is re-asked on the short interval,
    // not on every call — see the refetch-cadence cases below for the floor itself.
    seedEarnings(db, [
      {
        ticker: 'AAPL',
        nextEarnings: '2026-08-10',
        checkedThrough: '2026-10-06',
        checkedAt: subHours(NOW, 13).toISOString()
      }
    ])
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-11-05' } })

    const earnings = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(fetch).toHaveBeenCalledWith(['AAPL'], expect.anything())
    expect(earnings.get('AAPL')).toEqual({ status: 'found', date: '2026-11-05' })
  })

  it('serves a null date as none when the row was checked at least as far as the horizon', async () => {
    const db = makeTestDb()
    seedEarnings(db, [{ ticker: 'AAPL', nextEarnings: null, checkedThrough: '2026-10-06' }])
    const fetch = stubFetch({})

    const earnings = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(earnings.get('AAPL')).toEqual({ status: 'none' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refetches a null date whose checked_through falls short of the horizon', async () => {
    const db = makeTestDb()
    seedEarnings(db, [{ ticker: 'AAPL', nextEarnings: null, checkedThrough: '2026-09-16' }])
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-09-28' } })

    const earnings = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(fetch).toHaveBeenCalledWith(['AAPL'], expect.anything())
    expect(earnings.get('AAPL')).toEqual({ status: 'found', date: '2026-09-28' })
  })

  it('refetches a row checked longer ago than the staleness window even when its date is still future', async () => {
    const db = makeTestDb()
    seedEarnings(db, [
      {
        ticker: 'AAPL',
        nextEarnings: '2026-09-04',
        checkedThrough: '2026-10-06',
        checkedAt: subDays(NOW, 10).toISOString()
      }
    ])
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-09-08' } })

    const earnings = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(fetch).toHaveBeenCalledWith(['AAPL'], expect.anything())
    expect(earnings.get('AAPL')).toEqual({ status: 'found', date: '2026-09-08' })
  })

  it('writes no row for a failed fetch and reports the ticker unavailable', async () => {
    const db = makeTestDb()
    const fetch = stubFetch({ AAPL: { status: 'unavailable' } })

    const earnings = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(earnings.get('AAPL')).toEqual({ status: 'unavailable' })
    expect(readAllRows(db)).toEqual([])
  })

  it('still writes the successful tickers when one ticker in the batch fails', async () => {
    const db = makeTestDb()
    const fetch = stubFetch({
      AAPL: { status: 'unavailable' },
      MSFT: { status: 'found', date: '2026-09-24' },
      KO: { status: 'none' }
    })

    const earnings = await getEarnings(db, ['AAPL', 'MSFT', 'KO'], {
      horizon: HORIZON,
      now: NOW,
      fetch
    })

    expect(earnings.get('AAPL')).toEqual({ status: 'unavailable' })
    expect(earnings.get('MSFT')).toEqual({ status: 'found', date: '2026-09-24' })
    expect(earnings.get('KO')).toEqual({ status: 'none' })
    expect(readAllRows(db).map((row) => row.ticker)).toEqual(['KO', 'MSFT'])
  })

  it('writes a row with a null date for an empty calendar — positive knowledge that stops the refetch loop', async () => {
    const db = makeTestDb()
    const fetch = stubFetch({ AAPL: { status: 'none' } })

    await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(readAllRows(db)).toEqual([
      {
        ticker: 'AAPL',
        next_earnings: null,
        checked_through: '2026-10-06',
        checked_at: NOW.toISOString(),
        source: 'finnhub'
      }
    ])

    const second = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })
    expect(second.get('AAPL')).toEqual({ status: 'none' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('overwrites the prior row on the next fetch rather than accumulating history', async () => {
    const db = makeTestDb()
    const first = stubFetch({ AAPL: { status: 'found', date: '2026-08-20' } })
    await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch: first })

    // The stored print has passed by this later `now`, so the row is refetched.
    const later = parseISO('2026-08-25T12:00:00')
    const second = stubFetch({ AAPL: { status: 'found', date: '2026-11-19' } })
    await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: later, fetch: second })

    const rows = readAllRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].next_earnings).toBe('2026-11-19')
  })

  it('degrades to fetching every ticker and logs when the table cannot be read', async () => {
    const db = makeTestDb()
    seedEarnings(db, [{ ticker: 'AAPL', nextEarnings: '2026-09-04', checkedThrough: '2026-10-06' }])
    // Only the read is broken; the write-back that follows must still work.
    vi.spyOn(db, 'prepare').mockImplementationOnce(() => {
      throw new Error('database is locked')
    })
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-09-04' } })

    const earnings = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(fetch).toHaveBeenCalledWith(['AAPL'], expect.anything())
    expect(earnings.get('AAPL')).toEqual({ status: 'found', date: '2026-09-04' })
    expect(logger.warn).toHaveBeenCalled()
  })

  it('upper-cases requested tickers so the table key matches how the feed stores them', async () => {
    const db = makeTestDb()
    seedEarnings(db, [{ ticker: 'AAPL', nextEarnings: '2026-09-04', checkedThrough: '2026-10-06' }])
    const fetch = stubFetch({})

    const earnings = await getEarnings(db, ['aapl'], { horizon: HORIZON, now: NOW, fetch })

    expect(earnings.get('AAPL')).toEqual({ status: 'found', date: '2026-09-04' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns an empty map without touching the db or the feed when no tickers are requested', async () => {
    const db = makeTestDb()
    const prepare = vi.spyOn(db, 'prepare')
    const fetch = stubFetch({})

    expect(await getEarnings(db, [], { horizon: HORIZON, now: NOW, fetch })).toEqual(new Map())
    expect(prepare).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('asks the feed for a lookahead that reaches the caller’s horizon', async () => {
    const db = makeTestDb()
    const fetch = stubFetch({ AAPL: { status: 'none' } })

    await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(fetch).toHaveBeenCalledWith(['AAPL'], { now: NOW, lookaheadDays: 50 })
  })
})

// ---------------------------------------------------------------------------
// [US-70] Review findings. The store exists to survive outages and to bound
// request volume; these are the cases where a naive read-through does neither.
// ---------------------------------------------------------------------------

describe('getEarnings — a failed refetch must not destroy what we already knew', () => {
  it('keeps serving a stored date when the staleness refetch comes back unavailable', async () => {
    const db = makeTestDb()
    // Known in-window print, but the row tripped the revision backstop.
    seedEarnings(db, [
      {
        ticker: 'AAPL',
        nextEarnings: '2026-09-04',
        checkedThrough: '2026-10-06',
        checkedAt: subDays(NOW, 8).toISOString()
      }
    ])
    const fetch = stubFetch({}) // every ticker unavailable

    const result = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(fetch).toHaveBeenCalledTimes(1)
    // The cache is what carries us through an outage — discarding a known date here
    // would silently turn an `earnings_in_window` exclusion into a ranked candidate.
    expect(result.get('AAPL')).toEqual({ status: 'found', date: '2026-09-04' })
  })

  it('leaves the row untouched after a failed refetch, so the next run tries again', async () => {
    const db = makeTestDb()
    const checkedAt = subDays(NOW, 8).toISOString()
    seedEarnings(db, [
      { ticker: 'AAPL', nextEarnings: '2026-09-04', checkedThrough: '2026-10-06', checkedAt }
    ])

    await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch: stubFetch({}) })

    expect(readAllRows(db)).toEqual([
      expect.objectContaining({ next_earnings: '2026-09-04', checked_at: checkedAt })
    ])
  })

  it('still reports unavailable for a ticker that has no stored row to fall back on', async () => {
    const db = makeTestDb()

    const result = await getEarnings(db, ['AAPL'], {
      horizon: HORIZON,
      now: NOW,
      fetch: stubFetch({})
    })

    expect(result.get('AAPL')).toEqual({ status: 'unavailable' })
  })

  it('lets a successful refetch overwrite the stored date', async () => {
    const db = makeTestDb()
    seedEarnings(db, [
      {
        ticker: 'AAPL',
        nextEarnings: '2026-09-04',
        checkedThrough: '2026-10-06',
        checkedAt: subDays(NOW, 8).toISOString()
      }
    ])
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-09-11' } })

    const result = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(result.get('AAPL')).toEqual({ status: 'found', date: '2026-09-11' })
    expect(readAllRows(db)[0].next_earnings).toBe('2026-09-11')
  })
})

describe('getEarnings — refetch cadence', () => {
  it('does not re-ask about an already-passed print within the minimum interval', async () => {
    const db = makeTestDb()
    // The feed's lookback returns prints up to 7 days old, so a just-passed date is a
    // normal stored value. Trigger 2 must not fire on every scheduler tick because of it.
    seedEarnings(db, [
      {
        ticker: 'AAPL',
        nextEarnings: '2026-08-14',
        checkedThrough: '2026-10-06',
        checkedAt: subDays(NOW, 0).toISOString()
      }
    ])
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-08-14' } })

    await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('re-asks about an already-passed print once the minimum interval has elapsed', async () => {
    const db = makeTestDb()
    seedEarnings(db, [
      {
        ticker: 'AAPL',
        nextEarnings: '2026-08-14',
        checkedThrough: '2026-10-06',
        checkedAt: subHours(NOW, 13).toISOString()
      }
    ])
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-11-06' } })

    await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('re-reads a near-term date twice a day — US-56 alerts on a 10-day threshold', async () => {
    const db = makeTestDb()
    // 8 days out: inside the EARNINGS_PROXIMITY window, where a vendor revision
    // changes whether the alert should already have fired.
    seedEarnings(db, [
      {
        ticker: 'AAPL',
        nextEarnings: '2026-08-25',
        checkedThrough: '2026-10-06',
        checkedAt: subHours(NOW, 13).toISOString()
      }
    ])
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-08-21' } })

    const result = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.get('AAPL')).toEqual({ status: 'found', date: '2026-08-21' })
  })

  it('holds a near-term date inside the minimum interval', async () => {
    const db = makeTestDb()
    seedEarnings(db, [
      {
        ticker: 'AAPL',
        nextEarnings: '2026-08-25',
        checkedThrough: '2026-10-06',
        checkedAt: subHours(NOW, 6).toISOString()
      }
    ])
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-08-21' } })

    await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('leaves a distant date on the weekly backstop rather than re-asking daily', async () => {
    const db = makeTestDb()
    seedEarnings(db, [
      {
        ticker: 'AAPL',
        nextEarnings: '2026-09-30',
        checkedThrough: '2026-10-06',
        checkedAt: subDays(NOW, 2).toISOString()
      }
    ])
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-09-30' } })

    await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('getEarnings — a write failure must not cost the read', () => {
  it('returns the fetched verdicts and warns when the upsert throws', async () => {
    const db = makeTestDb()
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-09-04' } })
    // Only the write breaks; the read path already returned "no rows".
    const realPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO earnings_date')) throw new Error('database is locked')
      return realPrepare(sql)
    })

    const result = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(result.get('AAPL')).toEqual({ status: 'found', date: '2026-09-04' })
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ tickers: ['AAPL'] }),
      'earnings_date_write_failed'
    )
  })
})

// ---------------------------------------------------------------------------
// [US-70] Not every stored row is an answer. A row can be perfectly fresh and still
// be unable to speak for this caller — and serving it anyway fabricates a verdict.
// ---------------------------------------------------------------------------

describe('getEarnings — a row that cannot answer must not be served as one', () => {
  it('never serves a since-passed print as a found date, even when the refetch fails', async () => {
    const db = makeTestDb()
    // Last good write recorded a print that has since happened. It says nothing about
    // the *next* one — which is exactly why it triggers a refetch.
    seedEarnings(db, [
      {
        ticker: 'AAPL',
        nextEarnings: '2026-05-15',
        checkedThrough: '2026-07-06',
        checkedAt: subDays(NOW, 90).toISOString()
      }
    ])

    const result = await getEarnings(db, ['AAPL'], {
      horizon: HORIZON,
      now: NOW,
      fetch: stubFetch({})
    })

    // Serving `found` here would have the engine score it `clear` — a rank number and
    // no exclusion for a ticker whose real next print may land inside the expiry.
    expect(result.get('AAPL')).toEqual({ status: 'unavailable' })
  })

  it('never serves a since-passed print even inside the minimum refetch interval', async () => {
    const db = makeTestDb()
    seedEarnings(db, [
      {
        ticker: 'AAPL',
        nextEarnings: '2026-08-14',
        checkedThrough: '2026-10-06',
        checkedAt: NOW.toISOString()
      }
    ])
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-08-14' } })

    const result = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(fetch).not.toHaveBeenCalled()
    expect(result.get('AAPL')).toEqual({ status: 'unavailable' })
  })

  it('does not let a shallow null row answer a deeper horizon when the refetch fails', async () => {
    const db = makeTestDb()
    // Checked only to 2026-09-01; the screener is asking through 2026-10-06. Reporting
    // `none` would assert "calendar read, no event" over a window never examined,
    // collapsing the outage-vs-empty-calendar distinction AC-10 requires.
    seedEarnings(db, [
      {
        ticker: 'AAPL',
        nextEarnings: null,
        checkedThrough: '2026-09-01',
        checkedAt: subDays(NOW, 1).toISOString()
      }
    ])

    const result = await getEarnings(db, ['AAPL'], {
      horizon: HORIZON,
      now: NOW,
      fetch: stubFetch({})
    })

    expect(result.get('AAPL')).toEqual({ status: 'unavailable' })
  })

  it('still serves a null row that did look far enough', async () => {
    const db = makeTestDb()
    seedEarnings(db, [
      {
        ticker: 'AAPL',
        nextEarnings: null,
        checkedThrough: '2026-10-06',
        checkedAt: subDays(NOW, 8).toISOString()
      }
    ])

    const result = await getEarnings(db, ['AAPL'], {
      horizon: HORIZON,
      now: NOW,
      fetch: stubFetch({})
    })

    expect(result.get('AAPL')).toEqual({ status: 'none' })
  })

  it('returns an entry for every requested ticker even when rows cannot answer', async () => {
    const db = makeTestDb()
    seedEarnings(db, [
      { ticker: 'PASSED', nextEarnings: '2026-05-15', checkedThrough: '2026-10-06' },
      { ticker: 'SHALLOW', nextEarnings: null, checkedThrough: '2026-09-01' },
      { ticker: 'GOOD', nextEarnings: '2026-09-04', checkedThrough: '2026-10-06' }
    ])
    const tickers = ['PASSED', 'SHALLOW', 'GOOD', 'ABSENT']

    const result = await getEarnings(db, tickers, {
      horizon: HORIZON,
      now: NOW,
      fetch: stubFetch({})
    })

    expect([...result.keys()].sort()).toEqual([...tickers].sort())
    expect(result.get('GOOD')).toEqual({ status: 'found', date: '2026-09-04' })
  })
})

describe('getEarnings — the fetch path is held to the same invariant as the stored path', () => {
  it('does not serve a freshly-fetched past date as a found verdict', async () => {
    const db = makeTestDb()
    // The feed's window opens at `now - 7d` and falls back to the latest past date, so
    // for the week after every print this is its ordinary answer — not an error.
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-08-14' } })

    const result = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(fetch).toHaveBeenCalledTimes(1)
    // Serving `found` would have the engine score a past date `clear` — rank number, no
    // badge, no exclusion — for a ticker whose real next print is a quarter away and
    // unknown.
    expect(result.get('AAPL')).toEqual({ status: 'unavailable' })
  })

  it('agrees with itself across the fetch and stored paths for the same data', async () => {
    const db = makeTestDb()
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-08-14' } })

    const fetched = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })
    const stored = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    // Two calls over identical data must not alternate between tier 0 and tier 1.
    expect(stored.get('AAPL')).toEqual(fetched.get('AAPL'))
  })

  it('still persists the row for a fetched past date, so the refetch floor stays armed', async () => {
    const db = makeTestDb()
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-08-14' } })

    await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    expect(readAllRows(db)).toEqual([
      expect.objectContaining({ ticker: 'AAPL', next_earnings: '2026-08-14' })
    ])
  })

  it('serves a fetched date landing today as found — the boundary is inclusive', async () => {
    const db = makeTestDb()
    const fetch = stubFetch({ AAPL: { status: 'found', date: '2026-08-17' } })

    const result = await getEarnings(db, ['AAPL'], { horizon: HORIZON, now: NOW, fetch })

    // The engine's holding window opens at startOfDay(now), so today's print is real
    // gap risk, not history.
    expect(result.get('AAPL')).toEqual({ status: 'found', date: '2026-08-17' })
  })
})
