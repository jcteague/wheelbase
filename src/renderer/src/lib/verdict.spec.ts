import { describe, it, expect } from 'vitest'
import {
  computeVerdict,
  deltaSeverity,
  computePnl,
  computeDistance,
  computeThetaYield,
  type CockpitInput
} from './verdict'

// Helper: produce a date string N calendar days from today (UTC)
function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
}

// Base fixture for a CSP (SELL PUT) with all data present
function cspInput(overrides: Partial<CockpitInput> = {}): CockpitInput {
  return {
    instrument: 'PUT',
    expiration: daysFromNow(45),
    strike: 180,
    contracts: 1,
    premiumPerContract: 3.5,
    currentMid: 2.0,
    underlying: 185,
    greeks: { delta: -0.25, theta: -0.05, gamma: 0.01, vega: 0.1, iv: 0.3 },
    ...overrides
  }
}

// -------------------------------------------------------------------
// computeVerdict
// -------------------------------------------------------------------

describe('computeVerdict', () => {
  it('target-hit branch: pnl.pct >= 50 yields kind=target-hit and green color', () => {
    // premiumPerContract=3.50, currentMid=0.75 → captured=275, max=350, pct≈78.6
    const input = cspInput({ currentMid: 0.75, premiumPerContract: 3.5 })
    const verdict = computeVerdict(input)
    expect(verdict.kind).toBe('target-hit')
    expect(verdict.color).toBe('var(--wb-green)')
  })

  it('act-now branch: dte <= 3 and |delta| > 0.50 yields kind=act-now and red color with ITM in sub', () => {
    const input = cspInput({
      expiration: daysFromNow(2),
      greeks: { delta: -0.55, theta: -0.08, gamma: 0.03, vega: 0.05, iv: 0.35 },
      // Make it ITM so delta > 0.5 and dte <= 3
      underlying: 175,
      strike: 180,
      currentMid: 0.5
    })
    const verdict = computeVerdict(input)
    expect(verdict.kind).toBe('act-now')
    expect(verdict.color).toBe('var(--wb-red)')
    expect(verdict.sub).toContain('ITM')
  })

  it('consider-roll (danger delta): CSP with |delta|=0.52 yields kind=consider-roll', () => {
    // |delta|=0.52 > 0.45 threshold for CSP → danger severity
    const input = cspInput({
      greeks: { delta: -0.52, theta: -0.05, gamma: 0.02, vega: 0.1, iv: 0.3 },
      underlying: 182,
      strike: 180,
      currentMid: 2.0
    })
    const verdict = computeVerdict(input)
    expect(verdict.kind).toBe('consider-roll')
  })

  it('consider-roll (ITM): underlying < strike for CSP yields kind=consider-roll and sub includes "ITM by $"', () => {
    // underlying=175 < strike=180 → dist.isITM=true
    const input = cspInput({
      underlying: 175,
      strike: 180,
      greeks: { delta: -0.4, theta: -0.05, gamma: 0.01, vega: 0.1, iv: 0.3 },
      currentMid: 2.0
    })
    const verdict = computeVerdict(input)
    expect(verdict.kind).toBe('consider-roll')
    expect(verdict.sub).toContain('ITM by $')
  })

  it('watch (warning delta): CSP with |delta|=0.35 yields kind=watch and gold color', () => {
    // |delta|=0.35 is >= 0.30 threshold (warning band) for CSP
    const input = cspInput({
      greeks: { delta: -0.35, theta: -0.05, gamma: 0.01, vega: 0.1, iv: 0.3 },
      currentMid: 2.5 // pct well below 50
    })
    const verdict = computeVerdict(input)
    expect(verdict.kind).toBe('watch')
    expect(verdict.color).toBe('var(--wb-gold)')
  })

  it('watch (DTE window): |delta|=0.15, dte=14 yields kind=watch and sub includes "14 DTE"', () => {
    const input = cspInput({
      expiration: daysFromNow(14),
      greeks: { delta: -0.15, theta: -0.03, gamma: 0.01, vega: 0.1, iv: 0.25 },
      currentMid: 2.5 // pct well below 50
    })
    const verdict = computeVerdict(input)
    expect(verdict.kind).toBe('watch')
    expect(verdict.sub).toContain('14 DTE')
  })

  it('hold: |delta|=0.15, dte=30, pnl.pct=20 yields kind=hold and green color', () => {
    // premiumPerContract=3.50, currentMid=2.80 → pct=(0.70/3.50)*100=20
    const input = cspInput({
      expiration: daysFromNow(30),
      greeks: { delta: -0.15, theta: -0.03, gamma: 0.01, vega: 0.1, iv: 0.25 },
      currentMid: 2.8
    })
    const verdict = computeVerdict(input)
    expect(verdict.kind).toBe('hold')
    expect(verdict.color).toBe('var(--wb-green)')
  })

  it('no data: greeks=null yields kind=hold and sub==="Awaiting market data"', () => {
    const input = cspInput({ greeks: null })
    const verdict = computeVerdict(input)
    expect(verdict.kind).toBe('hold')
    expect(verdict.sub).toBe('Awaiting market data')
  })
})

