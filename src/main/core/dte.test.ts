import { describe, expect, it } from 'vitest'
import { computeDte } from './dte'

describe('computeDte', () => {
  it('returns null when expiration is null', () => {
    expect(computeDte(null, new Date('2026-06-25T12:00:00'))).toBeNull()
  })

  it('returns 0 when expiration equals the injected now calendar date', () => {
    expect(computeDte('2026-06-25', new Date('2026-06-25T12:00:00'))).toBe(0)
  })

  it('returns 5 when expiration is 5 calendar days after a fixed injected now', () => {
    expect(computeDte('2026-06-30', new Date('2026-06-25T12:00:00'))).toBe(5)
  })

  it('returns a negative number when expiration is in the past', () => {
    expect(computeDte('2026-06-20', new Date('2026-06-25T12:00:00'))).toBe(-5)
  })

  it('returns 5 for a leg expiring five calendar days after now regardless of time-of-day', () => {
    const lateInDay = computeDte('2026-06-30', new Date('2026-06-25T23:59:00'))
    const atMidnight = computeDte('2026-06-30', new Date('2026-06-25T00:00:00'))
    expect(lateInDay).toBe(5)
    expect(atMidnight).toBe(5)
    expect(lateInDay).toBe(atMidnight)
  })

  it('returns null (never NaN) for a non-date string', () => {
    expect(computeDte('TBD', new Date('2026-06-25T12:00:00'))).toBeNull()
  })

  it('returns null (never NaN) for a non-ISO date format', () => {
    expect(computeDte('2026-8-14', new Date('2026-06-25T12:00:00'))).toBeNull()
  })
})
