import { format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'
import {
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
  it('trims trailing zeros from a whole-number rank', () => {
    expect(fmtIvr({ value: '44.0', observedAt: '2026-08-07T16:00:00Z' })).toBe('44')
  })

  it('keeps a meaningful decimal', () => {
    expect(fmtIvr({ value: '38.5', observedAt: '2026-08-07T16:00:00Z' })).toBe('38.5')
  })

  it('renders n/a for a null rank', () => {
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
