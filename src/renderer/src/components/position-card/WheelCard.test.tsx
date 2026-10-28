import { fireEvent, render, screen, within } from '@testing-library/react'
import type { OptionSnapshot } from '../../api/market-data'
import type { WheelListItem } from '../../api/positions'
import { MANAGEMENT_WINDOW } from '../../test-fixtures/card-actions'
import { AAPL, AAPL_QUOTE, MSFT, NVDA, TSLA, optionSnapshot } from '../../test-fixtures/wheel-cards'
import { WheelCard, type WheelCardProps } from './WheelCard'

const AAPL_SNAPSHOT = optionSnapshot('2.55', '2.65', '2.60')

function renderCard(props: Partial<WheelCardProps> & { item: WheelListItem }): void {
  render(<WheelCard actions={[]} {...props} />)
}

function aaplAt(snapshot: OptionSnapshot | undefined): void {
  renderCard({ item: AAPL, quote: AAPL_QUOTE, session: 'regular', snapshot })
}

beforeEach(() => {
  window.location.hash = ''
})

describe('WheelCard — header', () => {
  it('names the position, its phase and its live price', () => {
    aaplAt(AAPL_SNAPSHOT)

    expect(screen.getByTestId('position-ticker')).toHaveTextContent('AAPL')
    expect(screen.getByText('CSP Open')).toBeInTheDocument()
    const price = screen.getByTestId('position-card-AAPL-price')
    expect(price).toHaveTextContent('$182.45')
    expect(price).toHaveTextContent('30d to expiration')
  })

  it('links to the detail page from the ticker and the Open link', () => {
    aaplAt(AAPL_SNAPSHOT)

    expect(screen.getByRole('link', { name: 'AAPL' })).toHaveAttribute(
      'href',
      '#/positions/pos-aapl'
    )
    expect(screen.getByRole('link', { name: 'Open ↗' })).toHaveAttribute(
      'href',
      '#/positions/pos-aapl'
    )
  })

  it('reads an open card with no quote as a dash over "unavailable"', () => {
    renderCard({ item: AAPL, session: 'regular', snapshot: AAPL_SNAPSHOT })

    const price = screen.getByTestId('position-card-AAPL-price')
    expect(price).toHaveAttribute('title', 'Price unavailable')
    expect(price).toHaveTextContent(/^—unavailable30d to expiration$/)
  })

  it("shows the day's change while the market is open", () => {
    aaplAt(AAPL_SNAPSHOT)

    expect(screen.getByTestId('position-card-AAPL-price')).toHaveTextContent('+$1.45')
  })

  it("hides the day's change once the session has closed", () => {
    renderCard({ item: AAPL, quote: AAPL_QUOTE, session: 'closed', snapshot: AAPL_SNAPSHOT })

    const price = screen.getByTestId('position-card-AAPL-price')
    expect(price).toHaveTextContent('$182.45')
    expect(price).not.toHaveTextContent('+$1.45')
  })

  it('shows the pending-assignment indicator beside the ticker', () => {
    renderCard({ item: AAPL, hasPendingAssignment: true })

    expect(screen.getByTestId('pending-assignment-indicator-pos-aapl')).toHaveAttribute(
      'aria-label',
      'Assignment pending'
    )
  })

  it('has no pending-assignment indicator by default', () => {
    renderCard({ item: AAPL })

    expect(screen.getByTestId('position-ticker')).toHaveTextContent('AAPL')
    expect(screen.queryByTestId('pending-assignment-indicator-pos-aapl')).not.toBeInTheDocument()
  })
})

describe('WheelCard — unrealized P&L', () => {
  it('reads a gain in green with its share of max profit', () => {
    aaplAt(AAPL_SNAPSHOT)

    const pnl = screen.getByTestId('position-card-AAPL-pnl')
    expect(within(pnl).getByText('+$90.00')).toHaveClass('text-wb-green')
    expect(pnl).toHaveTextContent('+25.7% of max profit')
  })

  it('reads a loss in red', () => {
    aaplAt(optionSnapshot('5.10', '5.30', '5.20'))

    const pnl = screen.getByTestId('position-card-AAPL-pnl')
    expect(within(pnl).getByText('-$170.00')).toHaveClass('text-wb-red')
    expect(pnl).toHaveTextContent('-48.6% of max profit')
  })
})

