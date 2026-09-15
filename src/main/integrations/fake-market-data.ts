import { eachDayOfInterval, format, isWeekend, parseISO } from 'date-fns'
import { Observable, Subject } from 'rxjs'
import { filter } from 'rxjs/operators'
import { parseOccSymbol } from '../core/option-symbol'
import {
  MarketDataError,
  type MarketCalendarDay,
  type MarketCalendarRange,
  type MarketDataErrorCode,
  type MarketDataFeed,
  type MarketDataProvider,
  type MarketStatus,
  type OptionChainFilter,
  type OptionChainQuote,
  type OptionSnapshot,
  type StockQuote,
  type StreamEvent,
  type StreamError
} from './market-data-provider'

// Module-level subjects so IPC test handlers can push events from outside this class.
export const fakeStockTickSubject = new Subject<StreamEvent<StockQuote>>()
export const fakeStreamErrorSubject = new Subject<StreamError>()

function buildMockMap<T>(envVar: string, keys: string[]): Map<string, T> {
  const raw = process.env[envVar]
  const all: Record<string, T> = raw ? (JSON.parse(raw) as Record<string, T>) : {}
  const result = new Map<string, T>()
  for (const key of keys) {
    if (all[key]) result.set(key, all[key])
  }
  return result
}

const DEFAULT_MARKET_STATUS: MarketStatus = {
  isOpen: true,
  nextOpen: '2026-05-30T13:30:00Z',
  nextClose: '2026-05-29T20:00:00Z',
  session: 'regular'
}

const FAKE_CLOSE_TIME = '16:00'

/** Every weekday in the range as a normal 16:00 session. Offline runs need a calendar
 *  that is correct *relative to whatever day the suite runs on*, so this is generated
 *  rather than fixtured; a spec that needs a holiday or early close sets
 *  FAKE_MARKET_CALENDAR explicitly. */
function weekdaySessions(range: MarketCalendarRange): MarketCalendarDay[] {
  return eachDayOfInterval({ start: parseISO(range.start), end: parseISO(range.end) })
    .filter((day) => !isWeekend(day))
    .map((day) => ({ date: format(day, 'yyyy-MM-dd'), close: FAKE_CLOSE_TIME }))
}

// How many calendar fetches the fake has served. The refresh throttle lives in the
// trading-calendar store, and a bench that skipped a fetch looks exactly like one that
// made it — so this counter is the only way an e2e spec can see the difference.
let calendarFetches = 0

export function marketCalendarFetchCount(): number {
  return calendarFetches
}

function parseEnv<T>(envVar: string): T | null {
  const raw = process.env[envVar]
  return raw ? (JSON.parse(raw) as T) : null
}

/**
 * In-process fake provider for e2e tests (enabled via FAKE_MARKET_DATA=true).
 * Reads fixture data from environment variables:
 *   WHEELBASE_MOCK_STOCK_QUOTES       JSON string: Record<ticker, StockQuote>
 *   WHEELBASE_MOCK_OPTION_SNAPSHOTS   JSON string: Record<symbol, OptionSnapshot>
 *   FAKE_MARKET_STATUS                JSON string: MarketStatus
 *   FAKE_MARKET_CALENDAR              JSON string: MarketCalendarDay[]
 *   FAKE_MARKET_DATA_ERROR            MarketDataErrorCode — when set, all calls throw this error
 *   FAKE_MARKET_CALENDAR_ERROR        MarketDataErrorCode — fails only getMarketCalendar
 */
export class FakeMarketDataProvider implements MarketDataProvider {
  private maybeThrow(): void {
    const code = process.env.FAKE_MARKET_DATA_ERROR
    if (code) throw new MarketDataError(code as MarketDataErrorCode, `Fake error: ${code}`)
  }

  async getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>> {
    this.maybeThrow()
    return buildMockMap<StockQuote>('WHEELBASE_MOCK_STOCK_QUOTES', tickers)
  }

  async getOptionSnapshot(contractId: string): Promise<OptionSnapshot> {
    this.maybeThrow()
    const map = buildMockMap<OptionSnapshot>('WHEELBASE_MOCK_OPTION_SNAPSHOTS', [contractId])
    const snapshot = map.get(contractId)
    if (!snapshot) {
      throw new MarketDataError('unknown', `FakeMarketDataProvider: no snapshot for ${contractId}`)
    }
    return snapshot
  }

  async getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionChainQuote[]> {
    this.maybeThrow()
    const raw = process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
    if (!raw) return []
    const all = JSON.parse(raw) as Record<string, OptionSnapshot | Partial<OptionChainQuote>>
    return Object.entries(all).flatMap(([symbol, snapshot]) => {
      // Fixtures are keyed by OCC symbol and may hold bare OptionSnapshots — every e2e spec
      // predating the chain endpoint seeds them that way — so per-strike identity is derived
      // from the key rather than assumed present on the value.
      const identity = parseOccSymbol(symbol)
      if (!identity) return []
      const { underlying, ...quoteFields } = identity
      if (underlying !== filter.underlying) return []
      const quote: OptionChainQuote = { ...quoteFields, ...(snapshot as OptionChainQuote) }
      if (filter.type && quote.contractType !== filter.type) return []
      if (filter.expirationFrom && quote.expiration < filter.expirationFrom) return []
      if (filter.expirationTo && quote.expiration > filter.expirationTo) return []
      return [quote]
    })
  }

  async getMarketStatus(): Promise<MarketStatus> {
    this.maybeThrow()
    return parseEnv<MarketStatus>('FAKE_MARKET_STATUS') ?? DEFAULT_MARKET_STATUS
  }

  async getMarketCalendar(range: MarketCalendarRange): Promise<MarketCalendarDay[]> {
    this.maybeThrow()
    // A calendar-only fault: the specs for "a calendar failure degrades IV freshness
    // only" need quotes and chains to keep serving, which the global seam cannot express.
    const calendarError = process.env.FAKE_MARKET_CALENDAR_ERROR
    if (calendarError) {
      throw new MarketDataError(
        calendarError as MarketDataErrorCode,
        `Fake calendar error: ${calendarError}`
      )
    }
    calendarFetches += 1
    const fixture = parseEnv<MarketCalendarDay[]>('FAKE_MARKET_CALENDAR')
    if (fixture === null) return weekdaySessions(range)

    return fixture.filter((day) => day.date >= range.start && day.date <= range.end)
  }

  async connect(): Promise<void> {
    // Instant connection in fake mode; ignores feed selection.
  }

  async disconnect(): Promise<void> {
    // Nothing to close
  }

  supportsStreaming(feed: MarketDataFeed): boolean {
    return feed === 'stockQuotes'
  }

  stream(
    feed: MarketDataFeed,
    symbols: string[]
  ): Observable<StreamEvent<StockQuote | OptionSnapshot>> {
    if (feed !== 'stockQuotes') {
      throw new MarketDataError(
        'streaming_unsupported',
        `FakeMarketDataProvider: unsupported feed ${feed}`
      )
    }
    return fakeStockTickSubject.pipe(
      filter((event) => symbols.includes(event.symbol))
    ) as Observable<StreamEvent<StockQuote | OptionSnapshot>>
  }
}
