// [US-109] The PMCC leg timeline's row copy: each LEAPS-track and cycle row cell from the OPT-17
// acceptance strings, over literal rows of the story's XYZ Background.
import { describe, expect, it } from 'vitest'
import type { PmccCycleRow, PmccLeapsRow } from '../../../main/core/pmcc-timeline'
import {
  contractLabel,
  cycleEventLabel,
  cycleOutcome,
  cycleTitle,
  feesSuffix,
  leapsBasisCell,
  leapsCoverageCell,
  leapsEventLabel,
  leapsRollPrices,
  netLabel,
  openCycleRow,
  outcomeLabel,
  rollContractLabel,
  rollNetCell,
  rowAmounts,
  shortRollPrices,
  unrecordedCycleRow
} from './pmcc-timeline-rows'

const LEAPS_PURCHASE: PmccLeapsRow = {
  kind: 'PURCHASE',
  date: '2026-09-14',
  contract: { strike: '80.0000', expiration: '2027-09-17', pricePerShare: '25.0000' },
  total: '2500.0000',
  dteAtFill: 368,
  basisAfter: '25.0000',
  fees: '0.0000'
}

const LEAPS_ROLL: PmccLeapsRow = {
  kind: 'ROLL',
  number: 1,
  date: '2027-07-09',
  from: { strike: '80.0000', expiration: '2027-09-17', pricePerShare: '26.0000' },
  to: { strike: '85.0000', expiration: '2028-01-21', pricePerShare: '23.5000' },
  net: { direction: 'credit', perShare: '2.5000', total: '250.0000' },
  coverage: { unbroken: true, extensionDays: 126 },
  basisAfter: '8.5000',
  fees: '0.0000'
}

const LEAPS_CLOSE: PmccLeapsRow = {
  kind: 'CLOSE',
  date: '2027-08-20',
  contract: { strike: '85.0000', expiration: '2028-01-21', pricePerShare: '26.5000' },
  total: '2650.0000',
  fees: '0.0000'
}

const LEAPS_UNKNOWN: PmccLeapsRow = { kind: 'UNKNOWN', date: '2027-08-04', role: 'LEAPS_ADJUST' }

const CYCLE_1_OPEN: PmccCycleRow = {
  kind: 'OPEN',
  date: '2026-09-14',
  contract: { strike: '110.0000', expiration: '2026-10-16', pricePerShare: '2.0000' },
  total: '200.0000',
  fees: '0.0000'
}

const CYCLE_2_ROLL: PmccCycleRow = {
  kind: 'ROLL',
  number: 1,
  date: '2026-11-06',
  from: { strike: '108.0000', expiration: '2026-11-20', pricePerShare: '3.0000' },
  to: { strike: '112.0000', expiration: '2026-12-18', pricePerShare: '2.4000' },
  net: { direction: 'debit', perShare: '0.6000', total: '60.0000' },
  fees: '0.0000'
}

const CYCLE_9_UNKNOWN: PmccCycleRow = { kind: 'UNKNOWN', date: '2027-08-04', role: 'CC_CLOSE' }

const CYCLE_5_BUYBACK: PmccCycleRow = {
  kind: 'END',
  date: '2027-04-02',
  outcome: 'CLOSED',
  contract: { strike: '114.0000', expiration: '2027-04-16' },
  pricePerShare: '0.5500',
  total: '55.0000',
  fees: '0.0000'
}

const CYCLE_1_EXPIRY: PmccCycleRow = {
  kind: 'END',
  date: '2026-10-16',
  outcome: 'EXPIRED',
  contract: { strike: '110.0000', expiration: '2026-10-16' },
  pricePerShare: null,
  total: null,
  fees: '0.0000'
}

const CYCLE_9_ASSIGNMENT: PmccCycleRow = {
  kind: 'END',
  date: '2027-08-20',
  outcome: 'ASSIGNED',
  contract: { strike: '118.0000', expiration: '2027-08-20' },
  pricePerShare: null,
  total: null,
  fees: '0.0000'
}

