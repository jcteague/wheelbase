// [US-110] PMCC screener service — the real screenWatchlistPmccCandidates (real two-window
// call pull, real IV-rank read, real earnings store, real engine) against an in-memory DB
// and the FakeMarketDataProvider, whose chains are OCC-keyed call fixtures. Only the
// Finnhub HTTP boundary is stubbed. Valuation date Fri 2026-09-18: the short call expires
// 2026-10-23 (35 DTE), the LEAPS 2027-09-17 (364) or 2028-01-21 (490).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Decimal from 'decimal.js'
import type Database from 'better-sqlite3'
import { DEFAULT_PMCC_SCREENING_CRITERIA, type PmccScreeningCriteria } from '../core/pmcc-screener'
import type { AssessedIvRank } from '../core/ivr-freshness'
import { FakeMarketDataProvider } from '../integrations/fake-market-data'
import { fetchEarningsCalendar, type EarningsCalendarRead } from '../integrations/finnhub-earnings'
import {
  MarketDataError,
  type OptionChainFilter,
  type OptionSnapshot,
  type StockQuote
} from '../integrations/market-data-provider'
import { logger } from '../logger'
import {
  makeTestDb,
  makeTradingCalendar,
  seedRankedIv30Series,
  seedTradingCalendar,
  seedWatchlist
} from '../test-utils'
import { createIvRunState } from './iv-run-state'
import { readIvRankLookup } from './iv-rank-lookup'
import {
  screenWatchlistPmccCandidates,
  type PmccScreenOptions,
  type PmccScreenerResults
} from './pmcc-screener'
import { savePmccScreeningCriteria } from './pmcc-screening-criteria'
import type { ScreenerExclusion } from './screener-shared'
import { removeWatchlistEntry } from './watchlist'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

// The IV-rank read stays real so a seeded series drives the join; the wrapper lets a test
// see what it was handed, or program a reading the engine cannot parse.
vi.mock('./iv-rank-lookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./iv-rank-lookup')>()
  return { ...actual, readIvRankLookup: vi.fn(actual.readIvRankLookup) }
})

// The Finnhub HTTP boundary. The earnings store above it (cache, horizon, last print) runs
// for real.
vi.mock('../integrations/finnhub-earnings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../integrations/finnhub-earnings')>()
  return { ...actual, fetchEarningsCalendar: vi.fn() }
})

// Mid-morning local time: DTE counts calendar days, and Sep 18's session has not closed.
const CURRENT_DATE = new Date(2026, 8, 18, 10, 0)
const TIMESTAMP = '2026-09-18T15:30:00Z'

// The two expiration ranges the default windows resolve to from CURRENT_DATE:
// 180–540 DTE → [2027-03-17, 2028-03-11]; 20–45 DTE → [2026-10-08, 2026-11-02].
const LONG_RANGE = { expirationFrom: '2027-03-17', expirationTo: '2028-03-11' }
const SHORT_RANGE = { expirationFrom: '2026-10-08', expirationTo: '2026-11-02' }

// Every weekday the seeded and fetched calendars hold: past the rank window behind the
// valuation date and the refresh threshold ahead of it.
const CALENDAR_FIRST_DAY = '2025-05-01'
const CALENDAR_LAST_DAY = '2027-12-31'

const NINE_STOCKS = ['XLF', 'KO', 'AAPL', 'PEP', 'DIS', 'MSFT', 'AMD', 'ORCL', 'XYZ']

/** A call quoted two cents either side of its mark — liquid enough to pass every default. */
function callQuote(
  mark: string,
  delta: string,
  overrides: Partial<OptionSnapshot> = {}
): OptionSnapshot {
  return {
    bid: new Decimal(mark).minus('0.02').toFixed(2),
    ask: new Decimal(mark).plus('0.02').toFixed(2),
    mid: mark,
    lastTrade: mark,
    openInterest: 1500,
    volume: 300,
    greeks: { delta, gamma: '0.0100', theta: '-0.0100', vega: '0.1000' },
    impliedVolatility: '0.2500',
    timestamp: TIMESTAMP,
    ...overrides
  }
}

