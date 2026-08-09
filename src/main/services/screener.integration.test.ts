// [US-65] AC integration — the real screenWatchlistCandidates (real chain pull, real
// IVR read, real engine) against an in-memory DB and a scripted MarketDataProvider.
// One it() per acceptance criterion; names mirror the story's Gherkin scenarios.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MarketDataProvider,
  OptionChainFilter,
  OptionChainQuote
} from '../integrations/market-data-provider'
import { makeTestDb, seedIvr, seedWatchlist } from '../test-utils'
import { screenWatchlistCandidates } from './screener'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

beforeEach(() => {
  vi.clearAllMocks()
})

// "Today" for every scenario. The default 30–45 DTE window resolves to expirations in
// [2026-08-22, 2026-09-06]; the two expirations below sit inside it.
const CURRENT_DATE = new Date(2026, 6, 23)
const EXP_37_DTE = '2026-08-29'
const EXP_36_DTE = '2026-08-28'
const TIMESTAMP = '2026-07-23T15:30:00Z'

/** A two-sided put quote that clears every default filter — each scenario overrides
 *  only the fields its AC is about. Delta is the sole greek the pipeline reads, so it
 *  is a top-level override; the other three are fixed filler. */
function chainStrike({
  delta = '-0.2800',
  ...overrides
}: Partial<Omit<OptionChainQuote, 'greeks'>> & { delta?: string } = {}): OptionChainQuote {
  return {
    contractId: 'AAPL260829P00180000',
    strike: '180.0000',
    expiration: EXP_37_DTE,
    contractType: 'put',
    bid: '2.65',
    ask: '2.75',
    mid: '2.70',
    lastTrade: '2.70',
    openInterest: 1500,
    volume: 800,
    impliedVolatility: '0.2800',
    timestamp: TIMESTAMP,
    ...overrides,
    greeks: { delta, gamma: '0.0400', theta: '-0.0500', vega: '0.1200' }
  }
}

/** Scripts the put chain per underlying; an unscripted ticker returns no options. */
function scriptChains(chains: Record<string, OptionChainQuote[]>): MarketDataProvider {
  return {
    getOptionChainSnapshot: vi.fn(
      async (filter: OptionChainFilter) => chains[filter.underlying] ?? []
    )
  } as unknown as MarketDataProvider
}

