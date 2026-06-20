import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetch = vi.fn()

type ModuleUnderTest = typeof import('./barchart-ivr-scraper')

type HeadersLike = {
  get(name: string): string | null
  getSetCookie?: () => string[]
}

function makeHeaders(values: Record<string, string> = {}, setCookies: string[] = []): HeadersLike {
  const normalized = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])
  )

  return {
    get(name: string) {
      return normalized[name.toLowerCase()] ?? null
    },
    getSetCookie: setCookies.length > 0 ? () => setCookies : undefined
  }
}

function fetchOk(body: unknown, headers: HeadersLike = makeHeaders()): Response {
  return {
    ok: true,
    status: 200,
    headers,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  } as unknown as Response
}

function fetchErr(
  status: number,
  body: unknown = {},
  headers: HeadersLike = makeHeaders()
): Response {
  return {
    ok: false,
    status,
    headers,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
  } as unknown as Response
}

function sessionResponse(
  setCookies: string[] = ['laravel_token=session123; path=/', 'XSRF-TOKEN=abc123; path=/']
): Response {
  return fetchOk('<html></html>', makeHeaders({}, setCookies))
}

function apiBody(
  raw: Record<string, unknown> = {
    impliedVolatilityRank1y: 45.678,
    impliedVolatilityPercentile1y: 0.72,
    historicVolatility20d: 18.5
  },
  count = 1
): unknown {
  return {
    count,
    data: count === 0 ? [] : [{ baseSymbol: 'SPY', raw }]
  }
}

async function loadModule(): Promise<ModuleUnderTest> {
  vi.resetModules()
  return import('./barchart-ivr-scraper')
}

async function loadLogger(): Promise<typeof import('../logger')> {
  return import('../logger')
}

function getCallHeaders(callIndex: number): Record<string, string> {
  const init = mockFetch.mock.calls[callIndex]?.[1] as RequestInit | undefined
  return (init?.headers ?? {}) as Record<string, string>
}

function mockSessionThenApi(body: unknown = apiBody()): void {
  mockFetch.mockResolvedValueOnce(sessionResponse()).mockResolvedValueOnce(fetchOk(body))
}

function mockImmediateTimers(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
    fn()
    return 0 as unknown as ReturnType<typeof setTimeout>
  }) as typeof setTimeout)
}

