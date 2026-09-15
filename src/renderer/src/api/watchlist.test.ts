import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addWatchlistEntry,
  getWatchlistSnapshot,
  removeWatchlistEntry,
  updateWatchlistEntry
} from './watchlist'

const mockList = vi.fn()
const mockAdd = vi.fn()
const mockRemove = vi.fn()
const mockUpdate = vi.fn()
const mockSnapshot = vi.fn()

beforeEach(() => {
  mockList.mockReset()
  mockAdd.mockReset()
  mockRemove.mockReset()
  mockUpdate.mockReset()
  mockSnapshot.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      watchlist: {
        list: mockList,
        add: mockAdd,
        remove: mockRemove,
        update: mockUpdate,
        snapshot: mockSnapshot
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

// [US-69] The edit adapter sends every editable field, so a save cannot silently keep a
// value the trader cleared.
describe('updateWatchlistEntry', () => {
  const FULL_PAYLOAD = {
    ticker: 'AAPL',
    notes: 'Would own below $165 after the split',
    ownBelowPrice: 165,
    ivrTrigger: null,
    postEarningsOnly: false,
    coreHolding: false
  }

  it('returns the updated entry and forwards the full payload', async () => {
    mockUpdate.mockResolvedValue({ ok: true, entry: ENTRY })

    await expect(updateWatchlistEntry(FULL_PAYLOAD)).resolves.toEqual(ENTRY)
    expect(mockUpdate).toHaveBeenCalledWith(FULL_PAYLOAD)
  })

  it('throws a mapped ApiError (status 400) when the entry is gone', async () => {
    mockUpdate.mockResolvedValue({
      ok: false,
      errors: [{ field: 'ticker', code: 'not_found', message: 'AAPL is not on the watchlist' }]
    })

    await expect(updateWatchlistEntry(FULL_PAYLOAD)).rejects.toMatchObject({
      status: 400,
      body: {
        detail: [{ field: 'ticker', code: 'not_found', message: 'AAPL is not on the watchlist' }]
      }
    })
  })
})

describe('addWatchlistEntry', () => {
  const BARE_PAYLOAD = {
    ticker: 'AAPL',
    notes: null,
    ownBelowPrice: null,
    ivrTrigger: null,
    postEarningsOnly: false,
    coreHolding: false
  }

  it('returns the created entry on a successful response', async () => {
    mockAdd.mockResolvedValue({ ok: true, entry: ENTRY })

    await expect(addWatchlistEntry(BARE_PAYLOAD)).resolves.toEqual(ENTRY)
    expect(mockAdd).toHaveBeenCalledWith(BARE_PAYLOAD)
  })

  it('throws a mapped ApiError (status 400) preserving the ticker field on a duplicate', async () => {
    mockAdd.mockResolvedValue({
      ok: false,
      errors: [{ field: 'ticker', code: 'duplicate', message: 'AAPL is already on the watchlist' }]
    })

    await expect(addWatchlistEntry(BARE_PAYLOAD)).rejects.toMatchObject({
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

  // A remove that quietly resolved would leave the ticker on screen after the trader
  // watched it disappear from the list, so the failure has to reach the mutation.
  it('throws a mapped ApiError when the channel reports a failure', async () => {
    mockRemove.mockResolvedValue({
      ok: false,
      errors: [{ field: 'ticker', code: 'not_found', message: 'AAPL is not on the watchlist' }]
    })

    await expect(removeWatchlistEntry('AAPL')).rejects.toMatchObject({
      status: 400,
      body: { detail: [{ field: 'ticker', code: 'not_found' }] }
    })
  })
})

// [US-96] One live bench — the snapshot adapter.
const SNAPSHOT_ROW = {
  entry: ENTRY,
  quote: { price: '178.40', prevClose: '176.98', timestamp: '2026-09-11T18:00:00.000Z' },
  ivRank: {
    value: '62.0',
    observedAt: '2026-09-11T13:35:00.000Z',
    ageTradingDays: 0,
    state: 'fresh' as const
  },
  earnings: { kind: 'date' as const, date: '2026-10-30', daysUntil: 49, withinWindow: false },
  verdict: {
    price: { verdict: 'unmet' as const, label: 'Price $178.40 above $170 target' },
    iv: { verdict: 'met' as const, label: null },
    earnings: { verdict: 'none' as const, label: null }
  }
}

describe('getWatchlistSnapshot', () => {
  it('returns the rows and the as-of clock on a successful response', async () => {
    mockSnapshot.mockResolvedValue({
      ok: true,
      rows: [SNAPSHOT_ROW],
      asOf: '2026-09-11T18:00:00.000Z'
    })

    await expect(getWatchlistSnapshot()).resolves.toEqual({
      rows: [SNAPSHOT_ROW],
      asOf: '2026-09-11T18:00:00.000Z'
    })
  })

  // Every expected failure is modelled inside the payload, so an ok:false envelope
  // only ever means something unexpected — it must still surface as an ApiError
  // rather than resolving with a half-built snapshot.
  it('throws a mapped ApiError (status 400) on an ok:false envelope', async () => {
    mockSnapshot.mockResolvedValue({
      ok: false,
      errors: [{ field: '__root__', code: 'internal_error', message: 'Unexpected error' }]
    })

    await expect(getWatchlistSnapshot()).rejects.toMatchObject({
      status: 400,
      body: {
        detail: [{ field: '__root__', code: 'internal_error', message: 'Unexpected error' }]
      }
    })
  })
})
