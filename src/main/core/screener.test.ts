// [US-65] screener — screening criteria, yield math, hard filters, and ranking
import { describe, expect, it } from 'vitest'
import { format, parseISO } from 'date-fns'
import type { CandidateStrike } from './candidate-chain'
import {
  DEFAULT_SCREENING_CRITERIA,
  evaluateFilters,
  rankCandidates,
  scoreCandidate,
  screenTicker,
  type FilterInput,
  type IvRank,
  type ScreeningCriteria,
  type TickerScreeningInput
} from './screener'

// A known IV rank always travels with the time it was observed, so downstream
// surfaces can judge whether it is still worth acting on.
const IVR_OBSERVED_AT = '2026-08-05T20:00:00.000Z'
const IVR_44 = { value: '44.0', observedAt: IVR_OBSERVED_AT }

// Derived rather than hardcoded, so the expectation holds in any machine's zone —
// the same technique the renderer's fmtQuoteTime test uses.
const IVR_OBSERVED_LABEL = format(parseISO(IVR_OBSERVED_AT), 'MMM d')

// [US-67] IV rank is stored at 1dp and the floor's exclusion reason renders the
// stored value verbatim, so the fixtures carry the same 1dp shape the collector writes.
function ivRank(value: string): IvRank {
  return { value, observedAt: IVR_OBSERVED_AT }
}

function strike(overrides: Partial<CandidateStrike> = {}): CandidateStrike {
  return {
    contractId: 'AAPL260912P00180000',
    strike: '180.0000',
    expiration: '2026-09-12',
    bid: '2.65',
    ask: '2.75',
    mark: '2.70',
    delta: '-0.2800',
    openInterest: 1200,
    volume: 340,
    timestamp: '2026-08-06T15:30:00Z',
    ...overrides
  }
}

describe('DEFAULT_SCREENING_CRITERIA', () => {
  it('matches the story Background: 0.20–0.30 delta, 30–45 DTE, 500 OI, 10%/$0.10 spread', () => {
    expect(DEFAULT_SCREENING_CRITERIA).toEqual({
      deltaMin: '0.20',
      deltaMax: '0.30',
      dteMin: 30,
      dteMax: 45,
      minOpenInterest: 500,
      maxSpreadPercent: '10',
      maxSpreadAbsolute: '0.10',
      maxUnderlyingPrice: null,
      minIvRank: null,
      earningsHandling: 'exclude'
    })
  })

  // [US-67] The floor is a ranking input the trader opts into — shipping it on would
  // silently empty results in a low-volatility market.
  it('leaves the IV-rank floor off', () => {
    expect(DEFAULT_SCREENING_CRITERIA.minIvRank).toBe(null)
  })
})

