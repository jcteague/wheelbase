import { describe, expect, it } from 'vitest'
import type { LegRecord } from '../schemas'
import { pmccInitialNetDebit, pmccOpeningLegs } from './pmcc-opening-legs'

function makeLeg(overrides: Partial<LegRecord> & Pick<LegRecord, 'id' | 'legRole'>): LegRecord {
  return {
    positionId: 'pos-pmcc',
    action: overrides.legRole === 'LEAPS_OPEN' ? 'BUY' : 'SELL',
    instrumentType: 'CALL',
    strike: overrides.legRole === 'LEAPS_OPEN' ? '80.0000' : '110.0000',
    expiration: overrides.legRole === 'LEAPS_OPEN' ? '2027-06-18' : '2026-07-17',
    contracts: 1,
    premiumPerContract: overrides.legRole === 'LEAPS_OPEN' ? '25.0000' : '2.0000',
    fillPrice: overrides.legRole === 'LEAPS_OPEN' ? '25.0000' : '2.0000',
    fillDate: '2026-06-01',
    rollChainId: null,
    fees: '0.0000',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides
  }
}

const LONG = makeLeg({ id: 'long', legRole: 'LEAPS_OPEN' })
const SHORT = makeLeg({ id: 'short', legRole: 'SHORT_CALL_OPEN' })

describe('pmccOpeningLegs', () => {
  it('picks the LEAPS_OPEN leg as long and the SHORT_CALL_OPEN leg as short', () => {
    expect(pmccOpeningLegs([LONG, SHORT])).toEqual({ long: LONG, short: SHORT })
  })

  it('ignores legs in other roles', () => {
    const close = makeLeg({ id: 'close', legRole: 'SHORT_CALL_CLOSE' })
    expect(pmccOpeningLegs([LONG, close, SHORT])).toEqual({ long: LONG, short: SHORT })
  })

  it('lets later rows win, so a newer opening leg supersedes the first', () => {
    const newerShort = makeLeg({ id: 'short-2', legRole: 'SHORT_CALL_OPEN', strike: '115.0000' })
    const newerLong = makeLeg({ id: 'long-2', legRole: 'LEAPS_OPEN', strike: '75.0000' })
    expect(pmccOpeningLegs([LONG, SHORT, newerShort, newerLong])).toEqual({
      long: newerLong,
      short: newerShort
    })
  })

  it('leaves a side undefined when its leg is missing', () => {
    expect(pmccOpeningLegs([LONG])).toEqual({ long: LONG, short: undefined })
    expect(pmccOpeningLegs([])).toEqual({ long: undefined, short: undefined })
  })
})

describe('pmccInitialNetDebit', () => {
  it('returns the net debit in dollars from both opening legs', () => {
    expect(pmccInitialNetDebit([LONG, SHORT])).toBe('2300.0000')
  })

  it('keeps the entry debit when a later SHORT_CALL_OPEN follows the opening legs', () => {
    const laterShort = makeLeg({
      id: 'short-2',
      legRole: 'SHORT_CALL_OPEN',
      strike: '108.0000',
      fillPrice: '1.8000',
      premiumPerContract: '1.8000'
    })
    expect(pmccInitialNetDebit([LONG, SHORT, laterShort])).toBe('2300.0000')
  })

  it('scales by contracts and adds each leg’s fees', () => {
    const long = { ...LONG, contracts: 3, fees: '0.0100' }
    const short = { ...SHORT, contracts: 3, fees: '0.0100' }
    expect(pmccInitialNetDebit([long, short])).toBe('6900.0200')
  })

  it('is null when either opening leg is missing', () => {
    expect(pmccInitialNetDebit([LONG])).toBeNull()
    expect(pmccInitialNetDebit([SHORT])).toBeNull()
    expect(pmccInitialNetDebit([])).toBeNull()
  })

  it('is null when either opening leg has no fill price', () => {
    expect(pmccInitialNetDebit([{ ...LONG, fillPrice: null }, SHORT])).toBeNull()
    expect(pmccInitialNetDebit([LONG, { ...SHORT, fillPrice: null }])).toBeNull()
  })
})
