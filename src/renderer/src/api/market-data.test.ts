import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMarketStatus, getStockQuotes, getOptionSnapshots } from './market-data'

const mockGetStockQuotes = vi.fn()
const mockGetOptionSnapshots = vi.fn()
const mockMarketStatus = vi.fn()

const AAPL_QUOTE = {
  price: '182.45',
  bid: '182.44',
  ask: '182.46',
  prevClose: '181.00',
  volume: 1000,
  timestamp: '2024-01-15T15:30:00Z'
}

const AAPL_OPTION_SNAPSHOT = {
  bid: '1.20',
  ask: '1.40',
  mid: '1.30',
  lastTrade: '1.30',
  openInterest: 100,
  volume: 50,
  greeks: {
    delta: '-0.30',
    gamma: '0.02',
    theta: '-0.05',
    vega: '0.15',
    iv: '0.25'
  },
  timestamp: '2024-01-15T15:30:00Z'
}

beforeEach(() => {
  mockGetStockQuotes.mockReset()
  mockGetOptionSnapshots.mockReset()
  mockMarketStatus.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      marketData: {
        ...((window.api as { marketData?: unknown })?.marketData ?? {}),
        stockQuotes: mockGetStockQuotes,
        marketStatus: mockMarketStatus
      },
      getOptionSnapshots: mockGetOptionSnapshots
    }
  })
})

// [US-116] The exchange session is a market fact, so it is read from the market-data
// channel rather than from the broker's.
describe('getMarketStatus', () => {
  const MARKET_STATUS = {
    isOpen: true,
    nextOpen: '2026-09-14T13:30:00Z',
    nextClose: '2026-09-11T20:00:00Z',
    session: 'regular' as const
  }

  it('calls window.api.marketData.marketStatus()', async () => {
    mockMarketStatus.mockResolvedValue({ ok: true, status: MARKET_STATUS })

    await getMarketStatus()

    expect(mockMarketStatus).toHaveBeenCalledOnce()
  })

  it('returns the MarketStatus on ok:true', async () => {
    mockMarketStatus.mockResolvedValue({ ok: true, status: MARKET_STATUS })

    expect(await getMarketStatus()).toEqual(MARKET_STATUS)
  })

  it('throws ApiError(502) on ok:false', async () => {
    const errors = [{ field: '__root__', code: 'auth_failed', message: 'Unauthorized' }]
    mockMarketStatus.mockResolvedValue({ ok: false, errors })

    await expect(getMarketStatus()).rejects.toMatchObject({
      status: 502,
      body: { detail: errors }
    })
  })
})

describe('getStockQuotes', () => {
  it('returns the quotes record on success', async () => {
    mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: { AAPL: AAPL_QUOTE } })
    const result = await getStockQuotes(['AAPL'])
    expect(result).toEqual({ AAPL: AAPL_QUOTE })
  })

  it('throws ApiError(502) on ok:false', async () => {
    const errors = [{ field: '__root__', code: 'auth_failed', message: 'Unauthorized' }]
    mockGetStockQuotes.mockResolvedValue({ ok: false, errors })
    await expect(getStockQuotes(['AAPL'])).rejects.toMatchObject({
      status: 502,
      body: { detail: errors }
    })
  })
})

describe('getOptionSnapshots', () => {
  it('returns snapshots and unavailable:false on success', async () => {
    mockGetOptionSnapshots.mockResolvedValue({
      ok: true,
      snapshots: { AAPL260516P00180000: AAPL_OPTION_SNAPSHOT },
      unavailable: false
    })
    const result = await getOptionSnapshots(['AAPL260516P00180000'])
    expect(result).toEqual({
      snapshots: { AAPL260516P00180000: AAPL_OPTION_SNAPSHOT },
      unavailable: false
    })
  })

  it('returns empty snapshots and unavailable:true when subscription required', async () => {
    mockGetOptionSnapshots.mockResolvedValue({
      ok: true,
      snapshots: {},
      unavailable: true
    })
    const result = await getOptionSnapshots(['AAPL260516P00180000'])
    expect(result).toEqual({ snapshots: {}, unavailable: true })
  })

  it('throws ApiError(502) on ok:false (auth_failed)', async () => {
    const errors = [{ field: '__root__', code: 'auth_failed', message: 'Unauthorized' }]
    mockGetOptionSnapshots.mockResolvedValue({ ok: false, errors })
    await expect(getOptionSnapshots(['AAPL260516P00180000'])).rejects.toMatchObject({
      status: 502,
      body: { detail: errors }
    })
  })

  it('throws ApiError(502) on ok:false (network_error)', async () => {
    const errors = [{ field: '__root__', code: 'network_error', message: 'Connection refused' }]
    mockGetOptionSnapshots.mockResolvedValue({ ok: false, errors })
    await expect(getOptionSnapshots(['AAPL260516P00180000'])).rejects.toMatchObject({
      status: 502,
      body: { detail: errors }
    })
  })
})