describe('scoreCandidate', () => {
  it('computes premium yield on capital secured for the AAPL 180 put at 37 DTE', () => {
    const scored = scoreCandidate(strike(), 'AAPL', 37, null)

    expect(scored.periodYield).toBe('0.0150')
    expect(scored.annualizedYield).toBe('0.1480')
    expect(scored.capitalSecured).toBe('18000.00')
  })

  it('divides the unrounded annualized yield by delta, not the 4dp rounded one', () => {
    // 0.015 × 365 / 37 = 0.14797297…; ÷ 0.28 = 0.5284749 → 0.5285.
    // Dividing the rounded 0.1480 would give 0.5286.
    expect(scoreCandidate(strike(), 'AAPL', 37, null).yieldPerDelta).toBe('0.5285')
  })

  it('absolutizes a negative put delta', () => {
    expect(scoreCandidate(strike({ delta: '-0.2800' }), 'AAPL', 37, null).delta).toBe('0.2800')
  })

  it('scores AC-2 candidate A — 30% annualized at 0.30 delta — as 1.0000', () => {
    const scored = scoreCandidate(
      strike({ strike: '73.0000', mark: '1.80', delta: '-0.3000' }),
      'KO',
      30,
      null
    )

    expect(scored.annualizedYield).toBe('0.3000')
    expect(scored.yieldPerDelta).toBe('1.0000')
  })

  it('scores AC-2 candidate B — 24% annualized at 0.20 delta — as 1.2000', () => {
    const scored = scoreCandidate(
      strike({ strike: '73.0000', mark: '1.44', delta: '-0.2000' }),
      'MSFT',
      30,
      null
    )

    expect(scored.annualizedYield).toBe('0.2400')
    expect(scored.yieldPerDelta).toBe('1.2000')
  })

  it('computes the absolute and percent spread from bid and ask against mark', () => {
    const scored = scoreCandidate(
      strike({ bid: '2.40', ask: '3.00', mark: '2.70' }),
      'AAPL',
      37,
      null
    )

    expect(scored.spreadAbsolute).toBe('0.60')
    expect(scored.spreadPercent).toBe('22.22')
  })

  it('yields on the chain-supplied mark rather than recomputing it from bid and ask', () => {
    // (bid + ask) / 2 would be 3.00; the chain says 2.70 and the chain wins.
    const scored = scoreCandidate(
      strike({ bid: '2.40', ask: '3.60', mark: '2.70' }),
      'AAPL',
      37,
      null
    )

    expect(scored.mark).toBe('2.70')
    expect(scored.periodYield).toBe('0.0150')
  })

  it('defaults earningsFlagged to false when no flag is supplied', () => {
    expect(scoreCandidate(strike(), 'AAPL', 37, null).earningsFlagged).toBe(false)
  })

  it('carries the identity, liquidity, and quote fields straight through', () => {
    const scored = scoreCandidate(strike(), 'AAPL', 37, IVR_44)

    expect(scored).toMatchObject({
      ticker: 'AAPL',
      contractId: 'AAPL260912P00180000',
      strike: '180.0000',
      expiration: '2026-09-12',
      dte: 37,
      bid: '2.65',
      ask: '2.75',
      openInterest: 1200,
      volume: 340,
      ivRank: IVR_44,
      timestamp: '2026-08-06T15:30:00Z'
    })
  })
})

// 2026-09-12 is 37 DTE from here; 2026-09-05 is 30.
const CURRENT_DATE = new Date(2026, 7, 6)

function filterInput(overrides: Partial<FilterInput> = {}): FilterInput {
  return {
    strike: strike(),
    dte: 37,
    underlyingPrice: null,
    ivRank: null,
    earningsDate: null,
    currentDate: CURRENT_DATE,
    ...overrides
  }
}

function criteria(overrides: Partial<ScreeningCriteria> = {}): ScreeningCriteria {
  return { ...DEFAULT_SCREENING_CRITERIA, ...overrides }
}

describe('evaluateFilters — delta', () => {
  it('excludes a strike whose absolute delta sits outside the band', () => {
    const failure = evaluateFilters(
      filterInput({ strike: strike({ delta: '0.4200' }) }),
      criteria()
    )

    expect(failure).toMatchObject({
      code: 'delta_band',
      reason: 'delta 0.42 outside 0.20–0.30'
    })
  })

  it('reports the same reason for a signed put delta as for its absolute value', () => {
    const failure = evaluateFilters(
      filterInput({ strike: strike({ delta: '-0.4200' }) }),
      criteria()
    )

    expect(failure?.reason).toBe('delta 0.42 outside 0.20–0.30')
  })

  it('treats both band bounds as inclusive', () => {
    expect(evaluateFilters(filterInput({ strike: strike({ delta: '-0.2000' }) }), criteria())).toBe(
      null
    )
    expect(evaluateFilters(filterInput({ strike: strike({ delta: '-0.3000' }) }), criteria())).toBe(
      null
    )
  })

  it('excludes a strike with no delta at all', () => {
    const failure = evaluateFilters(filterInput({ strike: strike({ delta: null }) }), criteria())

    expect(failure).toMatchObject({ code: 'delta_unavailable', reason: 'delta unavailable' })
  })
})

