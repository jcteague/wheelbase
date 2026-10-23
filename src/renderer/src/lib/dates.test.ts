import { afterEach, describe, expect, it, vi } from 'vitest'
import { localDate, localToday, newYorkToday } from './dates'

describe('localToday', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns YYYY-MM-DD in local timezone, not UTC', () => {
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

describe('newYorkToday (US-102)', () => {
  afterEach(() => vi.useRealTimers())

  it.each([
    ['2026-09-15T02:30:00Z', '2026-09-14'],
    ['2027-01-01T02:30:00Z', '2026-12-31'],
    ['2026-03-08T06:59:00Z', '2026-03-08'],
    ['2026-03-08T07:01:00Z', '2026-03-08'],
    ['2026-11-01T05:59:00Z', '2026-11-01'],
    ['2026-11-01T06:01:00Z', '2026-11-01']
  ])('uses the New York calendar day at %s', (instant, expected) => {
    expect(newYorkToday(new Date(instant))).toBe(expected)
  })

  it('defaults to the current instant, independently of the process timezone', () => {
    vi.useFakeTimers({ now: new Date('2026-09-15T02:30:00Z') })
    expect(newYorkToday()).toBe('2026-09-14')
  })
})
