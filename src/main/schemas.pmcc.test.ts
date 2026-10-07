import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PmccLedgerResult } from './core/costbasis'
import {
  PmccTriggerEvent,
  RollPmccShortCallPayloadSchema,
  type GetPositionResult,
  type PmccOpenLegs,
  type RollPmccShortCallPayload,
  type RollPmccShortCallResult,
  type RollResultBase
} from './schemas'

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

// [US-104] Roll the PMCC short call — positions:roll-pmcc-short payload + result
describe('RollPmccShortCallPayloadSchema', () => {
  const requiredFields = {
    positionId: '11111111-1111-4111-8111-111111111111',
    costToClosePerContract: 3.0,
    newPremiumPerContract: 2.4,
    newExpiration: '2026-12-18'
  }
  const contractExample = { ...requiredFields, newStrike: 112, fillDate: '2026-11-06' }

  it('accepts the contract example', () => {
    expect(RollPmccShortCallPayloadSchema.parse(contractExample)).toEqual(contractExample)
  })

  it('rejects a non-ISO fill date on the fillDate field', () => {
    const result = RollPmccShortCallPayloadSchema.safeParse({
      ...contractExample,
      fillDate: '11/13/2026'
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['fillDate'])
  })

  it('rejects a zero cost to close', () => {
    const result = RollPmccShortCallPayloadSchema.safeParse({
      ...contractExample,
      costToClosePerContract: 0
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['costToClosePerContract'])
  })

  it('rejects a non-ISO new expiration', () => {
    const result = RollPmccShortCallPayloadSchema.safeParse({
      ...contractExample,
      newExpiration: '12/18/2026'
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['newExpiration'])
  })

  it('rejects a missing positionId', () => {
    const result = RollPmccShortCallPayloadSchema.safeParse({
      ...contractExample,
      positionId: undefined
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['positionId'])
  })

  it('treats newStrike and fillDate as optional', () => {
    expect(RollPmccShortCallPayloadSchema.parse(requiredFields)).toEqual(requiredFields)
  })

  it('infers the payload type from the schema', () => {
    expectTypeOf<RollPmccShortCallPayload>().toEqualTypeOf<
      typeof RollPmccShortCallPayloadSchema._output
    >()
  })
})

describe('RollPmccShortCallResult', () => {
  it('narrows the position phase to PMCC_OPEN', () => {
    expectTypeOf<RollPmccShortCallResult['position']['phase']>().toEqualTypeOf<'PMCC_OPEN'>()
    expectTypeOf<RollPmccShortCallResult['position']['status']>().toEqualTypeOf<'ACTIVE'>()
  })

  it('narrows the snapshot trigger event to PMCC_SHORT_ROLL with no final P&L', () => {
    expectTypeOf<
      RollPmccShortCallResult['costBasisSnapshot']['triggerEvent']
    >().toEqualTypeOf<'PMCC_SHORT_ROLL'>()
    expectTypeOf<RollPmccShortCallResult['costBasisSnapshot']['finalPnl']>().toEqualTypeOf<null>()
  })

  it('extends the shared roll result base', () => {
    expectTypeOf<RollPmccShortCallResult>().toExtend<RollResultBase<'PMCC_OPEN'>>()
  })

  it('carries the recomputed ledger and the short-call roll number', () => {
    expectTypeOf<RollPmccShortCallResult['ledger']>().toEqualTypeOf<PmccLedgerResult>()
    expectTypeOf<RollPmccShortCallResult['shortCallRollNumber']>().toEqualTypeOf<number>()
  })
})

describe('PmccOpenLegs', () => {
  it('is re-exported from schemas and carried on getPosition, null for a wheel', () => {
    expectTypeOf<GetPositionResult['pmccOpenLegs']>().toEqualTypeOf<PmccOpenLegs | null>()
  })
})
