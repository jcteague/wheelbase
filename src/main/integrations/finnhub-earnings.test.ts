import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeSpyLogger } from '../test-utils'
import { clearEarningsCache, fetchNextEarningsDates } from './finnhub-earnings'

const mockFetch = vi.fn()

// Pinned "now": 2026-08-01 local time.
// from = now - 7 days = 2026-07-25, to = now + 30 days = 2026-08-31.
const NOW = new Date(2026, 7, 1, 12, 0, 0)

function calendarBody(dates: string[], symbol = 'NVDA'): unknown {
  return {
    earningsCalendar: dates.map((date) => ({ date, symbol }))
  }
}

function fetchOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body)
  } as unknown as Response
}

function fetchErr(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({})
  } as unknown as Response
}

function requestUrl(callIndex: number): string {
  return String(mockFetch.mock.calls[callIndex]?.[0])
}

describe('finnhub-earnings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    process.env.FINNHUB_API_KEY = 'test-key'
    clearEarningsCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.FINNHUB_API_KEY
  })

  describe('fetchNextEarningsDates — happy path', () => {
    it('resolves ticker to its upcoming earnings date', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
      const logger = makeSpyLogger()

      const result = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: '2026-08-14' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('request URL contains symbol, from (now - 7d), to (now + 30d) and token', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
      const logger = makeSpyLogger()

      await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })

      const url = requestUrl(0)
      expect(url).toContain('https://finnhub.io/api/v1/calendar/earnings')
      expect(url).toContain('symbol=NVDA')
      expect(url).toContain('from=2026-07-25')
      expect(url).toContain('to=2026-08-31')
      expect(url).toContain('token=test-key')
    })

    it('dedupes and uppercases tickers', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
      const logger = makeSpyLogger()

      const result = await fetchNextEarningsDates(['nvda', 'NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: '2026-08-14' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(requestUrl(0)).toContain('symbol=NVDA')
    })

    it('returns {} for an empty ticker list without fetching', async () => {
      const logger = makeSpyLogger()

      const result = await fetchNextEarningsDates([], { now: NOW, logger })

      expect(result).toEqual({})
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('event selection', () => {
    it('picks the earliest upcoming date when past and upcoming events exist', async () => {
      mockFetch.mockResolvedValueOnce(
        fetchOk(calendarBody(['2026-08-20', '2026-07-28', '2026-08-14']))
      )
      const logger = makeSpyLogger()

      const result = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: '2026-08-14' })
    })

    it('picks the most recent past date when only past events exist', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody(['2026-07-20', '2026-07-28'])))
      const logger = makeSpyLogger()

      const result = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: '2026-07-28' })
    })

    it('ignores rows with a null date instead of letting them displace a valid past date', async () => {
      mockFetch.mockResolvedValueOnce(
        fetchOk({
          earningsCalendar: [
            { date: null, symbol: 'NVDA' },
            { date: '2026-07-28', symbol: 'NVDA' }
          ]
        })
      )
      const logger = makeSpyLogger()

      const result = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: '2026-07-28' })
    })

    it('ignores rows whose date is not a YYYY-MM-DD string', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody(['TBD', '2026-08-14'])))
      const logger = makeSpyLogger()

      const result = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: '2026-08-14' })
    })
  })

  describe('empty calendar', () => {
    it('omits the ticker from the result', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody([])))
      const logger = makeSpyLogger()

      const result = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({})
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'NVDA' }),
        'earnings_no_event_in_window'
      )
    })

    it('caches the negative result — no new fetch within TTL', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody([])))
      const logger = makeSpyLogger()

      await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })
      const second = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })

      expect(second).toEqual({})
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('cache', () => {
    it('serves a second call for the same ticker from cache within 12h', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
      const logger = makeSpyLogger()

      const first = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })
      const second = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })

      expect(first).toEqual({ NVDA: '2026-08-14' })
      expect(second).toEqual({ NVDA: '2026-08-14' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('refetches after the 12h TTL has elapsed', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
        .mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-15'])))
      const logger = makeSpyLogger()
      const later = new Date(NOW.getTime() + 12 * 60 * 60 * 1000 + 1)

      await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })
      const second = await fetchNextEarningsDates(['NVDA'], { now: later, logger })

      expect(second).toEqual({ NVDA: '2026-08-15' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('clearEarningsCache forces a refetch', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
        .mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
      const logger = makeSpyLogger()

      await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })
      clearEarningsCache()
      await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('per-ticker failure isolation', () => {
    it('returns the healthy ticker when another ticker fetch rejects', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (String(url).includes('symbol=NVDA')) {
          return Promise.resolve(fetchOk(calendarBody(['2026-08-14'])))
        }
        return Promise.reject(new TypeError('fetch failed'))
      })
      const logger = makeSpyLogger()

      const result = await fetchNextEarningsDates(['NVDA', 'AAPL'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: '2026-08-14' })
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'AAPL', code: 'network_error' }),
        'earnings_fetch_failed'
      )
    })

    it('omits the ticker on HTTP 429 with WARN code rate_limited, without throwing', async () => {
      mockFetch.mockResolvedValueOnce(fetchErr(429))
      const logger = makeSpyLogger()

      const result = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({})
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'NVDA', code: 'rate_limited' }),
        'earnings_fetch_failed'
      )
    })

    it('omits the ticker on HTTP 401 with WARN code auth_failed, without throwing', async () => {
      mockFetch.mockResolvedValueOnce(fetchErr(401))
      const logger = makeSpyLogger()

      const result = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({})
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'NVDA', code: 'auth_failed' }),
        'earnings_fetch_failed'
      )
    })

    it('caches a failed ticker for the failure TTL — a rate-limited symbol is not re-hammered', async () => {
      mockFetch.mockResolvedValueOnce(fetchErr(429))
      const logger = makeSpyLogger()

      const first = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })
      // One scheduler tick (60s) later, still inside the failure TTL.
      const oneTickLater = new Date(NOW.getTime() + 60 * 1000)
      const second = await fetchNextEarningsDates(['NVDA'], { now: oneTickLater, logger })

      expect(first).toEqual({})
      expect(second).toEqual({})
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('refetches a failed ticker after the 5-minute failure TTL elapses', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchErr(429))
        .mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
      const logger = makeSpyLogger()
      const afterFailureTtl = new Date(NOW.getTime() + 5 * 60 * 1000 + 1)

      const first = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })
      const second = await fetchNextEarningsDates(['NVDA'], { now: afterFailureTtl, logger })

      expect(first).toEqual({})
      expect(second).toEqual({ NVDA: '2026-08-14' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('missing API key', () => {
    it('returns {} immediately with a single WARN and zero fetch calls', async () => {
      delete process.env.FINNHUB_API_KEY
      const logger = makeSpyLogger()

      const result = await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({})
      expect(mockFetch).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.warn).toHaveBeenCalledWith('earnings_fetch_no_api_key')
    })

    it('warns only once per process across repeated calls', async () => {
      delete process.env.FINNHUB_API_KEY
      const logger = makeSpyLogger()

      await fetchNextEarningsDates(['NVDA'], { now: NOW, logger })
      await fetchNextEarningsDates(['AAPL'], { now: NOW, logger })

      expect(logger.warn).toHaveBeenCalledTimes(1)
    })
  })
})
