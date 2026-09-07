import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PositionListItem } from '../api/positions'
import { usePositions } from '../hooks/usePositions'
import { useMarketStatus } from '../hooks/useMarketStatus'
import { useSettingsStatus } from '../hooks/useSettings'
import { CalendarPage } from './CalendarPage'

vi.mock('../hooks/usePositions')
vi.mock('../hooks/useMarketStatus')
vi.mock('../hooks/useSettings')
vi.mock('wouter', () => ({
  useLocation: () => ['/calendar', vi.fn()]
}))

const mockUsePositions = vi.mocked(usePositions)
const mockUseMarketStatus = vi.mocked(useMarketStatus)
const mockUseSettingsStatus = vi.mocked(useSettingsStatus)

const STORAGE_KEY = 'wb.calendar.view'

function makePosition(overrides: Partial<PositionListItem> = {}): PositionListItem {
  return {
    id: 'pos-1',
    ticker: 'AAPL',
    phase: 'CSP_OPEN',
    status: 'ACTIVE',
    strike: '180.00',
    expiration: '2026-08-14',
    dte: 6,
    instrumentType: 'PUT',
    contracts: 1,
    entryPremiumPerContract: '2.10',
    premium_collected: '210.00',
    effective_cost_basis: '177.90',
    profitTargetPercent: null,
    ...overrides
  }
}

function setPositions(positions: PositionListItem[]): void {
  mockUsePositions.mockReturnValue({
    data: positions,
    isLoading: false,
    isError: false
  } as unknown as ReturnType<typeof usePositions>)
}

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 1)) // Aug 1, 2026
    localStorage.clear()

    setPositions([
      makePosition({ id: 'aapl-1', ticker: 'AAPL', phase: 'CSP_OPEN', expiration: '2026-08-14' }),
      makePosition({
        id: 'msft-1',
        ticker: 'MSFT',
        phase: 'CC_OPEN',
        strike: '410.00',
        expiration: '2026-08-14'
      })
    ])
    mockUseMarketStatus.mockReturnValue({
      data: { session: 'closed' },
      isLoading: false,
      isError: false
    } as unknown as ReturnType<typeof useMarketStatus>)
    mockUseSettingsStatus.mockReturnValue({
      data: { activeBrokerEnv: 'none', marketData: 'missing' },
      isLoading: false,
      isError: false
    } as unknown as ReturnType<typeof useSettingsStatus>)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults to the Month Grid layout', () => {
    render(<CalendarPage />)

    expect(screen.getByTestId('day-cell-2026-08-14')).toBeInTheDocument()
  })

  it('switches to the Agenda layout when the toggle is clicked', () => {
    render(<CalendarPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Agenda' }))

    expect(screen.queryByTestId('day-cell-2026-08-14')).not.toBeInTheDocument()
    expect(screen.getByTestId('agenda-week-2026-08-09')).toBeInTheDocument()
  })

  it('restores the Agenda layout on mount when it was the last-used view', () => {
    localStorage.setItem(STORAGE_KEY, 'agenda')

    render(<CalendarPage />)

    expect(screen.getByTestId('agenda-week-2026-08-09')).toBeInTheDocument()
    expect(screen.queryByTestId('day-cell-2026-08-14')).not.toBeInTheDocument()
  })

  it('hides the month nav in the Agenda layout and shows it in the grid layout', () => {
    render(<CalendarPage />)

    expect(screen.getByText('August 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agenda' }))

    expect(screen.queryByText('August 2026')).not.toBeInTheDocument()
    expect(screen.getByText('Management Horizon · Next 30 Days')).toBeInTheDocument()
  })

  it('advances and rewinds the visible month with the nav controls (grid)', () => {
    render(<CalendarPage />)

    expect(screen.getByText('August 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByText('›'))
    expect(screen.getByText('September 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByText('‹'))
    fireEvent.click(screen.getByText('‹'))
    expect(screen.getByText('July 2026')).toBeInTheDocument()
  })

  it('shows the day detail for a date after it is clicked in the grid', () => {
    render(<CalendarPage />)

    fireEvent.click(screen.getByTestId('day-cell-2026-08-14'))

    expect(screen.getByText('Aug 14 · 2 expirations')).toBeInTheDocument()
  })

  it('renders the empty-month state for a month with no expirations', () => {
    setPositions([])

    render(<CalendarPage />)

    expect(screen.getByText('No expirations this month')).toBeInTheDocument()
  })
})