// The data-model bench, keyed by OCC symbol — the fake derives strike, expiration and
// contract type from the key.
const XLF_CHAIN = {
  XLF280121C00042000: callQuote('10.30', '0.81'), // LEAPS $42C 2028-01-21
  XLF261023C00053000: callQuote('0.64', '0.29') // short $53C 2026-10-23
}
const KO_CHAIN = {
  KO280121C00057500: callQuote('13.20', '0.82'),
  KO261023C00072500: callQuote('0.62', '0.25')
}
const AAPL_CHAIN = {
  AAPL270917C00140000: callQuote('45.90', '0.81'),
  AAPL261023C00190000: callQuote('2.45', '0.27')
}
const PEP_CHAIN = {
  PEP270917C00140000: callQuote('36.40', '0.80'),
  PEP261023C00180000: callQuote('1.85', '0.27')
}
const DIS_CHAIN = {
  DIS270917C00090000: callQuote('27.60', '0.79'),
  DIS261023C00120000: callQuote('1.35', '0.26')
}
// Debit 56.30 on a $60 width: 93.83% — over the 90% cap.
const AMD_CHAIN = {
  AMD270917C00110000: callQuote('60.20', '0.80'),
  AMD261023C00170000: callQuote('3.90', '0.29')
}
// A clean diagonal: only the earnings print three days out keeps it off the list.
const MSFT_CHAIN = {
  MSFT270917C00400000: callQuote('115.00', '0.80'),
  MSFT261023C00530000: callQuote('6.50', '0.28')
}
const ORCL_CHAIN = {
  ORCL270917C00190000: callQuote('58.00', '0.80'),
  ORCL261023C00260000: callQuote('3.20', '0.28')
}
// Short-dated calls only: no LEAPS is listed.
const XYZ_SHORT_ONLY = { XYZ261023C00026000: callQuote('0.55', '0.28') }

/** The nine-stock bench. ORCL lists no calls in either window. */
const BENCH_CHAINS = {
  ...XLF_CHAIN,
  ...KO_CHAIN,
  ...AAPL_CHAIN,
  ...PEP_CHAIN,
  ...DIS_CHAIN,
  ...AMD_CHAIN,
  ...MSFT_CHAIN,
  ...XYZ_SHORT_ONLY
}

const PRICES: Record<string, string> = {
  XLF: '51.20',
  KO: '68.90',
  AAPL: '178.40',
  PEP: '171.30',
  DIS: '112.40',
  AMD: '156.20',
  MSFT: '505.10',
  ORCL: '243.60',
  XYZ: '24.10',
  SPY: '560.00'
}

function stockQuote(price: string): StockQuote {
  return {
    price,
    bid: price,
    ask: price,
    change: '0.00',
    changePercent: '0.00',
    prevClose: price,
    volume: 1_000_000,
    timestamp: TIMESTAMP
  }
}

function stubChains(chains: Record<string, OptionSnapshot>): void {
  vi.stubEnv('WHEELBASE_MOCK_OPTION_SNAPSHOTS', JSON.stringify(chains))
}

function stubQuotes(tickers: string[]): void {
  vi.stubEnv(
    'WHEELBASE_MOCK_STOCK_QUOTES',
    JSON.stringify(Object.fromEntries(tickers.map((t) => [t, stockQuote(PRICES[t])])))
  )
}

/** What the Finnhub calendar holds; a ticker not named is a read that found nothing. */
function scriptEarnings(byTicker: Record<string, EarningsCalendarRead> = {}): void {
  vi.mocked(fetchEarningsCalendar).mockImplementation(async (tickers) =>
    Object.fromEntries(
      tickers.map((ticker): [string, EarningsCalendarRead] => [
        ticker,
        byTicker[ticker] ?? { status: 'read', next: null, last: null }
      ])
    )
  )
}

/** A watchlist with the exchange calendar cached — the state every screen runs in. */
function makeBenchDb(tickers: string[]): Database.Database {
  const db = makeTestDb()
  seedTradingCalendar(db, CALENDAR_FIRST_DAY, CALENDAR_LAST_DAY)
  seedWatchlist(db, tickers)
  return db
}