describe('netLabel', () => {
  it.each([
    [{ direction: 'debit', perShare: '0.6000', total: '60.0000' }, 'Net debit $0.60 ($60.00)'],
    [{ direction: 'credit', perShare: '2.5000', total: '250.0000' }, 'Net credit $2.50 ($250.00)'],
    [
      { direction: 'credit', perShare: '4.2000', total: '4200.0000' },
      'Net credit $4.20 ($4,200.00)'
    ],
    [{ direction: 'even', perShare: '0.0000', total: '0.0000' }, 'Net even $0.00 ($0.00)']
  ] as const)('%o reads %s', (net, expected) => {
    expect(netLabel(net)).toBe(expected)
  })
})

describe('leapsCoverageCell', () => {
  it('reads a purchase as opening coverage with its DTE at fill', () => {
    expect(leapsCoverageCell({ kind: 'PURCHASE', dteAtFill: 368 })).toBe(
      'opens coverage · 368 DTE at fill'
    )
  })

  it('reads a same-day roll as unbroken with its extension', () => {
    expect(
      leapsCoverageCell({ kind: 'ROLL', coverage: { unbroken: true, extensionDays: 126 } })
    ).toBe('unbroken · +126 days')
  })

  it('reads a broken roll as its gap, never unbroken', () => {
    expect(
      leapsCoverageCell({
        kind: 'ROLL',
        coverage: { unbroken: false, gapDays: 2, extensionDays: 126 }
      })
    ).toBe('2 day gap · +126 days')
  })

  it('reads a one-day extension in the singular', () => {
    expect(
      leapsCoverageCell({ kind: 'ROLL', coverage: { unbroken: true, extensionDays: 1 } })
    ).toBe('unbroken · +1 day')
  })
})

describe('contract labels', () => {
  it('reads a contract as strike call and expiration', () => {
    expect(contractLabel({ strike: '80.0000', expiration: '2027-09-17' })).toBe(
      '$80.00 call · 2027-09-17'
    )
  })

  it('reads a roll as from → to', () => {
    expect(
      rollContractLabel({
        from: { strike: '80.0000', expiration: '2027-09-17' },
        to: { strike: '85.0000', expiration: '2028-01-21' }
      })
    ).toBe('$80.00 2027-09-17 → $85.00 2028-01-21')
  })
})

describe('roll prices', () => {
  it('reads a LEAPS roll as selling the old and buying the new', () => {
    expect(
      leapsRollPrices({
        from: { strike: '80.0000', expiration: '2027-09-17', pricePerShare: '26.0000' },
        to: { strike: '85.0000', expiration: '2028-01-21', pricePerShare: '23.5000' }
      })
    ).toBe('sell $26.00 / buy $23.50')
  })

  it('reads a short roll as buying the old and selling the new', () => {
    expect(
      shortRollPrices({
        from: { strike: '108.0000', expiration: '2026-11-20', pricePerShare: '3.0000' },
        to: { strike: '112.0000', expiration: '2026-12-18', pricePerShare: '2.4000' }
      })
    ).toBe('buy $3.00 / sell $2.40')
  })
})

describe('feesSuffix', () => {
  it('names a non-zero fee', () => {
    expect(feesSuffix('1.0000')).toBe(' · fees $1.00')
  })

  it('is empty when the fee is zero', () => {
    expect(feesSuffix('0.0000')).toBe('')
  })
})

describe('rowAmounts', () => {
  it('signs a sell to open as cash in', () => {
    expect(rowAmounts(CYCLE_1_OPEN)).toEqual({ price: '+$2.00', total: '+$200.00' })
  })

  it('appends a non-zero fee to the total', () => {
    expect(rowAmounts({ ...CYCLE_1_OPEN, fees: '1.0000' })).toEqual({
      price: '+$2.00',
      total: '+$200.00 · fees $1.00'
    })
  })

  it('signs the LEAPS purchase as cash out, grouped', () => {
    expect(rowAmounts(LEAPS_PURCHASE)).toEqual({ price: '−$25.00', total: '−$2,500.00' })
  })

  it('signs the LEAPS sale to close as cash in', () => {
    expect(rowAmounts(LEAPS_CLOSE)).toEqual({ price: '+$26.50', total: '+$2,650.00' })
  })

  it('signs a buyback as cash out', () => {
    expect(rowAmounts(CYCLE_5_BUYBACK)).toEqual({ price: '−$0.55', total: '−$55.00' })
  })

  it('reads an expiration as worthless with no cash', () => {
    expect(rowAmounts(CYCLE_1_EXPIRY)).toEqual({ price: 'expired worthless', total: '—' })
  })

  it('reads an assignment without claiming the settlement', () => {
    expect(rowAmounts(CYCLE_9_ASSIGNMENT)).toEqual({
      price: '— (assigned)',
      total: 'settlement recorded by US-111'
    })
  })
})

