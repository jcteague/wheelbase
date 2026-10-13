// [US-104][US-105] Pure helpers behind the Roll Short Call and Roll LEAPS sheets: the net
// preview, the roll label, the post-roll basis / effective share cost, the below-effective-cost
// shortfall, and the LEAPS coverage change.
import Decimal from 'decimal.js'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  pmccPostRollEffectiveCost,
  type PmccPostRoll,
  pmccRollLabel,
  pmccRecordedRollNet,
  pmccRollNet,
  pmccStrikeShortfall,
  leapsCoverageChange,
  pmccLeapsPostRoll,
  effectiveCostMove,
  pmccLeapsLedger
} from './pmcc-roll'

describe('pmccRollNet', () => {
  it('reports a debit when the cost to close exceeds the replacement premium', () => {
    const net = pmccRollNet({ received: '2.40', paid: '3.00', contracts: 1 })
    expect(net).toEqual({ net: new Decimal('-0.60'), perShare: '0.60', total: '60.00' })
  })

  it('reports a credit when the replacement premium exceeds the cost to close', () => {
    const net = pmccRollNet({ received: '2.30', paid: '1.10', contracts: 1 })
    expect(net).toEqual({ net: new Decimal('1.20'), perShare: '1.20', total: '120.00' })
  })

  it('scales the total by the contract count', () => {
    expect(pmccRollNet({ received: '2.40', paid: '3.00', contracts: 3 })?.total).toBe('180.00')
  })

  it.each([
    ['', '2.40'],
    ['3.00', ''],
    ['2.', '2.40'],
    ['3.00', '2.'],
    ['0', '2.40'],
    ['3.00', '0']
  ])('is null while a cash field is undecided or zero (cost %j, premium %j)', (cost, premium) => {
    expect(pmccRollNet({ received: premium, paid: cost, contracts: 1 })).toBeNull()
  })

  describe('a LEAPS roll: proceeds received, replacement debit paid', () => {
    it('reports a credit when the proceeds exceed the replacement debit', () => {
      const net = pmccRollNet({ received: '26.00', paid: '23.50', contracts: 1 })
      expect(net).toEqual({ net: new Decimal('2.50'), perShare: '2.50', total: '250.00' })
    })

    it('reports a debit when the replacement costs more than the proceeds', () => {
      const net = pmccRollNet({ received: '26.00', paid: '29.20', contracts: 1 })
      expect(net?.net.isNegative()).toBe(true)
      expect(net).toMatchObject({ perShare: '3.20', total: '320.00' })
    })

    it('groups the thousands in the total', () => {
      const net = pmccRollNet({ received: '26.00', paid: '37.00', contracts: 1 })
      expect(net?.net.isNegative()).toBe(true)
      expect(net).toMatchObject({ perShare: '11.00', total: '1,100.00' })
    })

    it('scales the total by the contract count', () => {
      expect(pmccRollNet({ received: '26.00', paid: '23.50', contracts: 3 })?.total).toBe('750.00')
    })

    it.each([
      ['', '23.50'],
      ['26.00', ''],
      ['0', '23.50'],
      ['26.00', '0']
    ])('is null while proceeds %j or debit %j is undecided or zero', (received, paid) => {
      expect(pmccRollNet({ received, paid, contracts: 1 })).toBeNull()
    })
  })
})

describe('pmccRecordedRollNet', () => {
  it('nets a recorded debit roll from its stored 4-dp leg prices', () => {
    const net = pmccRecordedRollNet({ received: '2.4000', paid: '3.0000', contracts: 2 })
    expect(net).toEqual({ net: new Decimal('-0.6'), perShare: '0.60', total: '120.00' })
  })

  it('nets a recorded credit roll', () => {
    expect(pmccRecordedRollNet({ received: '2.3000', paid: '1.1000', contracts: 1 })).toEqual({
      net: new Decimal('1.2'),
      perShare: '1.20',
      total: '120.00'
    })
  })
})

