import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  computeDte,
  computeDteFromInput,
  fmtDate,
  fmtMoney,
  fmtPct,
  pnlClass,
  pnlColor
} from './format'

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

describe('pnlClass', () => {
  it('uses the green token class for non-negative pnl', () => {
    expect(pnlClass('250.00')).toBe('text-wb-green')
    expect(pnlClass('0')).toBe('text-wb-green')
  })

  it('uses the red token class for negative pnl', () => {
    expect(pnlClass('-50.00')).toBe('text-wb-red')
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

// [US-68] The DTE the promoted new-wheel form shows. Counted in local calendar days
// so it agrees with the screener row it was promoted from — the engine
// (src/main/core/dte.ts) counts the same way.
describe('computeDteFromInput', () => {
  it('counts local calendar days to a future expiration', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 15, 23, 30)) // 15 Jul, late local evening

    expect(computeDteFromInput('2026-08-21')).toBe(37)
  })

  // The UTC arithmetic in `computeDte` rolls the day over at 17:00 in New York, so
  // a candidate the screener scored at 37 DTE would read 36 on the promoted form.
  it('does not roll the day over early for a timezone behind UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 15, 23, 30))

    expect(computeDteFromInput('2026-07-16')).toBe(1)
  })

  it.each([undefined, '', '2026-8-21', '08/21/2026', 'next friday'])(
    'has no DTE while the expiration is unusable (%s)',
    (expiration) => {
      expect(computeDteFromInput(expiration)).toBeNull()
    }
  )

  // The shape guard admits it; `parseISO` rejects it. Must be null, never NaN.
  it('has no DTE for a well-shaped but impossible date', () => {
    expect(computeDteFromInput('2026-13-45')).toBeNull()
  })
})
