import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PmccLedgerResult, PmccLedgerWithStrike } from './core/costbasis'
import {
  PmccTriggerEvent,
  RollPmccLeapsPayloadSchema,
  RollPmccShortCallPayloadSchema,
  type GetPositionResult,
  type PmccOpenLegs,
  type RollCcResult,
  type RollPmccLeapsPayload,
  type RollPmccLeapsResult,
  type RollPmccShortCallPayload,
  type RollLegPair,
  type RollPmccShortCallResult,
  type RollResultBase
} from './schemas'
import type { RecordedPmccRoll } from './services/pmcc-roll-record'

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

// [US-105] Roll the PMCC LEAPS — positions:roll-pmcc-leaps payload + result
describe('RollPmccLeapsPayloadSchema', () => {
  const requiredFields = {
    positionId: '11111111-1111-4111-8111-111111111111',
    proceedsPerContract: 26.0,
    replacementDebitPerContract: 23.5,
    newExpiration: '2028-01-21'
  }
  const contractExample = { ...requiredFields, newStrike: 85, fillDate: '2027-07-09' }

  it('accepts the contract example', () => {
    expect(RollPmccLeapsPayloadSchema.parse(contractExample)).toEqual(contractExample)
  })

  it('rejects zero proceeds from close as too_small', () => {
    const result = RollPmccLeapsPayloadSchema.safeParse({
      ...contractExample,
      proceedsPerContract: 0
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['proceedsPerContract'])
    expect(result.error?.issues[0].code).toBe('too_small')
  })

  it('rejects a zero replacement debit as too_small', () => {
    const result = RollPmccLeapsPayloadSchema.safeParse({
      ...contractExample,
      replacementDebitPerContract: 0
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['replacementDebitPerContract'])
    expect(result.error?.issues[0].code).toBe('too_small')
  })

  it('rejects a non-ISO fill date on the fillDate field', () => {
    const result = RollPmccLeapsPayloadSchema.safeParse({
      ...contractExample,
      fillDate: '07/09/2027'
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['fillDate'])
  })

  it('rejects a non-ISO new expiration', () => {
    const result = RollPmccLeapsPayloadSchema.safeParse({
      ...contractExample,
      newExpiration: '01/21/2028'
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['newExpiration'])
  })

  it('rejects a missing positionId', () => {
    const result = RollPmccLeapsPayloadSchema.safeParse({
      ...contractExample,
      positionId: undefined
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['positionId'])
  })

  it('treats newStrike and fillDate as optional', () => {
    expect(RollPmccLeapsPayloadSchema.parse(requiredFields)).toEqual(requiredFields)
  })

  it('infers the payload type from the schema, with no short-call cost-to-close field', () => {
    expectTypeOf<RollPmccLeapsPayload>().toEqualTypeOf<typeof RollPmccLeapsPayloadSchema._output>()
    expectTypeOf<RollPmccLeapsPayload>().not.toHaveProperty('costToClosePerContract')
  })
})

describe('RollPmccLeapsResult', () => {
  it('inverts the leg actions: sell-to-close the LEAPS, buy-to-open the replacement', () => {
    expectTypeOf<RollPmccLeapsResult['rollFromLeg']['action']>().toEqualTypeOf<'SELL'>()
    expectTypeOf<RollPmccLeapsResult['rollToLeg']['action']>().toEqualTypeOf<'BUY'>()
  })

  it('narrows the position phase to PMCC_OPEN', () => {
    expectTypeOf<RollPmccLeapsResult['position']['phase']>().toEqualTypeOf<'PMCC_OPEN'>()
    expectTypeOf<RollPmccLeapsResult['position']['status']>().toEqualTypeOf<'ACTIVE'>()
  })

  it('narrows the snapshot trigger event to PMCC_LEAPS_ROLL with no final P&L', () => {
    expectTypeOf<
      RollPmccLeapsResult['costBasisSnapshot']['triggerEvent']
    >().toEqualTypeOf<'PMCC_LEAPS_ROLL'>()
    expectTypeOf<RollPmccLeapsResult['costBasisSnapshot']['finalPnl']>().toEqualTypeOf<null>()
  })

  it('extends the shared roll result base with the inverted action pair', () => {
    expectTypeOf<RollPmccLeapsResult>().toExtend<RollResultBase<'PMCC_OPEN', 'SELL', 'BUY'>>()
  })

  it('carries the recomputed ledger, with its effective share cost known, and the LEAPS roll number', () => {
    expectTypeOf<RollPmccLeapsResult['ledger']>().toEqualTypeOf<PmccLedgerWithStrike>()
    expectTypeOf<RollPmccLeapsResult['ledger']['effectiveShareCost']>().toEqualTypeOf<string>()
    expectTypeOf<RollPmccLeapsResult['leapsRollNumber']>().toEqualTypeOf<number>()
  })
})

describe('RollResultBase defaults', () => {
  it('keeps the wheel roll pair as buy-to-close / sell-to-open', () => {
    expectTypeOf<RollCcResult['rollFromLeg']['action']>().toEqualTypeOf<'BUY'>()
    expectTypeOf<RollCcResult['rollToLeg']['action']>().toEqualTypeOf<'SELL'>()
    expectTypeOf<RollCcResult>().toExtend<RollResultBase<'CC_OPEN'>>()
    expectTypeOf<RollResultBase<'CC_OPEN'>>().toEqualTypeOf<
      RollResultBase<'CC_OPEN', 'BUY', 'SELL'>
    >()
  })

  it('carries the shared roll leg pair, whose defaults are the wheel pair', () => {
    expectTypeOf<RollResultBase<'CC_OPEN'>>().toExtend<RollLegPair>()
    expectTypeOf<RollLegPair>().toEqualTypeOf<RollLegPair<'BUY', 'SELL'>>()
    expectTypeOf<RollResultBase<'PMCC_OPEN', 'SELL', 'BUY'>>().toExtend<
      RollLegPair<'SELL', 'BUY'>
    >()
  })

  it('a recorded PMCC roll carries the same leg pair as the roll results', () => {
    expectTypeOf<RecordedPmccRoll<'SELL', 'BUY', 'PMCC_LEAPS_ROLL'>>().toExtend<
      RollLegPair<'SELL', 'BUY'>
    >()
    expectTypeOf<
      Pick<RecordedPmccRoll<'BUY', 'SELL', 'PMCC_SHORT_ROLL'>, keyof RollLegPair>
    >().toEqualTypeOf<RollLegPair<'BUY', 'SELL'>>()
  })
})

describe('PmccOpenLegs', () => {
  it('is re-exported from schemas and carried on getPosition, null for a wheel', () => {
    expectTypeOf<GetPositionResult['pmccOpenLegs']>().toEqualTypeOf<PmccOpenLegs | null>()
  })
})
