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
    render(<ManagementQueueRow item={ITEM} onDismissClick={vi.fn()} />)

    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('HIGH')).toBeInTheDocument()
    expect(screen.getByText('CSP Open')).toBeInTheDocument()
    expect(screen.getByText('Expires in 3 days at $180.00 strike')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review position' })).toBeInTheDocument()
  })

  it('navigates to the position detail route when the action is clicked', async () => {
    const user = userEvent.setup()
    window.location.hash = ''

    render(<ManagementQueueRow item={ITEM} onDismissClick={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Review position' }))

    expect(window.location.hash).toBe('#/positions/pos-123')
  })

  it('renders a Dismiss button alongside the quick action', () => {
    render(<ManagementQueueRow item={ITEM} onDismissClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it("clicking Dismiss calls onDismissClick with the item's alertId, not the mutation directly", async () => {
    const user = userEvent.setup()
    const onDismissClick = vi.fn()

    render(<ManagementQueueRow item={ITEM} onDismissClick={onDismissClick} />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(onDismissClick).toHaveBeenCalledTimes(1)
    expect(onDismissClick).toHaveBeenCalledWith('a1')
  })
})
