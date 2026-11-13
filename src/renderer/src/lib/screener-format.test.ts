import { format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PMCC_SCREENING_CRITERIA } from '../../../main/core/pmcc-screener'
import { DEFAULT_SCREENING_CRITERIA } from '../../../main/core/screener'
import type { PmccScreeningCriteria } from '../api/pmcc-screening-criteria'
import type { ScreeningCriteria } from '../api/screening-criteria'
import { candidate } from '../components/bench-test-utils'
import { XLF_DIAGONAL } from '../test-fixtures/pmcc-diagonals'
import {
  fmtCriteriaSummary,
  fmtDelta,
  fmtDiagonalLine,
  fmtLongDate,
  fmtOpenInterest,
  fmtPmccCriteriaSummary,
  fmtPutLine,
  fmtQuoteTime,
  fmtRatioPercent,
  fmtScore,
  fmtSpread,
  fmtYieldPercent,
  formatIvrValue
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

// [US-110] The PMCC criteria strip. Same glyphs as the wheel's strip (EN-DASH bands, ≥ / ≤),
// each band prefixed with the leg it constrains.
describe('fmtPmccCriteriaSummary', () => {
  const pmccCriteria = (overrides: Partial<PmccScreeningCriteria> = {}): PmccScreeningCriteria => ({
    ...DEFAULT_PMCC_SCREENING_CRITERIA,
    ...overrides
  })

  it('renders the shipped defaults as the eight-chip PMCC strip', () => {
    expect(fmtPmccCriteriaSummary(pmccCriteria())).toEqual([
      'LEAPS Δ 0.70–0.85',
      'LEAPS 180–540 DTE',
      'Short Δ 0.25–0.35',
      'Short 20–45 DTE',
      'Debit ≤ 90% width',
      'OI ≥ 200',
      'Spread ≤ 10%',
      'Earnings Exclude'
    ])
  })

  it('places an enabled IV-rank floor and ceiling between the spread and earnings chips', () => {
    expect(fmtPmccCriteriaSummary(pmccCriteria({ minIvRank: '30', maxIvRank: '55' }))).toEqual([
      'LEAPS Δ 0.70–0.85',
      'LEAPS 180–540 DTE',
      'Short Δ 0.25–0.35',
      'Short 20–45 DTE',
      'Debit ≤ 90% width',
      'OI ≥ 200',
      'Spread ≤ 10%',
      'IVR ≥ 30',
      'IVR ≤ 55',
      'Earnings Exclude'
    ])
  })

  it('shows only the ceiling chip when the floor is off', () => {
    const chips = fmtPmccCriteriaSummary(pmccCriteria({ maxIvRank: '55' }))

    expect(chips.filter((chip) => chip.startsWith('IVR'))).toEqual(['IVR ≤ 55'])
  })

  it('reflects saved bands, windows and ratio, padding deltas to two decimals', () => {
    expect(
      fmtPmccCriteriaSummary(
        pmccCriteria({
          longDeltaMin: '0.8',
          longDeltaMax: '0.9',
          longDteMin: 270,
          longDteMax: 730,
          shortDeltaMin: '0.2',
          shortDeltaMax: '0.3',
          shortDteMin: 30,
          shortDteMax: 60,
          maxDebitToWidthPercent: '85',
          minOpenInterest: 1500,
          maxSpreadPercent: '7.5'
        })
      ).slice(0, 7)
    ).toEqual([
      'LEAPS Δ 0.80–0.90',
      'LEAPS 270–730 DTE',
      'Short Δ 0.20–0.30',
      'Short 30–60 DTE',
      'Debit ≤ 85% width',
      'OI ≥ 1,500',
      'Spread ≤ 7.5%'
    ])
  })

  it('renders the flag-only earnings policy as its own chip wording', () => {
    expect(fmtPmccCriteriaSummary(pmccCriteria({ earningsHandling: 'flag' })).at(-1)).toBe(
      'Earnings Flag only'
    )
  })
})

// [US-110] A ratio the engine already expresses in percent (debit / width, 2 dp).
describe('fmtRatioPercent', () => {
  it('keeps two significant decimals', () => {
    expect(fmtRatioPercent('87.82')).toBe('87.82%')
  })

  it('trims a trailing zero after the point', () => {
    expect(fmtRatioPercent('87.50')).toBe('87.5%')
  })

  it('drops the decimal point entirely on a whole percent', () => {
    expect(fmtRatioPercent('90.00')).toBe('90%')
  })
})

// [US-110] The diagonal's one-line summary on a bench card.
describe('fmtDiagonalLine', () => {
  it('names both strikes as money, the short expiry and the cycle yield on debit', () => {
    expect(fmtDiagonalLine(XLF_DIAGONAL)).toBe(
      '$42.00 LEAPS · $53.00 short Oct 23 · 6.63% on debit'
    )
  })

  it('reads the short leg, not the LEAPS, for the expiry it names', () => {
    const line = fmtDiagonalLine({
      ...XLF_DIAGONAL,
      long: { ...XLF_DIAGONAL.long, strike: '140.0000', expiration: '2027-09-17' },
      short: { ...XLF_DIAGONAL.short, strike: '190.0000', expiration: '2026-11-06' },
      cycleYield: '0.0564'
    })

    expect(line).toBe('$140.00 LEAPS · $190.00 short Nov 6 · 5.64% on debit')
  })
})

// [US-96] The wheel card's second line, lifted out of `BenchCard` so the bench can hand each
// lens its own summary. The wording must not change by a byte.
describe('fmtPutLine', () => {
  it('names the strike as money, the expiry and the period yield', () => {
    expect(fmtPutLine(candidate())).toBe('$60.00 put · Oct 16 · 1.58% yield')
  })

  it('trims trailing zeros from the period yield', () => {
    expect(fmtPutLine(candidate({ strike: '150.0000', periodYield: '0.0150' }))).toBe(
      '$150.00 put · Oct 16 · 1.5% yield'
    )
  })
})

// [US-110] The diagonal detail names its expiries with the year — a LEAPS is a year or more
// out, so "Jan 21" alone would not say which January.
describe('fmtLongDate', () => {
  it('formats an ISO day as month, day and year', () => {
    expect(fmtLongDate('2026-10-23')).toBe('Oct 23, 2026')
  })

  it('does not pad a single-digit day', () => {
    expect(fmtLongDate('2028-01-06')).toBe('Jan 6, 2028')
  })
})

describe('formatIvrValue', () => {
  it('renders an integer rank as-is', () => {
    expect(formatIvrValue('25')).toBe('25')
  })

  // [US-121] A flat 52-week window has no rank to show.
  it('renders a withheld rank as n/a', () => {
    expect(formatIvrValue(null)).toBe('n/a')
  })
})
