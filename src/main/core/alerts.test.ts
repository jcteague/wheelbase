import { describe, expect, it } from 'vitest'
import { evaluatePosition } from './alerts'
import type { AlertEvaluationInput } from './alerts'

function makeInput(overrides: Partial<AlertEvaluationInput> = {}): AlertEvaluationInput {
  return {
    positionId: 'pos-1',
    ticker: 'AAPL',
    phase: 'CSP_OPEN',
    instrumentType: 'PUT',
    strike: '180.0000',
    dte: 5,
    ...overrides
  }
}

describe('evaluatePosition', () => {
  it('fires EXPIRATION_IMMINENT (high) at dte = 5 and not MANAGEMENT_WINDOW', () => {
    const { matches, skipped } = evaluatePosition(makeInput({ dte: 5 }))
    expect(skipped).toEqual([])
    expect(matches).toEqual([
      {
        ruleCode: 'EXPIRATION_IMMINENT',
        urgency: 'high',
        summary: 'Expires in 5 days at $180.00 strike',
        quickAction: 'Review position'
      }
    ])
  })

  it('reflects the live dte in the EXPIRATION_IMMINENT summary at dte = 3', () => {
    const { matches } = evaluatePosition(makeInput({ dte: 3 }))
    expect(matches).toHaveLength(1)
    expect(matches[0].summary).toBe('Expires in 3 days at $180.00 strike')
  })

  it('fires MANAGEMENT_WINDOW (medium) at dte = 6', () => {
    const { matches, skipped } = evaluatePosition(makeInput({ dte: 6 }))
    expect(skipped).toEqual([])
    expect(matches).toEqual([
      {
        ruleCode: 'MANAGEMENT_WINDOW',
        urgency: 'medium',
        summary: '6 DTE remaining — review for roll or close',
        quickAction: 'Review position'
      }
    ])
  })

  it('fires MANAGEMENT_WINDOW at the default threshold dte = 21', () => {
    const { matches } = evaluatePosition(makeInput({ dte: 21 }))
    expect(matches).toHaveLength(1)
    expect(matches[0].ruleCode).toBe('MANAGEMENT_WINDOW')
  })

  it('produces no matches and no skips at dte = 22', () => {
    const { matches, skipped } = evaluatePosition(makeInput({ dte: 22 }))
    expect(matches).toEqual([])
    expect(skipped).toEqual([])
  })

  it('fires only EXPIRATION_IMMINENT at dte = 4 (precedence over management window)', () => {
    const { matches } = evaluatePosition(makeInput({ dte: 4 }))
    expect(matches).toHaveLength(1)
    expect(matches[0].ruleCode).toBe('EXPIRATION_IMMINENT')
  })

  it('skips both DTE-dependent rules with reason missing_dte when dte is null', () => {
    const { matches, skipped } = evaluatePosition(makeInput({ dte: null }))
    expect(matches).toEqual([])
    expect(skipped).toEqual([
      { ruleCode: 'EXPIRATION_IMMINENT', reason: 'missing_dte' },
      { ruleCode: 'MANAGEMENT_WINDOW', reason: 'missing_dte' }
    ])
  })

  it('respects a tighter managementWindowDte = 14: no match at dte = 18', () => {
    const { matches, skipped } = evaluatePosition(makeInput({ dte: 18, managementWindowDte: 14 }))
    expect(matches).toEqual([])
    expect(skipped).toEqual([])
  })

  it('respects a tighter managementWindowDte = 14: MANAGEMENT_WINDOW at dte = 14', () => {
    const { matches } = evaluatePosition(makeInput({ dte: 14, managementWindowDte: 14 }))
    expect(matches).toHaveLength(1)
    expect(matches[0].ruleCode).toBe('MANAGEMENT_WINDOW')
  })

  it('formats fractional strikes to two decimals: 7.5000 → $7.50', () => {
    const { matches } = evaluatePosition(makeInput({ dte: 5, strike: '7.5000' }))
    expect(matches[0].summary).toBe('Expires in 5 days at $7.50 strike')
  })

  it('formats large strikes to two decimals: 1250.0000 → $1250.00', () => {
    const { matches } = evaluatePosition(makeInput({ dte: 5, strike: '1250.0000' }))
    expect(matches[0].summary).toBe('Expires in 5 days at $1250.00 strike')
  })
})
