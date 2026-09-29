// Property tests: IV rank and percentile are bounded, order-independent, and pin to the
// window's edges when the anchor sits on or outside them.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import { MIN_WINDOW_COVERAGE, RANK_WINDOW_SESSIONS, computeIvMetrics } from './iv-metrics'
import { positiveMoney } from './test-fixtures/arbitraries'

const iv = positiveMoney(5)

const sessionsOf = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `S${String(i + 1).padStart(3, '0')}`)

const WINDOW = sessionsOf(RANK_WINDOW_SESSIONS)

/** A window with at least the coverage floor of readings, plus an anchor. */
const coveredWindow = fc
  .record({
    values: fc.array(iv, { minLength: MIN_WINDOW_COVERAGE, maxLength: RANK_WINDOW_SESSIONS }),
    anchorIv30: iv
  })
  .map(({ values, anchorIv30 }) => ({
    anchorIv30,
    windowSessions: WINDOW,
    readings: new Map(values.map((value, i) => [WINDOW[i], value]))
  }))

describe('computeIvMetrics', () => {
  it('returns bounded rank and percentile with low ≤ high and exact coverage', () => {
    fc.assert(
      fc.property(coveredWindow, (input) => {
        const result = computeIvMetrics(input)
        expect(result).not.toBeNull()
        const { rank, percentile, low, high, coverage } = result!
        expect(coverage).toBe(input.readings.size)
        expect(new Decimal(low).lte(high)).toBe(true)
        expect(percentile).toBeGreaterThanOrEqual(0)
        expect(percentile).toBeLessThanOrEqual(100)
        if (low === high) {
          expect(rank).toBeNull()
        } else {
          expect(rank).toBeGreaterThanOrEqual(0)
          expect(rank).toBeLessThanOrEqual(100)
        }
      })
    )
  })

  it('does not depend on the order the window sessions are listed in', () => {
    fc.assert(
      fc.property(
        coveredWindow.chain((input) =>
          fc.tuple(
            fc.constant(input),
            fc.shuffledSubarray(input.windowSessions, {
              minLength: input.windowSessions.length,
              maxLength: input.windowSessions.length
            })
          )
        ),
        ([input, shuffled]) => {
          expect(computeIvMetrics({ ...input, windowSessions: shuffled })).toEqual(
            computeIvMetrics(input)
          )
        }
      )
    )
  })

  it('pins rank and percentile to the edges when the anchor lies outside the window', () => {
    fc.assert(
      fc.property(coveredWindow, fc.boolean(), (input, above) => {
        const readings = [...input.readings.values()].map((value) => new Decimal(value))
        const low = Decimal.min(...readings)
        const high = Decimal.max(...readings)
        fc.pre(!low.equals(high))
        const anchorIv30 = above ? high.plus('0.0001').toFixed(4) : low.minus('0.0001').toFixed(4)
        const result = computeIvMetrics({ ...input, anchorIv30 })
        expect(result?.rank).toBe(above ? 100 : 0)
        expect(result?.percentile).toBe(above ? 100 : 0)
      })
    )
  })

  it('ranks 0 at the window low and 100 at the window high', () => {
    fc.assert(
      fc.property(coveredWindow, fc.boolean(), (input, atHigh) => {
        const readings = [...input.readings.values()].map((value) => new Decimal(value))
        const low = Decimal.min(...readings)
        const high = Decimal.max(...readings)
        fc.pre(!low.equals(high))
        const result = computeIvMetrics({ ...input, anchorIv30: (atHigh ? high : low).toFixed(4) })
        expect(result?.rank).toBe(atHigh ? 100 : 0)
      })
    )
  })

  it('returns null whenever fewer than the coverage floor of readings exist', () => {
    fc.assert(
      fc.property(
        fc.array(iv, { minLength: 0, maxLength: MIN_WINDOW_COVERAGE - 1 }),
        iv,
        (values, anchorIv30) => {
          const readings = new Map(values.map((value, i) => [WINDOW[i], value]))
          expect(computeIvMetrics({ anchorIv30, windowSessions: WINDOW, readings })).toBeNull()
        }
      )
    )
  })
})
