import { render, screen } from '@testing-library/react'
import { useManagementQueue } from '../hooks/useManagementQueue'
import { ManagementQueue } from './ManagementQueue'

vi.mock('../hooks/useManagementQueue')

const mockUseManagementQueue = vi.mocked(useManagementQueue)

function queueResult(items: ManagementQueueItem[]): ReturnType<typeof useManagementQueue> {
  return { data: items } as unknown as ReturnType<typeof useManagementQueue>
}

function makeItem(overrides: Partial<ManagementQueueItem>): ManagementQueueItem {
  return {
    alertId: 'a',
    positionId: 'p',
    ticker: 'AAPL',
    phase: 'CSP_OPEN',
    urgency: 'high',
    summary: 'summary',
    quickAction: 'Review position',
    triggeredAt: '2026-06-25T12:00:00.000Z',
    ...overrides
  }
}

describe('ManagementQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders one row per open alert in returned order', () => {
    mockUseManagementQueue.mockReturnValue(
      queueResult([
        makeItem({ alertId: 'a1', positionId: 'p1', ticker: 'AAPL', urgency: 'high' }),
        makeItem({ alertId: 'a2', positionId: 'p2', ticker: 'TSLA', urgency: 'medium' }),
        makeItem({ alertId: 'a3', positionId: 'p3', ticker: 'NVDA', urgency: 'low' })
      ])
    )

    render(<ManagementQueue />)

    const tickers = screen.getAllByText(/AAPL|TSLA|NVDA/)
    expect(tickers.map((el) => el.textContent)).toEqual(['AAPL', 'TSLA', 'NVDA'])
    expect(screen.getAllByRole('button', { name: 'Review position' })).toHaveLength(3)
  })

  it('renders the empty state with no action buttons when there are no alerts', () => {
    mockUseManagementQueue.mockReturnValue(queueResult([]))

    render(<ManagementQueue />)

    expect(screen.getByText('No positions need attention right now')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review position' })).not.toBeInTheDocument()
  })
})
