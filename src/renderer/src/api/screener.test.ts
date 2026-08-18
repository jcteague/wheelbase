import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getScreenerResults,
  type ScreenerCandidate,
  type ScreenerCandidateEarnings
} from './screener'

const mockResults = vi.fn()

beforeEach(() => {
  mockResults.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      screener: {
        results: mockResults
      }
    }
  })
})

const CANDIDATE: ScreenerCandidate = {
  ticker: 'AAPL',
  contractId: 'AAPL260918P00180000',
  strike: '180.0000',
  expiration: '2026-09-18',
  dte: 40,
  bid: '2.65',
  ask: '2.75',
  mark: '2.70',
  spreadAbsolute: '0.10',
  spreadPercent: '3.70',
  delta: '0.2800',
  openInterest: 4200,
  volume: 310,
  ivRank: { value: '44.0', observedAt: '2026-08-08T16:00:00.000Z' },
  capitalSecured: '18000.00',
  periodYield: '0.0150',
  annualizedYield: '0.1369',
  yieldPerDelta: '0.0536',
  earnings: { status: 'clear' },
  timestamp: '2026-08-08T16:00:02.000Z'
}

// [US-70] The adapter is a pass-through for the earnings verdict — every status has
// to arrive at the renderer exactly as the service shaped it.
function candidateWith(ticker: string, earnings: ScreenerCandidateEarnings): ScreenerCandidate {
  return { ...CANDIDATE, ticker, earnings }
}

const EXCLUSION = {
  ticker: 'TSLA',
  code: 'spread' as const,
  reason: 'spread 22% exceeds 10%'
}

describe('getScreenerResults', () => {
  it('returns the full payload on a successful ok-status response', async () => {
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: [CANDIDATE],
      excluded: [EXCLUSION],
      quoteTimestamp: '2026-08-08T16:00:02.000Z'
    })

    await expect(getScreenerResults()).resolves.toEqual({
      status: 'ok',
      ranked: [CANDIDATE],
      excluded: [EXCLUSION],
      quoteTimestamp: '2026-08-08T16:00:02.000Z'
    })
  })

  it('returns — does not throw — when the provider is unavailable (outage is data, not an error)', async () => {
    mockResults.mockResolvedValue({
      ok: true,
      status: 'provider_unavailable',
      ranked: [],
      excluded: [],
      quoteTimestamp: null
    })

    await expect(getScreenerResults()).resolves.toEqual({
      status: 'provider_unavailable',
      ranked: [],
      excluded: [],
      quoteTimestamp: null
    })
  })

  it('passes every earnings status through unchanged, in the order the service ranked them', async () => {
    const ranked = [
      candidateWith('AAPL', { status: 'clear' }),
      candidateWith('MSFT', { status: 'flagged', date: '2026-09-05', daysBeforeExpiry: 13 }),
      candidateWith('KO', { status: 'unknown' }),
      candidateWith('SOFI', { status: 'unavailable' })
    ]
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked,
      excluded: [],
      quoteTimestamp: '2026-08-08T16:00:02.000Z'
    })

    const results = await getScreenerResults()

    // Rank order is the service's — the renderer never re-sorts.
    expect(results.ranked.map((candidate) => candidate.ticker)).toEqual([
      'AAPL',
      'MSFT',
      'KO',
      'SOFI'
    ])
    expect(results.ranked.map((candidate) => candidate.earnings)).toEqual([
      { status: 'clear' },
      { status: 'flagged', date: '2026-09-05', daysBeforeExpiry: 13 },
      { status: 'unknown' },
      { status: 'unavailable' }
    ])
    results.ranked.forEach((candidate) => {
      expect(candidate).not.toHaveProperty('earningsFlagged')
    })
  })

  it('throws a mapped ApiError on an ok:false envelope (internal_error)', async () => {
    mockResults.mockResolvedValue({
      ok: false,
      errors: [
        { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
      ]
    })

    await expect(getScreenerResults()).rejects.toMatchObject({
      status: 400,
      body: {
        detail: [
          { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
        ]
      }
    })
  })
})
