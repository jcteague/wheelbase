// [US-121] The shared e2e clock, moved out of the retired fake Barchart scraper unchanged in
// behaviour: absent in production, and one mutable instant for every consumer under test.
import { afterEach, describe, expect, it } from 'vitest'
import { createFakeClock, setFakeNow } from './fake-clock'

afterEach(() => {
  delete process.env.WHEELBASE_FAKE_NOW
  setFakeNow(null)
})

describe('createFakeClock', () => {
  it('returns undefined when WHEELBASE_FAKE_NOW is unset, so the wall clock is used', () => {
    expect(createFakeClock()).toBeUndefined()
  })

  it('reads WHEELBASE_FAKE_NOW and follows later setFakeNow calls', () => {
    process.env.WHEELBASE_FAKE_NOW = '2026-08-10T14:00:00.000Z'
    const clock = createFakeClock()

    expect(clock?.now().toISOString()).toBe('2026-08-10T14:00:00.000Z')

    setFakeNow('2026-08-11T14:00:00.000Z')
    expect(clock?.now().toISOString()).toBe('2026-08-11T14:00:00.000Z')
  })

  it('falls back to the wall clock once the fake instant is cleared', () => {
    process.env.WHEELBASE_FAKE_NOW = '2026-08-10T14:00:00.000Z'
    const clock = createFakeClock()

    setFakeNow(null)
    const before = Date.now()
    const now = clock?.now().getTime() ?? Number.NaN

    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(Date.now())
  })

  it('rejects an invalid clock value', () => {
    expect(() => setFakeNow('not-a-timestamp')).toThrow(/valid ISO timestamp/)
  })
})