describe('barchart-ivr-scraper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('IVRDataSchema', () => {
    it('rejects ivr below 0', async () => {
      const { IVRDataSchema } = await loadModule()

      const result = IVRDataSchema.safeParse({
        ticker: 'SPY',
        ivr: -1,
        observedAt: new Date().toISOString(),
        source: 'barchart'
      })

      expect(result.success).toBe(false)
    })

    it('rejects ivr above 100', async () => {
      const { IVRDataSchema } = await loadModule()

      const result = IVRDataSchema.safeParse({
        ticker: 'SPY',
        ivr: 101,
        observedAt: new Date().toISOString(),
        source: 'barchart'
      })

      expect(result.success).toBe(false)
    })

    it('rejects invalid ticker', async () => {
      const { IVRDataSchema } = await loadModule()

      const result = IVRDataSchema.safeParse({
        ticker: 'SP Y',
        ivr: 45,
        observedAt: new Date().toISOString(),
        source: 'barchart'
      })

      expect(result.success).toBe(false)
    })

    it('accepts valid payload', async () => {
      const { IVRDataSchema } = await loadModule()

      const result = IVRDataSchema.safeParse({
        ticker: 'SPY',
        ivr: 45.7,
        ivp: 81.7,
        iv30: 18.5,
        observedAt: new Date().toISOString(),
        source: 'barchart'
      })

      expect(result.success).toBe(true)
    })
  })

  describe('parseIVRResponse', () => {
    it('returns ok with ivr from impliedVolatilityRank1y', async () => {
      const { parseIVRResponse } = await loadModule()

      const result = parseIVRResponse('SPY', apiBody())

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.data.ivr).toBe(45.7)
      }
    })

    it('ivr rounded to 1 decimal place', async () => {
      const { parseIVRResponse } = await loadModule()

      const result = parseIVRResponse(
        'SPY',
        apiBody({ impliedVolatilityRank1y: 67.333, impliedVolatilityPercentile1y: 0.72 })
      )

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.data.ivr).toBe(67.3)
      }
    })

    it('ivp is impliedVolatilityPercentile1y times 100, rounded to 1 dp', async () => {
      const { parseIVRResponse } = await loadModule()

      const result = parseIVRResponse(
        'SPY',
        apiBody({ impliedVolatilityRank1y: 45.678, impliedVolatilityPercentile1y: 0.81673 })
      )

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.data.ivp).toBe(81.7)
      }
    })

    it('iv30 is historicVolatility20d when present', async () => {
      const { parseIVRResponse } = await loadModule()

      const result = parseIVRResponse('SPY', apiBody())

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.data.iv30).toBe(18.5)
      }
    })

    it('ivp absent when impliedVolatilityPercentile1y is null', async () => {
      const { parseIVRResponse } = await loadModule()

      const result = parseIVRResponse(
        'SPY',
        apiBody({ impliedVolatilityRank1y: 45.678, impliedVolatilityPercentile1y: null })
      )

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.data.ivp).toBeUndefined()
      }
    })

    it('returns not_available when count is 0', async () => {
      const { parseIVRResponse } = await loadModule()

      const result = parseIVRResponse('ILLIQUID', apiBody({}, 0))

      expect(result).toMatchObject({
        status: 'not_available',
        error: {
          code: 'TICKER_NOT_COVERED'
        }
      })
      if (result.status === 'not_available') {
        expect(result.error.message).toContain('ILLIQUID')
      }
    })

    it('returns parse_error when impliedVolatilityRank1y missing', async () => {
      const { parseIVRResponse } = await loadModule()

      const result = parseIVRResponse('SPY', apiBody({}))

      expect(result).toMatchObject({
        status: 'parse_error',
        error: {
          code: 'PARSE_FAILED'
        }
      })
      if (result.status === 'parse_error') {
        expect(result.error.message).toContain('impliedVolatilityRank1y')
      }
    })

    it('parse_error rawSnippet is first 500 chars of serialised data[0]', async () => {
      const { parseIVRResponse } = await loadModule()

      const result = parseIVRResponse('SPY', apiBody({ description: 'x'.repeat(1000) }))

      expect(result.status).toBe('parse_error')
      if (result.status === 'parse_error') {
        expect(result.error.rawSnippet.length).toBeLessThanOrEqual(500)
      }
    })

    it('parse_error emits WARN log', async () => {
      const { parseIVRResponse } = await loadModule()
      const { logger } = await loadLogger()
      const warnSpy = vi.spyOn(logger, 'warn')

      parseIVRResponse('SPY', apiBody({}))

      expect(warnSpy).toHaveBeenCalledOnce()
    })
  })

  describe('fetchIVR', () => {
    it('invalid ticker empty string', async () => {
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('')

      expect(result).toEqual({
        status: 'invalid_input',
        error: { code: 'INVALID_TICKER' }
      })
    })

    it('invalid ticker non-alphanumeric', async () => {
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SP-Y')

      expect(result).toEqual({
        status: 'invalid_input',
        error: { code: 'INVALID_TICKER' }
      })
    })

    it('invalid ticker too long', async () => {
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('ABCDEF')

      expect(result).toEqual({
        status: 'invalid_input',
        error: { code: 'INVALID_TICKER' }
      })
    })

    it('does not issue network request for invalid ticker', async () => {
      const { fetchIVR } = await loadModule()

      await fetchIVR('SP-Y')

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('acquires session by fetching a Barchart page on first call', async () => {
      mockSessionThenApi()
      const { fetchIVR } = await loadModule()

      await fetchIVR('SPY')

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch.mock.calls[0][0]).toContain('barchart.com')
      expect(mockFetch.mock.calls[1][0]).toContain('/proxies/core-api/v1/options/get')
    })

    it('sends X-XSRF-TOKEN header derived from Set-Cookie', async () => {
      mockFetch
        .mockResolvedValueOnce(sessionResponse(['XSRF-TOKEN=abc123; path=/', 'foo=bar; path=/']))
        .mockResolvedValueOnce(fetchOk(apiBody()))
      const { fetchIVR } = await loadModule()

      await fetchIVR('SPY')

      expect(getCallHeaders(1)['X-XSRF-TOKEN']).toBe('abc123')
    })

    it('sends Cookie header from session', async () => {
      mockSessionThenApi()
      const { fetchIVR } = await loadModule()

      await fetchIVR('SPY')

      expect(getCallHeaders(1).Cookie).toContain('laravel_token=session123')
      expect(getCallHeaders(1).Cookie).toContain('XSRF-TOKEN=abc123')
    })

    it('reuses cached session on second call', async () => {
      mockFetch
        .mockResolvedValueOnce(sessionResponse())
        .mockResolvedValueOnce(fetchOk(apiBody()))
        .mockResolvedValueOnce(fetchOk(apiBody()))
      const { fetchIVR } = await loadModule()

      await fetchIVR('SPY')
      await fetchIVR('AAPL')

      const sessionCalls = mockFetch.mock.calls.filter((call) =>
        String(call[0]).includes('/stocks/quotes/SPY/options')
      )
      expect(sessionCalls).toHaveLength(1)
    })

    it('User-Agent header includes Wheelbase version', async () => {
      mockSessionThenApi()
      const { USER_AGENT, fetchIVR } = await loadModule()

      await fetchIVR('SPY')

      expect(USER_AGENT.startsWith('Wheelbase/')).toBe(true)
      expect(getCallHeaders(0)['User-Agent']).toBe(USER_AGENT)
      expect(getCallHeaders(1)['User-Agent']).toBe(USER_AGENT)
    })

    it('network_error on 5xx after 2 retries', async () => {
      const timeoutSpy = mockImmediateTimers()
      mockFetch
        .mockResolvedValueOnce(sessionResponse())
        .mockResolvedValueOnce(fetchErr(503))
        .mockResolvedValueOnce(fetchErr(503))
        .mockResolvedValueOnce(fetchErr(503))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result).toMatchObject({
        status: 'network_error',
        error: { code: 'NETWORK_FAILURE' }
      })
      if (result.status === 'network_error') {
        expect(result.error.message).toContain('503')
      }
      expect(mockFetch).toHaveBeenCalledTimes(4)
      expect(timeoutSpy).toHaveBeenCalled()
    })

    it('network_error when fetch throws network failure', async () => {
      mockImmediateTimers()
      mockFetch
        .mockResolvedValueOnce(sessionResponse())
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(new TypeError('fetch failed'))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result).toMatchObject({
        status: 'network_error',
        error: { code: 'NETWORK_FAILURE' }
      })
      expect(mockFetch).toHaveBeenCalledTimes(4)
    })

    it('retries use exponential backoff', async () => {
      const timeoutSpy = mockImmediateTimers()
      mockFetch
        .mockResolvedValueOnce(sessionResponse())
        .mockResolvedValueOnce(fetchErr(503))
        .mockResolvedValueOnce(fetchErr(503))
        .mockResolvedValueOnce(fetchOk(apiBody()))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result.status).toBe('ok')
      expect(timeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('rate_limited on 429 fetch called exactly once for API', async () => {
      mockFetch.mockResolvedValueOnce(sessionResponse()).mockResolvedValueOnce(fetchErr(429))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result).toMatchObject({
        status: 'rate_limited',
        error: { code: 'RATE_LIMITED' }
      })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('rate_limited message includes Retry-After when header present', async () => {
      mockFetch
        .mockResolvedValueOnce(sessionResponse())
        .mockResolvedValueOnce(fetchErr(429, {}, makeHeaders({ 'Retry-After': '60' })))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result.status).toBe('rate_limited')
      if (result.status === 'rate_limited') {
        expect(result.error.message).toContain('60')
      }
    })

    it('ok result for SPY', async () => {
      mockSessionThenApi()
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.data.ticker).toBe('SPY')
        expect(result.data.source).toBe('barchart')
        expect(typeof result.data.ivr).toBe('number')
      }
    })

    it('accepts lowercase ticker, upcases it in request URL and result', async () => {
      mockSessionThenApi()
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('spy')

      expect(String(mockFetch.mock.calls[1][0])).toContain('baseSymbol=SPY')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.data.ticker).toBe('SPY')
      }
    })

    it('observedAt is valid ISO-8601', async () => {
      mockSessionThenApi()
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(new Date(result.data.observedAt).toISOString()).toBe(result.data.observedAt)
      }
    })

    it('not_available propagated from parser', async () => {
      mockFetch
        .mockResolvedValueOnce(sessionResponse())
        .mockResolvedValueOnce(fetchOk(apiBody({}, 0)))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result.status).toBe('not_available')
    })

    it('parse_error propagated from parser', async () => {
      mockSessionThenApi(apiBody({}))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result.status).toBe('parse_error')
    })

    it('network_error propagated from fetch helper', async () => {
      mockImmediateTimers()
      mockFetch
        .mockResolvedValueOnce(sessionResponse())
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(new TypeError('fetch failed'))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result.status).toBe('network_error')
    })

    it('rate_limited propagated from fetch helper', async () => {
      mockFetch.mockResolvedValueOnce(sessionResponse()).mockResolvedValueOnce(fetchErr(429))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result.status).toBe('rate_limited')
    })

    it('logs INFO on ok result', async () => {
      mockSessionThenApi()
      const { fetchIVR } = await loadModule()
      const { logger } = await loadLogger()
      const infoSpy = vi.spyOn(logger, 'info')

      const result = await fetchIVR('SPY')

      expect(result.status).toBe('ok')
      expect(infoSpy).toHaveBeenCalled()
    })
  })

  describe('fetchIVR — AC coverage', () => {
    it('AC: Scrape IVR for a covered ticker — returns ok with ivr, ivp, observedAt, source', async () => {
      mockSessionThenApi()
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.data.ivr).toBeGreaterThanOrEqual(0)
        expect(result.data.ivr).toBeLessThanOrEqual(100)
        expect(result.data.ivp).toBeGreaterThanOrEqual(0)
        expect(result.data.ivp).toBeLessThanOrEqual(100)
        expect(result.data.source).toBe('barchart')
        expect(result.data.ticker).toBe('SPY')
        expect(new Date(result.data.observedAt).toISOString()).toBe(result.data.observedAt)
      }
    })

    it('AC: ivr is rounded to one decimal place', async () => {
      mockFetch
        .mockResolvedValueOnce(sessionResponse())
        .mockResolvedValueOnce(
          fetchOk(apiBody({ impliedVolatilityRank1y: 67.333, impliedVolatilityPercentile1y: 0.5 }))
        )
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.data.ivr).toBe(67.3)
      }
    })

    it('AC: Ticker not covered — returns not_available with TICKER_NOT_COVERED', async () => {
      mockFetch
        .mockResolvedValueOnce(sessionResponse())
        .mockResolvedValueOnce(fetchOk(apiBody({}, 0)))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('ZZZZZ')

      expect(result).toMatchObject({
        status: 'not_available',
        error: { code: 'TICKER_NOT_COVERED' }
      })
    })

    it('AC: Response fields missing — returns parse_error with PARSE_FAILED', async () => {
      mockSessionThenApi(apiBody({}))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result).toMatchObject({
        status: 'parse_error',
        error: { code: 'PARSE_FAILED' }
      })
      if (result.status === 'parse_error') {
        expect(result.error.message).toContain('impliedVolatilityRank1y')
        expect(result.error.rawSnippet.length).toBeLessThanOrEqual(500)
      }
    })

    it('AC: Response fields missing — emits WARN log', async () => {
      mockSessionThenApi(apiBody({}))
      const { fetchIVR } = await loadModule()
      const { logger } = await loadLogger()
      const warnSpy = vi.spyOn(logger, 'warn')

      await fetchIVR('SPY')

      expect(warnSpy).toHaveBeenCalled()
    })

    it('AC: Network failure — returns network_error after 2 retries', async () => {
      mockImmediateTimers()
      mockFetch
        .mockResolvedValueOnce(sessionResponse())
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(new TypeError('fetch failed'))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result).toMatchObject({
        status: 'network_error',
        error: { code: 'NETWORK_FAILURE' }
      })
    })

    it('AC: Rate limit HTTP 429 — returns rate_limited, no retry', async () => {
      mockFetch.mockResolvedValueOnce(sessionResponse()).mockResolvedValueOnce(fetchErr(429))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result).toMatchObject({
        status: 'rate_limited',
        error: { code: 'RATE_LIMITED' }
      })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('AC: Rate limit HTTP 429 — message includes Retry-After if present', async () => {
      mockFetch
        .mockResolvedValueOnce(sessionResponse())
        .mockResolvedValueOnce(fetchErr(429, {}, makeHeaders({ 'Retry-After': '120' })))
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SPY')

      expect(result.status).toBe('rate_limited')
      if (result.status === 'rate_limited') {
        expect(result.error.message).toContain('120')
      }
    })

    it('AC: Request identifies a polite user agent', async () => {
      mockSessionThenApi()
      const { fetchIVR } = await loadModule()

      await fetchIVR('SPY')

      expect(getCallHeaders(1)['User-Agent']).toMatch(/^Wheelbase\//)
    })

    it('AC: Invalid input — empty ticker returns invalid_input without network request', async () => {
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('')

      expect(result).toEqual({
        status: 'invalid_input',
        error: { code: 'INVALID_TICKER' }
      })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('AC: Invalid input — non-alphanumeric ticker returns invalid_input', async () => {
      const { fetchIVR } = await loadModule()

      const result = await fetchIVR('SP-Y')

      expect(result).toEqual({
        status: 'invalid_input',
        error: { code: 'INVALID_TICKER' }
      })
    })
  })
})