describe('pmccRollLabel', () => {
  const current = { strike: '108.0000', expiration: '2026-11-20' }

  it('labels a higher strike in a later month as Roll Up & Out', () => {
    expect(pmccRollLabel(current, { strike: '112', expiration: '2026-12-18' })).toBe(
      'Roll Up & Out: $108 to $112 strike, Nov to Dec expiration'
    )
  })

  it('labels the same strike in a later month as Roll Out', () => {
    expect(pmccRollLabel(current, { strike: '108', expiration: '2026-12-18' })).toBe(
      'Roll Out: same $108 strike, Nov to Dec expiration'
    )
  })

  it('labels a higher strike at the same expiration as Roll Up', () => {
    expect(pmccRollLabel(current, { strike: '112', expiration: '2026-11-20' })).toBe(
      'Roll Up: $108 to $112 strike, same Nov expiration'
    )
  })

  it('labels a lower strike at the same expiration as Roll Down', () => {
    expect(pmccRollLabel(current, { strike: '104', expiration: '2026-11-20' })).toBe(
      'Roll Down: $108 to $104 strike, same Nov expiration'
    )
  })

  it('labels a lower strike in a later month as Roll Down & Out', () => {
    expect(pmccRollLabel(current, { strike: '98', expiration: '2026-12-18' })).toBe(
      'Roll Down & Out: $108 to $98 strike, Nov to Dec expiration'
    )
  })

  it('adds the day when both expirations fall in the same month', () => {
    expect(pmccRollLabel(current, { strike: '108', expiration: '2026-11-27' })).toBe(
      'Roll Out: same $108 strike, Nov 20 to Nov 27 expiration'
    )
  })

  it('adds the years when the expirations fall in different years', () => {
    expect(pmccRollLabel(current, { strike: '108', expiration: '2027-11-19' })).toBe(
      'Roll Out: same $108 strike, Nov 2026 to Nov 2027 expiration'
    )
  })

  it('adds the years to a December-to-January roll', () => {
    expect(
      pmccRollLabel(
        { strike: '108.0000', expiration: '2026-12-18' },
        { strike: '112', expiration: '2027-01-15' }
      )
    ).toBe('Roll Up & Out: $108 to $112 strike, Dec 2026 to Jan 2027 expiration')
  })

  it('prints a fractional strike without trailing zeros', () => {
    expect(pmccRollLabel(current, { strike: '112.5000', expiration: '2026-12-18' })).toBe(
      'Roll Up & Out: $108 to $112.5 strike, Nov to Dec expiration'
    )
  })

  it('is null when nothing changed', () => {
    expect(pmccRollLabel(current, { strike: '108', expiration: '2026-11-20' })).toBeNull()
  })

  it.each([
    ['', '2026-12-18'],
    ['11.', '2026-12-18'],
    ['112', ''],
    ['112', '2026-12']
  ])('is null while the strike or expiration is undecided (%j, %j)', (strike, expiration) => {
    expect(pmccRollLabel(current, { strike, expiration })).toBeNull()
  })

  describe("a LEAPS roll in the 'MMM yyyy' format", () => {
    const leaps = { strike: '80.0000', expiration: '2027-09-17' }
    const label = (strike: string, expiration: string): string | null =>
      pmccRollLabel(leaps, { strike, expiration }, 'MMM yyyy')

    it('labels a higher strike at a later expiration as Roll Up & Out', () => {
      expect(label('85', '2028-01-21')).toBe(
        'Roll Up & Out: $80 to $85 strike, Sep 2027 to Jan 2028 expiration'
      )
    })

    it('labels the same strike at a later expiration as Roll Out', () => {
      expect(label('80', '2028-01-21')).toBe(
        'Roll Out: same $80 strike, Sep 2027 to Jan 2028 expiration'
      )
    })

    it('labels the same strike at an earlier expiration as Roll In', () => {
      expect(label('80', '2027-08-20')).toBe(
        'Roll In: same $80 strike, Sep 2027 to Aug 2027 expiration'
      )
    })

    it('labels a higher strike at the same expiration as Roll Up', () => {
      expect(label('85', '2027-09-17')).toBe('Roll Up: $80 to $85 strike, same Sep 2027 expiration')
    })

    it('labels a lower strike at a later expiration as Roll Down & Out', () => {
      expect(label('75', '2028-01-21')).toBe(
        'Roll Down & Out: $80 to $75 strike, Sep 2027 to Jan 2028 expiration'
      )
    })

    it('labels a higher strike at an earlier expiration as Roll Up & In', () => {
      expect(label('85', '2027-08-20')).toBe(
        'Roll Up & In: $80 to $85 strike, Sep 2027 to Aug 2027 expiration'
      )
    })

    it('is null when nothing changed', () => {
      expect(label('80', '2027-09-17')).toBeNull()
    })

    it('prints a fractional strike without trailing zeros', () => {
      expect(label('112.5000', '2028-01-21')).toBe(
        'Roll Up & Out: $80 to $112.5 strike, Sep 2027 to Jan 2028 expiration'
      )
    })
  })
})

describe('pmccPostRollEffectiveCost', () => {
  it('returns the named PmccPostRoll shape the preview renders', () => {
    expectTypeOf(pmccPostRollEffectiveCost).returns.toEqualTypeOf<PmccPostRoll>()
  })

  const position = {
    basisPerShare: '21.2000',
    leaps: { strike: '80.0000', contracts: 1 },
    shortContracts: 1
  }

  it('raises the basis and the effective share cost by a debit', () => {
    expect(pmccPostRollEffectiveCost({ ...position, net: new Decimal('-0.60') })).toEqual({
      postBasis: '21.80',
      effectiveAfter: '101.80'
    })
  })

  it('lowers the basis and the effective share cost by a credit', () => {
    expect(pmccPostRollEffectiveCost({ ...position, net: new Decimal('1.20') })).toEqual({
      postBasis: '20.00',
      effectiveAfter: '100.00'
    })
  })

  it.each([
    ['85', '2.50', '19.30', '104.30'],
    ['80', '-3.20', '25.00', '105.00'],
    ['80', '-11.00', '32.80', '112.80']
  ])(
    're-anchors a LEAPS roll on the replacement strike $%s (net %s)',
    (strike, net, postBasis, effectiveAfter) => {
      expect(
        pmccPostRollEffectiveCost({
          basisPerShare: '21.8000',
          leaps: { strike, contracts: 1 },
          shortContracts: 1,
          net: new Decimal(net)
        })
      ).toEqual({ postBasis, effectiveAfter })
    }
  )

  it('spreads a short roll on fewer contracts than the LEAPS across every LEAPS share', () => {
    // 1 short contract's $0.60 debit is $60, over 2 LEAPS contracts' 200 shares: +$0.30 / share.
    expect(
      pmccPostRollEffectiveCost({
        ...position,
        leaps: { strike: '80.0000', contracts: 2 },
        net: new Decimal('-0.60')
      })
    ).toEqual({ postBasis: '21.50', effectiveAfter: '101.50' })
  })
})

