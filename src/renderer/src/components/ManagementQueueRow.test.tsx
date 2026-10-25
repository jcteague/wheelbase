import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PHASE_COLOR } from '../lib/phase'
import { ManagementQueueRow } from './ManagementQueueRow'

const ITEM: ManagementQueueItem = {
  alertId: 'a1',
  positionId: 'pos-123',
  ticker: 'AAPL',
  phase: 'CSP_OPEN',
  ruleCode: 'EXPIRATION_IMMINENT',
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
    ruleCode: 'PMCC_ASSIGNMENT_RISK',
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

  it.each([
    { ruleCode: 'PMCC_ASSIGNMENT_RISK', label: 'PMCC · short call' },
    { ruleCode: 'PMCC_LEAPS_ROLL_WINDOW', label: 'PMCC · LEAPS' }
  ] as const)(
    'tints the $label badge and its dot in the PMCC phase colour, as on the positions list',
    ({ ruleCode, label }) => {
      render(<ManagementQueueRow item={{ ...PMCC_ITEM, ruleCode }} onDismissClick={vi.fn()} />)

      const badge = screen.getByText(label).closest('span')
      expect(badge).toHaveStyle({ color: PHASE_COLOR.PMCC_OPEN })
      expect(badge?.querySelector('span')).toHaveStyle({ background: PHASE_COLOR.PMCC_OPEN })
    }
  )

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

  it('a HIGH expiration row on a PMCC reads `PMCC · short call` — short-leg rules name the short leg', () => {
    render(
      <ManagementQueueRow
        item={{
          ...PMCC_ITEM,
          alertId: 'pmcc-a2',
          ruleCode: 'EXPIRATION_IMMINENT',
          urgency: 'high',
          summary: 'Expires in 4 days at $110.00 strike'
        }}
        onDismissClick={vi.fn()}
      />
    )

    expect(screen.getByText('HIGH')).toBeInTheDocument()
    expect(screen.getByText('PMCC · short call')).toBeInTheDocument()
  })

  // [US-107] the LEAPS roll-window alert names the long leg, not the short call
  it('a MED LEAPS roll-window row reads `PMCC · LEAPS` with its full summary — not the short-call or wheel label', () => {
    const summary = 'LEAPS expires in 60 days at $80.00 strike — review for roll or close'
    render(
      <ManagementQueueRow
        item={{
          ...PMCC_ITEM,
          alertId: 'pmcc-a3',
          ruleCode: 'PMCC_LEAPS_ROLL_WINDOW',
          urgency: 'medium',
          summary
        }}
        onDismissClick={vi.fn()}
      />
    )

    expect(screen.getByText('XYZ')).toBeInTheDocument()
    expect(screen.getByText('MED')).toBeInTheDocument()
    expect(screen.getByText('PMCC · LEAPS')).toBeInTheDocument()
    expect(screen.getByText(summary)).toBeInTheDocument()
    expect(screen.queryByText('PMCC · short call')).not.toBeInTheDocument()
    expect(screen.queryByText('LEAPS + short call open')).not.toBeInTheDocument()
  })

  it('a covered-call wheel row keeps its phase badge', () => {
    render(<ManagementQueueRow item={{ ...ITEM, phase: 'CC_OPEN' }} onDismissClick={vi.fn()} />)

    expect(screen.getByText('CC Open')).toBeInTheDocument()
    expect(screen.queryByText('PMCC · short call')).not.toBeInTheDocument()
  })
})
