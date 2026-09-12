import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testAlpacaConnection } from './settings-connections'

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

    it('reports the fetch failure message as a network_error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(
        testAlpacaConnection({ environment: 'paper', keyId: 'PKPAPER123', secret: 'paper-secret' })
      ).resolves.toEqual({ ok: false, errorCode: 'network_error', message: 'ECONNREFUSED' })
    })

    it('falls back to a generic network_error message for non-Error rejections', async () => {
      mockFetch.mockRejectedValue('socket hang up')

      await expect(
        testAlpacaConnection({ environment: 'paper', keyId: 'PKPAPER123', secret: 'paper-secret' })
      ).resolves.toEqual({ ok: false, errorCode: 'network_error', message: 'Network error' })
    })

    it('maps 401 with a matching key prefix to auth_failed', async () => {
      mockFetch.mockResolvedValue(fetchErr(401, 'Unauthorized'))

      await expect(
        testAlpacaConnection({ environment: 'paper', keyId: 'PKPAPER123', secret: 'paper-secret' })
      ).resolves.toEqual({
        ok: false,
        errorCode: 'auth_failed',
        message: 'Authentication failed (401)'
      })
    })

    it('maps 403 on the live endpoint with live keys to auth_failed', async () => {
      mockFetch.mockResolvedValue(fetchErr(403, 'Forbidden'))

      await expect(
        testAlpacaConnection({ environment: 'live', keyId: 'AKLIVE456', secret: 'live-secret' })
      ).resolves.toMatchObject({ ok: false, errorCode: 'auth_failed' })
    })

    it('maps 429 to rate_limited', async () => {
      mockFetch.mockResolvedValue(fetchErr(429))

      await expect(
        testAlpacaConnection({ environment: 'paper', keyId: 'PKPAPER123', secret: 'paper-secret' })
      ).resolves.toEqual({
        ok: false,
        errorCode: 'rate_limited',
        message: 'Rate limited — please try again'
      })
    })

    it('maps any other non-OK status to unknown with the HTTP status in the message', async () => {
      mockFetch.mockResolvedValue(fetchErr(500))

      await expect(
        testAlpacaConnection({ environment: 'paper', keyId: 'PKPAPER123', secret: 'paper-secret' })
      ).resolves.toEqual({ ok: false, errorCode: 'unknown', message: 'HTTP 500' })
    })

    it('returns short account numbers unmasked and tolerates a missing account_number', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk({ account_number: 'AB12' }))
      await expect(
        testAlpacaConnection({ environment: 'paper', keyId: 'PKPAPER123', secret: 'paper-secret' })
      ).resolves.toMatchObject({ ok: true, accountNumberMasked: 'AB12' })

      mockFetch.mockResolvedValueOnce(fetchOk({}))
      await expect(
        testAlpacaConnection({ environment: 'paper', keyId: 'PKPAPER123', secret: 'paper-secret' })
      ).resolves.toMatchObject({ ok: true, accountNumberMasked: '' })
    })

    it('rejects a blank keyId or secret before calling Alpaca', async () => {
      await expect(
        testAlpacaConnection({ environment: 'paper', keyId: '   ', secret: 'paper-secret' })
      ).rejects.toThrow('keyId is required')
      await expect(
        testAlpacaConnection({ environment: 'paper', keyId: 'PKPAPER123', secret: ' ' })
      ).rejects.toThrow('secret is required')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
