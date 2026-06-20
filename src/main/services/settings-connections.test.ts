import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testAlpacaConnection, testMassiveConnection } from './settings-connections'

const mockFetch = vi.fn()

function fetchOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  } as unknown as Response
}

function fetchErr(status: number, body = ''): Response {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body)
  } as unknown as Response
}

describe('settings connection probes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('testMassiveConnection', () => {
    it('calls the fixed AAPL reference probe with the shared configured app key', async () => {
      mockFetch.mockResolvedValue(fetchOk({ ticker: 'AAPL' }))

      const result = await testMassiveConnection({
        loadMassiveApiKey: () => 'shared-massive-key'
      })

      expect(result).toEqual({ ok: true, vendor: 'massive', status: 'connected' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('/v3/reference/tickers/AAPL')
      expect(url).not.toContain('MSFT')
      expect(init.headers).toMatchObject({ Authorization: 'Bearer shared-massive-key' })
    })

    it('maps Massive HTTP 401 to Authentication failed (401)', async () => {
      mockFetch.mockResolvedValue(fetchErr(401, 'Unauthorized'))

      await expect(
        testMassiveConnection({ loadMassiveApiKey: () => 'shared-massive-key' })
      ).resolves.toEqual({
        ok: false,
        errorCode: 'auth_failed',
        message: 'Authentication failed (401)'
      })
    })

    it('maps Massive HTTP 429 to Rate limited — please try again', async () => {
      mockFetch.mockResolvedValue(fetchErr(429, 'Too Many Requests'))

      await expect(
        testMassiveConnection({ loadMassiveApiKey: () => 'shared-massive-key' })
      ).resolves.toEqual({
        ok: false,
        errorCode: 'rate_limited',
        message: 'Rate limited — please try again'
      })
    })
  })

  describe('testAlpacaConnection', () => {
    it('calls the paper account endpoint for paper credentials', async () => {
      mockFetch.mockResolvedValue(
        fetchOk({
          account_number: 'PA12345ABC',
          buying_power: '10000.00',
          cash: '5000.00',
          portfolio_value: '50000.00'
        })
      )

      const result = await testAlpacaConnection({
        environment: 'paper',
        keyId: ' PKPAPER123 ',
        secret: ' paper-secret '
      })

      expect(result).toEqual({
        ok: true,
        vendor: 'alpaca',
        environment: 'paper',
        accountNumberMasked: 'PA…ABC'
      })
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://paper-api.alpaca.markets/v2/account')
      expect(init.headers).toMatchObject({
        'APCA-API-KEY-ID': 'PKPAPER123',
        'APCA-API-SECRET-KEY': 'paper-secret'
      })
    })

    it('calls the live account endpoint for live credentials', async () => {
      mockFetch.mockResolvedValue(fetchOk({ account_number: 'AL12345XYZ' }))

      await testAlpacaConnection({
        environment: 'live',
        keyId: 'AKLIVE456',
        secret: 'live-secret'
      })

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.alpaca.markets/v2/account')
    })

    it('does not import activities during an Alpaca test connection', async () => {
      mockFetch.mockResolvedValue(fetchOk({ account_number: 'PA12345ABC' }))

      await testAlpacaConnection({
        environment: 'paper',
        keyId: 'PKPAPER123',
        secret: 'paper-secret'
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch.mock.calls[0][0]).toBe('https://paper-api.alpaca.markets/v2/account')
    })

    it('maps live keys submitted to the Paper card to the exact environment mismatch message', async () => {
      mockFetch.mockResolvedValue(fetchErr(401, 'Unauthorized'))

      await expect(
        testAlpacaConnection({
          environment: 'paper',
          keyId: 'AKLIVE456',
          secret: 'live-secret'
        })
      ).resolves.toEqual({
        ok: false,
        errorCode: 'environment_mismatch',
        message: 'Environment mismatch — these are LIVE keys, not paper keys'
      })
    })

    it('maps paper keys submitted to the Live card to the exact environment mismatch message', async () => {
      mockFetch.mockResolvedValue(fetchErr(401, 'Unauthorized'))

      await expect(
        testAlpacaConnection({
          environment: 'live',
          keyId: 'PKPAPER123',
          secret: 'paper-secret'
        })
      ).resolves.toEqual({
        ok: false,
        errorCode: 'environment_mismatch',
        message: 'Environment mismatch — these are PAPER keys, not live keys'
      })
    })
  })
})
