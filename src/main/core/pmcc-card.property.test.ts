// Property tests: [US-108] the PMCC card's signal registry keeps awareness tags out of the
// action tier, ranks actions worst first, never shows EXPIRING and MANAGEMENT WINDOW together,
// and fires ASSIGNMENT_RISK exactly where the price reaches 98% of the short strike; the
// breakeven cue inverts back to the LEAPS strike and the recovery meter is the clamped fraction.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import {
  evaluatePmccSignals,
  pmccBreakeven,
  premiumRecoveredFraction,
  type PmccSignalInput
} from './pmcc-card'
import { pmccSignalInput, positiveMoney, signedMoney } from './test-fixtures/arbitraries'

const AWARENESS_GLYPHS: readonly string[] = ['⚑', 'δ', '⚠']

/** A stock price p % below the strike (negative p is above it), rounded to 4 dp. */
const strikeAndPrice = fc
  .tuple(positiveMoney(500), fc.integer({ min: -500, max: 500 }))
  .map(([strike, pHundredths]) => ({
    strike,
    price: new Decimal(strike)
      .times(new Decimal(1).minus(new Decimal(pHundredths).div(10_000)))
      .toFixed(4)
  }))

const oneShortAt = (strike: string, price: string): PmccSignalInput => ({
  leaps: { strike: '80.0000', dte: 326, delta: '0.8200', spread: null },
  shorts: [{ legId: 'short-1', strike, dte: 30, expiration: '2026-12-06' }],
  price,
  basisPerShare: '-1000.0000', // breakeven far below any strike, so ✕ never fires
  managementWindowDte: 21,
  daysToEarnings: null
})

describe('evaluatePmccSignals properties', () => {
  it('no awareness glyph ever reaches the action tier', () => {
    fc.assert(
      fc.property(pmccSignalInput, (input) => {
        const { actions } = evaluatePmccSignals(input)
        expect(actions.filter((a) => AWARENESS_GLYPHS.includes(a.glyph))).toEqual([])
      })
    )
  })

  it('actions come out sorted by lane rank', () => {
    fc.assert(
      fc.property(pmccSignalInput, (input) => {
        const ranks = evaluatePmccSignals(input).actions.map((a) => a.rank)
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
      })
    )
  })

  it('EXPIRING and MANAGEMENT WINDOW never fire together', () => {
    fc.assert(
      fc.property(pmccSignalInput, (input) => {
        const words = evaluatePmccSignals(input).actions.map((a) => a.statusWord)
        expect(words.includes('EXPIRING') && words.includes('MANAGEMENT WINDOW')).toBe(false)
      })
    )
  })

  it('ASSIGNMENT_RISK fires iff the price is at least 98% of the short strike', () => {
    // At most 2% below ⇔ price ≥ strike × 0.98: a product, no division.
    const floor = new Decimal('0.98')
    fc.assert(
      fc.property(strikeAndPrice, ({ strike, price }) => {
        const fired = evaluatePmccSignals(oneShortAt(strike, price)).actions.some(
          (a) => a.statusWord === 'ASSIGNMENT RISK'
        )
        expect(fired).toBe(new Decimal(price).gte(new Decimal(strike).times(floor)))
      })
    )
  })
})

describe('PMCC card cue properties', () => {
  it('breakeven minus the basis recovers the LEAPS strike', () => {
    fc.assert(
      fc.property(positiveMoney(500), signedMoney(100), (strike, basis) => {
        expect(new Decimal(pmccBreakeven(strike, basis)).minus(basis).toFixed(4)).toBe(strike)
      })
    )
  })

  // A percent as a count of ten-thousandths (−200 % … 200 %), so the expected fraction can
  // be read by moving the decimal point: n ten-thousandths of a percent is `${n}e-6`.
  const percentTicks = fc.integer({ min: -2_000_000, max: 2_000_000 })
  const asPercent = (ticks: number): string => new Decimal(ticks).div(10_000).toFixed(4)
  /** The fill for a percent; NaN for a `null` fill, which fails any comparison below. */
  const fill = (ticks: number): number => premiumRecoveredFraction(asPercent(ticks)) ?? Number.NaN

  it('the recovery meter fraction is the percent / 100, clamped to [0, 1]', () => {
    fc.assert(
      fc.property(percentTicks, (ticks) => {
        const expected = ticks <= 0 ? 0 : ticks >= 1_000_000 ? 1 : Number(`${ticks}e-6`)
        expect(fill(ticks)).toBe(expected)
      })
    )
  })

  it('the recovery meter never empties as the percent rises', () => {
    fc.assert(
      fc.property(percentTicks, percentTicks, (a, b) => {
        const [low, high] = a <= b ? [a, b] : [b, a]
        expect(fill(low)).toBeLessThanOrEqual(fill(high))
      })
    )
  })
})
