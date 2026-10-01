import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PmccListItem } from '../api/positions'
import { PmccPositionRow } from './PmccPositionRow'
import type { StockQuote } from './PriceCell'

const PMCC_ITEM: PmccListItem = {
  id: 'pmcc-1',
  ticker: 'XYZ',
  phase: 'PMCC_OPEN',
  status: 'ACTIVE',
  strategyType: 'PMCC',
  pmcc: {
    long: { strike: '80.0000', expiration: '2027-09-17', dte: 368, contracts: 1 },
    short: { strike: '110.0000', expiration: '2026-10-16', dte: 32, contracts: 1 },
    initialNetDebit: '2300.0000'
  },
  strike: null,
  expiration: null,
  dte: null,
  instrumentType: null,
  contracts: null,
  entryPremiumPerContract: null,
  premiumCollected: '200.0000',
  effectiveCostBasis: '2300.0000',
  profitTargetPercent: null
}

const XYZ_QUOTE: StockQuote = {
  price: '101.25',
  bid: '101.20',
  ask: '101.30',
  prevClose: '100.00',
  volume: 0,
  timestamp: '2026-09-14T14:00:00Z'
}

function renderRow(item: PmccListItem = PMCC_ITEM, quote?: StockQuote): void {
  render(
    <table>
      <tbody>
        <PmccPositionRow item={item} index={0} quote={quote} />
      </tbody>
    </table>
  )
}

function cells(): HTMLElement[] {
  return screen.getAllByRole('cell')
}

afterEach(() => {
  window.location.hash = ''
})

it('renders a position-card row with the same ten columns as the wheel row', () => {
  renderRow()
  expect(screen.getByTestId('position-card')).toBeInTheDocument()
  expect(cells()).toHaveLength(10)
})

it('ticker cell shows the ticker and a PMCC badge', () => {
  renderRow()
  expect(cells()[0]).toHaveTextContent('XYZ')
  expect(cells()[0]).toHaveTextContent('PMCC')
})

it('phase cell shows "LEAPS + short call open"', () => {
  renderRow()
  expect(cells()[1]).toHaveTextContent('LEAPS + short call open')
})

it('price cell renders the live quote', () => {
  renderRow(PMCC_ITEM, XYZ_QUOTE)
  expect(cells()[2]).toHaveTextContent('$101.25')
  expect(screen.getByTestId('position-card-XYZ-price')).toBeInTheDocument()
})

it('Opt Mid and P&L cells show —', () => {
  renderRow()
  expect(cells()[3]).toHaveTextContent(/^—$/)
  expect(cells()[4]).toHaveTextContent(/^—$/)
})

it('strike cell shows long / short strikes', () => {
  renderRow()
  expect(cells()[5]).toHaveTextContent('$80.00 / $110.00')
})

it('expiration cell labels each leg on its own line', () => {
  renderRow()
  expect(screen.getByText('LEAPS · 2027-09-17')).toBeInTheDocument()
  expect(screen.getByText('Short · 2026-10-16')).toBeInTheDocument()
  expect(cells()[6]).toContainElement(screen.getByText('LEAPS · 2027-09-17'))
})

it('DTE cell shows each leg DTE', () => {
  renderRow()
  expect(screen.getByText('368d')).toBeInTheDocument()
  expect(screen.getByText('32d')).toBeInTheDocument()
  expect(cells()[7]).toContainElement(screen.getByText('32d'))
})

it('premium cell shows the short-call credit', () => {
  renderRow()
  expect(cells()[8]).toHaveTextContent('$200.00')
})

it('cost basis cell shows the grouped initial net debit', () => {
  renderRow()
  expect(cells()[9]).toHaveTextContent('$2,300.00 net debit')
})

it('clicking the row navigates to the position detail', async () => {
  renderRow()
  await userEvent.click(screen.getByTestId('position-card'))
  expect(window.location.hash).toBe('#/positions/pmcc-1')
})

it('renders no target badge and no expiring-soon flag, even with a short call inside 7 DTE', () => {
  renderRow({
    ...PMCC_ITEM,
    pmcc: { ...PMCC_ITEM.pmcc, short: { ...PMCC_ITEM.pmcc.short, dte: 5 } }
  })
  expect(screen.getByText('5d')).toBeInTheDocument()
  expect(screen.queryByTestId('target-badge')).not.toBeInTheDocument()
  expect(screen.queryByTestId('expiring-soon-flag')).not.toBeInTheDocument()
})