describe('US-65 screenWatchlistCandidates — acceptance criteria', () => {
  it('premium yield is computed on capital secured', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL'])
    // AAPL 37-DTE put at the $180 strike, mark $2.70.
    const provider = scriptChains({ AAPL: [chainStrike()] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    const [aapl] = result.ranked
    expect(aapl.dte).toBe(37)
    expect(aapl.periodYield).toBe('0.0150') // 2.70 / 180
    expect(aapl.annualizedYield).toBe('0.1480') // 1.5% × 365 / 37
    expect(aapl.capitalSecured).toBe('18000.00') // 180 × 100
  })

  it('rank is annualized yield per unit of delta', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['TSLA', 'MSFT'])
    const provider = scriptChains({
      // Candidate A — 0.30 delta yielding 30.0% annualized (10.80 / 365 × 365 / 36).
      TSLA: [
        chainStrike({
          contractId: 'TSLA260828P00365000',
          strike: '365.0000',
          expiration: EXP_36_DTE,
          bid: '10.75',
          ask: '10.85',
          mid: '10.80',
          delta: '-0.3000'
        })
      ],
      // Candidate B — 0.20 delta yielding 24.0% annualized.
      MSFT: [
        chainStrike({
          contractId: 'MSFT260828P00365000',
          strike: '365.0000',
          expiration: EXP_36_DTE,
          bid: '8.60',
          ask: '8.68',
          mid: '8.64',
          delta: '-0.2000'
        })
      ]
    })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.ranked.map((c) => c.annualizedYield)).toEqual(['0.2400', '0.3000'])
    // Candidate B ranks above candidate A on the higher yield-per-delta score.
    expect(result.ranked.map((c) => c.ticker)).toEqual(['MSFT', 'TSLA'])
    expect(result.ranked.map((c) => c.yieldPerDelta)).toEqual(['1.2000', '1.0000'])
  })

  it('a strike outside the delta band is excluded', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AMD'])
    const provider = scriptChains({
      // 0.42 delta with a fat 4% period yield — the yield must not rescue it.
      AMD: [
        chainStrike({
          contractId: 'AMD260829P00150000',
          strike: '150.0000',
          bid: '5.95',
          ask: '6.05',
          mid: '6.00',
          delta: '-0.4200'
        })
      ]
    })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.ranked).toEqual([])
    expect(result.excluded).toEqual([
      { ticker: 'AMD', code: 'delta_band', reason: 'delta 0.42 outside 0.20–0.30' }
    ])
  })

  it('an illiquid strike is excluded', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['KO'])
    const provider = scriptChains({
      KO: [
        chainStrike({
          contractId: 'KO260829P00060000',
          strike: '60.0000',
          bid: '1.18',
          ask: '1.22',
          mid: '1.20',
          delta: '-0.2500',
          openInterest: 120 // against the 500 floor
        })
      ]
    })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.ranked).toEqual([])
    expect(result.excluded).toEqual([
      { ticker: 'KO', code: 'open_interest', reason: 'open interest 120 below 500' }
    ])
  })

  it('a wide-spread strike is excluded', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL'])
    // bid 2.40 / ask 3.00 on a 2.70 mark — $0.60 wide, 22% of mark.
    const provider = scriptChains({ AAPL: [chainStrike({ bid: '2.40', ask: '3.00' })] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.ranked).toEqual([])
    expect(result.excluded).toEqual([
      { ticker: 'AAPL', code: 'spread', reason: 'spread 22.23% exceeds 10%' }
    ])
  })

  it('a narrow absolute spread on a cheap option is not excluded', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['XYZ'])
    const provider = scriptChains({
      // bid 0.08 / ask 0.15 — 58% of mark, but only $0.07 to cross.
      XYZ: [
        chainStrike({
          contractId: 'XYZ260829P00012500',
          strike: '12.5000',
          bid: '0.08',
          ask: '0.15',
          mid: '0.12',
          delta: '-0.2500'
        })
      ]
    })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.ranked.map((c) => c.ticker)).toEqual(['XYZ'])
    expect(result.ranked[0].spreadAbsolute).toBe('0.07')
    expect(result.excluded).toEqual([])
  })

  it('missing IV rank does not exclude a candidate', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['KO', 'AAPL', 'MSFT'])
    // IVR observed for KO and AAPL — deliberately none for MSFT.
    seedIvr(db, [
      ['KO', '2026-07-23T12:00:00Z', '38.0'],
      ['AAPL', '2026-07-23T12:00:00Z', '44.0']
    ])
    const provider = scriptChains({
      KO: [
        chainStrike({
          contractId: 'KO260829P00060000',
          strike: '60.0000',
          bid: '1.18',
          ask: '1.22',
          mid: '1.20',
          delta: '-0.2500'
        })
      ],
      AAPL: [chainStrike()],
      MSFT: [
        chainStrike({
          contractId: 'MSFT260828P00365000',
          strike: '365.0000',
          expiration: EXP_36_DTE,
          bid: '10.75',
          ask: '10.85',
          mid: '10.80',
          delta: '-0.3000'
        })
      ]
    })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.ranked.map((c) => c.ticker)).toEqual(['MSFT', 'KO', 'AAPL'])
    const [msft, ko] = result.ranked
    // MSFT still ranks; its IV rank reads "n/a" rather than excluding or zeroing it.
    expect(msft.ivRank).toBeNull()
    expect(msft.yieldPerDelta).toBe('1.0000')
    expect(ko.ivRank).toEqual({ value: '38.0', observedAt: '2026-07-23T12:00:00Z' })
    expect(result.excluded).toEqual([])
  })

  it('the best strike per ticker is selected', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL'])
    const provider = scriptChains({
      AAPL: [
        // yieldPerDelta 0.5285
        chainStrike(),
        // yieldPerDelta 0.5893 — the best risk-adjusted survivor
        chainStrike({
          contractId: 'AAPL260829P00175000',
          strike: '175.0000',
          bid: '2.25',
          ask: '2.35',
          mid: '2.30',
          delta: '-0.2200'
        }),
        // yieldPerDelta 0.5688
        chainStrike({
          contractId: 'AAPL260829P00185000',
          strike: '185.0000',
          bid: '3.15',
          ask: '3.25',
          mid: '3.20',
          delta: '-0.3000'
        })
      ]
    })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    // One row represents AAPL, and it is the highest-scoring survivor.
    expect(result.ranked).toHaveLength(1)
    const [best] = result.ranked
    expect(best.contractId).toBe('AAPL260829P00175000')
    expect(best.yieldPerDelta).toBe('0.5893')
  })
})
