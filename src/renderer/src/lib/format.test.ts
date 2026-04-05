import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeDte, fmtDate, fmtMoney, fmtPct, pnlColor } from './format'

afterEach(() => {
  vi.useRealTimers()
})

describe('fmtMoney', () => {
  it('formats whole dollar strings to two decimals', () => {
    expect(fmtMoney('180.0000')).toBe('$180.00')
  })

  it('formats fractional dollar strings to two decimals', () => {
    expect(fmtMoney('3.2000')).toBe('$3.20')
  })
})

describe('fmtPct', () => {
  it('formats positive percentages without decimal places', () => {
    expect(fmtPct(30)).toBe('30%')
  })

  it('formats negative percentages without decimal places', () => {
    expect(fmtPct(-15)).toBe('-15%')
  })
})

describe('fmtDate', () => {
  it('formats an ISO date as a local month and day without timezone shift', () => {
    expect(fmtDate('2026-04-17')).toBe('Apr 17')
  })
})

describe('pnlColor', () => {
  it('uses green for non-negative pnl', () => {
    expect(pnlColor('250.00')).toBe('var(--wb-green)')
  })

  it('uses red for negative pnl', () => {
    expect(pnlColor('-50.00')).toBe('var(--wb-red)')
  })
})

describe('computeDte', () => {
  it('returns a positive integer for a future expiration date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 7, 12, 0, 0)))

    expect(computeDte('2026-04-17')).toBe(10)
  })

  it('returns a negative integer for a past expiration date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 27, 12, 0, 0)))

    expect(computeDte('2026-04-17')).toBe(-10)
  })
})