/** A provider serving the given chains, with a quote for every ticker named. */
function benchProvider(
  chains: Record<string, OptionSnapshot>,
  quoted: string[]
): FakeMarketDataProvider {
  stubChains(chains)
  stubQuotes(quoted)
  return new FakeMarketDataProvider()
}

function screen(
  db: Database.Database,
  provider: FakeMarketDataProvider,
  opts: Partial<PmccScreenOptions> = {}
): Promise<PmccScreenerResults> {
  return screenWatchlistPmccCandidates(() => provider, db, {
    runState: createIvRunState(),
    currentDate: CURRENT_DATE,
    ...opts
  })
}

function criteria(overrides: Partial<PmccScreeningCriteria>): PmccScreeningCriteria {
  return { ...DEFAULT_PMCC_SCREENING_CRITERIA, ...overrides }
}

/** Saves the default PMCC document with a tighter debit / width cap. */
function persistDebitCap(db: Database.Database, maxDebitToWidthPercent: string): void {
  savePmccScreeningCriteria(db, { ...DEFAULT_PMCC_SCREENING_CRITERIA, maxDebitToWidthPercent })
}

function byTicker(rows: ScreenerExclusion[]): ScreenerExclusion[] {
  return [...rows].sort((a, b) => a.ticker.localeCompare(b.ticker))
}

/** Fails the chain call for one expiration range (and optionally one ticker) with `error`;
 *  every other call reaches the real fake. */
function failChainPull(
  provider: FakeMarketDataProvider,
  matches: (filter: OptionChainFilter) => boolean,
  error: MarketDataError
): void {
  const real = provider.getOptionChainSnapshot.bind(provider)
  vi.spyOn(provider, 'getOptionChainSnapshot').mockImplementation(async (filter) => {
    if (matches(filter)) throw error
    return real(filter)
  })
}

const NETWORK_DOWN = new MarketDataError('network_error', 'market data unreachable')

