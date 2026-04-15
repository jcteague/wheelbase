import { afterEach, describe, expect, it, vi } from 'vitest'
import { localDate, localToday } from './dates'

describe('localToday', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns YYYY-MM-DD in local timezone, not UTC', () => {
    // 10pm on July 15 local = July 16 in UTC (for PDT / UTC-7)
    vi.useFakeTimers({ now: new Date(2025, 6, 15, 22, 0, 0) })
    expect(localToday()).toBe('2025-07-15')
  })

  it('matches YYYY-MM-DD format', () => {
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('localDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns today when offset is 0', () => {
    vi.useFakeTimers({ now: new Date(2025, 6, 15, 22, 0, 0) })
    expect(localDate(0)).toBe('2025-07-15')
  })

  it('returns tomorrow when offset is 1', () => {
    vi.useFakeTimers({ now: new Date(2025, 6, 15, 22, 0, 0) })
    expect(localDate(1)).toBe('2025-07-16')
  })

  it('returns yesterday when offset is -1', () => {
    vi.useFakeTimers({ now: new Date(2025, 6, 15, 22, 0, 0) })
    expect(localDate(-1)).toBe('2025-07-14')
  })
})
