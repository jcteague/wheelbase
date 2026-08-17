// [US-68] Promote a screener result to the new-wheel form — pure helpers.
//
// The module is the whole cross-page contract (query-string codec) plus the two
// display decisions the promoted form makes: has the mark moved materially, and
// which single banner does the trader see. Everything here is I/O-free, so every
// branch of the banner state machine is a table row rather than a rendered test.
import { describe, expect, it } from 'vitest'
import {
  buildPromoteSearch,
  derivePromoteBanner,
  markMovedMaterially,
  parsePromotedParams,
  type PromoteBannerInput,
  type PromoteSource
} from './promote'

// The story's Background candidate: AAPL $180 put, 2026-08-21, mark $2.70,
// quoted 10:42:15 local. `strike` arrives 4dp from the screener IPC.
const AAPL: PromoteSource = {
  ticker: 'AAPL',
  strike: '180.0000',
  expiration: '2026-08-21',
  mark: '2.70',
  timestamp: '2026-08-07T20:00:02Z'
}

const NOTE = 'Would own below $170; waiting for IV to lift'

describe('buildPromoteSearch', () => {
  it('encodes the promoted candidate as the navigation contract params', () => {
    const search = buildPromoteSearch(AAPL)

    expect(search).toBe(
      'promoted=1&ticker=AAPL&strike=180&expiration=2026-08-21&premium=2.70&quotedAt=2026-08-07T20%3A00%3A02Z'
    )
  })

  it('normalizes the screener 4dp strike to its displayed form', () => {
    expect(new URLSearchParams(buildPromoteSearch(AAPL)).get('strike')).toBe('180')
  })

  it('carries the promoted mark verbatim rather than re-formatting it', () => {
    // Unlike the strike, the mark keeps its trailing zero — Decimal would render '2.7'.
    expect(new URLSearchParams(buildPromoteSearch(AAPL)).get('premium')).toBe('2.70')
  })

  it('appends the watchlist note as an encoded thesis param', () => {
    const search = buildPromoteSearch(AAPL, NOTE)

    expect(search).toContain('thesis=Would+own+below+%24170%3B+waiting+for+IV+to+lift')
    expect(new URLSearchParams(search).get('thesis')).toBe(NOTE)
  })

  it('omits the thesis param when no note is passed', () => {
    expect(buildPromoteSearch(AAPL)).not.toContain('thesis')
  })

  it('omits the thesis param when the note is empty or whitespace', () => {
    expect(buildPromoteSearch(AAPL, '')).not.toContain('thesis')
    expect(buildPromoteSearch(AAPL, '   ')).not.toContain('thesis')
    expect(buildPromoteSearch(AAPL, null)).not.toContain('thesis')
  })
})

describe('parsePromotedParams', () => {
  /** The Background search string with one param changed — `null` deletes it. */
  function searchWith(param: string, value: string | null): string {
    const params = new URLSearchParams(buildPromoteSearch(AAPL))
    if (value === null) params.delete(param)
    else params.set(param, value)
    return params.toString()
  }

  it('round-trips buildPromoteSearch output back to the promoted candidate', () => {
    expect(parsePromotedParams(buildPromoteSearch(AAPL))).toEqual({
      ticker: 'AAPL',
      strike: '180',
      expiration: '2026-08-21',
      premium: '2.70',
      quotedAt: '2026-08-07T20:00:02Z'
    })
  })

  it('round-trips the thesis when the note was seeded', () => {
    expect(parsePromotedParams(buildPromoteSearch(AAPL, NOTE))?.thesis).toBe(NOTE)
  })

  it('accepts a search string carrying wouter’s leading question mark', () => {
    expect(parsePromotedParams(`?${buildPromoteSearch(AAPL)}`)?.ticker).toBe('AAPL')
  })

  it('returns null for the legacy bare ?ticker= prefill flow', () => {
    expect(parsePromotedParams('ticker=AAPL')).toBeNull()
  })

  it('returns null when the promoted discriminator is absent', () => {
    const search = buildPromoteSearch(AAPL).replace('promoted=1&', '')

    expect(parsePromotedParams(search)).toBeNull()
  })

  it('returns null for an empty search string', () => {
    expect(parsePromotedParams('')).toBeNull()
  })

  it.each(['ticker', 'strike', 'expiration', 'premium', 'quotedAt'])(
    'returns null when the required %s param is missing',
    (param) => {
      expect(parsePromotedParams(searchWith(param, null))).toBeNull()
    }
  )

  it.each([
    ['strike', '0'],
    ['strike', '-180'],
    ['strike', 'abc'],
    ['premium', '0'],
    ['premium', '-2.70'],
    ['premium', 'abc'],
    ['expiration', '2026-8-21'],
    ['expiration', '08/21/2026'],
    ['expiration', 'next friday'],
    ['quotedAt', 'not-a-time'],
    ['ticker', 'not a ticker']
  ])('returns null when %s is %s', (param, value) => {
    expect(parsePromotedParams(searchWith(param, value))).toBeNull()
  })
})

