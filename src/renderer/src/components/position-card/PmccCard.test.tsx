import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StockQuote } from '../../api/market-data'
import type { PmccListItem } from '../../api/positions'
import { XYZ } from '../../test-fixtures/wheel-cards'
import { PmccCard } from './PmccCard'

const SHORT = { strike: '118.0000', expiration: '2027-08-20', dte: 7, contracts: 1 }

const LEAPS_ONLY: PmccListItem = { ...XYZ, pmcc: { ...XYZ.pmcc, short: null } }

const XYZ_QUOTE: StockQuote = {
  price: '104.20',
  bid: '104.15',
  ask: '104.25',
  prevClose: '103.00',
  volume: 0,
  timestamp: '2027-08-13T14:00:00Z'
}

function renderCard(item: PmccListItem = XYZ, isClosed?: boolean): void {
  render(<PmccCard item={item} quote={XYZ_QUOTE} session="regular" isClosed={isClosed} />)
}

function footerCell(label: string): HTMLElement | null {
  return screen.getByText(label).parentElement
}

afterEach(() => {
  window.location.hash = ''
})

describe('PmccCard', () => {
  it('renders a teal PMCC shell with the ticker, PMCC badge and state, and no wheel phase badge', () => {
    renderCard()

    expect(screen.getByTestId('position-card')).toHaveAttribute('data-edge', 'PMCC')
    expect(screen.getByTestId('position-ticker')).toHaveTextContent(/^XYZ$/)
    expect(screen.getByText('PMCC')).toBeInTheDocument()
    expect(screen.getByText('LEAPS + short call open')).toBeInTheDocument()
    expect(screen.queryByText('CSP Open')).not.toBeInTheDocument()
  })

  it('states "No short open", not the two-leg state, between short calls', () => {
    renderCard(LEAPS_ONLY)

    expect(screen.getByText('No short open')).toHaveClass('text-wb-text-muted')
    expect(screen.queryByText('LEAPS + short call open')).not.toBeInTheDocument()
  })

  it('shows the live price with the short call DTE as the next decision', () => {
    renderCard()

    const price = screen.getByTestId('position-card-XYZ-price')
    expect(price).toHaveTextContent('$104.20')
    expect(price).toHaveTextContent('7d to next decision')
  })

  it('falls back to the LEAPS DTE as the next decision when no short call is open', () => {
    renderCard(LEAPS_ONLY)

    expect(screen.getByTestId('position-card-XYZ-price')).toHaveTextContent('161d to next decision')
  })

  it('renders one leg block per open leg, LEAPS first then the short call, each mark —', () => {
    renderCard()

    const [leaps, short, ...rest] = screen.getAllByTestId('leg-block')
    expect(rest).toEqual([])
    expect(leaps).toHaveTextContent(/^L\$80\.00 LEAPS · 2028-01-21161d—$/)
    expect(within(leaps).getByText('L')).toHaveAttribute(
      'title',
      'LEAPS — long call, the synthetic stock'
    )
    expect(short).toHaveTextContent(/^S\$118\.00 call · 2027-08-207d—$/)
    expect(within(short).getByText('S')).toHaveAttribute('title', 'Short call — the income leg')
  })

  it('renders only the LEAPS leg block when no short call is open', () => {
    renderCard(LEAPS_ONLY)

    const blocks = screen.getAllByTestId('leg-block')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toHaveTextContent(/^L\$80\.00 LEAPS · 2028-01-21161d—$/)
  })

  it('shows no valuation: P&L — with "no valuation yet"', () => {
    renderCard()

    expect(screen.getByTestId('position-card-XYZ-pnl')).toHaveTextContent(/^—$/)
    expect(screen.getByText('no valuation yet')).toBeInTheDocument()
  })

  it('carries no action strip, TARGET badge or expiring-soon flag even with the short call at 4 DTE', () => {
    renderCard({ ...XYZ, pmcc: { ...XYZ.pmcc, short: { ...SHORT, dte: 4 } } })

    expect(screen.getByText('4d')).toBeInTheDocument()
    expect(screen.queryByTestId('action-strip')).not.toBeInTheDocument()
    expect(screen.queryByTestId('target-badge')).not.toBeInTheDocument()
    expect(screen.queryByTestId('expiring-soon-flag')).not.toBeInTheDocument()
  })

  it('footer shows the grouped running basis with the per-share basis, and premium collected to date', () => {
    renderCard()

    expect(footerCell('Cost basis')).toHaveTextContent(/^Cost basis\$655\.00\$6\.55 \/ share$/)
    expect(footerCell('Premium collected')).toHaveTextContent(
      /^Premium collected\$1,595\.00to date$/
    )
  })

  it('footer shows a negative running basis signed, not clamped to zero', () => {
    renderCard({
      ...XYZ,
      pmcc: { ...XYZ.pmcc, basisPerShare: '-0.4000', basisTotal: '-40.0000' }
    })

    expect(footerCell('Cost basis')).toHaveTextContent(/^Cost basis-\$40\.00-\$0\.40 \/ share$/)
  })

  it('a closed card is muted with no live price, marks or DTEs, and keeps its footer', () => {
    renderCard(XYZ, true)

    const card = screen.getByTestId('position-card-closed')
    expect(screen.queryByTestId('position-card')).not.toBeInTheDocument()
    expect(card).toHaveClass('opacity-50')
    const price = screen.getByTestId('position-card-XYZ-price')
    expect(price).toHaveTextContent(/^—closed$/)
    expect(price).not.toHaveAttribute('title')
    expect(screen.getByText('closed — no live marks')).toBeInTheDocument()
    const [leaps, short] = screen.getAllByTestId('leg-block')
    expect(leaps).toHaveTextContent(/^L\$80\.00 LEAPS · 2028-01-21——$/)
    expect(short).toHaveTextContent(/^S\$118\.00 call · 2027-08-20——$/)
    expect(footerCell('Cost basis')).toHaveTextContent(/^Cost basis\$655\.00\$6\.55 \/ share$/)
  })

  it.each([
    ['a CLOSED item with no isClosed', 'position-card-closed', undefined, 'CLOSED'],
    ['a CLOSED item with isClosed', 'position-card-closed', true, 'CLOSED'],
    ['an ACTIVE item with no isClosed', 'position-card', undefined, 'ACTIVE']
  ] as const)('%s renders as %s', (_, testId, isClosed, status) => {
    renderCard({ ...XYZ, status }, isClosed)

    expect(screen.getByTestId(testId)).toHaveTextContent('XYZ')
  })

  it('reads an open card with no quote as a dash over "unavailable"', () => {
    render(<PmccCard item={XYZ} session="regular" />)

    const price = screen.getByTestId('position-card-XYZ-price')
    expect(price).toHaveAttribute('title', 'Price unavailable')
    expect(price).toHaveTextContent(/^—unavailable7d to next decision$/)
  })

  it('clicking the card navigates to the position detail', async () => {
    renderCard()

    await userEvent.click(screen.getByTestId('position-card'))

    expect(window.location.hash).toBe('#/positions/pmcc-xyz')
  })

  it('the ticker and Open ↗ link to the position detail', () => {
    renderCard()

    expect(screen.getByTestId('position-ticker')).toHaveAttribute('href', '#/positions/pmcc-xyz')
    expect(screen.getByRole('link', { name: 'Open ↗' })).toHaveAttribute(
      'href',
      '#/positions/pmcc-xyz'
    )
  })

  it('a closed card still opens the position detail from a click on its body', async () => {
    renderCard(XYZ, true)

    await userEvent.click(screen.getByText('closed — no live marks'))

    expect(window.location.hash).toBe('#/positions/pmcc-xyz')
  })
})
