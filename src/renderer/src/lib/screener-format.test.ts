import { format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SCREENING_CRITERIA } from '../../../main/core/screener'
import type { ScreeningCriteria } from '../api/screening-criteria'
import {
  fmtCriteriaSummary,
  fmtDelta,
  fmtIvr,
  fmtOpenInterest,
  fmtQuoteTime,
  fmtScore,
  fmtSpread,
  fmtYieldPercent
} from './screener-format'

describe('fmtYieldPercent', () => {
  it('trims a trailing zero after the point', () => {
    expect(fmtYieldPercent('0.0150')).toBe('1.5%')
  })

  it('keeps two significant decimals', () => {
    expect(fmtYieldPercent('0.0158')).toBe('1.58%')
  })

  it('trims a trailing zero on double-digit percents', () => {
    expect(fmtYieldPercent('0.1480')).toBe('14.8%')
  })

  it('keeps two decimals on double-digit percents', () => {
    expect(fmtYieldPercent('0.1254')).toBe('12.54%')
  })

  it('drops the decimal point entirely on whole percents', () => {
    expect(fmtYieldPercent('0.0200')).toBe('2%')
  })
})

describe('fmtScore', () => {
  it('rounds to fixed two decimals', () => {
    expect(fmtScore('0.5286')).toBe('0.53')
  })

  it('keeps trailing zeros at fixed two decimals', () => {
    expect(fmtScore('0.5018')).toBe('0.50')
  })

  it('formats an exact two-decimal value unchanged', () => {
    expect(fmtScore('0.7100')).toBe('0.71')
  })
})

describe('fmtSpread', () => {
  it('combines money absolute with rounded integer percent', () => {
    expect(fmtSpread('0.06', '2.22')).toBe('$0.06 (2%)')
  })

  it('rounds the percent to the nearest integer', () => {
    expect(fmtSpread('0.30', '4.84')).toBe('$0.30 (5%)')
  })
})

describe('fmtDelta', () => {
  it('formats a 4dp delta to fixed two decimals', () => {
    expect(fmtDelta('0.2800')).toBe('0.28')
  })

  it('keeps a non-zero second decimal', () => {
    expect(fmtDelta('0.2200')).toBe('0.22')
  })
})

describe('fmtIvr', () => {
  // IV rank is a hard filter as of US-67, so the reading's age travels with it —
  // a months-old snapshot must not silently look like today's.
  const OBSERVED_AT = '2026-08-07T16:00:00Z'
  const observedLabel = format(parseISO(OBSERVED_AT), 'MMM d')

  it('trims trailing zeros from a whole-number rank and stamps the observation date', () => {
    expect(fmtIvr({ value: '44.0', observedAt: OBSERVED_AT })).toBe(`44 (${observedLabel})`)
  })

  it('keeps a meaningful decimal', () => {
    expect(fmtIvr({ value: '38.5', observedAt: OBSERVED_AT })).toBe(`38.5 (${observedLabel})`)
  })

  it('renders the date in the local zone, like every other timestamp the screener shows', () => {
    // -04:00 and the equivalent Z instant must render identically.
    expect(fmtIvr({ value: '30', observedAt: '2026-08-07T16:00:02-04:00' })).toBe(
      fmtIvr({ value: '30', observedAt: '2026-08-07T20:00:02Z' })
    )
  })

  it('renders n/a for a null rank, with no date to stamp', () => {
    expect(fmtIvr(null)).toBe('n/a')
  })
})

describe('fmtOpenInterest', () => {
  it('groups thousands with commas', () => {
    expect(fmtOpenInterest(4200)).toBe('4,200')
  })

  it('leaves sub-thousand values ungrouped', () => {
    expect(fmtOpenInterest(120)).toBe('120')
  })

  it('renders an em dash for null', () => {
    expect(fmtOpenInterest(null)).toBe('—')
  })
})

describe('fmtQuoteTime', () => {
  it('formats an ISO timestamp as local HH:mm:ss', () => {
    const iso = '2026-08-07T16:00:02-04:00'
    expect(fmtQuoteTime(iso)).toBe(format(parseISO(iso), 'HH:mm:ss'))
  })

  it('formats a UTC timestamp into the local clock time', () => {
    const iso = '2026-08-07T20:15:09Z'
    expect(fmtQuoteTime(iso)).toBe(format(parseISO(iso), 'HH:mm:ss'))
  })
})

// [US-67] Criteria summary strip — the chip strings below are pinned verbatim by
// the acceptance criteria, including the EN-DASH band separator (U+2013) that the
// engine's formatBand already uses, and the ≥ / ≤ comparison glyphs.
describe('fmtCriteriaSummary', () => {
  const criteria = (overrides: Partial<ScreeningCriteria> = {}): ScreeningCriteria => ({
    ...DEFAULT_SCREENING_CRITERIA,
    ...overrides
  })

  it('renders the shipped defaults as the AC summary strip', () => {
    expect(fmtCriteriaSummary(criteria())).toEqual([
      'Δ 0.20–0.30',
      'DTE 30–45',
      'OI ≥ 500',
      'Spread ≤ 10%',
      'Earnings Exclude'
    ])
  })

  it('reflects a saved 0.15–0.20 delta band and 40–45 DTE window in the first two chips', () => {
    const chips = fmtCriteriaSummary(
      criteria({ deltaMin: '0.15', deltaMax: '0.20', dteMin: 40, dteMax: 45 })
    )

    expect(chips[0]).toBe('Δ 0.15–0.20')
    expect(chips[1]).toBe('DTE 40–45')
  })

  it('pads the delta band to two decimals', () => {
    expect(fmtCriteriaSummary(criteria({ deltaMin: '0.2', deltaMax: '0.3' }))[0]).toBe(
      'Δ 0.20–0.30'
    )
  })

  it('renders the flag-only earnings policy as its own chip wording', () => {
    expect(fmtCriteriaSummary(criteria({ earningsHandling: 'flag' }))).toContain(
      'Earnings Flag only'
    )
  })

  it('appends a price-ceiling chip when the ceiling is enabled', () => {
    expect(fmtCriteriaSummary(criteria({ maxUnderlyingPrice: '75' }))).toContain('Price ≤ $75')
  })

  it('omits the price-ceiling chip when the ceiling is disabled', () => {
    const chips = fmtCriteriaSummary(criteria({ maxUnderlyingPrice: null }))

    expect(chips.some((chip) => chip.startsWith('Price'))).toBe(false)
  })

  it('appends an IV-rank floor chip when the floor is enabled', () => {
    expect(fmtCriteriaSummary(criteria({ minIvRank: '30' }))).toContain('IVR ≥ 30')
  })

  it('omits the IV-rank floor chip when the floor is disabled', () => {
    const chips = fmtCriteriaSummary(criteria({ minIvRank: null }))

    expect(chips.some((chip) => chip.startsWith('IVR'))).toBe(false)
  })

  it('orders chips delta, DTE, OI, spread, price ceiling, IVR floor, earnings', () => {
    expect(
      fmtCriteriaSummary(
        criteria({ maxUnderlyingPrice: '75', minIvRank: '30', earningsHandling: 'flag' })
      )
    ).toEqual([
      'Δ 0.20–0.30',
      'DTE 30–45',
      'OI ≥ 500',
      'Spread ≤ 10%',
      'Price ≤ $75',
      'IVR ≥ 30',
      'Earnings Flag only'
    ])
  })
})
