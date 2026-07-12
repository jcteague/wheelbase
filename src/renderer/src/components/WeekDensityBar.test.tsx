import { render, screen } from '@testing-library/react'
import type { CalendarEntry } from '../lib/expiration-calendar'
import { WeekDensityBar } from './WeekDensityBar'

function buildEntry(overrides: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: 'id-1',
    ticker: 'AAPL',
    phase: 'CSP_OPEN',
    strike: '180.0000',
    dte: 10,
    expiration: '2026-08-14',
    ...overrides
  }
}

describe('WeekDensityBar', () => {
  it('renders a gold segment for CSP entries and a violet segment for CC entries sized by count', () => {
    const entries: CalendarEntry[] = [
      buildEntry({ id: '1', phase: 'CSP_OPEN' }),
      buildEntry({ id: '2', phase: 'CSP_OPEN' }),
      buildEntry({ id: '3', phase: 'CSP_OPEN' }),
      buildEntry({ id: '4', phase: 'CC_OPEN' })
    ]

    render(<WeekDensityBar entries={entries} />)

    const csp = screen.getByTestId('density-csp')
    const cc = screen.getByTestId('density-cc')

    expect(csp).toHaveClass('bg-wb-gold')
    expect(csp).toHaveStyle({ flexGrow: '3' })
    expect(cc).toHaveClass('bg-wb-violet')
    expect(cc).toHaveStyle({ flexGrow: '1' })
  })
})
