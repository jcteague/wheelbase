// [US-64] candidate-chain — pure DTE range / strike filter / failure classification
import { describe, expect, it } from 'vitest'
import type { OptionChainQuote } from '../integrations/market-data-provider'
import {
  DEFAULT_DTE_WINDOW,
  classifyChainFailure,
  dteWindowToExpirationRange,
  isTradeableStrike,
  isWellFormedStrike,
  toCandidateStrikes
} from './candidate-chain'

function chainQuote(overrides: Partial<OptionChainQuote> = {}): OptionChainQuote {
  return {
    contractId: 'AAPL260905P00190000',
    strike: '190.00',
    expiration: '2026-09-05',
    contractType: 'put',
    bid: '2.10',
    ask: '2.20',
    mid: '2.15',
    lastTrade: '2.18',
    openInterest: 1234,
    volume: 567,
    greeks: { delta: '-0.32', gamma: '0.04', theta: '-0.05', vega: '0.12' },
    impliedVolatility: '0.28',
    timestamp: '2026-07-26T15:30:00Z',
    ...overrides
  }
}

describe('DEFAULT_DTE_WINDOW', () => {
  it('is 30–45 DTE', () => {
    expect(DEFAULT_DTE_WINDOW).toEqual({ min: 30, max: 45 })
  })
})

describe('dteWindowToExpirationRange', () => {
  it('adds min/max days to currentDate and formats yyyy-MM-dd', () => {
    const range = dteWindowToExpirationRange(new Date(2026, 6, 23), { min: 30, max: 45 })
    expect(range).toEqual({ from: '2026-08-22', to: '2026-09-06' })
  })

  // The window anchors on the trader's own calendar day. A late-evening instant is
  // already tomorrow in UTC west of Greenwich; an early-morning instant is still
  // yesterday in UTC east of it. Both must resolve to the same local-day window.
  it("anchors on the trader's local day for a late-evening instant", () => {
    const range = dteWindowToExpirationRange(new Date(2026, 6, 23, 23, 30), { min: 30, max: 45 })
    expect(range).toEqual({ from: '2026-08-22', to: '2026-09-06' })
  })

  it("anchors on the trader's local day for an early-morning instant", () => {
    const range = dteWindowToExpirationRange(new Date(2026, 6, 23, 0, 30), { min: 30, max: 45 })
    expect(range).toEqual({ from: '2026-08-22', to: '2026-09-06' })
  })

  it('crosses month and year boundaries', () => {
    const range = dteWindowToExpirationRange(new Date(2026, 0, 1), { min: 30, max: 45 })
    expect(range).toEqual({ from: '2026-01-31', to: '2026-02-15' })
  })
})

describe('isTradeableStrike', () => {
  it('is false when bid is zero (no reliable mark)', () => {
    expect(isTradeableStrike('0.00', '0.15')).toBe(false)
  })

  it('is true when both bid and ask are positive', () => {
    expect(isTradeableStrike('1.20', '1.25')).toBe(true)
  })

  it('is false when one-sided (ask is zero)', () => {
    expect(isTradeableStrike('1.00', '0.00')).toBe(false)
  })

  it('is false rather than throwing when a quote side is not a number', () => {
    expect(isTradeableStrike('not-a-number', '1.25')).toBe(false)
    expect(isTradeableStrike('1.20', '')).toBe(false)
    expect(isTradeableStrike('NaN', '1.25')).toBe(false)
  })
})

describe('isWellFormedStrike', () => {
  it('accepts a strike whose money fields are all finite decimals', () => {
    expect(isWellFormedStrike(toCandidateStrikes([chainQuote()])[0])).toBe(true)
  })

  it('rejects a strike with a malformed money field', () => {
    const [strike] = toCandidateStrikes([chainQuote()])
    expect(isWellFormedStrike({ ...strike, bid: 'not-a-number' })).toBe(false)
    expect(isWellFormedStrike({ ...strike, ask: '' })).toBe(false)
    expect(isWellFormedStrike({ ...strike, mark: 'NaN' })).toBe(false)
    expect(isWellFormedStrike({ ...strike, strike: 'Infinity' })).toBe(false)
  })

  it('rejects a malformed delta but accepts a null one', () => {
    const [strike] = toCandidateStrikes([chainQuote()])
    expect(isWellFormedStrike({ ...strike, delta: 'bad' })).toBe(false)
    expect(isWellFormedStrike({ ...strike, delta: null })).toBe(true)
  })
})

describe('toCandidateStrikes', () => {
  it('drops untradeable strikes (zero-bid / one-sided)', () => {
    const quotes = [
      chainQuote({ contractId: 'A', bid: '2.10', ask: '2.20' }),
      chainQuote({ contractId: 'B', bid: '0.00', ask: '0.15' }),
      chainQuote({ contractId: 'C', bid: '1.00', ask: '0.00' })
    ]

    const result = toCandidateStrikes(quotes)

    expect(result.map((s) => s.contractId)).toEqual(['A'])
  })

  it('maps mid→mark and greeks.delta→delta, preserving identity + liquidity fields', () => {
    const quote = chainQuote({
      contractId: 'AAPL260905P00190000',
      strike: '190.00',
      expiration: '2026-09-05',
      bid: '2.10',
      ask: '2.20',
      mid: '2.15',
      openInterest: 4211,
      volume: 875,
      timestamp: '2026-07-26T15:30:00Z',
      greeks: { delta: '-0.3200', gamma: '0.04', theta: '-0.05', vega: '0.12' }
    })

    const [strike] = toCandidateStrikes([quote])

    expect(strike).toEqual({
      contractId: 'AAPL260905P00190000',
      strike: '190.00',
      expiration: '2026-09-05',
      bid: '2.10',
      ask: '2.20',
      mark: '2.15',
      delta: '-0.3200',
      openInterest: 4211,
      volume: 875,
      timestamp: '2026-07-26T15:30:00Z'
    })
  })

  it('sets delta to null when the quote has no greeks (deep ITM)', () => {
    const quote = chainQuote({ greeks: undefined })

    const [strike] = toCandidateStrikes([quote])

    expect(strike.delta).toBeNull()
  })
})

describe('classifyChainFailure', () => {
  it('classifies not_found as a ticker-level failure', () => {
    expect(classifyChainFailure('not_found')).toBe('ticker')
  })

  it('classifies network_error / auth_failed / rate_limited / unknown as provider-level', () => {
    expect(classifyChainFailure('network_error')).toBe('provider')
    expect(classifyChainFailure('auth_failed')).toBe('provider')
    expect(classifyChainFailure('rate_limited')).toBe('provider')
    expect(classifyChainFailure('unknown')).toBe('provider')
  })
})
