import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ManagementQueueRow } from './ManagementQueueRow'

const ITEM: ManagementQueueItem = {
  alertId: 'a1',
  positionId: 'pos-123',
  ticker: 'AAPL',
  phase: 'CSP_OPEN',
  urgency: 'high',
  summary: 'Expires in 3 days at $180.00 strike',
  quickAction: 'Review position',
  triggeredAt: '2026-06-25T12:00:00.000Z'
}

describe('ManagementQueueRow', () => {
  it('renders ticker, urgency pill, phase badge, summary, and action button', () => {
    render(<ManagementQueueRow item={ITEM} />)

    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('HIGH')).toBeInTheDocument()
    expect(screen.getByText('CSP Open')).toBeInTheDocument()
    expect(screen.getByText('Expires in 3 days at $180.00 strike')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review position' })).toBeInTheDocument()
  })

  it('navigates to the position detail route when the action is clicked', async () => {
    const user = userEvent.setup()
    window.location.hash = ''

    render(<ManagementQueueRow item={ITEM} />)
    await user.click(screen.getByRole('button', { name: 'Review position' }))

    expect(window.location.hash).toBe('#/positions/pos-123')
  })
})
