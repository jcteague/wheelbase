import { describe, it, expect } from 'vitest'
import { MarketDataError } from './market-data-provider'
import type { DataFeed } from './market-data-provider'

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
      'stream_disconnected',
      'streaming_unsupported',
      'subscription_failed',
      'unknown'
    ] as const

    for (const code of codes) {
      expect(() => new MarketDataError(code, `test ${code}`)).not.toThrow()
    }
  })
})

describe('DataFeed type', () => {
  it('accepts valid values', () => {
    const stockQuotes: DataFeed = 'stockQuotes'
    const optionQuotes: DataFeed = 'optionQuotes'
    const optionTrades: DataFeed = 'optionTrades'

    expect(stockQuotes).toBe('stockQuotes')
    expect(optionQuotes).toBe('optionQuotes')
    expect(optionTrades).toBe('optionTrades')
  })
})
