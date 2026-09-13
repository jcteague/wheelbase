// [US-96] underlying-quotes — shared per-ticker isolated stock-quote fetch. One
// ticker's failure must degrade to that ticker being absent from the map, never
// sink the quotes the other tickers returned.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketDataProvider, StockQuote } from '../integrations/market-data-provider'
import { logger } from '../logger'
import { fetchIsolatedStockQuotes } from './underlying-quotes'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const TIMESTAMP = '2026-09-11T18:30:00.000Z'

function stockQuote(price: string): StockQuote {
  return {
    price,
    bid: price,
    ask: price,
    change: '0.00',
    changePercent: '0.00',
    prevClose: '100.00',
    volume: 1_000_000,
    timestamp: TIMESTAMP
  }
}

function makeProvider(quotes: (tickers: string[]) => Map<string, StockQuote>): {
  provider: MarketDataProvider
  getStockQuotes: ReturnType<typeof vi.fn>
} {
  const getStockQuotes = vi.fn(async (tickers: string[]) => quotes(tickers))
  return { provider: { getStockQuotes } as unknown as MarketDataProvider, getStockQuotes }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchIsolatedStockQuotes', () => {
  it('keeps the quotes that succeeded when one ticker fails, and warns for that ticker', async () => {
    const { provider } = makeProvider((tickers) => {
      if (tickers.includes('KO')) throw new Error('rate limited')
      return new Map(tickers.map((t) => [t, stockQuote('412.00')]))
    })

    const quotes = await fetchIsolatedStockQuotes(provider, ['AAPL', 'KO', 'MSFT'])

    expect([...quotes.keys()]).toEqual(['AAPL', 'MSFT'])
    expect(quotes.get('AAPL')).toEqual({
      price: '412.00',
      bid: '412.00',
      ask: '412.00',
      prevClose: '100.00',
      volume: 1_000_000,
      timestamp: TIMESTAMP
    })
    expect(quotes.has('KO')).toBe(false)
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'KO' }),
      'underlying_quote_fetch_failed'
    )
  })

  it('returns an empty map without touching the provider when there are no tickers', async () => {
    const { provider, getStockQuotes } = makeProvider(() => new Map())

    const quotes = await fetchIsolatedStockQuotes(provider, [])

    expect(quotes.size).toBe(0)
    expect(getStockQuotes).not.toHaveBeenCalled()
  })
})
