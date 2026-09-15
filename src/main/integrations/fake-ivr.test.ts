import { afterEach, describe, expect, it } from 'vitest'
import {
  createFakeIvrCollaborators,
  readFakeIvrFetchLog,
  setFakeIvrNow,
  setFakeIvrOutcomes
} from './fake-ivr'

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

// The fetch log is the only seam an e2e spec has for "no IVR request was made for KO" —
// a clause five acceptance criteria turn on. A log that silently stopped recording, or
// never cleared between scenarios, would make all five pass vacuously.
describe('fake IVR fetch log', () => {
  function enableFakeIvr(): NonNullable<ReturnType<typeof createFakeIvrCollaborators>['fetchIvr']> {
    process.env.WHEELBASE_FAKE_IVR = '{}'
    return createFakeIvrCollaborators().fetchIvr!
  }

  it('records every ticker asked for, upper-cased, in call order', async () => {
    const fetchIvr = enableFakeIvr()

    await fetchIvr('ko')
    await fetchIvr('MSFT')

    expect(readFakeIvrFetchLog()).toEqual(['KO', 'MSFT'])
  })

  it('records a ticker even when no outcome was programmed for it', async () => {
    const fetchIvr = enableFakeIvr()

    const result = await fetchIvr('XYZ')

    expect(result.status).toBe('not_available')
    expect(readFakeIvrFetchLog()).toEqual(['XYZ'])
  })

  it('clears the log when a scenario programs new outcomes', async () => {
    const fetchIvr = enableFakeIvr()
    await fetchIvr('KO')
    expect(readFakeIvrFetchLog()).toEqual(['KO'])

    setFakeIvrOutcomes({})

    expect(readFakeIvrFetchLog()).toEqual([])
  })

  it('hands back a copy, so a reader cannot mutate the log', async () => {
    const fetchIvr = enableFakeIvr()
    await fetchIvr('KO')

    readFakeIvrFetchLog().push('MSFT')

    expect(readFakeIvrFetchLog()).toEqual(['KO'])
  })

  it('starts with an empty log when the programmed outcomes are malformed', async () => {
    process.env.WHEELBASE_FAKE_IVR = 'not json'
    const { fetchIvr } = createFakeIvrCollaborators()

    const result = await fetchIvr!('KO')

    expect(result.status).toBe('not_available')
    expect(readFakeIvrFetchLog()).toEqual(['KO'])
  })
})
