import { describe, expect, it } from 'vitest'
import {
  getRollTypeLabel,
  computeNetCreditDebit,
  rollCreditDebitColors,
  getCcRollTypeLabel,
  getCcRollTypeColor,
  getCcRollTypeDetail,
  getRollPreview
} from './rolls'
import type { CcRollType } from './rolls'

describe('getRollPreview', () => {
  it('returns currentBasis as projectedBasis and hasNetValues=false when inputs are zero', () => {
    const result = getRollPreview({ currentBasis: '180.00', costToClose: '0', newPremium: '0' })
    expect(result.projectedBasis).toBe('180.00')
    expect(result.hasNetValues).toBe(false)
  })

  it('returns currentBasis as projectedBasis and hasNetValues=false when inputs are empty', () => {
    const result = getRollPreview({ currentBasis: '180.00', costToClose: '', newPremium: '' })
    expect(result.projectedBasis).toBe('180.00')
    expect(result.hasNetValues).toBe(false)
  })

  it('projects lower basis for a net credit roll', () => {
    // net = 4.20 - 3.50 = 0.70 credit → 180.00 - 0.70 = 179.30
    const result = getRollPreview({
      currentBasis: '180.00',
      costToClose: '3.50',
      newPremium: '4.20'
    })
    expect(result.projectedBasis).toBe('179.30')
    expect(result.hasNetValues).toBe(true)
  })

  it('projects higher basis for a net debit roll', () => {
    // net = 2.00 - 3.50 = -1.50 debit → 180.00 - (-1.50) = 181.50
    const result = getRollPreview({
      currentBasis: '180.00',
      costToClose: '3.50',
      newPremium: '2.00'
    })
    expect(result.projectedBasis).toBe('181.50')
    expect(result.hasNetValues).toBe(true)
  })
})

describe('getRollTypeLabel', () => {
  it("returns 'Roll Down & Out' when new strike < current strike", () => {
    expect(getRollTypeLabel('180', '175')).toBe('Roll Down & Out')
  })
  it("returns 'Roll Up & Out' when new strike > current strike", () => {
    expect(getRollTypeLabel('180', '185')).toBe('Roll Up & Out')
  })
  it("returns 'Roll Out' when strikes are equal", () => {
    expect(getRollTypeLabel('180', '180')).toBe('Roll Out')
  })
})

describe('computeNetCreditDebit', () => {
  it('returns isCredit=true and positive net when premium > cost', () => {
    const result = computeNetCreditDebit(1.2, 2.8, 1)
    expect(result.isCredit).toBe(true)
    expect(result.net).toBeCloseTo(1.6)
  })
  it('returns isCredit=false when cost > premium', () => {
    const result = computeNetCreditDebit(3.0, 2.5, 1)
    expect(result.isCredit).toBe(false)
    expect(result.net).toBeCloseTo(-0.5)
  })
  it('computes total as |net| × contracts × 100', () => {
    const result = computeNetCreditDebit(1.2, 2.8, 2)
    expect(result.total).toBeCloseTo(320) // |1.6| * 2 * 100
  })
})

describe('rollCreditDebitColors', () => {
  it('returns green palette vars for credit, gold palette vars for debit', () => {
    const credit = rollCreditDebitColors(true)
    const debit = rollCreditDebitColors(false)
    expect(credit.color).toContain('green')
    expect(debit.color).toContain('gold')
    expect(credit.bg).toContain('green')
    expect(debit.bg).toContain('gold')
    expect(credit.border).toContain('green')
    expect(debit.border).toContain('gold')
  })
})