// Threshold: |fresh − promoted| > max($0.05, 5% of the promoted mark). Strict `>`,
// so a deviation exactly at the threshold is silent — the $0.05 floor is the
// tick-noise guard for sub-$1.00 premiums, not an independent trigger.
describe('markMovedMaterially', () => {
  it('flags a move past both the floor and the relative test', () => {
    expect(markMovedMaterially('2.70', '2.50')).toBe(true)
  })

  it('is silent for a move under the $0.05 tick-noise floor', () => {
    expect(markMovedMaterially('2.70', '2.68')).toBe(false)
  })

  it('is silent for a deviation exactly at the threshold', () => {
    // 2.70 × 5% = 0.135 → 2.835 is exactly at the threshold, not past it.
    expect(markMovedMaterially('2.70', '2.835')).toBe(false)
  })

  it('flags a move a tick past the threshold', () => {
    expect(markMovedMaterially('2.70', '2.836')).toBe(true)
  })

  it('is symmetric — an upward move of the same size also flags', () => {
    expect(markMovedMaterially('2.70', '2.90')).toBe(true)
  })

  it('holds the $0.05 floor over the relative test on sub-$1.00 premiums', () => {
    // 5% of 0.60 is 0.03, but 0.04 is still inside the nickel floor.
    expect(markMovedMaterially('0.60', '0.64')).toBe(false)
    expect(markMovedMaterially('0.60', '0.66')).toBe(true)
  })
})

// Exactly one banner, first match wins:
// offline > stale > moved > edited > match > none.
describe('derivePromoteBanner', () => {
  const QUOTED_AT = '2026-08-07T20:00:02Z'
  const FRESH_AT = '2026-08-07T20:11:40Z'

  function input(overrides: Partial<PromoteBannerInput> = {}): PromoteBannerInput {
    return {
      quote: { mark: '2.70', timestamp: FRESH_AT },
      marketDisplay: 'LIVE',
      promotedPremium: '2.70',
      currentPremium: '2.70',
      promotedQuotedAt: QUOTED_AT,
      ...overrides
    }
  }

  it('is offline when the re-fetch failed, even with the market closed and the price moved', () => {
    expect(
      derivePromoteBanner(
        input({ quote: 'failed', marketDisplay: 'CLOSED', currentPremium: '2.50' })
      )
    ).toEqual({ kind: 'offline', quotedAt: QUOTED_AT })
  })

  it.each(['CLOSED', 'EXT'] as const)(
    'is stale when the market display is %s, even when the fresh mark moved',
    (marketDisplay) => {
      expect(
        derivePromoteBanner(input({ marketDisplay, quote: { mark: '2.50', timestamp: FRESH_AT } }))
      ).toEqual({ kind: 'stale', quotedAt: QUOTED_AT, session: marketDisplay })
    }
  )

  it('is moved when the fresh mark drifted materially, even when the trader edited the premium', () => {
    expect(
      derivePromoteBanner(
        input({ quote: { mark: '2.50', timestamp: FRESH_AT }, currentPremium: '2.65' })
      )
    ).toEqual({ kind: 'moved', promotedMark: '2.70', freshMark: '2.50' })
  })

  it('is edited when the trader overrode the premium and the mark held', () => {
    expect(derivePromoteBanner(input({ currentPremium: '2.65' }))).toEqual({
      kind: 'edited',
      enteredPremium: '2.65',
      promotedMark: '2.70'
    })
  })

  it('is edited while the re-fetch is still pending', () => {
    expect(derivePromoteBanner(input({ quote: 'pending', currentPremium: '2.65' }))).toEqual({
      kind: 'edited',
      enteredPremium: '2.65',
      promotedMark: '2.70'
    })
  })

  it('is not edited when the override is the promoted mark written differently', () => {
    expect(derivePromoteBanner(input({ currentPremium: '2.700' })).kind).toBe('match')
  })

  it('is not edited while the premium field is cleared or unparseable', () => {
    expect(derivePromoteBanner(input({ currentPremium: '' })).kind).toBe('match')
    expect(derivePromoteBanner(input({ currentPremium: '2.' })).kind).toBe('match')
  })

  it('is match when the fetch landed with no material move, carrying the fresh quote', () => {
    expect(derivePromoteBanner(input({ quote: { mark: '2.68', timestamp: FRESH_AT } }))).toEqual({
      kind: 'match',
      promotedMark: '2.70',
      freshMark: '2.68'
    })
  })

  it('is none while the re-fetch is pending on an open market with an untouched premium', () => {
    expect(derivePromoteBanner(input({ quote: 'pending' }))).toEqual({ kind: 'none' })
  })
})
