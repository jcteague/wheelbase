import Decimal from 'decimal.js'
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  getDate,
  isFriday,
  isThursday,
  isWeekend,
  parseISO
} from 'date-fns'
import { Observable, Subject } from 'rxjs'
import { filter } from 'rxjs/operators'
import { blackScholesPrice } from '../core/black-scholes'
import { parseOccSymbol } from '../core/option-symbol'
import {
  MarketDataError,
  type DailyBar,
  type DailyBarRange,
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

// --- IV-history daily bars ---

/** One session of a programmed IV series: a flat vol surface, optionally thinned. */
export type FakeIvSessionSpec =
  | number
  | {
      iv: number
      untraded?: Array<{ strike: number; type: 'call' | 'put' }>
      tradeCount?: number
      weeklyTradeCount?: number
    }

export type FakeIvSeries = {
  price: number
  tradeCount?: number
  weeklyTradeCount?: number
  latencyMs?: number
  failWith?: 'network_error' | 'rate_limited' | 'unknown'
  sessions: Record<string, FakeIvSessionSpec>
}

export type FakeIvSeriesFixture = Record<string, FakeIvSeries>

export type DailyBarRequest = {
  kind: 'option' | 'stock'
  underlying: string
  start: string
  end: string | null
}

const FAKE_RATE = 0.045
const DEFAULT_TRADE_COUNT = 100
const STOCK_VOLUME = 1_000_000
const STOCK_TRADE_COUNT = 10_000

let ivSeries: FakeIvSeriesFixture = {}
let barRequests: DailyBarRequest[] = []

/** Replaces the programmed IV series and clears the request log. */
export function setFakeIvSeries(fixture: FakeIvSeriesFixture): void {
  ivSeries = fixture
  barRequests = []
}

export function dailyBarRequests(): DailyBarRequest[] {
  return [...barRequests]
}

export function dailyBarRequestCount(): number {
  return barRequests.length
}

function recordBarRequest(
  kind: DailyBarRequest['kind'],
  underlying: string,
  range: DailyBarRange
): void {
  barRequests = [...barRequests, { kind, underlying, start: range.start, end: range.end ?? null }]
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sessionsInRange(series: FakeIvSeries, range: DailyBarRange): string[] {
  return Object.keys(series.sessions)
    .filter(
      (session) => session >= range.start && (range.end === undefined || session <= range.end)
    )
    .sort()
}

/** Third-Friday ("monthly") expiration, decided locally so the fake shares nothing with the
 *  selection logic it feeds. A Thursday 14–20 counts too: when the third Friday is an exchange
 *  holiday (Juneteenth 2026) the monthly expires the day before. Tickers with Thursday
 *  dailies would misclassify, which no fixture needs. */
function isMonthlyExpiration(expiration: string): boolean {
  const day = parseISO(expiration)
  return isThirdFriday(day) || (isThursday(day) && isThirdFriday(addDays(day, 1)))
}

function isThirdFriday(date: Date): boolean {
  return isFriday(date) && getDate(date) >= 15 && getDate(date) <= 21
}

function tradeCountFor(series: FakeIvSeries, spec: FakeIvSessionSpec, monthly: boolean): number {
  const sessionSpec = typeof spec === 'number' ? undefined : spec
  const tradeCount = sessionSpec?.tradeCount ?? series.tradeCount ?? DEFAULT_TRADE_COUNT
  if (monthly) return tradeCount
  return sessionSpec?.weeklyTradeCount ?? series.weeklyTradeCount ?? tradeCount
}

function optionBarsFor(
  symbol: string,
  range: DailyBarRange,
  fixture: FakeIvSeriesFixture
): DailyBar[] {
  const identity = parseOccSymbol(symbol)
  const series = identity ? fixture[identity.underlying] : undefined
  if (!identity || !series) return []
  const strike = Number(identity.strike)
  const monthly = isMonthlyExpiration(identity.expiration)

  return sessionsInRange(series, range).flatMap((session) => {
    const spec = series.sessions[session]
    const iv = typeof spec === 'number' ? spec : spec.iv
    const untraded =
      typeof spec !== 'number' &&
      (spec.untraded ?? []).some(
        (leg) => leg.strike === strike && leg.type === identity.contractType
      )
    const tradeCount = tradeCountFor(series, spec, monthly)
    const daysToExpiry = differenceInCalendarDays(parseISO(identity.expiration), parseISO(session))
    if (untraded || tradeCount === 0 || daysToExpiry <= 0) return []

    const price = new Decimal(
      blackScholesPrice({
        type: identity.contractType,
        spot: series.price,
        strike,
        yearsToExpiry: daysToExpiry / 365,
        rate: FAKE_RATE,
        dividendYield: 0,
        volatility: iv
      })
    ).toFixed(4)
    return [{ date: session, vwap: price, close: price, volume: tradeCount, tradeCount }]
  })
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
 *   FAKE_OPTION_CHAIN_DELAY_MS        number — delays only getOptionChainSnapshot (default 0)
 *   WHEELBASE_FAKE_IV_SERIES          JSON string: FakeIvSeriesFixture — read at construction;
 *                                     setFakeIvSeries() replaces it at runtime
 */
export class FakeMarketDataProvider implements MarketDataProvider {
  constructor() {
    const fixture = parseEnv<FakeIvSeriesFixture>('WHEELBASE_FAKE_IV_SERIES')
    if (fixture !== null) ivSeries = fixture
  }

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
    await delay(parseEnv<number>('FAKE_OPTION_CHAIN_DELAY_MS') ?? 0)
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

  async getOptionDailyBars(
    input: { symbols: string[] } & DailyBarRange
  ): Promise<Map<string, DailyBar[]>> {
    this.maybeThrow()
    const { symbols, ...range } = input
    const underlyings = [
      ...new Set(symbols.flatMap((symbol) => parseOccSymbol(symbol)?.underlying ?? []))
    ]
    for (const underlying of underlyings) recordBarRequest('option', underlying, range)
    await delay(Math.max(0, ...underlyings.map((u) => ivSeries[u]?.latencyMs ?? 0)))

    const failing = underlyings.find((u) => ivSeries[u]?.failWith)
    const failWith = failing ? ivSeries[failing].failWith : undefined
    if (failWith) {
      throw new MarketDataError(failWith, `Fake option bar error for ${failing}: ${failWith}`)
    }

    return new Map(
      symbols
        .map((symbol) => [symbol, optionBarsFor(symbol, range, ivSeries)] as const)
        .filter(([, bars]) => bars.length > 0)
    )
  }

  async getStockDailyBars(input: { symbol: string } & DailyBarRange): Promise<DailyBar[]> {
    this.maybeThrow()
    const { symbol, ...range } = input
    recordBarRequest('stock', symbol, range)
    const series = ivSeries[symbol]
    if (!series) return []
    await delay(series.latencyMs ?? 0)

    const price = new Decimal(series.price).toFixed(4)
    return sessionsInRange(series, range).map((date) => ({
      date,
      vwap: price,
      close: price,
      volume: STOCK_VOLUME,
      tradeCount: STOCK_TRADE_COUNT
    }))
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