describe('evaluateFilters — open interest', () => {
  it('excludes a strike below the open-interest floor', () => {
    const failure = evaluateFilters(
      filterInput({ strike: strike({ openInterest: 120 }) }),
      criteria()
    )

    expect(failure).toMatchObject({
      code: 'open_interest',
      reason: 'open interest 120 below 500'
    })
  })

  it('does not exclude a strike whose open interest is unknown', () => {
    expect(
      evaluateFilters(filterInput({ strike: strike({ openInterest: null }) }), criteria())
    ).toBe(null)
  })

  it('excludes a strike with zero open interest — zero is a real reading, not a gap', () => {
    const failure = evaluateFilters(
      filterInput({ strike: strike({ openInterest: 0 }) }),
      criteria()
    )

    expect(failure).toMatchObject({
      code: 'open_interest',
      reason: 'open interest 0 below 500'
    })
  })
})

describe('evaluateFilters — spread', () => {
  it('excludes a strike whose spread breaches both the percent and absolute ceilings', () => {
    const failure = evaluateFilters(
      filterInput({ strike: strike({ bid: '2.40', ask: '3.00', mark: '2.70' }) }),
      criteria()
    )

    expect(failure).toMatchObject({ code: 'spread', reason: 'spread 22.23% exceeds 10%' })
  })

  it('never renders a reason whose observed percent reads equal to the limit it exceeds', () => {
    // 0.21 wide on a 2.09 mark = 10.0478…% — a 0dp rendering would claim
    // "spread 10% exceeds 10%", so the observed side rounds up at 2dp instead.
    const failure = evaluateFilters(
      filterInput({ strike: strike({ bid: '2.00', ask: '2.21', mark: '2.09' }) }),
      criteria()
    )

    expect(failure).toMatchObject({ code: 'spread', reason: 'spread 10.05% exceeds 10%' })
  })

  it('does not exclude a cheap option whose absolute spread is inside the floor', () => {
    // $0.07 wide is 58% of a $0.12 mark, but still under the $0.10 absolute floor —
    // both ceilings must be breached before a strike is dropped.
    expect(
      evaluateFilters(
        filterInput({ strike: strike({ bid: '0.08', ask: '0.15', mark: '0.12' }) }),
        criteria()
      )
    ).toBe(null)
  })
})

describe('evaluateFilters — DTE window', () => {
  it('excludes a strike expiring outside the window', () => {
    const failure = evaluateFilters(filterInput({ dte: 52 }), criteria())

    expect(failure).toMatchObject({ code: 'dte_window', reason: 'DTE 52 outside 30–45' })
  })

  it('excludes a strike whose expiration could not be parsed', () => {
    expect(evaluateFilters(filterInput({ dte: null }), criteria())?.code).toBe('dte_window')
  })

  it('excludes a same-day expiration, which would divide the annualized yield by zero', () => {
    expect(evaluateFilters(filterInput({ dte: 0 }), criteria())?.code).toBe('dte_window')
  })
})

describe('evaluateFilters — price ceiling', () => {
  it('excludes a ticker trading above the capital ceiling', () => {
    const failure = evaluateFilters(
      filterInput({ underlyingPrice: '412.00' }),
      criteria({ maxUnderlyingPrice: '75' })
    )

    expect(failure).toMatchObject({
      code: 'price_ceiling',
      reason: 'underlying $412.00 above $75.00 ceiling'
    })
  })

  it('does not fire when the ceiling is disabled', () => {
    expect(evaluateFilters(filterInput({ underlyingPrice: '412.00' }), criteria())).toBe(null)
  })

  it('does not fire when the underlying price is unknown', () => {
    expect(
      evaluateFilters(
        filterInput({ underlyingPrice: null }),
        criteria({ maxUnderlyingPrice: '75' })
      )
    ).toBe(null)
  })
})

