import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStockQuotes, getMarketStatus } from './market-data'

const mockGetStockQuotes = vi.fn()
const mockGetMarketStatus = vi.fn()

const AAPL_QUOTE = {
  price: '182.45',
  bid: '182.44',
  ask: '182.46',
  prevClose: '181.00',
  volume: 1000,
  timestamp: '2024-01-15T15:30:00Z'
}

const MARKET_STATUS = {
  isOpen: true,
  nextOpen: '2024-01-15T14:30:00Z',
  nextClose: '2024-01-15T21:00:00Z',
  session: 'regular' as const
}

beforeEach(() => {
  mockGetStockQuotes.mockReset()
  mockGetMarketStatus.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      getStockQuotes: mockGetStockQuotes,
      getMarketStatus: mockGetMarketStatus
    }
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

describe('getMarketStatus', () => {
  it('returns the status on success', async () => {
    mockGetMarketStatus.mockResolvedValue({ ok: true, status: MARKET_STATUS })
    const result = await getMarketStatus()
    expect(result).toEqual(MARKET_STATUS)
    expect(result.session).toBe('regular')
  })

  it('throws ApiError(502) on ok:false', async () => {
    const errors = [{ field: '__root__', code: 'network_error', message: 'Connection refused' }]
    mockGetMarketStatus.mockResolvedValue({ ok: false, errors })
    await expect(getMarketStatus()).rejects.toMatchObject({
      status: 502,
      body: { detail: errors }
    })
  })
})
