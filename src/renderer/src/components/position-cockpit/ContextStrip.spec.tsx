import { render, screen } from '@testing-library/react'
import { ContextStrip } from './ContextStrip'
import { MANAGEMENT_RULES } from '../../lib/verdict'
import type { CockpitInput } from '../../lib/verdict'

function daysFromToday(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const TIGHT_DTE = MANAGEMENT_RULES.tightDte - 2 // well inside tight window
const NORMAL_DTE = MANAGEMENT_RULES.tightDte + 10 // well outside tight window
// delta well below CSP warning threshold — safe, no severity colour
const SAFE_DELTA = -(MANAGEMENT_RULES.cspWarningDelta - 0.05)

const baseGreeks = {
  delta: SAFE_DELTA,
  theta: -0.05,
  gamma: 0.015,
  vega: 0.12,
  iv: 0.32
}

function makeInput(overrides: Partial<CockpitInput> = {}): CockpitInput {
  return {
    instrument: 'PUT',
    expiration: daysFromToday(MANAGEMENT_RULES.managementWindowDte),
    strike: 180,
    contracts: 1,
    premiumPerContract: 3.5,
    currentMid: 1.75,
    underlying: 185,
    greeks: baseGreeks,
    ...overrides
  }
}

describe('ContextStrip', () => {
  it('renders null when greeks are absent', () => {
    const { container } = render(<ContextStrip input={makeInput({ greeks: null })} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders Theta as dollar-per-day', () => {
    // theta=-0.05, contracts=1 → thetaDollar = 0.05 * 100 * 1 = $5.00
    render(<ContextStrip input={makeInput({ contracts: 1 })} />)
    expect(screen.getByText('$5.00/d')).toBeInTheDocument()
  })

  it('theta sub reads "N% yield over Nd" (dynamic, not static "daily decay")', () => {
    // theta=-0.05, contracts=1, dte=21, premium=3.50 → thetaDollar=5,
    // yieldPct = (5 × 21) / 350 × 100 = 30
    render(
      <ContextStrip
        input={makeInput({
          expiration: daysFromToday(21),
          contracts: 1,
          premiumPerContract: 3.5
        })}
      />
    )
    expect(screen.getByText('30% yield over 21d')).toBeInTheDocument()
  })

  it('renders IV as percentage', () => {
    // greeks.iv=0.32 → '32.0%'
    render(<ContextStrip input={makeInput()} />)
    expect(screen.getByText('32.0%')).toBeInTheDocument()
  })

  it('renders Vega per 1% IV move', () => {
    // greeks.vega=0.12 → vega * 100 = 12.00 → '$12.00'
    render(<ContextStrip input={makeInput()} />)
    expect(screen.getByText('$12.00')).toBeInTheDocument()
  })

  it('renders Gamma to 3dp', () => {
    render(<ContextStrip input={makeInput()} />)
    expect(screen.getByText('0.015')).toBeInTheDocument()
  })

  it('gamma cell is amber (text-wb-gold) when dte ≤ tightDte and |gamma| ≥ gammaElevatedThreshold', () => {
    const input = makeInput({
      expiration: daysFromToday(TIGHT_DTE),
      greeks: { ...baseGreeks, gamma: MANAGEMENT_RULES.gammaElevatedThreshold }
    })
    render(<ContextStrip input={input} />)
    expect(screen.getByText(MANAGEMENT_RULES.gammaElevatedThreshold.toFixed(3))).toHaveClass(
      'text-wb-gold'
    )
  })

  it('gamma cell is not amber when dte > tightDte even if |gamma| ≥ gammaElevatedThreshold', () => {
    const input = makeInput({
      expiration: daysFromToday(NORMAL_DTE),
      greeks: { ...baseGreeks, gamma: MANAGEMENT_RULES.gammaElevatedThreshold }
    })
    render(<ContextStrip input={input} />)
    expect(screen.getByText(MANAGEMENT_RULES.gammaElevatedThreshold.toFixed(3))).not.toHaveClass(
      'text-wb-gold'
    )
  })

  it('gamma cell is not amber when dte ≤ tightDte but |gamma| < gammaElevatedThreshold', () => {
    const input = makeInput({
      expiration: daysFromToday(TIGHT_DTE),
      greeks: { ...baseGreeks, gamma: baseGreeks.gamma } // 0.015 < gammaElevatedThreshold
    })
    render(<ContextStrip input={input} />)
    expect(screen.getByText('0.015')).not.toHaveClass('text-wb-gold')
  })

  it('gamma sub reads "elevated near expiry" when elevated, "delta sensitivity" otherwise', () => {
    // Elevated: dte ≤ tightDte and gamma ≥ gammaElevatedThreshold
    const elevatedInput = makeInput({
      expiration: daysFromToday(TIGHT_DTE),
      greeks: { ...baseGreeks, gamma: MANAGEMENT_RULES.gammaElevatedThreshold }
    })
    const { unmount } = render(<ContextStrip input={elevatedInput} />)
    expect(screen.getByText('elevated near expiry')).toBeInTheDocument()
    unmount()

    // Normal: dte > tightDte
    const normalInput = makeInput({ expiration: daysFromToday(NORMAL_DTE) })
    render(<ContextStrip input={normalInput} />)
    expect(screen.getByText('delta sensitivity')).toBeInTheDocument()
  })

  it('theta sub shows ivRank when provided', () => {
    render(<ContextStrip input={makeInput()} ivRank={42} />)
    expect(screen.getByText('rank 42')).toBeInTheDocument()
  })

  it('KV cell uses bg-wb-bg-surface (defined Tailwind token)', () => {
    render(<ContextStrip input={makeInput()} />)
    // Theta is the first KV cell label
    const labelEl = screen.getByText('Theta')
    const cellEl = labelEl.parentElement
    expect(cellEl).not.toBeNull()
    expect(cellEl).toHaveClass('bg-wb-bg-surface')
  })

  it('theta value is text-wb-green when yieldPct ≥ targetCapturePct', () => {
    // thetaDollar=5, dte=managementWindowDte, max=0.35*100=35 → yieldPct=(5*21/35)*100=300%
    const input = makeInput({
      expiration: daysFromToday(MANAGEMENT_RULES.managementWindowDte),
      contracts: 1,
      premiumPerContract: 0.35
    })
    render(<ContextStrip input={input} />)
    expect(screen.getByText('$5.00/d')).toHaveClass('text-wb-green')
  })
})