describe('WheelCard — leg block', () => {
  it('describes the open AAPL put with its mid and credit', () => {
    aaplAt(AAPL_SNAPSHOT)

    const leg = screen.getByTestId('leg-block')
    expect(within(leg).getByTitle('Cash-secured put')).toHaveTextContent('P')
    expect(leg).toHaveTextContent('$180.00 put · 2027-09-12')
    expect(within(leg).getByText('30d')).toBeInTheDocument()
    expect(screen.getByTestId('position-card-AAPL-opt-mid')).toHaveTextContent(/^\$2\.60$/)
    expect(leg).toHaveTextContent('· $3.50 credit')
  })

  it('tags the MSFT call C', () => {
    renderCard({ item: MSFT, snapshot: optionSnapshot('1.75', '1.85', '1.80') })

    const leg = screen.getByTestId('leg-block')
    expect(within(leg).getByTitle('Covered call')).toHaveTextContent('C')
    expect(leg).toHaveTextContent('$430.00 call · 2027-08-23')
  })

  it('warns on a wide spread with the US-33 tooltip', () => {
    aaplAt(optionSnapshot('0.50', '1.50', '1.00'))

    expect(screen.getByTestId('position-card-AAPL-opt-mid')).toHaveTextContent('$1.00')
    expect(screen.getByTestId('opt-mid-spread-warning')).toHaveAttribute(
      'title',
      'Wide spread: $0.50 × $1.50 — P&L may be unreliable'
    )
  })

  it('reads "no bid" without the spread warning when the bid is zero', () => {
    aaplAt(optionSnapshot('0', '0.06', '0.03'))

    const mark = screen.getByTestId('position-card-AAPL-opt-mid')
    expect(mark).toHaveTextContent('$0.03')
    expect(mark).toHaveTextContent('no bid')
    expect(screen.queryByTestId('opt-mid-spread-warning')).not.toBeInTheDocument()
  })

  it('blanks the mid and the P&L when no snapshot came back', () => {
    aaplAt(undefined)

    expect(screen.getByTestId('position-card-AAPL-opt-mid')).toHaveTextContent('— unavailable')
    const pnl = screen.getByTestId('position-card-AAPL-pnl')
    expect(pnl).toHaveTextContent(/^—unavailable$/)
  })

  it('shows the placeholder leg while holding shares', () => {
    renderCard({ item: NVDA, quote: { ...AAPL_QUOTE, price: '128.30' } })

    const leg = screen.getByTestId('leg-block')
    expect(within(leg).getByTitle('No option leg open')).toHaveTextContent('·')
    expect(leg).toHaveTextContent('no option leg open — sell a covered call')
    expect(screen.getByTestId('position-card-NVDA-opt-mid')).toHaveTextContent(/^—$/)
    expect(screen.getByTestId('position-card-NVDA-pnl')).toHaveTextContent(/^—no option leg open$/)
    expect(screen.getByTestId('position-card-NVDA-price')).toHaveTextContent(
      'shares held · no option leg'
    )
  })
})

describe('WheelCard — TARGET badge', () => {
  it('shows TARGET once the MSFT call has captured 53.6%', () => {
    renderCard({ item: MSFT, snapshot: optionSnapshot('1.25', '1.35', '1.30') })

    expect(screen.getByTestId('target-badge')).toHaveAttribute(
      'title',
      '53.6% of max profit ($280) — target is 50%'
    )
  })

  it('shows no TARGET below the profit target', () => {
    renderCard({ item: MSFT, snapshot: optionSnapshot('1.75', '1.85', '1.80') })

    expect(screen.getByTestId('position-card-MSFT-pnl')).toHaveTextContent('+$100.00')
    expect(screen.queryByTestId('target-badge')).not.toBeInTheDocument()
  })
})

describe('WheelCard — expiring soon', () => {
  it('golds the DTE and flags the header at 4 days', () => {
    renderCard({ item: { ...MSFT, dte: 4 } })

    expect(within(screen.getByTestId('leg-block')).getByText('4d')).toHaveClass(
      'font-semibold',
      'text-wb-gold'
    )
    expect(screen.getByTestId('expiring-soon-flag')).toHaveTextContent('Expiring soon')
  })

  it('leaves a 30-day DTE plain and unflagged', () => {
    aaplAt(AAPL_SNAPSHOT)

    expect(within(screen.getByTestId('leg-block')).getByText('30d')).not.toHaveClass('text-wb-gold')
    expect(screen.queryByTestId('expiring-soon-flag')).not.toBeInTheDocument()
  })
})

describe('WheelCard — footer', () => {
  it('shows the cost basis per share and the premium collected to date', () => {
    aaplAt(AAPL_SNAPSHOT)

    expect(screen.getByText('Cost basis').parentElement).toHaveTextContent(
      /^Cost basis\$176\.50\/ share$/
    )
    expect(screen.getByText('Premium collected').parentElement).toHaveTextContent(
      /^Premium collected\$350\.00to date$/
    )
  })

  it('groups thousands in the premium collected', () => {
    renderCard({ item: TSLA })

    expect(screen.getByText('Premium collected').parentElement).toHaveTextContent('$1,240.00')
  })
})

