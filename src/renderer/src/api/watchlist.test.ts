import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addWatchlistEntry, listWatchlist, removeWatchlistEntry } from './watchlist'

const mockList = vi.fn()
const mockAdd = vi.fn()
const mockRemove = vi.fn()

beforeEach(() => {
  mockList.mockReset()
  mockAdd.mockReset()
  mockRemove.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      watchlist: {
        list: mockList,
        add: mockAdd,
        remove: mockRemove
      }
    }
  })
})

const ENTRY = {
  ticker: 'AAPL',
  notes: 'Would own below $180',
  ownBelowPrice: '180.0000',
  ivrTrigger: 50,
  postEarningsOnly: false,
  coreHolding: true,
  addedAt: '2026-07-19T12:00:00.000Z'
}

describe('listWatchlist', () => {
  it('returns the entries array on a successful response', async () => {
    mockList.mockResolvedValue({ ok: true, entries: [ENTRY] })

    await expect(listWatchlist()).resolves.toEqual([ENTRY])
  })
})

describe('addWatchlistEntry', () => {
  it('returns the created entry on a successful response', async () => {
    mockAdd.mockResolvedValue({ ok: true, entry: ENTRY })

    await expect(addWatchlistEntry({ ticker: 'AAPL' })).resolves.toEqual(ENTRY)
    expect(mockAdd).toHaveBeenCalledWith({ ticker: 'AAPL' })
  })

  it('throws a mapped ApiError (status 400) preserving the ticker field on a duplicate', async () => {
    mockAdd.mockResolvedValue({
      ok: false,
      errors: [{ field: 'ticker', code: 'duplicate', message: 'AAPL is already on the watchlist' }]
    })

    await expect(addWatchlistEntry({ ticker: 'AAPL' })).rejects.toMatchObject({
      status: 400,
      body: {
        detail: [
          { field: 'ticker', code: 'duplicate', message: 'AAPL is already on the watchlist' }
        ]
      }
    })
  })
})

describe('removeWatchlistEntry', () => {
  it('resolves on a successful response', async () => {
    mockRemove.mockResolvedValue({ ok: true, ticker: 'AAPL' })

    await expect(removeWatchlistEntry('AAPL')).resolves.toBeUndefined()
    expect(mockRemove).toHaveBeenCalledWith({ ticker: 'AAPL' })
  })
})