// [US-67] The floor is optional and sits immediately after the price ceiling — both
// are whole-ticker disqualifiers, judged before any per-strike criterion.
describe('evaluateFilters — IV-rank floor', () => {
  it('excludes a ticker whose IV rank sits below the floor', () => {
    const failure = evaluateFilters(
      filterInput({ ivRank: ivRank('22.0') }),
      criteria({ minIvRank: '30' })
    )

    expect(failure).toMatchObject({
      code: 'iv_rank_floor',
      reason: `IV rank 22.0 (${IVR_OBSERVED_LABEL}) below 30`
    })
  })

  it('does not fire on a ticker whose IV rank clears the floor', () => {
    expect(
      evaluateFilters(filterInput({ ivRank: ivRank('38.0') }), criteria({ minIvRank: '30' }))
    ).toBe(null)
  })

  it('treats the floor as inclusive — an IV rank exactly at it survives', () => {
    expect(
      evaluateFilters(filterInput({ ivRank: ivRank('30.0') }), criteria({ minIvRank: '30' }))
    ).toBe(null)
  })

  it('does not exclude a ticker whose IV rank is unknown — a gap is not a low reading', () => {
    expect(evaluateFilters(filterInput({ ivRank: null }), criteria({ minIvRank: '30' }))).toBe(null)
  })

  it('does not fire when the floor is disabled', () => {
    expect(evaluateFilters(filterInput({ ivRank: ivRank('5.0') }), criteria())).toBe(null)
  })
})

describe('evaluateFilters — earnings', () => {
  // CURRENT_DATE is 2026-08-06; earnings land between now and the 2026-08-21 expiry.
  const beforeExpiry = filterInput({
    strike: strike({ expiration: '2026-08-21' }),
    earningsDate: '2026-08-12'
  })

  it('excludes a strike whose expiry straddles an earnings report', () => {
    expect(evaluateFilters(beforeExpiry, criteria())).toMatchObject({
      code: 'earnings_in_window',
      reason: 'earnings 2026-08-12 falls on or before expiry'
    })
  })

  it('excludes a strike whose earnings land exactly on the expiry date', () => {
    expect(
      evaluateFilters({ ...beforeExpiry, earningsDate: '2026-08-21' }, criteria())
    ).toMatchObject({
      code: 'earnings_in_window',
      reason: 'earnings 2026-08-21 falls on or before expiry'
    })
  })

  it('does not fire when earnings land after the expiry', () => {
    expect(evaluateFilters({ ...beforeExpiry, earningsDate: '2026-09-04' }, criteria())).toBe(null)
  })

  it('does not fire on an already-past earnings date — last quarter’s print is not gap risk', () => {
    expect(evaluateFilters({ ...beforeExpiry, earningsDate: '2026-07-28' }, criteria())).toBe(null)
  })

  it('fires on an earnings print landing today — the trader would hold across it', () => {
    expect(
      evaluateFilters({ ...beforeExpiry, earningsDate: '2026-08-06' }, criteria())
    ).toMatchObject({ code: 'earnings_in_window' })
  })

  it('does not fire when the trader chose to flag earnings rather than exclude them', () => {
    expect(evaluateFilters(beforeExpiry, criteria({ earningsHandling: 'flag' }))).toBe(null)
  })

  it('does not fire when no earnings date is known', () => {
    expect(evaluateFilters({ ...beforeExpiry, earningsDate: null }, criteria())).toBe(null)
  })
})

describe('evaluateFilters — ordering', () => {
  it('reports only the first failing filter when a strike breaches several', () => {
    const failure = evaluateFilters(
      filterInput({ strike: strike({ delta: '-0.4200', openInterest: 120 }) }),
      criteria()
    )

    expect(failure?.code).toBe('delta_band')
  })

  it('reports the ticker-level IV-rank floor ahead of a per-strike delta breach', () => {
    const offBand = strike({ delta: '-0.4200' })
    const failure = evaluateFilters(
      filterInput({ strike: offBand, ivRank: ivRank('22.0') }),
      criteria({ minIvRank: '30' })
    )
    const deltaOnly = evaluateFilters(filterInput({ strike: offBand }), criteria())

    expect(failure?.code).toBe('iv_rank_floor')
    expect(failure!.index).toBeLessThan(deltaOnly!.index)
  })
})

