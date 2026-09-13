// [US-96] One live bench — the day change shown beside every last price.

import { describe, expect, it } from 'vitest'
import type { SnapshotQuote } from '../api/watchlist'
import { dayChange } from './day-change'

function quote(price: string, prevClose: string | null): SnapshotQuote {
  return { price, prevClose, timestamp: '2026-09-11T18:00:00.000Z' }
}

describe('dayChange', () => {
  it('reports a gain as a signed percent with an up direction', () => {
    // (178.40 − 176.98) / 176.98 × 100 = 0.8023…% → 0.8 at 1dp
    expect(dayChange(quote('178.40', '176.98'))).toEqual({ percent: '+0.8%', direction: 'up' })
  })

  // U+2212 MINUS SIGN, not a hyphen: it aligns with the digits at the same width as
  // the plus, so a column of changes does not jitter.
  it('reports a loss with a true minus sign and a down direction', () => {
    // (505.10 − 511.24) / 511.24 × 100 = −1.2009…% → −1.2 at 1dp
    expect(dayChange(quote('505.10', '511.24'))).toEqual({ percent: '−1.2%', direction: 'down' })
  })

  it('reports an unchanged price as flat with no sign', () => {
    expect(dayChange(quote('178.40', '178.40'))).toEqual({ percent: '0.0%', direction: 'flat' })
  })

  it('returns null when the previous close is missing', () => {
    expect(dayChange(quote('178.40', null))).toBeNull()
  })

  it('returns null when the quote itself is missing', () => {
    expect(dayChange(null)).toBeNull()
  })

  // The provider maps a falsy prevClose to null, but the string '0' is truthy and reaches
  // the division intact. `Decimal` answers Infinity rather than throwing, so the cell would
  // render "+Infinity%" — a percent change from nothing is undefined, not enormous.
  it('returns null rather than an infinite percent when the previous close is zero', () => {
    expect(dayChange(quote('178.40', '0'))).toBeNull()
    expect(dayChange(quote('178.40', '0.0000'))).toBeNull()
  })
})
