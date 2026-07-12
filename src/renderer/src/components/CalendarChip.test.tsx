import { render, screen } from '@testing-library/react'
import { PHASE_COLOR } from '../lib/phase'
import type { CalendarEntry } from '../lib/expiration-calendar'
import { CalendarChip } from './CalendarChip'

function makeEntry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: 'pos-1',
    ticker: 'AAPL',
    phase: 'CSP_OPEN',
    strike: '180.00',
    dte: 6,
    expiration: '2026-08-14',
    ...overrides
  }
}

describe('CalendarChip', () => {
  it('renders the ticker and a phase-colored dot', () => {
    render(<CalendarChip entry={makeEntry()} />)

    const chip = screen.getByText('AAPL').closest('div')
    const dot = chip?.querySelector('span')

    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(dot).not.toBeNull()
    expect(dot).toHaveStyle({ background: PHASE_COLOR.CSP_OPEN })
  })

  it('applies the CSP (gold) color for CSP_OPEN and violet for CC_OPEN', () => {
    const { rerender } = render(<CalendarChip entry={makeEntry({ phase: 'CSP_OPEN' })} />)
    let dot = screen.getByText('AAPL').closest('div')?.querySelector('span')
    expect(dot).toHaveStyle({ background: PHASE_COLOR.CSP_OPEN })

    rerender(<CalendarChip entry={makeEntry({ ticker: 'MSFT', phase: 'CC_OPEN' })} />)
    dot = screen.getByText('MSFT').closest('div')?.querySelector('span')
    expect(dot).toHaveStyle({ background: PHASE_COLOR.CC_OPEN })
  })
})
