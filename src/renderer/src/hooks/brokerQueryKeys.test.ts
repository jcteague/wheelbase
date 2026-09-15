import { describe, expect, it } from 'vitest'
import { brokerQueryKeys } from './brokerQueryKeys'

describe('brokerQueryKeys', () => {
  it('broker account and activities keys start with broker', () => {
    expect(brokerQueryKeys.account[0]).toBe('broker')
    expect(brokerQueryKeys.activities({ type: 'FILL', since: '2026-01-01' })[0]).toBe('broker')
  })

  // An omitted `since` still has to produce a stable key, or two activity reads that
  // differ only in that would share a cache entry.
  it('activities keys a missing since as an empty segment', () => {
    expect(brokerQueryKeys.activities({ type: 'FILL' })).toEqual([
      'broker',
      'activities',
      'FILL',
      ''
    ])
  })

  // [US-116] The session is a market fact — its key lives in marketDataQueryKeys now.
  it('no longer carries a market-status key', () => {
    expect('marketStatus' in brokerQueryKeys).toBe(false)
  })
})
