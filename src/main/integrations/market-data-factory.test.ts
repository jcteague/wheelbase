import { beforeEach, describe, expect, it } from 'vitest'

import { FakeMarketDataProvider } from './fake-market-data'
import { marketDataFactory } from './market-data-factory'
import { MassiveMarketDataProvider } from './massive-market-data'

describe('marketDataFactory', () => {
  beforeEach(() => {
    delete process.env.MASSIVE_API_KEY
    delete process.env.FAKE_MARKET_DATA
    marketDataFactory.recreate()
    marketDataFactory.configure({
      loadMassiveApiKey: () => process.env.MASSIVE_API_KEY ?? ''
    })
  })

  it('returns MassiveMarketDataProvider when shared Massive app config is configured', () => {
    marketDataFactory.configure({
      loadMassiveApiKey: () => 'shared-massive-key'
    })
    const provider = marketDataFactory.create()
    expect(provider).toBeInstanceOf(MassiveMarketDataProvider)
  })

  it('returns FakeMarketDataProvider when FAKE_MARKET_DATA env var is set', () => {
    process.env.FAKE_MARKET_DATA = 'true'
    const provider = marketDataFactory.create()
    expect(provider).toBeInstanceOf(FakeMarketDataProvider)
  })

  it('throws if neither Massive nor Fake is configured', () => {
    expect(() => marketDataFactory.create()).toThrow()
  })

  it('prefers FakeMarketDataProvider when both FAKE_MARKET_DATA and MASSIVE_API_KEY are set', () => {
    process.env.FAKE_MARKET_DATA = 'true'
    process.env.MASSIVE_API_KEY = 'test-key'
    const provider = marketDataFactory.create()
    expect(provider).toBeInstanceOf(FakeMarketDataProvider)
  })

  it('does not consult user credential settings when Massive shared key is missing', () => {
    marketDataFactory.configure({
      loadMassiveApiKey: () => ''
    })

    expect(() => marketDataFactory.create()).toThrow(/not configured/i)
  })
})
