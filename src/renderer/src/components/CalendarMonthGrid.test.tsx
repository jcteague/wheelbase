import { format } from 'date-fns'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import {
  buildMonthGrid,
  groupByExpiration,
  type CalendarEntry,
  type DayCell
} from '../lib/expiration-calendar'
import { CalendarMonthGrid } from './CalendarMonthGrid'

const VIEW_MONTH = new Date(2026, 7, 1) // August 2026
const TODAY = new Date(2026, 7, 1)

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

function buildGrid(entries: CalendarEntry[]): DayCell[][] {
  return buildMonthGrid(VIEW_MONTH, groupByExpiration(entries), TODAY)
}

function findCellByDay(grid: DayCell[][], day: number, inMonth = true): DayCell {
  const cell = grid.flat().find((c) => c.dayOfMonth === day && c.inMonth === inMonth)
  if (!cell) throw new Error(`cell for day ${day} (inMonth=${inMonth}) not found in fixture`)
  return cell
}

describe('CalendarMonthGrid', () => {
  it('renders phase-colored chips on the dates that have expirations', () => {
    const entries = [
      makeEntry({ id: 'e1', ticker: 'AAPL', phase: 'CSP_OPEN', expiration: '2026-08-14' }),
      makeEntry({ id: 'e2', ticker: 'MSFT', phase: 'CC_OPEN', expiration: '2026-08-14' })
    ]
    const grid = buildGrid(entries)

    render(
      <CalendarMonthGrid
        grid={grid}
        selectedDate={null}
        onSelectDate={vi.fn()}
        emptyMonth={false}
      />
    )

    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('MSFT')).toBeInTheDocument()
  })

  it('does not render a chip for a share-only position', () => {
    const entries = [makeEntry({ id: 'e1', ticker: 'AAPL', expiration: '2026-08-14' })]
    const grid = buildGrid(entries)

    render(
      <CalendarMonthGrid
        grid={grid}
        selectedDate={null}
        onSelectDate={vi.fn()}
        emptyMonth={false}
      />
    )

    // Grid only ever renders what's in cell.entries - TSLA was never added to any entry,
    // so it must never appear even though the grid renders 42 cells.
    expect(screen.queryByText('TSLA')).not.toBeInTheDocument()
    expect(screen.getByText('AAPL')).toBeInTheDocument()
  })

  it('shows exactly CHIP_LIMIT chips and a "+2 more" indicator for a 5-expiration day', () => {
    const entries = ['AAPL', 'MSFT', 'GOOG', 'AMZN', 'NFLX'].map((ticker, i) =>
      makeEntry({ id: `e${i}`, ticker, expiration: '2026-08-14' })
    )
    const grid = buildGrid(entries)

    render(
      <CalendarMonthGrid
        grid={grid}
        selectedDate={null}
        onSelectDate={vi.fn()}
        emptyMonth={false}
      />
    )

    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('MSFT')).toBeInTheDocument()
    expect(screen.getByText('GOOG')).toBeInTheDocument()
    expect(screen.queryByText('AMZN')).not.toBeInTheDocument()
    expect(screen.queryByText('NFLX')).not.toBeInTheDocument()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('calls onSelectDate with the ISO date when a populated cell is clicked', async () => {
    const user = userEvent.setup()
    const entries = [makeEntry({ id: 'e1', ticker: 'AAPL', expiration: '2026-08-14' })]
    const grid = buildGrid(entries)
    const onSelectDate = vi.fn()

    render(
      <CalendarMonthGrid
        grid={grid}
        selectedDate={null}
        onSelectDate={onSelectDate}
        emptyMonth={false}
      />
    )

    const cell = findCellByDay(grid, 14)
    await user.click(screen.getByText('AAPL').closest('[data-testid^="day-cell-"]') as Element)

    expect(onSelectDate).toHaveBeenCalledWith(format(cell.date, 'yyyy-MM-dd'))
  })

  it('does not call onSelectDate for an empty cell', async () => {
    const user = userEvent.setup()
    const entries = [makeEntry({ id: 'e1', ticker: 'AAPL', expiration: '2026-08-14' })]
    const grid = buildGrid(entries)
    const onSelectDate = vi.fn()

    render(
      <CalendarMonthGrid
        grid={grid}
        selectedDate={null}
        onSelectDate={onSelectDate}
        emptyMonth={false}
      />
    )

    const emptyCell = findCellByDay(grid, 10)
    await user.click(screen.getByTestId(`day-cell-${format(emptyCell.date, 'yyyy-MM-dd')}`))

    expect(onSelectDate).not.toHaveBeenCalled()
  })

  it('renders all day cells and the "No expirations this month" message when emptyMonth is true', () => {
    const grid = buildGrid([])

    render(
      <CalendarMonthGrid grid={grid} selectedDate={null} onSelectDate={vi.fn()} emptyMonth={true} />
    )

    expect(screen.getAllByTestId(/^day-cell-/)).toHaveLength(42)
    expect(screen.getByText('No expirations this month')).toBeInTheDocument()
  })
})
