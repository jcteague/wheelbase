import { render, screen, within } from '@testing-library/react'
import type { AgendaWeek, CalendarEntry } from '../lib/expiration-calendar'
import { CalendarAgenda } from './CalendarAgenda'

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

describe('CalendarAgenda', () => {
  it('renders one section per week with its expirations grouped by day', () => {
    const weeks: AgendaWeek[] = [
      {
        weekStart: new Date(2026, 7, 9),
        label: 'Week of Aug 9',
        rangeLabel: 'Aug 9 – 15',
        total: 2,
        isBusy: false,
        days: [
          {
            date: new Date(2026, 7, 12),
            entries: [buildEntry({ id: '1', ticker: 'AAPL', phase: 'CSP_OPEN' })]
          },
          {
            date: new Date(2026, 7, 14),
            entries: [buildEntry({ id: '2', ticker: 'MSFT', phase: 'CC_OPEN' })]
          }
        ]
      },
      {
        weekStart: new Date(2026, 7, 16),
        label: 'Week of Aug 16',
        rangeLabel: 'Aug 16 – 22',
        total: 1,
        isBusy: false,
        days: [
          {
            date: new Date(2026, 7, 21),
            entries: [buildEntry({ id: '3', ticker: 'NVDA', phase: 'CSP_OPEN' })]
          }
        ]
      }
    ]

    render(<CalendarAgenda weeks={weeks} />)

    expect(screen.getByText('Week of Aug 9')).toBeInTheDocument()
    expect(screen.getByText('Week of Aug 16')).toBeInTheDocument()

    const weekOneCard = screen.getByTestId('agenda-week-2026-08-09')
    const weekTwoCard = screen.getByTestId('agenda-week-2026-08-16')

    expect(within(weekOneCard).getByText('AAPL')).toBeInTheDocument()
    expect(within(weekOneCard).getByText('MSFT')).toBeInTheDocument()
    expect(within(weekOneCard).queryByText('NVDA')).not.toBeInTheDocument()

    expect(within(weekTwoCard).getByText('NVDA')).toBeInTheDocument()
    expect(within(weekTwoCard).queryByText('AAPL')).not.toBeInTheDocument()
  })

  it('shows the BUSY WEEK badge for a week with >= BUSY_WEEK_THRESHOLD expirations', () => {
    const weeks: AgendaWeek[] = [
      {
        weekStart: new Date(2026, 7, 9),
        label: 'Week of Aug 9',
        rangeLabel: 'Aug 9 – 15',
        total: 1,
        isBusy: false,
        days: [{ date: new Date(2026, 7, 12), entries: [buildEntry({ id: '1', ticker: 'AAPL' })] }]
      },
      {
        weekStart: new Date(2026, 7, 16),
        label: 'Week of Aug 16',
        rangeLabel: 'Aug 16 – 22',
        total: 5,
        isBusy: true,
        days: [
          {
            date: new Date(2026, 7, 21),
            entries: [
              buildEntry({ id: '2', ticker: 'MSFT' }),
              buildEntry({ id: '3', ticker: 'NVDA' }),
              buildEntry({ id: '4', ticker: 'TSLA' }),
              buildEntry({ id: '5', ticker: 'AMD' }),
              buildEntry({ id: '6', ticker: 'GOOG' })
            ]
          }
        ]
      }
    ]

    render(<CalendarAgenda weeks={weeks} />)

    const quietWeek = screen.getByTestId('agenda-week-2026-08-09')
    const busyWeek = screen.getByTestId('agenda-week-2026-08-16')

    expect(within(busyWeek).getByText('BUSY WEEK')).toBeInTheDocument()
    expect(within(quietWeek).queryByText('BUSY WEEK')).not.toBeInTheDocument()
  })

  it('shows the "N expiring" count per week', () => {
    const weeks: AgendaWeek[] = [
      {
        weekStart: new Date(2026, 7, 9),
        label: 'Week of Aug 9',
        rangeLabel: 'Aug 9 – 15',
        total: 5,
        isBusy: true,
        days: [
          {
            date: new Date(2026, 7, 12),
            entries: [buildEntry({ id: '1', ticker: 'AAPL' })]
          }
        ]
      }
    ]

    render(<CalendarAgenda weeks={weeks} />)

    expect(screen.getByText('5 expiring')).toBeInTheDocument()
  })

  it('renders the "No expirations in the next 30 days" message when weeks is empty', () => {
    render(<CalendarAgenda weeks={[]} />)

    expect(screen.getByText('No expirations in the next 30 days')).toBeInTheDocument()
  })
})
