import Decimal from 'decimal.js'

export const RANK_WINDOW_SESSIONS = 252
export const MIN_WINDOW_COVERAGE = 200

export type IvMetrics = {
  rank: number | null // integer 0..100, null when high === low
  percentile: number // integer 0..100
  low: string // 4 dp, window min
  high: string // 4 dp, window max
  coverage: number // readings in window
}

const HUNDRED = new Decimal(100)

function roundHalfUp(x: Decimal): number {
  return x.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

function clampPercent(x: Decimal): Decimal {
  return Decimal.min(HUNDRED, Decimal.max(0, x))
}

/**
 * Pure. `windowSessions` = the 252 sessions strictly before the anchor, ascending (caller derives
 * them from the calendar). `readings` maps session → iv30 for any session (anchor included).
 * Returns null when fewer than MIN_WINDOW_COVERAGE window sessions have a reading.
 */
export function computeIvMetrics(input: {
  anchorIv30: string
  windowSessions: readonly string[]
  readings: ReadonlyMap<string, string>
}): IvMetrics | null {
  const { anchorIv30, windowSessions, readings } = input
  const window = windowSessions.flatMap((session) => {
    const value = readings.get(session)
    return value === undefined ? [] : [new Decimal(value)]
  })
  if (window.length < MIN_WINDOW_COVERAGE) return null

  const anchor = new Decimal(anchorIv30)
  const low = Decimal.min(...window)
  const high = Decimal.max(...window)
  const range = high.minus(low)
  const rank = range.isZero()
    ? null
    : roundHalfUp(clampPercent(anchor.minus(low).div(range).times(HUNDRED)))
  const below = window.filter((value) => value.lessThan(anchor)).length

  return {
    rank,
    percentile: roundHalfUp(new Decimal(below).div(window.length).times(HUNDRED)),
    low: low.toFixed(4),
    high: high.toFixed(4),
    coverage: window.length
  }
}
