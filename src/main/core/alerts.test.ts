import { describe, expect, it } from 'vitest'
import { evaluatePosition } from './alerts'
import type { AlertEvaluationInput } from './alerts'

function makeInput(overrides: Partial<AlertEvaluationInput> = {}): AlertEvaluationInput {
  return {
    positionId: 'pos-1',
    phase: 'CSP_OPEN',
    instrumentType: 'PUT',
    strike: '180.0000',
    dte: 5,
    // Inert defaults for the market-data rules: PROFIT_TARGET sees a 0%-captured
    // position (mid === entry) and STRIKE_PROXIMITY sees a price far from strike,
    // so neither fires nor skips unless a test overrides these fields.
    entryPremiumPerContract: '3.5000',
    contracts: 1,
    currentOptionMid: '3.5000',
    profitTargetPercentOverride: null,
    currentUnderlyingPrice: '200.0000',
    // Inert default for EARNINGS_PROXIMITY: earnings far beyond the 10-day
    // window and a present expiration, so the rule neither fires nor skips
    // unless a test overrides it.
    daysToEarnings: 45,
    expiration: '2026-12-18',
    ...overrides
  }
}

describe('evaluatePosition', () => {
  it('fires EXPIRATION_IMMINENT at dte = 5 with high urgency, story summary text, and Review position quick action', () => {
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

  it('updates the expiration-imminent summary to the live dte value inside the final window', () => {
    const { matches } = evaluatePosition(makeInput({ dte: 3 }))
    expect(matches).toHaveLength(1)
    expect(matches[0].summary).toBe('Expires in 3 days at $180.00 strike')
  })

  it('does not match expiration imminent at dte = 6', () => {
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

  it('does not emit both EXPIRATION_IMMINENT and MANAGEMENT_WINDOW inside 5 dte', () => {
    const { matches } = evaluatePosition(makeInput({ dte: 4 }))
    expect(matches).toHaveLength(1)
    expect(matches[0].ruleCode).toBe('EXPIRATION_IMMINENT')
  })

  it('fires EXPIRATION_IMMINENT at the dte = 0 boundary (expires today)', () => {
    const { matches } = evaluatePosition(makeInput({ dte: 0 }))
    expect(matches).toHaveLength(1)
    expect(matches[0].ruleCode).toBe('EXPIRATION_IMMINENT')
    expect(matches[0].summary).toBe('Expires in 0 days at $180.00 strike')
  })

  it('produces no matches for an already-expired position (dte < 0)', () => {
    const { matches, skipped } = evaluatePosition(makeInput({ dte: -2 }))
    expect(matches).toEqual([])
    expect(skipped).toEqual([])
  })

  it('skips the DTE-dependent rules with reason missing_dte when dte is null', () => {
    const { matches, skipped } = evaluatePosition(makeInput({ dte: null }))
    expect(matches).toEqual([])
    expect(skipped).toEqual([
      { ruleCode: 'EXPIRATION_IMMINENT', reason: 'missing_dte' },
      { ruleCode: 'MANAGEMENT_WINDOW', reason: 'missing_dte' },
      { ruleCode: 'EARNINGS_PROXIMITY', reason: 'missing_dte' }
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

describe('evaluatePosition — PROFIT_TARGET (US-54)', () => {
  it('PROFIT_TARGET fires when captured percent reaches the target', () => {
    const { matches } = evaluatePosition(
      makeInput({
        dte: 30,
        entryPremiumPerContract: '3.5000',
        currentOptionMid: '1.7000',
        contracts: 1,
        profitTargetPercentOverride: null
      })
    )
    const match = matches.find((m) => m.ruleCode === 'PROFIT_TARGET')
    expect(match).toEqual({
      ruleCode: 'PROFIT_TARGET',
      urgency: 'low',
      summary: '51.4% of max profit captured — consider closing',
      quickAction: 'Review position'
    })
  })

  it('PROFIT_TARGET does not fire below the target', () => {
    const { matches } = evaluatePosition(
      makeInput({
        dte: 30,
        entryPremiumPerContract: '3.5000',
        currentOptionMid: '2.4000',
        contracts: 1,
        profitTargetPercentOverride: null
      })
    )
    expect(matches.find((m) => m.ruleCode === 'PROFIT_TARGET')).toBeUndefined()
  })

  it('PROFIT_TARGET honors a per-position override', () => {
    const fires = evaluatePosition(
      makeInput({
        dte: 30,
        entryPremiumPerContract: '3.5000',
        currentOptionMid: '1.7000',
        contracts: 1,
        profitTargetPercentOverride: 25
      })
    )
    expect(fires.matches.find((m) => m.ruleCode === 'PROFIT_TARGET')).toBeDefined()

    const doesNotFire = evaluatePosition(
      makeInput({
        dte: 30,
        entryPremiumPerContract: '3.5000',
        currentOptionMid: '1.7000',
        contracts: 1,
        profitTargetPercentOverride: 60
      })
    )
    expect(doesNotFire.matches.find((m) => m.ruleCode === 'PROFIT_TARGET')).toBeUndefined()
  })

  it('PROFIT_TARGET skips with missing_option_mark when the mid is absent', () => {
    const { matches, skipped } = evaluatePosition(
      makeInput({
        dte: 30,
        entryPremiumPerContract: '3.5000',
        currentOptionMid: null,
        contracts: 1
      })
    )
    expect(matches.find((m) => m.ruleCode === 'PROFIT_TARGET')).toBeUndefined()
    expect(skipped).toContainEqual({ ruleCode: 'PROFIT_TARGET', reason: 'missing_option_mark' })
  })

  it('PROFIT_TARGET skips (never throws) on a non-positive entry premium, preserving other rules', () => {
    const { matches, skipped } = evaluatePosition(
      makeInput({
        dte: 4, // EXPIRATION_IMMINENT must still fire despite the bad premium
        entryPremiumPerContract: '0.0000',
        currentOptionMid: '1.0000',
        contracts: 1
      })
    )
    expect(skipped).toContainEqual({
      ruleCode: 'PROFIT_TARGET',
      reason: 'invalid_profit_target_input'
    })
    expect(matches.find((m) => m.ruleCode === 'PROFIT_TARGET')).toBeUndefined()
    // The would-be throw must not suppress the high-urgency expiration rule.
    expect(matches.find((m) => m.ruleCode === 'EXPIRATION_IMMINENT')).toBeDefined()
  })

  it('PROFIT_TARGET skips when contracts is not a positive integer', () => {
    const { skipped } = evaluatePosition(
      makeInput({
        dte: 30,
        entryPremiumPerContract: '3.5000',
        currentOptionMid: '1.0000',
        contracts: 0
      })
    )
    expect(skipped).toContainEqual({
      ruleCode: 'PROFIT_TARGET',
      reason: 'invalid_profit_target_input'
    })
  })

  it('PROFIT_TARGET summary rounds captured percent to one decimal', () => {
    const { matches } = evaluatePosition(
      makeInput({
        phase: 'CC_OPEN',
        instrumentType: 'CALL',
        dte: 30,
        entryPremiumPerContract: '4.0000',
        currentOptionMid: '1.9000',
        contracts: 1
      })
    )
    const match = matches.find((m) => m.ruleCode === 'PROFIT_TARGET')
    expect(match?.summary).toBe('52.5% of max profit captured — consider closing')
  })
})

describe('evaluatePosition — STRIKE_PROXIMITY (US-55)', () => {
  it('STRIKE_PROXIMITY fires above the strike within 1 percent', () => {
    const { matches } = evaluatePosition(
      makeInput({
        phase: 'CSP_OPEN',
        dte: 30,
        strike: '180.0000',
        currentUnderlyingPrice: '181.20'
      })
    )
    const match = matches.find((m) => m.ruleCode === 'STRIKE_PROXIMITY')
    expect(match).toEqual({
      ruleCode: 'STRIKE_PROXIMITY',
      urgency: 'medium',
      summary: 'Stock is 0.7% above the $180.00 put strike',
      quickAction: 'Review position'
    })
  })

  it('STRIKE_PROXIMITY fires below the strike and flags in the money', () => {
    const { matches } = evaluatePosition(
      makeInput({
        phase: 'CSP_OPEN',
        dte: 30,
        strike: '180.0000',
        currentUnderlyingPrice: '179.10'
      })
    )
    const match = matches.find((m) => m.ruleCode === 'STRIKE_PROXIMITY')
    expect(match?.summary).toBe('Stock is 0.5% below the $180.00 put strike — now in the money')
  })

  it('STRIKE_PROXIMITY does not fire outside 1 percent', () => {
    const { matches } = evaluatePosition(
      makeInput({
        phase: 'CSP_OPEN',
        dte: 30,
        strike: '180.0000',
        currentUnderlyingPrice: '183.80'
      })
    )
    expect(matches.find((m) => m.ruleCode === 'STRIKE_PROXIMITY')).toBeUndefined()
  })

  it('STRIKE_PROXIMITY does not apply to CC_OPEN', () => {
    const { matches, skipped } = evaluatePosition(
      makeInput({
        phase: 'CC_OPEN',
        instrumentType: 'CALL',
        dte: 30,
        strike: '420.0000',
        currentUnderlyingPrice: '419.60'
      })
    )
    expect(matches.find((m) => m.ruleCode === 'STRIKE_PROXIMITY')).toBeUndefined()
    expect(skipped.find((s) => s.ruleCode === 'STRIKE_PROXIMITY')).toBeUndefined()
  })

  it('STRIKE_PROXIMITY skips with missing_underlying_price for a CSP without a price', () => {
    const { matches, skipped } = evaluatePosition(
      makeInput({
        phase: 'CSP_OPEN',
        dte: 30,
        strike: '180.0000',
        currentUnderlyingPrice: null
      })
    )
    expect(matches.find((m) => m.ruleCode === 'STRIKE_PROXIMITY')).toBeUndefined()
    expect(skipped).toContainEqual({
      ruleCode: 'STRIKE_PROXIMITY',
      reason: 'missing_underlying_price'
    })
  })
})

describe('evaluatePosition — EARNINGS_PROXIMITY (US-56)', () => {
  it('EARNINGS_PROXIMITY fires when earnings fall within 10 days and before expiration', () => {
    const { matches, skipped } = evaluatePosition(
      makeInput({
        dte: 13,
        daysToEarnings: 6,
        expiration: '2026-08-21'
      })
    )
    const match = matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')
    expect(match).toEqual({
      ruleCode: 'EARNINGS_PROXIMITY',
      urgency: 'medium',
      summary: 'Earnings in 6 days before your 2026-08-21 expiration',
      quickAction: 'Review position'
    })
    expect(skipped.find((s) => s.ruleCode === 'EARNINGS_PROXIMITY')).toBeUndefined()
  })

  it('EARNINGS_PROXIMITY fires at the daysToEarnings = 10 inclusive upper bound', () => {
    const { matches } = evaluatePosition(
      makeInput({ dte: 30, daysToEarnings: 10, expiration: '2026-09-07' })
    )
    expect(matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')).toBeDefined()
  })

  it('EARNINGS_PROXIMITY fires at the daysToEarnings = 0 boundary with "today" copy', () => {
    const { matches } = evaluatePosition(
      makeInput({ dte: 13, daysToEarnings: 0, expiration: '2026-08-21' })
    )
    const match = matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')
    expect(match?.summary).toBe('Earnings today before your 2026-08-21 expiration')
  })

  it('EARNINGS_PROXIMITY uses singular copy at daysToEarnings = 1', () => {
    const { matches } = evaluatePosition(
      makeInput({ dte: 13, daysToEarnings: 1, expiration: '2026-08-21' })
    )
    const match = matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')
    expect(match?.summary).toBe('Earnings in 1 day before your 2026-08-21 expiration')
  })

  it('EARNINGS_PROXIMITY fires when earnings land on expiration day (daysToEarnings === dte)', () => {
    const { matches } = evaluatePosition(
      makeInput({ dte: 8, daysToEarnings: 8, expiration: '2026-08-16' })
    )
    expect(matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')).toBeDefined()
  })

  it('EARNINGS_PROXIMITY does not fire at daysToEarnings = 11', () => {
    const { matches, skipped } = evaluatePosition(
      makeInput({ dte: 30, daysToEarnings: 11, expiration: '2026-09-07' })
    )
    expect(matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')).toBeUndefined()
    expect(skipped.find((s) => s.ruleCode === 'EARNINGS_PROXIMITY')).toBeUndefined()
  })

  it('EARNINGS_PROXIMITY does not fire at daysToEarnings = 13 with dte = 19', () => {
    const { matches, skipped } = evaluatePosition(
      makeInput({ dte: 19, daysToEarnings: 13, expiration: '2026-08-27' })
    )
    expect(matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')).toBeUndefined()
    expect(skipped.find((s) => s.ruleCode === 'EARNINGS_PROXIMITY')).toBeUndefined()
  })

  it('EARNINGS_PROXIMITY does not fire (and records no skip) when earnings fall after expiration', () => {
    const { matches, skipped } = evaluatePosition(
      makeInput({ dte: 5, daysToEarnings: 8, expiration: '2026-08-15' })
    )
    expect(matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')).toBeUndefined()
    expect(skipped.find((s) => s.ruleCode === 'EARNINGS_PROXIMITY')).toBeUndefined()
  })

  it('EARNINGS_PROXIMITY does not fire (and records no skip) for negative daysToEarnings', () => {
    const { matches, skipped } = evaluatePosition(
      makeInput({ dte: 13, daysToEarnings: -2, expiration: '2026-08-21' })
    )
    expect(matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')).toBeUndefined()
    expect(skipped.find((s) => s.ruleCode === 'EARNINGS_PROXIMITY')).toBeUndefined()
  })

  it('EARNINGS_PROXIMITY skips with missing_earnings_date when daysToEarnings is null', () => {
    const { matches, skipped } = evaluatePosition(
      makeInput({ dte: 13, daysToEarnings: null, expiration: '2026-08-21' })
    )
    expect(matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')).toBeUndefined()
    expect(skipped).toContainEqual({
      ruleCode: 'EARNINGS_PROXIMITY',
      reason: 'missing_earnings_date'
    })
  })

  it('EARNINGS_PROXIMITY skips with missing_expiration when expiration is null, never rendering "null expiration"', () => {
    const { matches, skipped } = evaluatePosition(
      makeInput({ dte: 13, daysToEarnings: 6, expiration: null })
    )
    expect(matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')).toBeUndefined()
    expect(skipped).toContainEqual({ ruleCode: 'EARNINGS_PROXIMITY', reason: 'missing_expiration' })
  })

  it('EARNINGS_PROXIMITY skips with missing_dte when dte is null', () => {
    const { matches, skipped } = evaluatePosition(
      makeInput({ dte: null, daysToEarnings: 6, expiration: '2026-08-21' })
    )
    expect(matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')).toBeUndefined()
    expect(skipped).toContainEqual({ ruleCode: 'EARNINGS_PROXIMITY', reason: 'missing_dte' })
  })

  it('EARNINGS_PROXIMITY co-fires with EXPIRATION_IMMINENT', () => {
    const { matches } = evaluatePosition(
      makeInput({ dte: 4, daysToEarnings: 2, expiration: '2026-08-12' })
    )
    expect(matches.find((m) => m.ruleCode === 'EXPIRATION_IMMINENT')).toBeDefined()
    expect(matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')).toBeDefined()
  })

  it('EARNINGS_PROXIMITY is phase-agnostic: matches identically for CSP_OPEN and CC_OPEN', () => {
    const overrides = { dte: 13, daysToEarnings: 6, expiration: '2026-08-21' }
    const csp = evaluatePosition(makeInput({ ...overrides, phase: 'CSP_OPEN' }))
    const cc = evaluatePosition(
      makeInput({ ...overrides, phase: 'CC_OPEN', instrumentType: 'CALL' })
    )
    const cspMatch = csp.matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')
    const ccMatch = cc.matches.find((m) => m.ruleCode === 'EARNINGS_PROXIMITY')
    expect(cspMatch).toBeDefined()
    expect(ccMatch).toEqual(cspMatch)
  })
})

describe('evaluatePosition — new rules co-fire with DTE rules', () => {
  it('New rules co-fire with DTE rules', () => {
    const { matches } = evaluatePosition(
      makeInput({
        phase: 'CSP_OPEN',
        dte: 4,
        strike: '180.0000',
        entryPremiumPerContract: '3.5000',
        currentOptionMid: '1.7000',
        contracts: 1,
        currentUnderlyingPrice: '181.20'
      })
    )
    const codes = matches.map((m) => m.ruleCode).sort()
    expect(codes).toEqual(['EXPIRATION_IMMINENT', 'PROFIT_TARGET', 'STRIKE_PROXIMITY'])
  })
})
