import { render, screen } from '@testing-library/react'
import { OptMidCell } from './OptMidCell'

type OptionSnapshot = {
  bid: string
  ask: string
  mid: string
}

type OptionLeg = {
  instrumentType: 'PUT' | 'CALL'
}

function renderInTable(ui: React.ReactNode): ReturnType<typeof render> {
  return render(
    <table>
      <tbody>
        <tr>{ui}</tr>
      </tbody>
    </table>
  )
}

describe('OptMidCell', () => {
  it('renders dash when leg is null', () => {
    renderInTable(<OptMidCell ticker="AAPL" leg={null} snapshot={undefined} />)

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('unavailable')).toBeNull()
    expect(screen.queryByText('no bid')).toBeNull()
    expect(screen.queryByTestId('opt-mid-spread-warning')).toBeNull()
  })

  it('renders dash and unavailable caption when snapshot is undefined and leg is set', () => {
    const leg: OptionLeg = { instrumentType: 'PUT' }
    renderInTable(<OptMidCell ticker="AAPL" leg={leg} snapshot={undefined} />)

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('unavailable')).toBeInTheDocument()
    expect(screen.getByTitle('Option snapshot unavailable')).toBeInTheDocument()
  })

  it('renders mid price as $1.30 in normal case', () => {
    const leg: OptionLeg = { instrumentType: 'PUT' }
    // tight spread (~7.7% of mid) so no warning, and bid > 0 so no "no bid"
    const snapshot: OptionSnapshot = { bid: '1.25', ask: '1.35', mid: '1.30' }
    renderInTable(<OptMidCell ticker="AAPL" leg={leg} snapshot={snapshot} />)

    expect(screen.getByText('$1.30')).toBeInTheDocument()
    expect(screen.queryByText('no bid')).toBeNull()
    expect(screen.queryByTestId('opt-mid-spread-warning')).toBeNull()
  })

  it('renders amber spread-warning icon when spread > 10% of mid', () => {
    const leg: OptionLeg = { instrumentType: 'PUT' }
    const snapshot: OptionSnapshot = { bid: '0.50', ask: '1.50', mid: '1.00' }
    renderInTable(<OptMidCell ticker="AAPL" leg={leg} snapshot={snapshot} />)

    expect(screen.getByText('$1.00')).toBeInTheDocument()
    const warning = screen.getByTestId('opt-mid-spread-warning')
    expect(warning).toBeInTheDocument()
    expect(warning).toHaveAttribute('title', 'Wide spread: $0.50 × $1.50 — P&L may be unreliable')
  })

  it('renders "no bid" subtext when bid is zero', () => {
    const leg: OptionLeg = { instrumentType: 'PUT' }
    const snapshot: OptionSnapshot = { bid: '0', ask: '0.05', mid: '0.03' }
    renderInTable(<OptMidCell ticker="AAPL" leg={leg} snapshot={snapshot} />)

    expect(screen.getByText('$0.03')).toBeInTheDocument()
    expect(screen.getByText('no bid')).toBeInTheDocument()
  })

  it('renders the testId on the wrapping cell', () => {
    const leg: OptionLeg = { instrumentType: 'PUT' }
    const snapshot: OptionSnapshot = { bid: '1.20', ask: '1.40', mid: '1.30' }
    const { container } = renderInTable(<OptMidCell ticker="AAPL" leg={leg} snapshot={snapshot} />)

    const cell = container.querySelector('[data-testid="position-card-AAPL-opt-mid"]')
    expect(cell).toBeInTheDocument()
    expect(cell?.tagName).toBe('TD')
  })
})
