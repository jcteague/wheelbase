import { describe, expect, it } from 'vitest'
import { brokerQueryKeys } from './brokerQueryKeys'

describe('brokerQueryKeys', () => {
  it('broker account, activities, and market-status keys start with broker', () => {
    expect(brokerQueryKeys.account[0]).toBe('broker')
    expect(brokerQueryKeys.marketStatus[0]).toBe('broker')
    expect(brokerQueryKeys.activities({ type: 'FILL', since: '2026-01-01' })[0]).toBe('broker')
  })
})