beforeEach(() => {
  vi.clearAllMocks()
  scriptEarnings()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('US-110 screenWatchlistPmccCandidates — the nine-stock bench at default criteria', () => {
  async function screenBench(): Promise<PmccScreenerResults> {
    const db = makeBenchDb(NINE_STOCKS)
    scriptEarnings({ MSFT: { status: 'read', next: '2026-09-21', last: null } })
    return screen(db, benchProvider(BENCH_CHAINS, NINE_STOCKS))
  }

  it('ranks the surviving diagonals by return per delta', async () => {
    const result = await screenBench()

    expect(result.status).toBe('ok')
    // 2.3825, 2.1779, 2.0682, 2.0628, 2.0559 — the gates that hold AAPL/PEP/DIS back
    // are the bench's, not the service's.
    expect(result.ranked.map((c) => c.ticker)).toEqual(['XLF', 'AAPL', 'PEP', 'DIS', 'KO'])
  })

  it('excludes AMD, MSFT, ORCL and XYZ, each with the reason that refused it', async () => {
    const result = await screenBench()

    expect(byTicker(result.excluded)).toEqual([
      { ticker: 'AMD', code: 'debit_to_width', reason: 'debit 93.84% of width exceeds 90%' },
      {
        ticker: 'MSFT',
        code: 'earnings_in_window',
        reason: 'earnings 2026-09-21 falls on or before expiry'
      },
      {
        ticker: 'ORCL',
        code: 'no_options_listed',
        reason: 'no calls quoted in the 180–540 DTE window'
      },
      {
        ticker: 'XYZ',
        code: 'no_options_listed',
        reason: 'no calls quoted in the 180–540 DTE window'
      }
    ])
  })

  it('places every watchlist ticker in exactly one of ranked / excluded', async () => {
    const result = await screenBench()

    const placed = [...result.ranked, ...result.excluded].map((row) => row.ticker)
    expect([...placed].sort()).toEqual([...NINE_STOCKS].sort())
  })

  it('logs the completed screen at INFO with its counts', async () => {
    await screenBench()

    expect(logger.info).toHaveBeenCalledWith(
      { status: 'ok', rankedCount: 5, excludedCount: 4 },
      'PMCC screen completed'
    )
  })
})

describe('US-110 screenWatchlistPmccCandidates — chain pulls', () => {
  it('pulls calls twice per ticker — once per window — and never puts', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])
    const chainSpy = vi.spyOn(provider, 'getOptionChainSnapshot')

    await screen(db, provider)

    const requests = chainSpy.mock.calls
      .map(([filter]) => filter)
      .sort(
        (a, b) =>
          a.underlying.localeCompare(b.underlying) ||
          (a.expirationFrom ?? '').localeCompare(b.expirationFrom ?? '')
      )
    expect(requests).toEqual([
      { underlying: 'KO', ...SHORT_RANGE, type: 'call' },
      { underlying: 'KO', ...LONG_RANGE, type: 'call' },
      { underlying: 'XLF', ...SHORT_RANGE, type: 'call' },
      { underlying: 'XLF', ...LONG_RANGE, type: 'call' }
    ])
  })

  it('names the empty LEAPS window for a ticker with short calls only, and the empty short window for one with LEAPS only', async () => {
    const db = makeBenchDb(['XYZ', 'SPY'])
    const provider = benchProvider(
      { ...XYZ_SHORT_ONLY, SPY270917C00480000: callQuote('92.00', '0.80') },
      ['XYZ', 'SPY']
    )

    const result = await screen(db, provider)

    expect(result.ranked).toEqual([])
    expect(byTicker(result.excluded)).toEqual([
      {
        ticker: 'SPY',
        code: 'no_options_listed',
        reason: 'no calls quoted in the 20–45 DTE window'
      },
      {
        ticker: 'XYZ',
        code: 'no_options_listed',
        reason: 'no calls quoted in the 180–540 DTE window'
      }
    ])
  })

  it('words an empty window with the criteria actually screened, not the defaults', async () => {
    const db = makeBenchDb(['XYZ', 'SPY'])
    const provider = benchProvider(
      { ...XYZ_SHORT_ONLY, SPY270917C00480000: callQuote('92.00', '0.80') },
      ['XYZ', 'SPY']
    )

    const result = await screen(db, provider, {
      criteria: criteria({ longDteMin: 200, longDteMax: 600, shortDteMin: 21, shortDteMax: 50 })
    })

    expect(byTicker(result.excluded)).toEqual([
      {
        ticker: 'SPY',
        code: 'no_options_listed',
        reason: 'no calls quoted in the 21–50 DTE window'
      },
      {
        ticker: 'XYZ',
        code: 'no_options_listed',
        reason: 'no calls quoted in the 200–600 DTE window'
      }
    ])
  })

  it('reports a ticker whose chain could not be fetched as data unavailable, without costing the others', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])
    failChainPull(
      provider,
      (filter) => filter.underlying === 'KO' && filter.expirationFrom === LONG_RANGE.expirationFrom,
      new MarketDataError('not_found', 'HTTP 404')
    )

    const result = await screen(db, provider)

    expect(result.ranked.map((c) => c.ticker)).toEqual(['XLF'])
    expect(result.excluded).toEqual([
      { ticker: 'KO', code: 'data_unavailable', reason: 'market data unavailable' }
    ])
  })

  it('reports a ticker removed from the watchlist between the two window pulls as data unavailable', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])
    // The trader removes KO while its LEAPS chain is in flight, so the short-window pull
    // (which re-reads the watchlist) never asks for it.
    const real = provider.getOptionChainSnapshot.bind(provider)
    vi.spyOn(provider, 'getOptionChainSnapshot').mockImplementation(async (filter) => {
      if (filter.underlying === 'KO' && filter.expirationFrom === LONG_RANGE.expirationFrom) {
        removeWatchlistEntry(db, 'KO')
      }
      return real(filter)
    })

    const result = await screen(db, provider)

    expect(result.ranked.map((c) => c.ticker)).toEqual(['XLF'])
    expect(result.excluded).toEqual([
      { ticker: 'KO', code: 'data_unavailable', reason: 'market data unavailable' }
    ])
  })

  it('drops only a malformed quote and still screens the ticker’s good diagonal', async () => {
    const db = makeBenchDb(['XLF'])
    const provider = benchProvider(
      { ...XLF_CHAIN, XLF261023C00054000: callQuote('0.50', '0.27', { mid: 'n/a' }) },
      ['XLF']
    )

    const result = await screen(db, provider)

    expect(result.ranked.map((c) => [c.short.contractId, c.returnPerDelta])).toEqual([
      ['XLF261023C00053000', '2.3825']
    ])
    expect(result.excluded).toEqual([])
  })
})

