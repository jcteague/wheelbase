import { afterEach, describe, expect, it } from 'vitest'
import { createFakeIvrCollaborators, setFakeIvrNow } from './fake-ivr'

afterEach(() => {
  delete process.env.WHEELBASE_FAKE_IVR
  delete process.env.WHEELBASE_FAKE_NOW
  setFakeIvrNow(null)
})

describe('fake IVR clock', () => {
  it('does not replace the production clock when fake mode is unavailable', () => {
    const collaborators = createFakeIvrCollaborators()

    expect(collaborators).toEqual({})
  })

  it('shares one mutable clock with consumers after fake mode is enabled', () => {
    process.env.WHEELBASE_FAKE_IVR = '{}'
    process.env.WHEELBASE_FAKE_NOW = '2026-08-10T14:00:00.000Z'
    const collaborators = createFakeIvrCollaborators()

    expect(collaborators.clock?.now().toISOString()).toBe('2026-08-10T14:00:00.000Z')

    setFakeIvrNow('2026-08-11T14:00:00.000Z')
    expect(collaborators.clock?.now().toISOString()).toBe('2026-08-11T14:00:00.000Z')
  })

  it('rejects an invalid test clock value', () => {
    expect(() => setFakeIvrNow('not-a-timestamp')).toThrow(/valid ISO timestamp/)
  })
})
