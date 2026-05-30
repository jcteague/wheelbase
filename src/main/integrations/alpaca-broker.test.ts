// [US-40] AlpacaBrokerProvider — implements BrokerProvider interface

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
      expect(result.buyingPower).toBe('10000.00')
      expect(result.portfolioValue).toBe('50000.00')
      expect(result.cash).toBe('5000.00')
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
  })
})
