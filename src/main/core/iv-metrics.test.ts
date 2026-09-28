// [US-121] IV rank, percentile, range and coverage from the app's own IV30 history
import { describe, expect, it } from 'vitest'

import { MIN_WINDOW_COVERAGE, RANK_WINDOW_SESSIONS, computeIvMetrics } from './iv-metrics'

const sessionsOf = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `S${String(i + 1).padStart(3, '0')}`)

const WINDOW = sessionsOf(252)

/** Pair each window session with a value; `values` shorter than the window leaves the tail unread. */
const readingsOf = (sessions: readonly string[], values: readonly string[]): Map<string, string> =>
  new Map(values.map((value, i) => [sessions[i], value]))

/** 252 readings: first `0.1800`, last `0.4500`, everything between `0.3000`. */
const spanningValues = (): string[] =>
  WINDOW.map((_, i) => (i === 0 ? '0.1800' : i === WINDOW.length - 1 ? '0.4500' : '0.3000'))

describe('computeIvMetrics', () => {
  it('exposes the window size and coverage floor', () => {
    expect(RANK_WINDOW_SESSIONS).toBe(252)
    expect(MIN_WINDOW_COVERAGE).toBe(200)
  })

  it('computes rank, low, high and coverage from a full window', () => {
    const result = computeIvMetrics({
      anchorIv30: '0.2475',
      windowSessions: WINDOW,
      readings: readingsOf(WINDOW, spanningValues())
    })

    // (0.2475 − 0.1800) / (0.4500 − 0.1800) × 100 = 25
    expect(result).toMatchObject({ rank: 25, low: '0.1800', high: '0.4500', coverage: 252 })
  })

  it('counts readings strictly below the anchor for percentile; ties are not below', () => {
    const values = [
      ...Array<string>(180).fill('0.2000'),
      ...Array<string>(10).fill('0.2475'),
      ...Array<string>(62).fill('0.3000')
    ]

    const result = computeIvMetrics({
      anchorIv30: '0.2475',
      windowSessions: WINDOW,
      readings: readingsOf(WINDOW, values)
    })

    // 180 / 252 = 71.43% → 71 (the 10 ties would push it to 75 if counted)
    expect(result?.percentile).toBe(71)
  })

  it('clamps rank to 100 when the anchor is above the window', () => {
    const result = computeIvMetrics({
      anchorIv30: '0.4700',
      windowSessions: WINDOW,
      readings: readingsOf(WINDOW, spanningValues())
    })

    expect(result).toMatchObject({ rank: 100, high: '0.4500', percentile: 100 })
  })

  it('clamps rank to 0 when the anchor is below the window', () => {
    const result = computeIvMetrics({
      anchorIv30: '0.1500',
      windowSessions: WINDOW,
      readings: readingsOf(WINDOW, spanningValues())
    })

    expect(result).toMatchObject({ rank: 0, low: '0.1800', percentile: 0 })
  })

  it('withholds rank but not percentile for a flat window', () => {
    const result = computeIvMetrics({
      anchorIv30: '0.2000',
      windowSessions: WINDOW,
      readings: readingsOf(WINDOW, Array<string>(252).fill('0.2000'))
    })

    expect(result).toEqual({
      rank: null,
      percentile: 0,
      low: '0.2000',
      high: '0.2000',
      coverage: 252
    })
  })

  describe('rounds rank half-up', () => {
    // low 0.2000, high 1.2000 → range 1.0000, so rank = (anchor − 0.2000) × 100 exactly
    const values = (): string[] =>
      WINDOW.map((_, i) => (i === 0 ? '0.2000' : i === WINDOW.length - 1 ? '1.2000' : '0.5000'))

    it('71.5 → 72', () => {
      const result = computeIvMetrics({
        anchorIv30: '0.9150',
        windowSessions: WINDOW,
        readings: readingsOf(WINDOW, values())
      })

      expect(result?.rank).toBe(72)
    })

    it('71.49 → 71', () => {
      const result = computeIvMetrics({
        anchorIv30: '0.9149',
        windowSessions: WINDOW,
        readings: readingsOf(WINDOW, values())
      })

      expect(result?.rank).toBe(71)
    })
  })

  describe('coverage gate', () => {
    const withReadings = (count: number): ReturnType<typeof computeIvMetrics> =>
      computeIvMetrics({
        anchorIv30: '0.2475',
        windowSessions: WINDOW,
        readings: readingsOf(WINDOW, spanningValues().slice(0, count))
      })

    it('returns null with readings on only 150 of 252 window sessions', () => {
      expect(withReadings(150)).toBeNull()
    })

    it('returns null with 199 readings', () => {
      expect(withReadings(199)).toBeNull()
    })

    it('returns metrics with 200 readings', () => {
      expect(withReadings(200)).toMatchObject({ coverage: 200 })
    })

    it('returns null for a young calendar with fewer than 252 window sessions and 60 readings', () => {
      const young = sessionsOf(60)

      const result = computeIvMetrics({
        anchorIv30: '0.2475',
        windowSessions: young,
        readings: readingsOf(young, Array<string>(60).fill('0.3000'))
      })

      expect(result).toBeNull()
    })
  })

  it("excludes the anchor session's own reading from the window", () => {
    const readings = readingsOf(WINDOW, spanningValues())
    readings.set('ANCHOR', '0.9000')

    const result = computeIvMetrics({ anchorIv30: '0.9000', windowSessions: WINDOW, readings })

    expect(result).toMatchObject({ high: '0.4500', rank: 100, coverage: 252 })
  })
})