describe('pmccStrikeShortfall', () => {
  it('is the per-share gap when the strike sits below the effective share cost', () => {
    expect(pmccStrikeShortfall('98', '101.70')).toBe('3.70')
  })

  it('is null when the strike is above the effective share cost', () => {
    expect(pmccStrikeShortfall('112', '101.80')).toBeNull()
  })

  it('is null when the strike equals the effective share cost', () => {
    expect(pmccStrikeShortfall('101.70', '101.70')).toBeNull()
  })

  it('is null while the strike is undecided', () => {
    expect(pmccStrikeShortfall('', '101.70')).toBeNull()
  })

  it("reports the gap between a LEAPS roll's open short strike and the new effective cost", () => {
    expect(pmccStrikeShortfall('112.0000', '112.80')).toBe('0.80')
  })

  it.each(['104.30', '112.00'])('is null when the open short strike covers %s', (effective) => {
    expect(pmccStrikeShortfall('112.0000', effective)).toBeNull()
  })
})

describe('leapsCoverageChange', () => {
  it('is negative when the replacement LEAPS expires earlier', () => {
    expect(leapsCoverageChange('2027-09-17', '2027-08-20')).toBe(-28)
  })

  it('is positive when the replacement LEAPS expires later', () => {
    expect(leapsCoverageChange('2027-09-17', '2028-01-21')).toBe(126)
  })

  it('is zero at the same expiration', () => {
    expect(leapsCoverageChange('2027-09-17', '2027-09-17')).toBe(0)
  })

  it.each(['', '2028-01', '2028-01-2'])(
    'is null while the new expiration %j is incomplete',
    (newExpiration) => {
      expect(leapsCoverageChange('2027-09-17', newExpiration)).toBeNull()
    }
  )
})

describe('pmccLeapsPostRoll', () => {
  const ledger = { basisPerShare: '21.8000', leapsCostPerShare: '25.0000' }

  it('a credit lowers the basis and the LEAPS cost and re-anchors to the new strike', () => {
    expect(
      pmccLeapsPostRoll({ ledger, newStrike: '85', contracts: 1, net: new Decimal('2.50') })
    ).toEqual({ postBasis: '19.30', leapsCostAfter: '22.50', effectiveAfter: '104.30' })
  })

  it('a debit raises both', () => {
    expect(
      pmccLeapsPostRoll({ ledger, newStrike: '80', contracts: 2, net: new Decimal('-3.20') })
    ).toEqual({ postBasis: '25.00', leapsCostAfter: '28.20', effectiveAfter: '105.00' })
  })

  it.each(['', '0', '85.'])('is null while the strike %j is undecided', (newStrike) => {
    expect(
      pmccLeapsPostRoll({ ledger, newStrike, contracts: 1, net: new Decimal('2.50') })
    ).toBeNull()
  })
})

describe('effectiveCostMove', () => {
  it('names a rise and where it rose from', () => {
    expect(effectiveCostMove('101.8000', '104.30')).toBe('up $2.50 from $101.80')
  })

  it('names a fall', () => {
    expect(effectiveCostMove('101.8000', '99.80')).toBe('down $2.00 from $101.80')
  })

  it('names no move as unchanged', () => {
    expect(effectiveCostMove('101.8000', '101.80')).toBe('unchanged')
  })
})

describe('pmccLeapsLedger', () => {
  const LEDGER = {
    basisPerShare: '21.8000',
    basisTotal: '2180.0000',
    leapsCostPerShare: '25.0000',
    leapsCostTotal: '2500.0000',
    shortCreditsPerShare: '3.2000',
    shortCreditsTotal: '320.0000',
    effectiveShareCost: '101.8000',
    premiumRecoveredPercent: '12.8000'
  }

  it('passes a ledger with a known effective share cost through', () => {
    expect(pmccLeapsLedger(LEDGER)).toMatchObject({
      basisPerShare: '21.8000',
      leapsCostPerShare: '25.0000',
      effectiveShareCost: '101.8000'
    })
  })

  it('is null without a ledger, or while no LEAPS strike anchors the effective share cost', () => {
    expect(pmccLeapsLedger(null)).toBeNull()
    expect(pmccLeapsLedger({ ...LEDGER, effectiveShareCost: null })).toBeNull()
  })
})