// -------------------------------------------------------------------
// deltaSeverity
// -------------------------------------------------------------------

describe('deltaSeverity', () => {
  it('DTE-aware shift: CSP |delta|=0.41, dte=5 yields danger (threshold drops from 0.45 to 0.40)', () => {
    // dte=5 ≤ 7 → shift=0.05 → danger threshold = 0.45 - 0.05 = 0.40
    // 0.41 > 0.40 → danger
    expect(deltaSeverity(0.41, 'PUT', 5)).toBe('danger')
  })

  it('CC thresholds: CC |delta|=0.42 yields warning (between 0.35 and 0.50)', () => {
    // CC danger threshold = 0.50, warning threshold = 0.35 (dte > 7, no shift)
    // 0.42 is between 0.35 and 0.50 → warning
    expect(deltaSeverity(0.42, 'CALL', 30)).toBe('warning')
  })
})

// -------------------------------------------------------------------
// computePnl
// -------------------------------------------------------------------

describe('computePnl', () => {
  it('captured %: premiumPerContract=3.50, currentMid=1.75 yields pct≈50', () => {
    const input = cspInput({ premiumPerContract: 3.5, currentMid: 1.75, contracts: 1 })
    const pnl = computePnl(input)
    expect(pnl).not.toBeNull()
    expect(pnl!.pct).toBeCloseTo(50, 1)
  })
})

// -------------------------------------------------------------------
// computeDistance
// -------------------------------------------------------------------

describe('computeDistance', () => {
  it('OTM CSP: underlying=185, strike=180 yields dollars=5, pct≈2.78, isITM=false', () => {
    const input = cspInput({ underlying: 185, strike: 180 })
    const dist = computeDistance(input)
    expect(dist).not.toBeNull()
    expect(dist!.dollars).toBeCloseTo(5, 4)
    expect(dist!.pct).toBeCloseTo(2.78, 1)
    expect(dist!.isITM).toBe(false)
  })

  it('ITM CSP: underlying=175, strike=180 yields isITM=true and severity=danger', () => {
    const input = cspInput({ underlying: 175, strike: 180 })
    const dist = computeDistance(input)
    expect(dist).not.toBeNull()
    expect(dist!.isITM).toBe(true)
    expect(dist!.severity).toBe('danger')
  })
})

// -------------------------------------------------------------------
// computeThetaYield
// -------------------------------------------------------------------

describe('computeThetaYield', () => {
  it('theta=-0.05, contracts=1, dte=21, premiumPerContract=3.50 → thetaDollar≈5, yieldPct≈30', () => {
    const input = cspInput({
      greeks: { delta: -0.25, theta: -0.05, gamma: 0.01, vega: 0.1, iv: 0.3 },
      contracts: 1,
      premiumPerContract: 3.5
    })
    const ty = computeThetaYield(input, 21)
    expect(ty).not.toBeNull()
    // thetaDollar = |theta| * 100 * contracts = 0.05 * 100 * 1 = 5
    expect(ty!.thetaDollar).toBeCloseTo(5, 4)
    // yieldPct = (thetaDollar * dte / max) * 100 = (5 * 21 / 350) * 100 = 30
    expect(ty!.yieldPct).toBeCloseTo(30, 1)
  })
})
