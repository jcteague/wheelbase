import { describe, expect, it } from 'vitest'
import { pmccCoverageLabel } from './pmcc-coverage'

describe('pmccCoverageLabel', () => {
  it('reads a LEAPS with no short call open', () => {
    expect(pmccCoverageLabel({ leapsContracts: 1, shortContracts: [] })).toBe(
      'LEAPS open · no short call'
    )
  })

  it('reads one short call covering the one LEAPS contract', () => {
    expect(pmccCoverageLabel({ leapsContracts: 1, shortContracts: [1] })).toBe(
      'LEAPS + short call open'
    )
  })

  it('adds no suffix when the short covers every LEAPS contract', () => {
    expect(pmccCoverageLabel({ leapsContracts: 3, shortContracts: [3] })).toBe(
      'LEAPS + short call open'
    )
  })

  it('states partial coverage one contract below full', () => {
    expect(pmccCoverageLabel({ leapsContracts: 3, shortContracts: [2] })).toBe(
      'LEAPS + short call open · 2 of 3 covered'
    )
  })

  it('states partial coverage of 1 of 3 LEAPS contracts', () => {
    expect(pmccCoverageLabel({ leapsContracts: 3, shortContracts: [1] })).toBe(
      'LEAPS + short call open · 1 of 3 covered'
    )
  })

  it('states partial coverage summed across two short calls', () => {
    expect(pmccCoverageLabel({ leapsContracts: 3, shortContracts: [1, 1] })).toBe(
      'LEAPS + 2 short calls open · 2 of 3 covered'
    )
  })

  it('counts two short calls open against the LEAPS', () => {
    expect(pmccCoverageLabel({ leapsContracts: 2, shortContracts: [1, 1] })).toBe(
      'LEAPS + 2 short calls open'
    )
  })
})
