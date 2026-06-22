// [US-40] AlpacaBrokerProvider — implements BrokerProvider interface
// [US-47] AlpacaBrokerProvider hardening — deeplink, credential checks, money normalization

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrokerError } from './broker-provider'

const { mockCreateClient, mockGetAccount, mockGetActivity, mockGetClock } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetAccount: vi.fn(),
  mockGetActivity: vi.fn(),
  mockGetClock: vi.fn()
}))

vi.mock('@alpacahq/typescript-sdk', () => ({
  createClient: mockCreateClient
}))

import { AlpacaBrokerProvider } from './alpaca-broker'

function createProvider(
  overrides: {
    keyId?: string
    secretKey?: string
    environment?: 'paper' | 'live'
  } = {}
): AlpacaBrokerProvider {
  return new AlpacaBrokerProvider({
    keyId: 'test-key',
    secretKey: 'test-secret',
    environment: 'paper',
    ...overrides
  })
}

// A1
describe('BrokerError', () => {
  it('carries deeplink field when constructed with one', () => {
    const err = new BrokerError('auth_failed', 'msg', 'settings/credentials/alpaca')
    expect(err.deeplink).toBe('settings/credentials/alpaca')
  })
})

describe('AlpacaBrokerProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockCreateClient.mockReturnValue({
      getAccount: mockGetAccount,
      getActivity: mockGetActivity,
      getClock: mockGetClock
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // === getAccountInfo ===

  describe('getAccountInfo', () => {
    it("returns AccountInfo with masked account number 'PA…ABC' for paper credentials", async () => {
      mockGetAccount.mockResolvedValue({
        account_number: 'PA12345ABC',
        buying_power: '10000.00',
        portfolio_value: '50000.00',
        cash: '5000.00'
      })

      const provider = createProvider({ environment: 'paper' })
      const result = await provider.getAccountInfo()

      expect(result.accountNumberMasked).toBe('PA…ABC')
      expect(result.environment).toBe('paper')
      expect(result.buyingPower).toBe('10000.0000')
      expect(result.portfolioValue).toBe('50000.0000')
      expect(result.cash).toBe('5000.0000')
    })

    it("throws BrokerError('auth_failed') on 401", async () => {
      mockGetAccount.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }))

      const provider = createProvider()
      const thrown = await provider.getAccountInfo().catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(BrokerError)
      expect((thrown as BrokerError).code).toBe('auth_failed')
    })

    it('paper environment passes paper:true to createClient', () => {
      mockGetAccount.mockResolvedValue({
        account_number: 'PA12345ABC',
        buying_power: '10000.00',
        portfolio_value: '50000.00',
        cash: '5000.00'
      })

      const provider = createProvider({ environment: 'paper' })
      void provider.getAccountInfo()

      expect(mockCreateClient).toHaveBeenCalledWith(expect.objectContaining({ paper: true }))
    })

    it('live environment passes paper:false to createClient', async () => {
      mockGetAccount.mockResolvedValue({
        account_number: 'LIVE12345XYZ',
        buying_power: '10000.00',
        portfolio_value: '50000.00',
        cash: '5000.00'
      })

      const provider = createProvider({ keyId: 'live-key', environment: 'live' })
      await provider.getAccountInfo()

      expect(mockCreateClient).toHaveBeenCalledWith(expect.objectContaining({ paper: false }))
    })

    // A6
    it('normalizes money fields to 4 decimal places', async () => {
      mockGetAccount.mockResolvedValue({
        buying_power: '10000.00',
        portfolio_value: '50000',
        cash: '5000.1',
        account_number: 'PA12345ABC'
      })

      const provider = createProvider()
      const result = await provider.getAccountInfo()

      expect(result.buyingPower).toBe('10000.0000')
      expect(result.portfolioValue).toBe('50000.0000')
      expect(result.cash).toBe('5000.1000')
    })

    // A7
    it('normalizes raw integer buying_power to 4 decimal places', async () => {
      mockGetAccount.mockResolvedValue({
        buying_power: '9999',
        portfolio_value: '50000.0000',
        cash: '5000.0000',
        account_number: 'PA12345ABC'
      })

      const provider = createProvider()
      const result = await provider.getAccountInfo()

      expect(result.buyingPower).toBe('9999.0000')
    })
  })

  // === getActivities ===

  describe('getActivities', () => {
    it('sorts results by transactionTime descending', async () => {
      mockGetActivity.mockResolvedValue([
        {
          activity_type: 'OPASN',
          id: 'a1',
          transaction_time: '2024-01-03',
          symbol: 'AAPL',
          qty: '100',
          per_share_amount: '1.50'
        },
        {
          activity_type: 'OPASN',
          id: 'a2',
          transaction_time: '2024-01-01',
          symbol: 'MSFT',
          qty: '100',
          per_share_amount: '1.50'
        },
        {
          activity_type: 'OPASN',
          id: 'a3',
          transaction_time: '2024-01-02',
          symbol: 'TSLA',
          qty: '100',
          per_share_amount: '1.50'
        }
      ])

      const provider = createProvider()
      const result = await provider.getActivities({ type: 'OPASN' })

      expect(result[0].transactionTime).toBe('2024-01-03')
      expect(result[1].transactionTime).toBe('2024-01-02')
      expect(result[2].transactionTime).toBe('2024-01-01')
    })

    it("passes through 'since' as 'date' query parameter", async () => {
      mockGetActivity.mockResolvedValue([])

      const provider = createProvider()
      await provider.getActivities({ type: 'OPASN', since: '2024-01-01' })

      expect(mockGetActivity).toHaveBeenCalledWith(
        expect.objectContaining({ activity_type: 'OPASN', date: '2024-01-01' })
      )
    })

    it('maps Alpaca fields to BrokerActivity shape', async () => {
      mockGetActivity.mockResolvedValue([
        {
          activity_type: 'OPASN',
          id: 'act-001',
          transaction_time: '2024-01-15T14:30:00Z',
          symbol: 'AAPL260516P00180000',
          qty: '100',
          per_share_amount: '180.00'
        }
      ])

      const provider = createProvider()
      const result = await provider.getActivities({ type: 'OPASN' })

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        activityId: 'act-001',
        activityType: 'OPASN',
        symbol: 'AAPL260516P00180000',
        qty: 100,
        price: '180.00',
        transactionTime: '2024-01-15T14:30:00Z'
      })
    })

    // A2
    it('rejects missing credentials with auth_failed and deeplink', async () => {
      const provider = createProvider({ keyId: '', secretKey: '' })
      const thrown = await provider.getActivities({ type: 'OPASN' }).catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(BrokerError)
      expect((thrown as BrokerError).code).toBe('auth_failed')
      expect((thrown as BrokerError).message).toBe('Alpaca credentials not configured')
      expect((thrown as BrokerError).deeplink).toBe('settings/credentials/alpaca')
    })
  })

  // === getMarketStatus ===

  describe('getMarketStatus', () => {
    it("parses clock response into MarketStatus with session 'regular' when market is open", async () => {
      mockGetClock.mockResolvedValue({
        is_open: true,
        next_open: '2026-05-30T13:30:00Z',
        next_close: '2026-05-29T20:00:00Z',
        timestamp: '2026-05-29T14:00:00-04:00'
      })

      const provider = createProvider()
      const result = await provider.getMarketStatus()

      expect(result.isOpen).toBe(true)
      expect(result.session).toBe('regular')
      expect(typeof result.nextOpen).toBe('string')
      expect(typeof result.nextClose).toBe('string')
    })

    it("parses clock response into MarketStatus with session 'pre' during pre-market", async () => {
      mockGetClock.mockResolvedValue({
        is_open: false,
        next_open: '2026-05-29T13:30:00Z',
        next_close: '2026-05-29T20:00:00Z',
        timestamp: '2026-05-29T08:00:00-04:00'
      })

      const provider = createProvider()
      const result = await provider.getMarketStatus()

      expect(result.isOpen).toBe(false)
      expect(result.session).toBe('pre')
    })

    it("parses clock response into MarketStatus with session 'post' during post-market", async () => {
      mockGetClock.mockResolvedValue({
        is_open: false,
        next_open: '2026-05-30T13:30:00Z',
        next_close: '2026-05-30T20:00:00Z',
        timestamp: '2026-05-29T17:00:00-04:00'
      })

      const provider = createProvider()
      const result = await provider.getMarketStatus()

      expect(result.session).toBe('post')
    })

    it("parses clock response into MarketStatus with session 'closed' overnight", async () => {
      mockGetClock.mockResolvedValue({
        is_open: false,
        next_open: '2026-05-29T13:30:00Z',
        next_close: '2026-05-29T20:00:00Z',
        timestamp: '2026-05-29T02:00:00-04:00'
      })

      const provider = createProvider()
      const result = await provider.getMarketStatus()

      expect(result.session).toBe('closed')
    })

    // A3
    it('rejects missing credentials with auth_failed and deeplink', async () => {
      const provider = createProvider({ keyId: '', secretKey: '' })
      const thrown = await provider.getMarketStatus().catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(BrokerError)
      expect((thrown as BrokerError).code).toBe('auth_failed')
      expect((thrown as BrokerError).message).toBe('Alpaca credentials not configured')
      expect((thrown as BrokerError).deeplink).toBe('settings/credentials/alpaca')
    })
  })

  // === Error handling ===

  describe('error handling', () => {
    it("missing credentials throws BrokerError('auth_failed') with 'Alpaca credentials not configured'", async () => {
      const provider = createProvider({ keyId: '', secretKey: '' })
      const thrown = await provider.getAccountInfo().catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(BrokerError)
      expect((thrown as BrokerError).code).toBe('auth_failed')
      expect((thrown as BrokerError).message).toMatch(/not configured/i)
    })

    it("credential environment mismatch surfaces BrokerError('environment_mismatch')", async () => {
      // Paper-style key (starts with 'P') used with live environment → 401 → environment_mismatch
      mockGetAccount.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }))

      const provider = createProvider({ keyId: 'PKPAPER123', environment: 'live' })
      const thrown = await provider.getAccountInfo().catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(BrokerError)
      expect((thrown as BrokerError).code).toBe('environment_mismatch')
    })

    it("throws BrokerError('network_error') on connection failure", async () => {
      mockGetAccount.mockRejectedValue(
        Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
      )

      const provider = createProvider()
      const thrown = await provider.getAccountInfo().catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(BrokerError)
      expect((thrown as BrokerError).code).toBe('network_error')
    })

    // A4
    it('paper environment with AK key surfaces environment_mismatch on 401', async () => {
      mockGetClock.mockRejectedValue(Object.assign(new Error(), { status: 401 }))

      const provider = createProvider({
        environment: 'paper',
        keyId: 'AK_LIVE_KEY',
        secretKey: 'secret'
      })
      const thrown = await provider.getMarketStatus().catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(BrokerError)
      expect((thrown as BrokerError).code).toBe('environment_mismatch')
      expect((thrown as BrokerError).message).toBe(
        'Environment mismatch — these are LIVE keys, not paper keys'
      )
    })

    // A5
    it('non-mismatch 401 on paper env with PK key stays auth_failed', async () => {
      mockGetClock.mockRejectedValue(Object.assign(new Error(), { status: 401 }))

      const provider = createProvider({
        environment: 'paper',
        keyId: 'PKPAPER123',
        secretKey: 'secret'
      })
      const thrown = await provider.getMarketStatus().catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(BrokerError)
      expect((thrown as BrokerError).code).toBe('auth_failed')
    })

    it('Alpaca JSON body error code 40110000 (no HTTP status field) maps to auth_failed', async () => {
      // Alpaca SDK sometimes throws with no .status but with a JSON body as the message
      mockGetClock.mockRejectedValue(
        new Error(JSON.stringify({ code: 40110000, message: 'request is not authorized' }))
      )

      const provider = createProvider({ environment: 'live', keyId: 'AKLIVE123', secretKey: 's' })
      const thrown = await provider.getMarketStatus().catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(BrokerError)
      expect((thrown as BrokerError).code).toBe('auth_failed')
    })
  })
})
