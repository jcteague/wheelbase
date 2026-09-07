import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AlpacaMarketDataProvider } from './alpaca-market-data'
import * as alpacaCredentials from './alpaca-credentials'
import { FakeMarketDataProvider } from './fake-market-data'
import { marketDataFactory } from './market-data-factory'
import type { AlpacaCredentials } from '../services/settings'

const PAPER_CREDS: AlpacaCredentials = {
  environment: 'paper',
  keyId: 'PKTESTKEYID',
  secret: 'paper-secret'
}

describe('marketDataFactory', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    delete process.env.FAKE_MARKET_DATA
    marketDataFactory.recreate()
    marketDataFactory.configure({ loadActiveAlpacaCredentials: () => PAPER_CREDS })
  })

  it('returns AlpacaMarketDataProvider when Alpaca credentials are configured', () => {
    expect(marketDataFactory.create()).toBeInstanceOf(AlpacaMarketDataProvider)
  })

  // The app must start without credentials — the provider raises auth_failed per call
  // instead, so the screener and Positions can render their "connect Alpaca" states.
  it('still returns AlpacaMarketDataProvider when no credentials are configured', () => {
    marketDataFactory.configure({ loadActiveAlpacaCredentials: () => null })

    expect(() => marketDataFactory.create()).not.toThrow()
    expect(marketDataFactory.create()).toBeInstanceOf(AlpacaMarketDataProvider)
  })

  it('returns FakeMarketDataProvider when FAKE_MARKET_DATA env var is set', () => {
    process.env.FAKE_MARKET_DATA = 'true'
    expect(marketDataFactory.create()).toBeInstanceOf(FakeMarketDataProvider)
  })

  it('prefers FakeMarketDataProvider even when Alpaca credentials exist', () => {
    process.env.FAKE_MARKET_DATA = 'true'
    expect(marketDataFactory.create()).toBeInstanceOf(FakeMarketDataProvider)
  })

  it('caches the provider across create() calls', () => {
    expect(marketDataFactory.create()).toBe(marketDataFactory.create())
  })

  it('builds a fresh provider after recreate()', () => {
    const first = marketDataFactory.create()
    marketDataFactory.recreate()

    expect(marketDataFactory.create()).not.toBe(first)
  })

  // A fresh module instance is the only way to observe the default config, since every
  // other test in this file has already called configure().
  it('builds a provider from the default env credential loader when never configured', async () => {
    vi.resetModules()
    vi.stubEnv('ALPACA_KEY_ID', 'PKENV')
    vi.stubEnv('ALPACA_SECRET_KEY', 'env-secret')
    vi.stubEnv('ALPACA_PAPER', 'true')

    // The provider class must come from the same fresh module graph — a class re-evaluated
    // by resetModules() is a different object than the statically imported one.
    const { AlpacaMarketDataProvider: FreshProvider } = await import('./alpaca-market-data')
    const { marketDataFactory: freshFactory } = await import('./market-data-factory')

    expect(freshFactory.create()).toBeInstanceOf(FreshProvider)
    expect(alpacaCredentials.loadAlpacaCredentialsFromEnv()).toEqual({
      keyId: 'PKENV',
      secret: 'env-secret',
      environment: 'paper'
    })
  })

  it('delegates disconnect() to the cached provider', async () => {
    const provider = marketDataFactory.create()
    const spy = vi.spyOn(provider, 'disconnect').mockResolvedValue()

    await marketDataFactory.disconnect()

    expect(spy).toHaveBeenCalled()
  })

  it('resolves disconnect() when no provider has been created', async () => {
    marketDataFactory.recreate()

    await expect(marketDataFactory.disconnect()).resolves.toBeUndefined()
  })
})
