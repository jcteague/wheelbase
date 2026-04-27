import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetAccount = vi.fn()

vi.mock('@alpacahq/typescript-sdk', () => ({
  createClient: vi.fn(() => ({
    getStocksQuotesLatest: vi.fn(),
    getOptionsSnapshots: vi.fn(),
    getActivity: vi.fn(),
    getAccount: mockGetAccount,
    getClock: vi.fn()
  }))
}))

import { createMarketDataProvider } from './market-data-factory'

describe('Market Data Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createMarketDataProvider returns provider with all MarketDataProvider methods for "alpaca"', () => {
    const provider = createMarketDataProvider({
      provider: 'alpaca',
      keyId: 'test-key',
      secretKey: 'test-secret',
      paper: true
    })

    expect(provider).toBeDefined()
    expect(typeof provider.getStockQuotes).toBe('function')
    expect(typeof provider.getOptionSnapshots).toBe('function')
    expect(typeof provider.getActivities).toBe('function')
    expect(typeof provider.getAccountInfo).toBe('function')
    expect(typeof provider.getMarketStatus).toBe('function')
    expect(typeof provider.supportsStreaming).toBe('function')
    expect(typeof provider.connect).toBe('function')
    expect(typeof provider.disconnect).toBe('function')
    expect(typeof provider.stream).toBe('function')
  })

  it('createMarketDataProvider throws for unknown provider', () => {
    expect(() =>
      createMarketDataProvider({
        provider: 'unknown' as 'alpaca',
        keyId: 'test-key',
        secretKey: 'test-secret',
        paper: true
      })
    ).toThrow()
  })

  it('factory passes config through to provider', async () => {
    mockGetAccount.mockResolvedValue({
      buying_power: '50000.00',
      portfolio_value: '125000.00',
      cash: '50000.00'
    })

    const provider = createMarketDataProvider({
      provider: 'alpaca',
      keyId: 'test-key',
      secretKey: 'test-secret',
      paper: true
    })

    const accountInfo = await provider.getAccountInfo()
    expect(accountInfo.environment).toBe('paper')
  })
})
