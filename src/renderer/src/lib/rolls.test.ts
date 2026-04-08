import { describe, expect, it } from 'vitest'
import { getRollTypeLabel, computeNetCreditDebit, rollCreditDebitColors } from './rolls'

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
