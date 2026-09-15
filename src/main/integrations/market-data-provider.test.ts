import { describe, it, expect } from 'vitest'
import type { Observable } from 'rxjs'
import { MarketDataError } from './market-data-provider'
import type {
  MarketCalendarDay,
  MarketCalendarRange,
  MarketDataFeed,
  MarketDataProvider,
  MarketStatus,
  MarketStatusSource,
  OptionSnapshot,
  StockQuote,
  StreamEvent
} from './market-data-provider'
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

// [US-116] Market facts — the exchange clock and calendar — belong to the market-data
// port, not the broker. Account facts stay on BrokerProvider.
describe('MarketDataProvider market facts', () => {
  it('exposes getMarketStatus and getMarketCalendar but not getAccountInfo or getActivities', () => {
    const fake = new FakeMarketDataProvider()

    expect(typeof (fake as unknown as Record<string, unknown>).getMarketStatus).toBe('function')
    expect(typeof (fake as unknown as Record<string, unknown>).getMarketCalendar).toBe('function')
    expect('getAccountInfo' in fake).toBe(false)
    expect('getActivities' in fake).toBe(false)
  })

  it('is satisfied by a structural fixture carrying both market-fact methods', () => {
    const fixture = {
      async getStockQuotes(): Promise<Map<string, StockQuote>> {
        return new Map()
      },
      async getOptionSnapshot(): Promise<OptionSnapshot> {
        throw new MarketDataError('not_found', 'none')
      },
      async getOptionChainSnapshot() {
        return []
      },
      async getMarketStatus(): Promise<MarketStatus> {
        return {
          isOpen: false,
          nextOpen: '2026-09-14T13:30:00Z',
          nextClose: '2026-09-14T20:00:00Z',
          session: 'closed'
        }
      },
      async getMarketCalendar(range: MarketCalendarRange): Promise<MarketCalendarDay[]> {
        return [{ date: range.start, close: '16:00' }]
      },
      supportsStreaming(): boolean {
        return false
      },
      async connect(): Promise<void> {
        // no-op
      },
      async disconnect(): Promise<void> {
        // no-op
      },
      stream(): Observable<StreamEvent<StockQuote | OptionSnapshot>> {
        throw new MarketDataError('streaming_unsupported', 'none')
      }
    } satisfies MarketDataProvider

    expect(typeof fixture.getMarketStatus).toBe('function')
    expect(typeof fixture.getMarketCalendar).toBe('function')
  })

  it('exports MarketStatus, MarketCalendarDay and MarketCalendarRange', () => {
    const status: MarketStatus = {
      isOpen: true,
      nextOpen: '2026-09-14T13:30:00Z',
      nextClose: '2026-09-14T20:00:00Z',
      session: 'regular'
    }
    const day: MarketCalendarDay = { date: '2026-09-11', close: '16:00' }
    const range: MarketCalendarRange = { start: '2026-09-01', end: '2026-09-30' }

    expect(status.session).toBe('regular')
    expect(day.close).toBe('16:00')
    expect(range.start).toBe('2026-09-01')
  })

  // The polling scheduler needs the clock and nothing else; MarketStatusSource keeps it
  // from importing a port that can also stream quotes.
  it('exports MarketStatusSource as the clock-only slice of the port', async () => {
    const source: MarketStatusSource = {
      async getMarketStatus(): Promise<MarketStatus> {
        return {
          isOpen: true,
          nextOpen: '2026-09-14T13:30:00Z',
          nextClose: '2026-09-14T20:00:00Z',
          session: 'regular'
        }
      }
    }

    expect((await source.getMarketStatus()).isOpen).toBe(true)
  })
})

describe('MarketDataProvider slim interface', () => {
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
