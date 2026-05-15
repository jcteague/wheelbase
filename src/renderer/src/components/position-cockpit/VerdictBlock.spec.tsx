import { render, screen } from '@testing-library/react'
import { VerdictBlock } from './VerdictBlock'
import { MANAGEMENT_RULES } from '../../lib/verdict'
import type { CockpitInput, Verdict, Pnl } from '../../lib/verdict'

function daysFromToday(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// DTE values derived from MANAGEMENT_RULES so tests stay valid if thresholds change
const ACT_NOW_DTE = MANAGEMENT_RULES.actNowDte - 1 // dte ≤ actNowDte → red
const TIGHT_DTE = MANAGEMENT_RULES.actNowDte + 2 // dte ≤ tightDte but > actNowDte → gold
const NORMAL_DTE = MANAGEMENT_RULES.tightDte + 10 // dte > tightDte → no special colour
// delta well below CSP warning threshold — safe, no severity colour
const SAFE_DELTA = -(MANAGEMENT_RULES.cspWarningDelta - 0.05)

const baseInput: CockpitInput = {
  instrument: 'PUT',
  expiration: daysFromToday(NORMAL_DTE),
  strike: 180,
  contracts: 1,
  premiumPerContract: 3.5,
  currentMid: 1.75,
  underlying: 185.5,
  greeks: { delta: SAFE_DELTA, theta: -0.05, gamma: 0.02, vega: 0.1, iv: 0.3 }
}

const holdVerdict: Verdict = {
  kind: 'hold',
  label: 'HOLD',
  sub: 'Position tracking to plan · no action required',
  color: 'var(--wb-green)'
}

const basePnl: Pnl = { pct: 62, captured: 217, max: 350 }

function renderBlock(
  overrides: Partial<CockpitInput> = {},
  pnl: Pnl | null = basePnl
): ReturnType<typeof render> {
  return render(
    <VerdictBlock
      input={{ ...baseInput, ...overrides }}
      verdict={holdVerdict}
      pnl={pnl}
      ticker="TSLA"
      phaseLabel="CSP OPEN"
      phaseColor="var(--wb-green)"
    />
  )
}

describe('VerdictBlock', () => {
  it('renders ticker symbol prominently', () => {
    renderBlock()
    expect(screen.getByText('TSLA')).toBeInTheDocument()
  })

  it('renders phase pill with phaseLabel text', () => {
    renderBlock()
    expect(screen.getByText('CSP OPEN')).toBeInTheDocument()
  })

  it('renders verdict pill with verdict.label text', () => {
    renderBlock()
    expect(screen.getByText('HOLD')).toBeInTheDocument()
  })

  it('renders verdict.sub reason text', () => {
    renderBlock()
    expect(screen.getByText('Position tracking to plan · no action required')).toBeInTheDocument()
  })

  it('renders DTE with red color class when dte ≤ actNowDte', () => {
    renderBlock({ expiration: daysFromToday(ACT_NOW_DTE) })
    expect(screen.getByText(new RegExp(`${ACT_NOW_DTE}d`))).toHaveClass('text-wb-red')
  })

  it('renders DTE with gold color when dte ≤ tightDte (and > actNowDte)', () => {
    renderBlock({ expiration: daysFromToday(TIGHT_DTE) })
    expect(screen.getByText(new RegExp(`${TIGHT_DTE}d`))).toHaveClass('text-wb-gold')
  })

  it('renders P&L % captured when pnl is provided', () => {
    renderBlock({}, { pct: 62, captured: 217, max: 350 })
    expect(screen.getByText(/62%/)).toBeInTheDocument()
  })

  it('P&L panel is absent when pnl is null', () => {
    renderBlock({}, null)
    expect(screen.queryByText(/% captured/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('renders underlying price when present in input', () => {
    renderBlock({ underlying: 185.5 })
    expect(screen.getByText(/185\.50|185\.5/)).toBeInTheDocument()
  })

  it('P&L panel is dimmed (opacity-50) when pnlStale is true', () => {
    render(
      <VerdictBlock
        input={baseInput}
        verdict={holdVerdict}
        pnl={basePnl}
        ticker="TSLA"
        phaseLabel="CSP OPEN"
        phaseColor="var(--wb-green)"
        pnlStale
      />
    )
    // Find the % captured number, walk up to the PnlSummary root
    const pctEl = screen.getByText(/62%/)
    const summaryRoot = pctEl.closest('[data-testid="pnl-summary"]')
    expect(summaryRoot).not.toBeNull()
    expect(summaryRoot).toHaveClass('opacity-50')
  })

  it('P&L panel is not dimmed when pnlStale is false (default)', () => {
    renderBlock()
    const pctEl = screen.getByText(/62%/)
    const summaryRoot = pctEl.closest('[data-testid="pnl-summary"]')
    expect(summaryRoot).not.toBeNull()
    expect(summaryRoot).not.toHaveClass('opacity-50')
  })
})