describe('outcomeLabel', () => {
  it.each([
    ['EXPIRED', 'Expired worthless'],
    ['CLOSED', 'Closed early'],
    ['ASSIGNED', 'Assigned'],
    ['OPEN', 'Open'],
    ['UNRECORDED', 'Outcome not recorded']
  ] as const)('%s reads %s', (outcome, expected) => {
    expect(outcomeLabel(outcome)).toBe(expected)
  })
})

describe('leapsEventLabel', () => {
  it.each([
    ['Buy LEAPS', LEAPS_PURCHASE],
    ['LEAPS roll #2', { ...LEAPS_ROLL, number: 2 }],
    ['Sold to close', LEAPS_CLOSE],
    ['LEAPS_ADJUST', LEAPS_UNKNOWN]
  ])('reads %s', (expected, row) => {
    expect(leapsEventLabel(row)).toBe(expected)
  })
})

describe('cycleEventLabel', () => {
  it.each([
    ['Sell to open', CYCLE_1_OPEN],
    ['Roll #2', { ...CYCLE_2_ROLL, number: 2 }],
    ['CC_CLOSE', CYCLE_9_UNKNOWN],
    ['Closed early', CYCLE_5_BUYBACK]
  ])('reads %s', (expected, row) => {
    expect(cycleEventLabel(row)).toBe(expected)
  })
})

describe('openCycleRow', () => {
  it('reads the DTE left and that the credit is not realized', () => {
    expect(openCycleRow({ dteRemaining: 7 })).toBe(
      '7 DTE remaining · credit collected, not realized'
    )
  })
})

describe('unrecordedCycleRow', () => {
  it('reads the expiration and that no outcome is recorded, with no DTE remaining', () => {
    expect(unrecordedCycleRow({ expiredOn: '2027-08-20' })).toBe(
      'Expired 2027-08-20 · outcome not recorded'
    )
  })
})

describe('leapsBasisCell', () => {
  it.each([
    ['$25.00', LEAPS_PURCHASE],
    ['$8.50', LEAPS_ROLL],
    ['—', LEAPS_CLOSE],
    ['—', LEAPS_UNKNOWN]
  ])('reads %s (case %#)', (expected, row) => {
    expect(leapsBasisCell(row)).toBe(expected)
  })
})

describe('cycleTitle', () => {
  it('names a cycle by its number', () => {
    expect(cycleTitle(2)).toBe('Cycle 2')
  })
})

describe('cycleOutcome', () => {
  it('reads OPEN for an open cycle', () => {
    expect(cycleOutcome({ status: 'OPEN' })).toBe('OPEN')
  })

  it('reads UNRECORDED for a cycle past its expiration with no outcome recorded', () => {
    expect(cycleOutcome({ status: 'UNRECORDED' })).toBe('UNRECORDED')
  })

  it.each(['EXPIRED', 'CLOSED', 'ASSIGNED'] as const)(
    'reads an ended cycle by its outcome, %s',
    (outcome) => {
      expect(cycleOutcome({ status: 'ENDED', outcome })).toBe(outcome)
    }
  )
})

describe('rollNetCell', () => {
  it('reads the net alone when the roll had no fee', () => {
    expect(
      rollNetCell({
        net: { direction: 'debit', perShare: '0.6000', total: '60.0000' },
        fees: '0.0000'
      })
    ).toBe('Net debit $0.60 ($60.00)')
  })

  it('appends a non-zero fee to the net', () => {
    expect(
      rollNetCell({
        net: { direction: 'credit', perShare: '2.5000', total: '250.0000' },
        fees: '1.3000'
      })
    ).toBe('Net credit $2.50 ($250.00) · fees $1.30')
  })
})