describe('WheelCard — action strip', () => {
  it('carries an open queue row as a strip, a gold edge and a highlighted leg', () => {
    renderCard({ item: MSFT, actions: [MANAGEMENT_WINDOW] })

    expect(screen.getByTestId('action-strip')).toHaveAttribute('data-tone', 'gold')
    expect(screen.getByTestId('position-card')).toHaveAttribute('data-edge', 'gold')
    expect(screen.getByTestId('leg-block')).toHaveAttribute('data-action', 'gold')
  })

  it('keeps the phase edge and a plain leg with no open rows', () => {
    aaplAt(AAPL_SNAPSHOT)

    expect(screen.queryByTestId('action-strip')).not.toBeInTheDocument()
    expect(screen.getByTestId('position-card')).toHaveAttribute('data-edge', 'CSP_OPEN')
    expect(screen.getByTestId('leg-block')).not.toHaveAttribute('data-action')
  })
})

describe('WheelCard — closed', () => {
  function renderClosed(): void {
    renderCard({
      item: TSLA,
      isClosed: true,
      quote: AAPL_QUOTE,
      session: 'regular',
      snapshot: optionSnapshot('1.25', '1.35', '1.30'),
      actions: [MANAGEMENT_WINDOW]
    })
  }

  it('is muted under the closed test id with no live figures', () => {
    renderClosed()

    const card = screen.getByTestId('position-card-closed')
    expect(card).toHaveClass('opacity-50')
    const price = screen.getByTestId('position-card-TSLA-price')
    expect(price).toHaveTextContent(/^—closed$/)
    expect(price).not.toHaveAttribute('title')
    expect(screen.getByTestId('position-card-TSLA-pnl')).toHaveTextContent(
      /^—closed — no live marks$/
    )
    expect(screen.getByTestId('leg-block')).toHaveTextContent('wheel complete')
    expect(screen.getByTestId('position-card-TSLA-opt-mid')).toHaveTextContent(/^—$/)
  })

  it('carries no strip, edge or leg highlight even when actions are passed', () => {
    renderClosed()

    expect(screen.getByTestId('position-card-closed')).toHaveAttribute(
      'data-edge',
      'WHEEL_COMPLETE'
    )
    expect(screen.queryByTestId('action-strip')).not.toBeInTheDocument()
    expect(screen.getByTestId('leg-block')).not.toHaveAttribute('data-action')
  })

  it('shows no TARGET or Expiring-soon flag on a closed card that would otherwise earn both', () => {
    renderCard({
      item: { ...MSFT, dte: 4, status: 'CLOSED' },
      snapshot: optionSnapshot('1.25', '1.35', '1.30')
    })

    expect(screen.getByTestId('position-card-closed')).toBeInTheDocument()
    expect(screen.queryByTestId('target-badge')).not.toBeInTheDocument()
    expect(screen.queryByTestId('expiring-soon-flag')).not.toBeInTheDocument()
  })

  it('keeps the footer', () => {
    renderClosed()

    expect(screen.getByText('Cost basis').parentElement).toHaveTextContent('$236.40')
    expect(screen.getByText('Premium collected').parentElement).toHaveTextContent('$1,240.00')
  })

  it('labels a closed-for-profit CSP "CSP ✓"', () => {
    renderCard({ item: { ...TSLA, phase: 'CSP_CLOSED_PROFIT' } })

    expect(screen.getByTestId('position-card-closed')).toHaveTextContent('CSP ✓')
  })

  it.each([
    ['a CLOSED item with no isClosed', 'position-card-closed', undefined, 'CLOSED'],
    ['a CLOSED item with isClosed', 'position-card-closed', true, 'CLOSED'],
    ['an ACTIVE item with no isClosed', 'position-card', undefined, 'ACTIVE']
  ] as const)('%s renders as %s', (_, testId, isClosed, status) => {
    renderCard({ item: { ...MSFT, status }, isClosed })

    expect(screen.getByTestId(testId)).toHaveTextContent('MSFT')
  })

  it('is not muted while open', () => {
    aaplAt(AAPL_SNAPSHOT)

    expect(screen.getByTestId('position-card')).not.toHaveClass('opacity-50')
  })
})

describe('WheelCard — navigation', () => {
  it('opens the detail page from a click anywhere on the card', () => {
    aaplAt(AAPL_SNAPSHOT)

    fireEvent.click(screen.getByText('+$90.00'))

    expect(window.location.hash).toBe('#/positions/pos-aapl')
  })

  it('opens a closed position too', () => {
    renderCard({ item: TSLA })

    fireEvent.click(screen.getByText('wheel complete'))

    expect(window.location.hash).toBe('#/positions/pos-tsla')
  })
})
