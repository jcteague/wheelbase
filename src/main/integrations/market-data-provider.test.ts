import { describe, it, expect } from 'vitest'
import { MarketDataError } from './market-data-provider'
import type { MarketDataFeed, OptionSnapshot } from './market-data-provider'
import { FakeMarketDataProvider } from './fake-market-data'

describe('MarketDataError', () => {
  it('has code and message properties', () => {
    const error = new MarketDataError('auth_failed', 'Invalid credentials')
    expect(error.code).toBe('auth_failed')
    expect(error.message).toContain('Invalid credentials')
    expect(error).toBeInstanceOf(Error)
  })

  it('codes are exhaustive', () => {
    const codes = [
      'auth_failed',
      'network_error',
      'rate_limited',
      'streaming_unsupported',
      'unknown'
    ] as const

    for (const code of codes) {
      expect(() => new MarketDataError(code, `test ${code}`)).not.toThrow()
    }
  })
})

describe('MarketDataFeed type', () => {
  it('accepts valid values', () => {
    const stockQuotes: MarketDataFeed = 'stockQuotes'
    const optionQuotes: MarketDataFeed = 'optionQuotes'
    const optionTrades: MarketDataFeed = 'optionTrades'

    expect(stockQuotes).toBe('stockQuotes')
    expect(optionQuotes).toBe('optionQuotes')
    expect(optionTrades).toBe('optionTrades')
  })
})

describe('MarketDataProvider slim interface', () => {
  it('does not expose getAccountInfo, getActivities, or getMarketStatus', () => {
    // After the provider split, broker methods belong on BrokerProvider, not MarketDataProvider.
    // Currently FAILS at runtime: FakeMarketDataProvider still implements these broker methods.
    const fake = new FakeMarketDataProvider()
    expect('getAccountInfo' in fake).toBe(false)
  })

  it('exposes getOptionSnapshot for a single contract', () => {
    // MarketDataProvider should have getOptionSnapshot (singular), not getOptionSnapshots (plural).
    // Currently FAILS at runtime: FakeMarketDataProvider only has getOptionSnapshots (plural).
    const fake = new FakeMarketDataProvider()
    expect(typeof (fake as unknown as Record<string, unknown>).getOptionSnapshot).toBe('function')
  })

  it('OptionSnapshot.greeks and impliedVolatility are optional', () => {
    // After the refactor, greeks is optional and impliedVolatility is a top-level optional field.
    // Currently FAILS at pnpm typecheck: greeks is required and impliedVolatility does not exist.
    const snapshot: OptionSnapshot = {
      bid: '1.00',
      ask: '1.05',
      mid: '1.025',
      lastTrade: '1.00',
      openInterest: null,
      volume: null,
      timestamp: '2026-01-01T00:00:00Z'
      // greeks intentionally omitted — valid only after interface change
    }
    expect(snapshot.greeks).toBeUndefined()
  })
})