function tickerInput(overrides: Partial<TickerScreeningInput> = {}): TickerScreeningInput {
  return {
    ticker: 'AAPL',
    strikes: [strike()],
    ivRank: null,
    underlyingPrice: null,
    earningsDate: null,
    ...overrides
  }
}

describe('screenTicker', () => {
  it('represents the ticker with its highest-scoring survivor and nothing else', () => {
    const result = screenTicker(
      tickerInput({
        strikes: [
          strike({ contractId: 'B', strike: '180.0000', mark: '2.70', delta: '-0.2800' }),
          strike({ contractId: 'A', strike: '175.0000', mark: '2.00', delta: '-0.2000' }),
          strike({ contractId: 'C', strike: '170.0000', mark: '1.50', delta: '-0.2200' })
        ]
      }),
      DEFAULT_SCREENING_CRITERIA,
      CURRENT_DATE
    )

    expect(result.best?.contractId).toBe('A')
    expect(result.excluded).toEqual([])
    expect(JSON.stringify(result)).not.toContain('"B"')
    expect(JSON.stringify(result)).not.toContain('"C"')
  })

  it('never lets a rich yield rescue a strike outside the delta band', () => {
    const result = screenTicker(
      tickerInput({
        strikes: [
          strike({ contractId: 'fat', mark: '8.00', delta: '-0.4500' }),
          strike({ contractId: 'lean', mark: '2.00', delta: '-0.2500' })
        ]
      }),
      DEFAULT_SCREENING_CRITERIA,
      CURRENT_DATE
    )

    expect(result.best?.contractId).toBe('lean')
    expect(result.excluded).toEqual([
      expect.objectContaining({ contractId: 'fat', code: 'delta_band' })
    ])
  })

  it('orders exclusions so the strike that got furthest through the funnel speaks first', () => {
    const result = screenTicker(
      tickerInput({
        strikes: [
          strike({ contractId: 'off-band', delta: '-0.4500' }),
          strike({ contractId: 'wide', bid: '2.40', ask: '3.00', mark: '2.70' })
        ]
      }),
      DEFAULT_SCREENING_CRITERIA,
      CURRENT_DATE
    )

    expect(result.best).toBe(null)
    expect(result.excluded.map((e) => e.code)).toEqual(['spread', 'delta_band'])
  })

  it('returns a null best with the exclusions intact when nothing survives', () => {
    const result = screenTicker(
      tickerInput({ strikes: [strike({ delta: '-0.4500' })] }),
      DEFAULT_SCREENING_CRITERIA,
      CURRENT_DATE
    )

    expect(result.best).toBe(null)
    expect(result.excluded).toHaveLength(1)
  })

  it('carries an unknown IV rank through as null without excluding or zeroing it', () => {
    const result = screenTicker(
      tickerInput({ ivRank: null }),
      DEFAULT_SCREENING_CRITERIA,
      CURRENT_DATE
    )

    expect(result.best?.ivRank).toBe(null)
    expect(result.best?.yieldPerDelta).toBe('0.5285')
  })

  it('carries a known IV rank, with its observation time, onto the best candidate', () => {
    const result = screenTicker(
      tickerInput({ ivRank: IVR_44 }),
      DEFAULT_SCREENING_CRITERIA,
      CURRENT_DATE
    )

    expect(result.best?.ivRank).toEqual(IVR_44)
  })

  it('drops every strike of a ticker sitting below the IV-rank floor', () => {
    const result = screenTicker(
      tickerInput({ ticker: 'PEP', ivRank: ivRank('22.0') }),
      criteria({ minIvRank: '30' }),
      CURRENT_DATE
    )

    expect(result.best).toBe(null)
    expect(result.excluded).toEqual([
      expect.objectContaining({
        code: 'iv_rank_floor',
        reason: `IV rank 22.0 (${IVR_OBSERVED_LABEL}) below 30`
      })
    ])
  })

  it('still scores a ticker whose IV rank clears the floor', () => {
    const result = screenTicker(
      tickerInput({ ticker: 'KO', ivRank: ivRank('38.0') }),
      criteria({ minIvRank: '30' }),
      CURRENT_DATE
    )

    expect(result.best?.ticker).toBe('KO')
    expect(result.excluded).toEqual([])
  })

  it('flags a survivor whose expiry straddles earnings when the trader chose flag mode', () => {
    const result = screenTicker(
      tickerInput({ earningsDate: '2026-08-27' }),
      { ...DEFAULT_SCREENING_CRITERIA, earningsHandling: 'flag' },
      CURRENT_DATE
    )

    expect(result.best?.earningsFlagged).toBe(true)
  })

  it('does not flag a survivor whose earnings land outside the holding window', () => {
    const afterExpiry = screenTicker(
      tickerInput({ earningsDate: '2026-10-01' }),
      { ...DEFAULT_SCREENING_CRITERIA, earningsHandling: 'flag' },
      CURRENT_DATE
    )
    const alreadyPast = screenTicker(
      tickerInput({ earningsDate: '2026-07-28' }),
      { ...DEFAULT_SCREENING_CRITERIA, earningsHandling: 'flag' },
      CURRENT_DATE
    )

    expect(afterExpiry.best?.earningsFlagged).toBe(false)
    expect(alreadyPast.best?.earningsFlagged).toBe(false)
  })

  it('never flags in exclude mode — an in-window earnings strike is excluded instead', () => {
    const result = screenTicker(
      tickerInput({ earningsDate: '2026-08-27' }),
      DEFAULT_SCREENING_CRITERIA,
      CURRENT_DATE
    )

    expect(result.best).toBe(null)
    expect(result.excluded[0].code).toBe('earnings_in_window')
  })
})

