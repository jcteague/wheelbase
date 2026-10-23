import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PHASE_COLOR } from '../lib/phase'
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

// [US-106] PMCC rows show the strategy badge in place of a wheel phase badge
describe('ManagementQueueRow — PMCC', () => {
  const PMCC_ITEM: ManagementQueueItem = {
    alertId: 'pmcc-a1',
    positionId: 'pmcc-xyz',
    ticker: 'XYZ',
    phase: 'PMCC_OPEN',
    urgency: 'medium',
    summary:
      'Stock is 2.3% above the $110.00 short-call strike — in the money, LEAPS would have to cover',
    quickAction: 'Review position',
    triggeredAt: '2026-09-28T16:00:00.000Z'
  }

  it('renders XYZ, MED, the PMCC badge, the summary and Review position — not the wheel phase label', () => {
    render(<ManagementQueueRow item={PMCC_ITEM} onDismissClick={vi.fn()} />)

    expect(screen.getByText('XYZ')).toBeInTheDocument()
    expect(screen.getByText('MED')).toBeInTheDocument()
    expect(screen.getByText('PMCC · short call')).toBeInTheDocument()
    expect(screen.getByText(PMCC_ITEM.summary)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review position' })).toBeInTheDocument()
    expect(screen.queryByText('LEAPS + short call open')).not.toBeInTheDocument()
  })

  it('tints the PMCC badge and its dot in the PMCC phase colour, as on the positions list', () => {
    render(<ManagementQueueRow item={PMCC_ITEM} onDismissClick={vi.fn()} />)

    const badge = screen.getByText('PMCC · short call').closest('span')
    expect(badge).toHaveStyle({ color: PHASE_COLOR.PMCC_OPEN })
    expect(badge?.querySelector('span')).toHaveStyle({ background: PHASE_COLOR.PMCC_OPEN })
  })

  it('Review position opens the PMCC position detail and Dismiss passes the alert id', async () => {
    const user = userEvent.setup()
    const onDismissClick = vi.fn()
    window.location.hash = ''

    render(<ManagementQueueRow item={PMCC_ITEM} onDismissClick={onDismissClick} />)
    await user.click(screen.getByRole('button', { name: 'Review position' }))
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(window.location.hash).toBe('#/positions/pmcc-xyz')
    expect(onDismissClick).toHaveBeenCalledWith('pmcc-a1')
  })

  it('a HIGH expiration row on a PMCC gets the same badge — the branch follows phase, not rule or summary', () => {
    render(
      <ManagementQueueRow
        item={{
          ...PMCC_ITEM,
          alertId: 'pmcc-a2',
          urgency: 'high',
          summary: 'Expires in 4 days at $110.00 strike'
        }}
        onDismissClick={vi.fn()}
      />
    )

    expect(screen.getByText('HIGH')).toBeInTheDocument()
    expect(screen.getByText('PMCC · short call')).toBeInTheDocument()
  })

  it('a covered-call wheel row keeps its phase badge', () => {
    render(<ManagementQueueRow item={{ ...ITEM, phase: 'CC_OPEN' }} onDismissClick={vi.fn()} />)

    expect(screen.getByText('CC Open')).toBeInTheDocument()
    expect(screen.queryByText('PMCC · short call')).not.toBeInTheDocument()
  })
})
