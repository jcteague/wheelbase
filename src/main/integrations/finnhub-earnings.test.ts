import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeSpyLogger } from '../test-utils'
import { fetchEarningsCalendar, resetEarningsFeedState } from './finnhub-earnings'

const mockFetch = vi.fn()

// Pinned "now": 2026-08-01 local time.
// from = now - 30 days = 2026-07-02, to = now + 30 days = 2026-08-31.
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
    resetEarningsFeedState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.FINNHUB_API_KEY
  })

  describe('fetchEarningsCalendar — happy path', () => {
    it('resolves ticker to a calendar carrying its upcoming earnings date', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: { status: 'read', next: '2026-08-14', last: null } })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('request URL contains symbol, from (now - 30d), to (now + 30d) and token', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
      const logger = makeSpyLogger()

      await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      const url = requestUrl(0)
      expect(url).toContain('https://finnhub.io/api/v1/calendar/earnings')
      expect(url).toContain('symbol=NVDA')
      expect(url).toContain('from=2026-07-02')
      expect(url).toContain('to=2026-08-31')
      expect(url).toContain('token=test-key')
    })

    it('dedupes and uppercases tickers', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar(['nvda', 'NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: { status: 'read', next: '2026-08-14', last: null } })
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(requestUrl(0)).toContain('symbol=NVDA')
    })

    it('returns {} for an empty ticker list without fetching', async () => {
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar([], { now: NOW, logger })

      expect(result).toEqual({})
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('fetchEarningsCalendar — split history and next print', () => {
    it('selects the earliest next and latest past date independently', async () => {
      mockFetch.mockResolvedValueOnce(
        fetchOk(calendarBody(['2026-08-20', '2026-07-10', '2026-07-31', '2026-08-14']))
      )

      const result = await fetchEarningsCalendar(['NVDA'], { now: NOW })

      expect(result).toEqual({
        NVDA: { status: 'read', next: '2026-08-14', last: '2026-07-31' }
      })
      expect(requestUrl(0)).toContain('from=2026-07-02')
    })

    it('keeps today as next and excludes invalid or out-of-window dates', async () => {
      mockFetch.mockResolvedValueOnce(
        fetchOk(
          calendarBody([
            '2026-08-01',
            '2026-07-02',
            '2026-07-01',
            '2026-09-01',
            '2026-02-30',
            'TBD'
          ])
        )
      )

      const result = await fetchEarningsCalendar(['NVDA'], { now: NOW })

      expect(result).toEqual({
        NVDA: { status: 'read', next: '2026-08-01', last: '2026-07-02' }
      })
    })

    it('isolates a failed ticker while returning successful calendar knowledge', async () => {
      mockFetch.mockImplementation((url: string) =>
        String(url).includes('symbol=KO')
          ? Promise.reject(new TypeError('fetch failed'))
          : Promise.resolve(fetchOk(calendarBody(['2026-08-14', '2026-07-31'])))
      )

      const result = await fetchEarningsCalendar(['NVDA', 'KO'], { now: NOW })

      expect(result.NVDA).toEqual({ status: 'read', next: '2026-08-14', last: '2026-07-31' })
      expect(result.KO).toEqual({ status: 'unavailable' })
    })
  })

  describe('lookahead window', () => {
    it('lookaheadDays: 50 puts `to` 50 days past now', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody(['2026-09-07'])))
      const logger = makeSpyLogger()

      await fetchEarningsCalendar(['NVDA'], { now: NOW, logger, lookaheadDays: 50 })

      expect(requestUrl(0)).toContain('to=2026-09-20')
    })

    it('defaults `to` to 30 days past now when lookaheadDays is omitted', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
      const logger = makeSpyLogger()

      await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      expect(requestUrl(0)).toContain('to=2026-08-31')
    })

    it('returns an event beyond the default 30-day horizon when the lookahead is widened', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody(['2026-09-07'])))
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger, lookaheadDays: 50 })

      expect(result).toEqual({ NVDA: { status: 'read', next: '2026-09-07', last: null } })
    })
  })

  describe('event selection', () => {
    it('reports the most recent past date as last when only past events exist', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody(['2026-07-20', '2026-07-28'])))
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: { status: 'read', next: null, last: '2026-07-28' } })
    })

    it('ignores rows with a null date instead of letting them displace a valid date', async () => {
      mockFetch.mockResolvedValueOnce(
        fetchOk({
          earningsCalendar: [
            { date: null, symbol: 'NVDA' },
            { date: '2026-07-28', symbol: 'NVDA' }
          ]
        })
      )
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: { status: 'read', next: null, last: '2026-07-28' } })
    })
  })

  describe('empty calendar — an empty read, not a missing key', () => {
    it('returns an empty read for an empty earningsCalendar array', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(calendarBody([])))
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: { status: 'read', next: null, last: null } })
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'NVDA' }),
        'earnings_no_event_in_window'
      )
    })

    it('returns an empty read when every row has a null or malformed date', async () => {
      mockFetch.mockResolvedValueOnce(
        fetchOk({
          earningsCalendar: [
            { date: null, symbol: 'NVDA' },
            { date: 'TBD', symbol: 'NVDA' }
          ]
        })
      )
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: { status: 'read', next: null, last: null } })
    })
  })

  describe('no success caching — freshness is the store’s job', () => {
    it('issues an HTTP request on both of two successive calls for the same ticker', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
        .mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-15'])))
      const logger = makeSpyLogger()

      const first = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })
      const second = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      expect(first).toEqual({ NVDA: { status: 'read', next: '2026-08-14', last: null } })
      expect(second).toEqual({ NVDA: { status: 'read', next: '2026-08-15', last: null } })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('does not cache an empty answer either', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchOk(calendarBody([])))
        .mockResolvedValueOnce(fetchOk(calendarBody([])))
      const logger = makeSpyLogger()

      await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })
      await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('every requested ticker gets an entry', () => {
    it('returns one entry per requested ticker on a mixed dated/empty/failed batch', async () => {
      mockFetch.mockImplementation((url: string) => {
        const target = String(url)
        if (target.includes('symbol=NVDA')) {
          return Promise.resolve(fetchOk(calendarBody(['2026-08-14'])))
        }
        if (target.includes('symbol=KO')) return Promise.resolve(fetchOk(calendarBody([])))
        return Promise.resolve(fetchErr(429))
      })
      const logger = makeSpyLogger()
      const tickers = ['NVDA', 'KO', 'AAPL']

      const result = await fetchEarningsCalendar(tickers, { now: NOW, logger })

      expect(Object.keys(result)).toHaveLength(tickers.length)
      expect(result).toEqual({
        NVDA: { status: 'read', next: '2026-08-14', last: null },
        KO: { status: 'read', next: null, last: null },
        AAPL: { status: 'unavailable' }
      })
    })
  })

  describe('per-ticker failure isolation', () => {
    it('never rejects — one ticker throwing leaves every other ticker’s result intact', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (String(url).includes('symbol=AAPL')) {
          return Promise.reject(new TypeError('fetch failed'))
        }
        return Promise.resolve(fetchOk(calendarBody(['2026-08-14'])))
      })
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar(['NVDA', 'AAPL', 'KO'], { now: NOW, logger })

      expect(result).toEqual({
        NVDA: { status: 'read', next: '2026-08-14', last: null },
        AAPL: { status: 'unavailable' },
        KO: { status: 'read', next: '2026-08-14', last: null }
      })
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'AAPL', code: 'network_error' }),
        'earnings_fetch_failed'
      )
    })

    it('returns unavailable on HTTP 429 with WARN code rate_limited, without throwing', async () => {
      mockFetch.mockResolvedValueOnce(fetchErr(429))
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: { status: 'unavailable' } })
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'NVDA', code: 'rate_limited' }),
        'earnings_fetch_failed'
      )
    })

    it('returns unavailable on HTTP 401 with WARN code auth_failed, without throwing', async () => {
      mockFetch.mockResolvedValueOnce(fetchErr(401))
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: { status: 'unavailable' } })
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'NVDA', code: 'auth_failed' }),
        'earnings_fetch_failed'
      )
    })

    it('returns unavailable on a thrown network error with WARN code network_error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: { status: 'unavailable' } })
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'NVDA', code: 'network_error' }),
        'earnings_fetch_failed'
      )
    })

    it('caches a failed ticker for the failure TTL — a rate-limited symbol is not re-hammered', async () => {
      mockFetch.mockResolvedValueOnce(fetchErr(429))
      const logger = makeSpyLogger()

      const first = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })
      // One scheduler tick (60s) later, still inside the failure TTL.
      const oneTickLater = new Date(NOW.getTime() + 60 * 1000)
      const second = await fetchEarningsCalendar(['NVDA'], { now: oneTickLater, logger })

      expect(first).toEqual({ NVDA: { status: 'unavailable' } })
      expect(second).toEqual({ NVDA: { status: 'unavailable' } })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('writes the negative cache entry for a rate-limited ticker inside a capped batch', async () => {
      mockFetch.mockImplementation((url: string) =>
        String(url).includes('symbol=AAPL')
          ? Promise.resolve(fetchErr(429))
          : Promise.resolve(fetchOk(calendarBody(['2026-08-14'])))
      )
      const logger = makeSpyLogger()
      const batch = ['NVDA', 'AAPL', 'KO', 'MSFT', 'TSLA', 'AMD']

      await fetchEarningsCalendar(batch, { now: NOW, logger })
      const callsAfterFirstBatch = mockFetch.mock.calls.length
      const retry = await fetchEarningsCalendar(['AAPL'], { now: NOW, logger })

      expect(retry).toEqual({ AAPL: { status: 'unavailable' } })
      expect(mockFetch).toHaveBeenCalledTimes(callsAfterFirstBatch)
    })

    it('refetches a failed ticker after the 5-minute failure TTL elapses', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchErr(429))
        .mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
      const logger = makeSpyLogger()
      const afterFailureTtl = new Date(NOW.getTime() + 5 * 60 * 1000 + 1)

      const first = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })
      const second = await fetchEarningsCalendar(['NVDA'], { now: afterFailureTtl, logger })

      expect(first).toEqual({ NVDA: { status: 'unavailable' } })
      expect(second).toEqual({ NVDA: { status: 'read', next: '2026-08-14', last: null } })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('returns unavailable when the body is missing its earningsCalendar array', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk({ notACalendar: true }))
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      expect(result).toEqual({ NVDA: { status: 'unavailable' } })
    })
  })

  describe('missing API key', () => {
    it('returns unavailable for every requested ticker with a single WARN and zero fetch calls', async () => {
      delete process.env.FINNHUB_API_KEY
      const logger = makeSpyLogger()

      const result = await fetchEarningsCalendar(['NVDA', 'AAPL'], { now: NOW, logger })

      expect(result).toEqual({
        NVDA: { status: 'unavailable' },
        AAPL: { status: 'unavailable' }
      })
      expect(mockFetch).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.warn).toHaveBeenCalledWith('earnings_fetch_no_api_key')
    })

    it('warns only once per process across repeated calls', async () => {
      delete process.env.FINNHUB_API_KEY
      const logger = makeSpyLogger()

      await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })
      await fetchEarningsCalendar(['AAPL'], { now: NOW, logger })

      expect(logger.warn).toHaveBeenCalledTimes(1)
    })
  })

  describe('resetEarningsFeedState', () => {
    it('clears the failure backoff so a failed ticker is retried immediately', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchErr(429))
        .mockResolvedValueOnce(fetchOk(calendarBody(['2026-08-14'])))
      const logger = makeSpyLogger()

      await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })
      resetEarningsFeedState()
      const second = await fetchEarningsCalendar(['NVDA'], { now: NOW, logger })

      expect(second).toEqual({ NVDA: { status: 'read', next: '2026-08-14', last: null } })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
