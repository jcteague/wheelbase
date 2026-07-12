import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { CalendarEntry } from '../lib/expiration-calendar'
import { CalendarDayDetail } from './CalendarDayDetail'

function makeEntry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: 'entry-1',
    ticker: 'AAPL',
    phase: 'CSP_OPEN',
    strike: '180.00',
    dte: 6,
    expiration: '2026-08-14',
    ...overrides
  }
}

describe('CalendarDayDetail', () => {
  it('lists each position for the selected day with ticker, phase, strike, and DTE', () => {
    const entries = [
      makeEntry({ id: 'e1', ticker: 'AAPL', phase: 'CSP_OPEN', strike: '180.00', dte: 6 }),
      makeEntry({ id: 'e2', ticker: 'MSFT', phase: 'CC_OPEN', strike: '420.00', dte: 6 })
    ]

    render(<CalendarDayDetail date="2026-08-14" entries={entries} onReview={vi.fn()} />)

    expect(screen.getByText('Aug 14 · 2 expirations')).toBeInTheDocument()

    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('MSFT')).toBeInTheDocument()

    expect(screen.getByText('Sell Put')).toBeInTheDocument()
    expect(screen.getByText('Sell Call')).toBeInTheDocument()

    expect(screen.getByText('$180.00')).toBeInTheDocument()
    expect(screen.getByText('$420.00')).toBeInTheDocument()

    expect(screen.getAllByText('6d')).toHaveLength(2)
  })

  it('shows the guidance copy when no date is selected', () => {
    render(<CalendarDayDetail date={null} entries={[]} onReview={vi.fn()} />)

    expect(screen.getByText('Day Detail')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Click any populated date to inspect the expirations, strike context, and DTE for that day.'
      )
    ).toBeInTheDocument()
  })

  it('calls onReview with the position id when Review position is clicked', async () => {
    const user = userEvent.setup()
    const entries = [makeEntry({ id: 'pos-42', ticker: 'AAPL' })]
    const onReview = vi.fn()

    render(<CalendarDayDetail date="2026-08-14" entries={entries} onReview={onReview} />)

    await user.click(screen.getByRole('button', { name: /review position/i }))

    expect(onReview).toHaveBeenCalledWith('pos-42')
  })
})