describe('US-110 screenWatchlistPmccCandidates — provider outages', () => {
  const OUTAGE: PmccScreenerResults = {
    status: 'provider_unavailable',
    ranked: [],
    excluded: [],
    quoteTimestamp: null
  }

  it('reports provider_unavailable when the LEAPS-window pull is an outage', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])
    failChainPull(
      provider,
      (filter) => filter.expirationFrom === LONG_RANGE.expirationFrom,
      NETWORK_DOWN
    )

    expect(await screen(db, provider)).toEqual(OUTAGE)
  })

  it('reports provider_unavailable when only the short-window pull is an outage', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])
    failChainPull(
      provider,
      (filter) => filter.expirationFrom === SHORT_RANGE.expirationFrom,
      NETWORK_DOWN
    )

    expect(await screen(db, provider)).toEqual(OUTAGE)
  })

  it('makes no underlying-quote or earnings request when a chain pull is an outage', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])
    failChainPull(
      provider,
      (filter) => filter.expirationFrom === SHORT_RANGE.expirationFrom,
      NETWORK_DOWN
    )
    const quoteSpy = vi.spyOn(provider, 'getStockQuotes')

    expect(await screen(db, provider)).toEqual(OUTAGE)
    expect(quoteSpy).not.toHaveBeenCalled()
    expect(fetchEarningsCalendar).not.toHaveBeenCalled()
  })

  it('reports provider_unavailable when the provider cannot be constructed', async () => {
    const db = makeBenchDb(['XLF'])

    const result = await screenWatchlistPmccCandidates(
      () => {
        throw new Error('market data provider not configured')
      },
      db,
      { runState: createIvRunState(), currentDate: CURRENT_DATE }
    )

    expect(result).toEqual(OUTAGE)
  })
})

describe('US-110 screenWatchlistPmccCandidates — underlying quotes', () => {
  it('fetches a quote for every watchlist ticker with no price ceiling set, and prices the LEAPS extrinsic from it', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])
    const quoteSpy = vi.spyOn(provider, 'getStockQuotes')

    const result = await screen(db, provider)

    expect(quoteSpy.mock.calls.flatMap(([tickers]) => tickers).sort()).toEqual(['KO', 'XLF'])
    // 10.30 − (51.20 − 42.00) and 13.20 − (68.90 − 57.50)
    expect(result.ranked.map((c) => [c.ticker, c.longExtrinsic])).toEqual([
      ['XLF', '1.10'],
      ['KO', '1.80']
    ])
  })

  it('requests no quote until every chain request has settled, so the two bursts never overlap', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])
    const events: Array<'chain_requested' | 'chain_settled' | 'quote_requested'> = []
    // Every chain request is held open until the test releases it by hand.
    let releaseChains: () => void = () => {}
    const chainsHeld = new Promise<void>((resolve) => {
      releaseChains = resolve
    })
    const realChain = provider.getOptionChainSnapshot.bind(provider)
    vi.spyOn(provider, 'getOptionChainSnapshot').mockImplementation(async (filter) => {
      events.push('chain_requested')
      await chainsHeld
      const quotes = await realChain(filter)
      events.push('chain_settled')
      return quotes
    })
    const realQuotes = provider.getStockQuotes.bind(provider)
    vi.spyOn(provider, 'getStockQuotes').mockImplementation(async (tickers) => {
      events.push('quote_requested')
      return realQuotes(tickers)
    })

    const screening = screen(db, provider)
    // A macrotask turn: every read the screen can start without the chains has started.
    await new Promise((resolve) => setTimeout(resolve, 0))
    releaseChains()
    const result = await screening

    expect(result.ranked.map((c) => c.ticker)).toEqual(['XLF', 'KO'])
    expect(events.filter((e) => e === 'chain_settled')).toHaveLength(4)
    expect(events.indexOf('quote_requested')).toBeGreaterThan(events.lastIndexOf('chain_settled'))
  })

  it('still ranks a ticker whose quote fetch throws, with its extrinsic unknown', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])
    const realQuotes = provider.getStockQuotes.bind(provider)
    vi.spyOn(provider, 'getStockQuotes').mockImplementation(async (tickers) => {
      if (tickers.includes('XLF')) throw new MarketDataError('network_error', 'XLF quote failed')
      return realQuotes(tickers)
    })

    const result = await screen(db, provider)

    const [xlf, ko] = result.ranked
    expect(xlf.ticker).toBe('XLF')
    expect(xlf.returnPerDelta).toBe('2.3825')
    expect(xlf.longExtrinsic).toBeNull()
    expect(xlf.extrinsicCoverage).toBeNull()
    // KO's quote arrived, so its extrinsic is still priced.
    expect(ko.longExtrinsic).toBe('1.80')
  })
})