describe('rankCandidates', () => {
  // AC-2's worked pair: 24% annualized at 0.20 delta outranks 30% at 0.30 delta.
  const candidateA = tickerInput({
    ticker: 'KO',
    strikes: [
      strike({
        strike: '73.0000',
        expiration: '2026-09-05',
        bid: '1.78',
        ask: '1.82',
        mark: '1.80',
        delta: '-0.3000'
      })
    ]
  })
  const candidateB = tickerInput({
    ticker: 'MSFT',
    strikes: [
      strike({
        strike: '73.0000',
        expiration: '2026-09-05',
        bid: '1.42',
        ask: '1.46',
        mark: '1.44',
        delta: '-0.2000'
      })
    ]
  })
  const screen = (input: TickerScreeningInput): ReturnType<typeof screenTicker> =>
    screenTicker(input, DEFAULT_SCREENING_CRITERIA, CURRENT_DATE)

  it('sorts by yield per delta descending', () => {
    const ranked = rankCandidates([screen(candidateA), screen(candidateB)])

    expect(ranked.map((c) => [c.ticker, c.yieldPerDelta])).toEqual([
      ['MSFT', '1.2000'],
      ['KO', '1.0000']
    ])
  })

  it('breaks a tied score by ticker ascending', () => {
    const ranked = rankCandidates([
      screen({ ...candidateA, ticker: 'ZTS' }),
      screen({ ...candidateA, ticker: 'AMD' })
    ])

    expect(ranked.map((c) => c.ticker)).toEqual(['AMD', 'ZTS'])
  })

  it('omits tickers that had no surviving strike', () => {
    const noSurvivor = screen(
      tickerInput({ ticker: 'TSLA', strikes: [strike({ delta: '-0.4500' })] })
    )

    expect(rankCandidates([noSurvivor, screen(candidateA)]).map((c) => c.ticker)).toEqual(['KO'])
  })
})