describe('getCcRollTypeLabel', () => {
  it('returns "Roll Up & Out" when strike is higher and expiration is later', () => {
    const result: CcRollType = getCcRollTypeLabel({
      currentStrike: '180',
      newStrike: '185',
      currentExpiration: '2026-04-18',
      newExpiration: '2026-05-16'
    })
    expect(result).toBe('Roll Up & Out')
  })

  it('returns "Roll Down & Out" when strike is lower and expiration is later', () => {
    const result: CcRollType = getCcRollTypeLabel({
      currentStrike: '180',
      newStrike: '175',
      currentExpiration: '2026-04-18',
      newExpiration: '2026-05-16'
    })
    expect(result).toBe('Roll Down & Out')
  })

  it('returns "Roll Out" when strike is same and expiration is later', () => {
    const result: CcRollType = getCcRollTypeLabel({
      currentStrike: '180',
      newStrike: '180',
      currentExpiration: '2026-04-18',
      newExpiration: '2026-05-16'
    })
    expect(result).toBe('Roll Out')
  })

  it('returns "Roll Up" when strike is higher and expiration is same', () => {
    const result: CcRollType = getCcRollTypeLabel({
      currentStrike: '180',
      newStrike: '185',
      currentExpiration: '2026-04-18',
      newExpiration: '2026-04-18'
    })
    expect(result).toBe('Roll Up')
  })

  it('returns "Roll Down" when strike is lower and expiration is same', () => {
    const result: CcRollType = getCcRollTypeLabel({
      currentStrike: '180',
      newStrike: '175',
      currentExpiration: '2026-04-18',
      newExpiration: '2026-04-18'
    })
    expect(result).toBe('Roll Down')
  })

  it('returns "No Change" when both strike and expiration are same', () => {
    const result: CcRollType = getCcRollTypeLabel({
      currentStrike: '180',
      newStrike: '180',
      currentExpiration: '2026-04-18',
      newExpiration: '2026-04-18'
    })
    expect(result).toBe('No Change')
  })
})

describe('getCcRollTypeDetail', () => {
  it('shows both strike and expiration change for Roll Up & Out with full dates', () => {
    const result = getCcRollTypeDetail({
      currentStrike: '185',
      newStrike: '190',
      currentExpiration: '2026-04-18',
      newExpiration: '2026-05-16'
    })
    expect(result).toBe('$185 → $190 strike, Apr 18 → May 16 expiration')
  })

  it('shows same strike and expiration change for Roll Out with full dates', () => {
    const result = getCcRollTypeDetail({
      currentStrike: '185',
      newStrike: '185',
      currentExpiration: '2026-04-18',
      newExpiration: '2026-05-16'
    })
    expect(result).toBe('same $185 strike, Apr 18 → May 16 expiration')
  })

  it('shows strike change and same expiration for Roll Up with full date', () => {
    const result = getCcRollTypeDetail({
      currentStrike: '185',
      newStrike: '190',
      currentExpiration: '2026-04-18',
      newExpiration: '2026-04-18'
    })
    expect(result).toBe('$185 → $190 strike, same Apr 18 expiration')
  })

  it('shows downward strike change for Roll Down & Out with full dates', () => {
    const result = getCcRollTypeDetail({
      currentStrike: '185',
      newStrike: '182',
      currentExpiration: '2026-04-18',
      newExpiration: '2026-05-16'
    })
    expect(result).toBe('$185 → $182 strike, Apr 18 → May 16 expiration')
  })

  it('disambiguates same-month weekly rolls (Apr 18 → Apr 25)', () => {
    const result = getCcRollTypeDetail({
      currentStrike: '185',
      newStrike: '185',
      currentExpiration: '2026-04-18',
      newExpiration: '2026-04-25'
    })
    expect(result).toBe('same $185 strike, Apr 18 → Apr 25 expiration')
  })
})

describe('getCcRollTypeColor', () => {
  it('returns purple-like string for "Roll Up & Out"', () => {
    const result = getCcRollTypeColor('Roll Up & Out')
    expect(result.toLowerCase().includes('purple') || result.includes('wb-purple')).toBe(true)
  })

  it('returns purple-like string for "Roll Up"', () => {
    const result = getCcRollTypeColor('Roll Up')
    expect(result.toLowerCase().includes('purple') || result.includes('wb-purple')).toBe(true)
  })

  it('returns red-like string for "Roll Down & Out"', () => {
    const result = getCcRollTypeColor('Roll Down & Out')
    expect(result.toLowerCase().includes('red') || result.includes('wb-red')).toBe(true)
  })

  it('returns red-like string for "Roll Down"', () => {
    const result = getCcRollTypeColor('Roll Down')
    expect(result.toLowerCase().includes('red') || result.includes('wb-red')).toBe(true)
  })

  it('returns red-like string for "No Change"', () => {
    const result = getCcRollTypeColor('No Change')
    expect(result.toLowerCase().includes('red') || result.includes('wb-red')).toBe(true)
  })

  it('returns gold-like string for "Roll Out"', () => {
    const result = getCcRollTypeColor('Roll Out')
    expect(result.toLowerCase().includes('gold') || result.includes('wb-gold')).toBe(true)
  })
})