describe('US-110 screenWatchlistPmccCandidates — earnings', () => {
  it('still ranks every diagonal with its earnings unavailable when the earnings read rejects', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    vi.mocked(fetchEarningsCalendar).mockRejectedValueOnce(new Error('Finnhub unreachable'))
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])

    const result = await screen(db, provider)

    expect(result.ranked.map((c) => [c.ticker, c.earnings])).toEqual([
      ['XLF', { status: 'unavailable' }],
      ['KO', { status: 'unavailable' }]
    ])
    expect(result.excluded).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ tickers: ['XLF', 'KO'] }),
      'pmcc_screener_earnings_read_failed'
    )
  })
})

describe('US-110 screenWatchlistPmccCandidates — IV rank', () => {
  // Holds every weekday, as the seeded table does.
  let sessions: ReturnType<typeof makeTradingCalendar>
  beforeEach(() => {
    sessions = makeTradingCalendar(CALENDAR_FIRST_DAY, CALENDAR_LAST_DAY)
  })

  it('carries a stale, expired or pre-earnings reading onto the ranked row without judging the IV band on it', async () => {
    const db = makeBenchDb(['KO', 'PEP', 'DIS', 'ORCL'])
    seedRankedIv30Series(db, 'KO', sessions, '2026-09-17', 58) // fresh — the positive control
    seedRankedIv30Series(db, 'PEP', sessions, '2026-09-09', 58) // 6 sessions old: stale
    seedRankedIv30Series(db, 'DIS', sessions, '2026-08-31', 47) // 13 sessions old: expired
    seedRankedIv30Series(db, 'ORCL', sessions, '2026-09-14', 62) // before the Sep 15 print
    scriptEarnings({ ORCL: { status: 'read', next: null, last: '2026-09-15' } })
    const provider = benchProvider({ ...KO_CHAIN, ...PEP_CHAIN, ...DIS_CHAIN, ...ORCL_CHAIN }, [
      'KO',
      'PEP',
      'DIS',
      'ORCL'
    ])

    const result = await screen(db, provider, {
      criteria: criteria({ minIvRank: '50', maxIvRank: '55' })
    })

    // A fresh 58 is judged and refused by the 55 ceiling …
    expect(result.excluded).toEqual([
      { ticker: 'KO', code: 'iv_rank_ceiling', reason: 'IV rank 58 (Sep 17) above 55' }
    ])
    // … while a stale 58, an expired 47 and a pre-earnings 62 never reach the band.
    expect(
      result.ranked
        .map((c) => [c.ticker, c.ivRank?.value, c.ivRank?.state, c.ivRankAbsence])
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
    ).toEqual([
      ['DIS', '47', 'expired', null],
      ['ORCL', '62', 'predates_earnings', null],
      ['PEP', '58', 'stale', null]
    ])
  })

  it('ranks a ticker with no IV history as not collected, and one mid-collection as pending', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    const runState = createIvRunState()
    runState.markPending('KO')
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])

    const result = await screen(db, provider, { runState })

    expect(result.ranked.map((c) => [c.ticker, c.ivRank, c.ivRankAbsence])).toEqual([
      ['XLF', null, { reason: 'not_collected' }],
      ['KO', null, { reason: 'pending' }]
    ])
  })

  it('forwards the caller’s run state to the IV-rank read as the same object', async () => {
    const db = makeBenchDb(['XLF'])
    const runState = createIvRunState()
    const provider = benchProvider(XLF_CHAIN, ['XLF'])

    await screen(db, provider, { runState })

    expect(readIvRankLookup).toHaveBeenCalledTimes(1)
    expect(vi.mocked(readIvRankLookup).mock.calls[0][2].runState).toBe(runState)
  })

  it('isolates a ticker the engine cannot screen as data unavailable, ranking the others', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    const unparseable: AssessedIvRank = {
      value: 'not-a-number',
      percentile: '40',
      low: '0.2000',
      high: '0.4500',
      observedAt: '2026-09-17T20:00:00.000Z',
      ageTradingDays: 0,
      state: 'fresh'
    }
    vi.mocked(readIvRankLookup).mockReturnValueOnce(
      new Map([['XLF', { ivRank: unparseable, ivRankAbsence: null }]])
    )
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])

    const result = await screen(db, provider, { criteria: criteria({ maxIvRank: '55' }) })

    expect(result.ranked.map((c) => c.ticker)).toEqual(['KO'])
    expect(result.excluded).toEqual([
      { ticker: 'XLF', code: 'data_unavailable', reason: 'market data unavailable' }
    ])
  })
})

