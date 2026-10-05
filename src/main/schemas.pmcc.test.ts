import { describe, expect, it } from 'vitest'
import { PmccTriggerEvent } from './schemas'

describe('PmccTriggerEvent', () => {
  it('lists exactly the six PMCC trigger events in order', () => {
    expect(PmccTriggerEvent.options).toEqual([
      'PMCC_OPEN',
      'PMCC_SHORT_OPEN',
      'PMCC_SHORT_EXPIRED',
      'PMCC_SHORT_CLOSED',
      'PMCC_SHORT_ROLL',
      'PMCC_LEAPS_ROLL'
    ])
  })

  it('rejects a wheel trigger event', () => {
    expect(PmccTriggerEvent.safeParse('CSP_ROLL').success).toBe(false)
  })
})
