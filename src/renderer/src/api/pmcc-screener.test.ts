// [US-110] Screen the watchlist for PMCC diagonals — renderer API adapter contract.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { XLF_DIAGONAL } from '../test-fixtures/pmcc-diagonals'
import type { IvRankPair } from './ivr'
import { getPmccScreenerResults } from './pmcc-screener'

const mockPmccResults = vi.fn<Window['api']['screener']['pmccResults']>()

beforeEach(() => {
  mockPmccResults.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      screener: { pmccResults: mockPmccResults }
    }
  })
})

describe('getPmccScreenerResults', () => {
  it('returns the ranked diagonals and exclusions on a successful ok-status response', async () => {
    mockPmccResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: [XLF_DIAGONAL],
      excluded: [
        { ticker: 'AMD', code: 'debit_to_width', reason: 'debit 93.84% of width exceeds 90%' }
      ],
      quoteTimestamp: '2026-09-18T20:00:00.000Z'
    })

    await expect(getPmccScreenerResults()).resolves.toEqual({
      status: 'ok',
      ranked: [XLF_DIAGONAL],
      excluded: [
        { ticker: 'AMD', code: 'debit_to_width', reason: 'debit 93.84% of width exceeds 90%' }
      ],
      quoteTimestamp: '2026-09-18T20:00:00.000Z'
    })
  })

  it('returns — does not throw — when the provider is unavailable (outage is data, not an error)', async () => {
    mockPmccResults.mockResolvedValue({
      ok: true,
      status: 'provider_unavailable',
      ranked: [],
      excluded: [],
      quoteTimestamp: null
    })

    await expect(getPmccScreenerResults()).resolves.toEqual({
      status: 'provider_unavailable',
      ranked: [],
      excluded: [],
      quoteTimestamp: null
    })
  })

  it('throws a mapped ApiError on an ok:false envelope', async () => {
    mockPmccResults.mockResolvedValue({
      ok: false,
      errors: [
        { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
      ]
    })

    await expect(getPmccScreenerResults()).rejects.toEqual({
      status: 400,
      body: {
        detail: [
          { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
        ]
      }
    })
  })

  // A ranked diagonal carries the same IV-rank pair every bench row does, so `IvrCell`
  // takes it unchanged — typed, never cast.
  it('hands each ranked diagonal over as an IV-rank pair', async () => {
    mockPmccResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: [XLF_DIAGONAL],
      excluded: [],
      quoteTimestamp: '2026-09-18T20:00:00.000Z'
    })

    const { ranked } = await getPmccScreenerResults()
    const pairs: IvRankPair[] = ranked

    expect(pairs.map((pair) => pair.ivRank?.value)).toEqual(['32'])
  })
})
