// [US-116] The calendar fallback is what the pill shows before — or without — a session
// from the provider. Gating the status query on market-data credentials made that path
// load-bearing for an install that has none, so it is pinned here rather than left to
// whatever hour the suite happens to run at.
import { describe, expect, it } from 'vitest'
import { computeNYSESession, deriveMarketStatusDisplay } from './market-status'

/** Instants are given in UTC so the expected ET wall clock is the same on any machine.
 *  2026-09-11 is a Friday; 2026-09-12 a Saturday. */
const at = (iso: string): Date => new Date(iso)

describe('computeNYSESession', () => {
  it('reports a weekday 10:00 ET as the regular session', () => {
    expect(computeNYSESession(at('2026-09-11T14:00:00Z'))).toBe('regular')
  })

  it('reports 08:00 ET as pre-market', () => {
    expect(computeNYSESession(at('2026-09-11T12:00:00Z'))).toBe('pre')
  })

  it('reports 17:00 ET as post-market', () => {
    expect(computeNYSESession(at('2026-09-11T21:00:00Z'))).toBe('post')
  })

  it('reports 22:00 ET as closed', () => {
    expect(computeNYSESession(at('2026-09-12T02:00:00Z'))).toBe('closed')
  })

  it('reports 03:00 ET, before the pre-market open, as closed', () => {
    expect(computeNYSESession(at('2026-09-11T07:00:00Z'))).toBe('closed')
  })

  it('reports a weekend as closed regardless of the hour', () => {
    expect(computeNYSESession(at('2026-09-12T14:00:00Z'))).toBe('closed')
    expect(computeNYSESession(at('2026-09-13T14:00:00Z'))).toBe('closed')
  })
})

describe('deriveMarketStatusDisplay', () => {
  it('maps a reported session to its pill state', () => {
    expect(deriveMarketStatusDisplay('regular', false)).toBe('LIVE')
    expect(deriveMarketStatusDisplay('pre', false)).toBe('EXT')
    expect(deriveMarketStatusDisplay('post', false)).toBe('EXT')
    expect(deriveMarketStatusDisplay('closed', false)).toBe('CLOSED')
  })

  it('reports DELAYED when quotes are stale, whatever the session says', () => {
    expect(deriveMarketStatusDisplay('regular', true)).toBe('DELAYED')
    expect(deriveMarketStatusDisplay(undefined, true)).toBe('DELAYED')
  })

  it('falls back to the calendar when no session has been reported', () => {
    // What an install with no market-data credentials shows: the query never runs, so
    // there is no session to derive from and the local calendar answers instead.
    expect(deriveMarketStatusDisplay(undefined, false)).toBe(
      deriveMarketStatusDisplay(computeNYSESession(), false)
    )
  })
})
