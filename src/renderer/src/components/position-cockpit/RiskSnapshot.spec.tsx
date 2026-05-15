import { render, screen } from '@testing-library/react'
import { RiskSnapshot } from './RiskSnapshot'
import { MANAGEMENT_RULES } from '../../lib/verdict'
import type { CockpitInput, Distance } from '../../lib/verdict'

function daysFromToday(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const TIGHT_DTE = MANAGEMENT_RULES.tightDte - 2 // well inside tight window
const NORMAL_DTE = MANAGEMENT_RULES.tightDte + 10 // well outside tight window

// delta well below warning threshold → 'normal' severity
const SAFE_DELTA = -(MANAGEMENT_RULES.cspWarningDelta - 0.05)
// delta above danger threshold → 'danger' severity
const DANGER_DELTA = -(MANAGEMENT_RULES.cspDangerDelta + 0.07)

const baseGreeks = { delta: SAFE_DELTA, theta: -0.05, gamma: 0.01, vega: 0.12, iv: 0.3 }

function makeInput(overrides: Partial<CockpitInput> = {}): CockpitInput {
  return {
    instrument: 'PUT',
    expiration: daysFromToday(NORMAL_DTE),
    strike: 180,
    contracts: 1,
    premiumPerContract: 3.5,
    currentMid: 1.75,
    underlying: 185,
    greeks: baseGreeks,
    ...overrides
  }
}

const normalDist: Distance = {
  dollars: 5,
  pct: 2.78,
  severity: 'normal',
  isITM: false
}

describe('RiskSnapshot', () => {
  it('renders null when greeks are absent', () => {
    const { container } = render(
      <RiskSnapshot input={makeInput({ greeks: null })} dist={normalDist} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders "Assignment probability" label for CSP (SELL PUT)', () => {
    render(<RiskSnapshot input={makeInput({ instrument: 'PUT' })} dist={normalDist} />)
    expect(screen.getByText('Assignment probability')).toBeInTheDocument()
  })

  it('renders "Call-away probability" label for CC (SELL CALL)', () => {
    render(<RiskSnapshot input={makeInput({ instrument: 'CALL' })} dist={normalDist} />)
    expect(screen.getByText('Call-away probability')).toBeInTheDocument()
  })

  it('delta gauge label reads "DELTA" without TIGHT when dte > tightDte', () => {
    render(
      <RiskSnapshot
        input={makeInput({ expiration: daysFromToday(NORMAL_DTE) })}
        dist={normalDist}
      />
    )
    expect(screen.getByText('DELTA')).toBeInTheDocument()
    expect(screen.queryByText(/TIGHT/)).not.toBeInTheDocument()
  })

  it('delta gauge label reads "DELTA · TIGHT" when dte ≤ tightDte', () => {
    render(
      <RiskSnapshot input={makeInput({ expiration: daysFromToday(TIGHT_DTE) })} dist={normalDist} />
    )
    expect(screen.getByText('DELTA · TIGHT')).toBeInTheDocument()
  })

  it('distance headline shows signed dollar amount and percentage', () => {
    const dist: Distance = { dollars: 5, pct: 2.8, severity: 'normal', isITM: false }
    render(<RiskSnapshot input={makeInput()} dist={dist} />)
    expect(screen.getByText(/\+\$5\.00/)).toBeInTheDocument()
    expect(screen.getByText(/\+2\.8%/)).toBeInTheDocument()
  })

  it('OTM reading shows "Low — comfortably out of the money"', () => {
    render(
      <RiskSnapshot
        input={makeInput({ greeks: { ...baseGreeks, delta: SAFE_DELTA } })}
        dist={normalDist}
      />
    )
    expect(screen.getByText(/Low — comfortably out of the money/)).toBeInTheDocument()
  })

  it('right pane shows "<underlying> vs <strike>" sublabel when distance is present', () => {
    render(<RiskSnapshot input={makeInput({ underlying: 185, strike: 180 })} dist={normalDist} />)
    expect(screen.getByText(/\$185\.00 vs \$180\.00/)).toBeInTheDocument()
  })

  it('danger reading shows "High — strike likely breached"', () => {
    render(
      <RiskSnapshot
        input={makeInput({ greeks: { ...baseGreeks, delta: DANGER_DELTA } })}
        dist={normalDist}
      />
    )
    expect(screen.getByText(/High — strike likely breached/)).toBeInTheDocument()
  })
})
