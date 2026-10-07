// [US-104] Pure helpers behind the Roll Short Call sheet: the net preview, the roll label,
// the post-roll basis / effective share cost, and the below-effective-cost shortfall.
import Decimal from 'decimal.js'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  pmccPostRollEffectiveCost,
  type PmccPostRoll,
  pmccRollLabel,
  pmccRecordedRollNet,
  pmccRollNet,
  pmccStrikeShortfall
} from './pmcc-roll'

describe('pmccRollNet', () => {
  it('reports a debit when the cost to close exceeds the replacement premium', () => {
    const net = pmccRollNet({ costToClose: '3.00', premium: '2.40', contracts: 1 })
    expect(net).toEqual({ net: new Decimal('-0.60'), perShare: '0.60', total: '60.00' })
  })

  it('reports a credit when the replacement premium exceeds the cost to close', () => {
    const net = pmccRollNet({ costToClose: '1.10', premium: '2.30', contracts: 1 })
    expect(net).toEqual({ net: new Decimal('1.20'), perShare: '1.20', total: '120.00' })
  })

  it('scales the total by the contract count', () => {
    expect(pmccRollNet({ costToClose: '3.00', premium: '2.40', contracts: 3 })?.total).toBe(
      '180.00'
    )
  })

  it.each([
    ['', '2.40'],
    ['3.00', ''],
    ['2.', '2.40'],
    ['3.00', '2.'],
    ['0', '2.40'],
    ['3.00', '0']
  ])('is null while a cash field is undecided or zero (cost %j, premium %j)', (cost, premium) => {
    expect(pmccRollNet({ costToClose: cost, premium, contracts: 1 })).toBeNull()
  })
})

describe('pmccRecordedRollNet', () => {
  it('nets a recorded debit roll from its stored 4-dp leg prices', () => {
    const net = pmccRecordedRollNet({ costToClose: '3.0000', premium: '2.4000', contracts: 2 })
    expect(net).toEqual({ net: new Decimal('-0.6'), perShare: '0.60', total: '120.00' })
  })

  it('nets a recorded credit roll', () => {
    expect(pmccRecordedRollNet({ costToClose: '1.1000', premium: '2.3000', contracts: 1 })).toEqual(
      { net: new Decimal('1.2'), perShare: '1.20', total: '120.00' }
    )
  })
})

describe('pmccRollLabel', () => {
  const current = { openShort: { strike: '108.0000', expiration: '2026-11-20' } }

  it('labels a higher strike in a later month as Roll Up & Out', () => {
    expect(pmccRollLabel({ ...current, newStrike: '112', newExpiration: '2026-12-18' })).toBe(
      'Roll Up & Out: $108 to $112 strike, Nov to Dec expiration'
    )
  })

  it('labels the same strike in a later month as Roll Out', () => {
    expect(pmccRollLabel({ ...current, newStrike: '108', newExpiration: '2026-12-18' })).toBe(
      'Roll Out: same $108 strike, Nov to Dec expiration'
    )
  })

  it('labels a higher strike at the same expiration as Roll Up', () => {
    expect(pmccRollLabel({ ...current, newStrike: '112', newExpiration: '2026-11-20' })).toBe(
      'Roll Up: $108 to $112 strike, same Nov expiration'
    )
  })

  it('labels a lower strike at the same expiration as Roll Down', () => {
    expect(pmccRollLabel({ ...current, newStrike: '104', newExpiration: '2026-11-20' })).toBe(
      'Roll Down: $108 to $104 strike, same Nov expiration'
    )
  })

  it('labels a lower strike in a later month as Roll Down & Out', () => {
    expect(pmccRollLabel({ ...current, newStrike: '98', newExpiration: '2026-12-18' })).toBe(
      'Roll Down & Out: $108 to $98 strike, Nov to Dec expiration'
    )
  })

  it('adds the day when both expirations fall in the same month', () => {
    expect(pmccRollLabel({ ...current, newStrike: '108', newExpiration: '2026-11-27' })).toBe(
      'Roll Out: same $108 strike, Nov 20 to Nov 27 expiration'
    )
  })

  it('adds the years when the expirations fall in different years', () => {
    expect(pmccRollLabel({ ...current, newStrike: '108', newExpiration: '2027-11-19' })).toBe(
      'Roll Out: same $108 strike, Nov 2026 to Nov 2027 expiration'
    )
  })

  it('adds the years to a December-to-January roll', () => {
    expect(
      pmccRollLabel({
        openShort: { strike: '108.0000', expiration: '2026-12-18' },
        newStrike: '112',
        newExpiration: '2027-01-15'
      })
    ).toBe('Roll Up & Out: $108 to $112 strike, Dec 2026 to Jan 2027 expiration')
  })

  it('prints a fractional strike without trailing zeros', () => {
    expect(pmccRollLabel({ ...current, newStrike: '112.5000', newExpiration: '2026-12-18' })).toBe(
      'Roll Up & Out: $108 to $112.5 strike, Nov to Dec expiration'
    )
  })

  it('is null when nothing changed', () => {
    expect(pmccRollLabel({ ...current, newStrike: '108', newExpiration: '2026-11-20' })).toBeNull()
  })

  it.each([
    ['', '2026-12-18'],
    ['11.', '2026-12-18'],
    ['112', ''],
    ['112', '2026-12']
  ])('is null while the strike or expiration is undecided (%j, %j)', (strike, expiration) => {
    expect(pmccRollLabel({ ...current, newStrike: strike, newExpiration: expiration })).toBeNull()
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
})
