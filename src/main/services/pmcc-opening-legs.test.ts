import { describe, expect, it } from 'vitest'
import type { LegRecord } from '../schemas'
import { pmccEntryDebit } from './pmcc-opening-legs'

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

describe('pmccEntryDebit', () => {
  it('returns the net debit in dollars and per share from both opening legs', () => {
    expect(pmccEntryDebit([LONG, SHORT])).toEqual({ perShare: '23.0000', total: '2300.0000' })
  })

  it('keeps the entry debit when a later SHORT_CALL_OPEN follows the opening legs', () => {
    const laterShort = makeLeg({
      id: 'short-2',
      legRole: 'SHORT_CALL_OPEN',
      strike: '108.0000',
      fillPrice: '1.8000',
      premiumPerContract: '1.8000'
    })
    expect(pmccEntryDebit([LONG, SHORT, laterShort])).toEqual({
      perShare: '23.0000',
      total: '2300.0000'
    })
  })

  it('scales the total by contracts and adds each leg’s fees (0.01 + 0.01 over 300 shares → 23.0001 / share)', () => {
    const long = { ...LONG, contracts: 3, fees: '0.0100' }
    const short = { ...SHORT, contracts: 3, fees: '0.0100' }
    expect(pmccEntryDebit([long, short])).toEqual({ perShare: '23.0001', total: '6900.0200' })
  })

  it('is null when either opening leg is missing', () => {
    expect(pmccEntryDebit([LONG])).toBeNull()
    expect(pmccEntryDebit([SHORT])).toBeNull()
    expect(pmccEntryDebit([])).toBeNull()
  })

  it('is null when either opening leg has no fill price', () => {
    expect(pmccEntryDebit([{ ...LONG, fillPrice: null }, SHORT])).toBeNull()
    expect(pmccEntryDebit([LONG, { ...SHORT, fillPrice: null }])).toBeNull()
  })
})

// [US-108] The tier-2 "Entry net debit … / share" figure.
describe('pmccEntryDebit — the US-103 fixture ($25.00 LEAPS, $1.80 short, 1 contract)', () => {
  const short180 = { ...SHORT, fillPrice: '1.8000', premiumPerContract: '1.8000' }

  it('returns the entry debit per share and in dollars (25.00 − 1.80)', () => {
    expect(pmccEntryDebit([LONG, short180])).toEqual({ perShare: '23.2000', total: '2320.0000' })
  })

  it('adds both legs’ fees (1.00 + 1.00 on 1 contract → 23.2200 / share)', () => {
    expect(
      pmccEntryDebit([
        { ...LONG, fees: '1.0000' },
        { ...short180, fees: '1.0000' }
      ])
    ).toEqual({ perShare: '23.2200', total: '2322.0000' })
  })
})