describe('US-110 screenWatchlistPmccCandidates — criteria and timestamp', () => {
  it('reports the newest leg timestamp across the ranked diagonals, ignoring excluded ones', async () => {
    const db = makeBenchDb(['XLF', 'KO', 'AMD'])
    const provider = benchProvider(
      {
        XLF280121C00042000: callQuote('10.30', '0.81', { timestamp: '2026-09-18T15:30:00Z' }),
        XLF261023C00053000: callQuote('0.64', '0.29', { timestamp: '2026-09-18T15:31:00Z' }),
        KO280121C00057500: callQuote('13.20', '0.82', { timestamp: '2026-09-18T15:29:00Z' }),
        KO261023C00072500: callQuote('0.62', '0.25', { timestamp: '2026-09-18T15:29:00Z' }),
        AMD270917C00110000: callQuote('60.20', '0.80', { timestamp: '2026-09-18T15:45:00Z' }),
        AMD261023C00170000: callQuote('3.90', '0.29', { timestamp: '2026-09-18T15:45:00Z' })
      },
      ['XLF', 'KO', 'AMD']
    )

    const result = await screen(db, provider)

    expect(result.quoteTimestamp).toBe('2026-09-18T15:31:00Z')
  })

  it('screens against the persisted PMCC criteria when the caller supplies none', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    persistDebitCap(db, '85')
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])

    const result = await screen(db, provider)

    expect(result.ranked.map((c) => c.ticker)).toEqual(['KO'])
    expect(result.excluded).toEqual([
      { ticker: 'XLF', code: 'debit_to_width', reason: 'debit 87.82% of width exceeds 85%' }
    ])
  })

  it('lets opts.criteria override the persisted document', async () => {
    const db = makeBenchDb(['XLF', 'KO'])
    persistDebitCap(db, '85')
    const provider = benchProvider({ ...XLF_CHAIN, ...KO_CHAIN }, ['XLF', 'KO'])

    const result = await screen(db, provider, { criteria: DEFAULT_PMCC_SCREENING_CRITERIA })

    expect(result.ranked.map((c) => c.ticker)).toEqual(['XLF', 'KO'])
    expect(result.excluded).toEqual([])
  })
})
