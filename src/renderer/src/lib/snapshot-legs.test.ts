// [US-108] The positions list quotes every open option leg: a wheel's one leg, and each PMCC
// leg (the LEAPS and every short call) as a CALL.
import { AAPL, NVDA, XYZ, XYZ_LEAPS_ONLY } from '../test-fixtures/wheel-cards'
import { legsForSnapshots } from './snapshot-legs'

describe('legsForSnapshots', () => {
  it('gives a wheel its one leg and a PMCC one CALL per leg, in item then leg order', () => {
    expect(legsForSnapshots([XYZ, AAPL])).toEqual([
      { ticker: 'XYZ', expiration: '2028-01-21', strike: '80.0000', instrumentType: 'CALL' },
      { ticker: 'XYZ', expiration: '2027-08-20', strike: '118.0000', instrumentType: 'CALL' },
      { ticker: 'AAPL', expiration: '2027-09-12', strike: '180.0000', instrumentType: 'PUT' }
    ])
  })

  it('gives a LEAPS-only PMCC its LEAPS alone', () => {
    expect(legsForSnapshots([XYZ_LEAPS_ONLY])).toEqual([
      { ticker: 'XYZ', expiration: '2027-09-17', strike: '80.0000', instrumentType: 'CALL' }
    ])
  })

  it('keeps a wheel with no open option leg as an all-null leg', () => {
    expect(legsForSnapshots([NVDA])).toEqual([
      { ticker: 'NVDA', expiration: null, strike: null, instrumentType: null }
    ])
  })

  it('returns no legs for no items', () => {
    expect(legsForSnapshots([])).toEqual([])
  })
})
