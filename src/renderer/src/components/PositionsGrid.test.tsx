import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { EXPIRING, MANAGEMENT_WINDOW } from '../test-fixtures/card-actions'
import {
  AAPL,
  AAPL_QUOTE,
  MSFT,
  NVDA,
  TSLA,
  XYZ,
  optionSnapshot
} from '../test-fixtures/wheel-cards'
import { PositionsGrid } from './PositionsGrid'
import type { PmccCardProps } from './position-card/PmccCard'
import type { WheelCardProps } from './position-card/WheelCard'

vi.mock('./position-card/WheelCard', () => ({
  WheelCard: ({
    item,
    actions,
    isClosed,
    quote,
    session,
    snapshot,
    hasPendingAssignment,
    profitTargetDefault
  }: WheelCardProps) => (
    <div
      data-testid={isClosed ? 'position-card-closed' : 'position-card'}
      data-ticker={item.ticker}
      data-kind="wheel"
      data-session={session}
      data-target={profitTargetDefault}
    >
      <span data-testid={`mock-actions-${item.ticker}`}>
        {actions.length > 0 ? actions.map((a) => a.statusWord).join(' | ') : 'NO_ACTIONS'}
      </span>
      <span data-testid={`mock-quote-${item.ticker}`}>{quote?.price ?? 'NO_QUOTE'}</span>
      <span data-testid={`mock-snapshot-${item.ticker}`}>{snapshot?.mid ?? 'NO_SNAPSHOT'}</span>
      {hasPendingAssignment && <span data-testid={`mock-pending-${item.ticker}`} />}
    </div>
  )
}))

vi.mock('./position-card/PmccCard', () => ({
  PmccCard: (props: PmccCardProps) => (
    <div
      data-testid={props.isClosed ? 'position-card-closed' : 'position-card'}
      data-ticker={props.item.ticker}
      data-kind="pmcc"
      data-target={props.profitTargetDefault}
    >
      {'actions' in props && <span data-testid={`mock-actions-${props.item.ticker}`} />}
      <span data-testid={`mock-snapshots-${props.item.ticker}`}>
        {props.snapshots ? Object.keys(props.snapshots).join(' ') : 'NO_SNAPSHOTS'}
      </span>
      <span data-testid={`mock-quote-${props.item.ticker}`}>
        {props.quote?.price ?? 'NO_QUOTE'}
      </span>
    </div>
  )
}))

function cardSummary(el: HTMLElement): [string | undefined, string | undefined] {
  return [el.dataset.ticker, el.dataset.kind]
}

describe('PositionsGrid', () => {
  it('renders one card per item, in input order, inside a grid', () => {
    render(<PositionsGrid items={[AAPL, XYZ, MSFT, NVDA]} />)

    const cards = screen.getAllByTestId('position-card')
    expect(cards.map(cardSummary)).toEqual([
      ['AAPL', 'wheel'],
      ['XYZ', 'pmcc'],
      ['MSFT', 'wheel'],
      ['NVDA', 'wheel']
    ])
    expect(cards[0].parentElement).toHaveClass('grid')
    expect(cards.every((card) => card.parentElement === cards[0].parentElement)).toBe(true)
  })

  it('renders no table column headers', () => {
    render(<PositionsGrid items={[AAPL, XYZ]} />)

    expect(screen.getAllByTestId('position-card')).toHaveLength(2)
    expect(screen.queryByRole('columnheader')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('passes isClosed to both card kinds', () => {
    render(<PositionsGrid items={[TSLA, { ...XYZ, status: 'CLOSED' }]} isClosed />)

    expect(screen.getAllByTestId('position-card-closed').map(cardSummary)).toEqual([
      ['TSLA', 'wheel'],
      ['XYZ', 'pmcc']
    ])
    expect(screen.queryByTestId('position-card')).toBeNull()
  })

  it('gives each wheel card only its own actions, an empty list when it has none, and the PMCC card none', () => {
    render(
      <PositionsGrid
        items={[AAPL, MSFT, XYZ]}
        actionsByPosition={
          new Map([
            [AAPL.id, [MANAGEMENT_WINDOW]],
            [XYZ.id, [EXPIRING]]
          ])
        }
      />
    )

    expect(screen.getByTestId('mock-actions-AAPL')).toHaveTextContent(/^MANAGEMENT WINDOW$/)
    expect(screen.getByTestId('mock-actions-MSFT')).toHaveTextContent(/^NO_ACTIONS$/)
    expect(screen.getByTestId('mock-quote-XYZ')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-actions-XYZ')).toBeNull()
  })

  it('looks up each card’s quote by ticker, snapshot by OCC symbol and pending flag by id', () => {
    render(
      <PositionsGrid
        items={[AAPL, MSFT, XYZ]}
        quotes={{ AAPL: AAPL_QUOTE, XYZ: { ...AAPL_QUOTE, price: '104.20' } }}
        session="pre"
        // AAPL 2027-09-12 $180 put
        snapshots={{ AAPL270912P00180000: optionSnapshot('1.25', '1.35', '1.30') }}
        pendingPositionIds={new Set([MSFT.id])}
        profitTargetDefault={60}
      />
    )

    expect(screen.getByTestId('mock-quote-AAPL')).toHaveTextContent('182.45')
    expect(screen.getByTestId('mock-quote-MSFT')).toHaveTextContent('NO_QUOTE')
    expect(screen.getByTestId('mock-quote-XYZ')).toHaveTextContent('104.20')
    expect(screen.getByTestId('mock-snapshot-AAPL')).toHaveTextContent('1.30')
    expect(screen.getByTestId('mock-snapshot-MSFT')).toHaveTextContent('NO_SNAPSHOT')
    expect(screen.getByTestId('mock-pending-MSFT')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-pending-AAPL')).toBeNull()
    const aapl = screen.getAllByTestId('position-card')[0]
    expect(aapl).toHaveAttribute('data-session', 'pre')
    expect(aapl).toHaveAttribute('data-target', '60')
  })

  it('withholds snapshots from closed cards', () => {
    render(
      <PositionsGrid
        items={[{ ...AAPL, status: 'CLOSED' }]}
        isClosed
        snapshots={{ AAPL270912P00180000: optionSnapshot('1.25', '1.35', '1.30') }}
      />
    )

    expect(screen.getByTestId('position-card-closed')).toHaveAttribute('data-ticker', 'AAPL')
    expect(screen.getByTestId('mock-snapshot-AAPL')).toHaveTextContent('NO_SNAPSHOT')
  })

  // [US-108] The PMCC card looks up each leg's OCC symbol itself, so it gets the whole map.
  it('hands an active PMCC card the whole snapshot map and the profit-target default', () => {
    render(
      <PositionsGrid
        items={[AAPL, XYZ]}
        snapshots={{
          AAPL270912P00180000: optionSnapshot('1.25', '1.35', '1.30'),
          XYZ280121C00080000: optionSnapshot('25.70', '26.50', '26.10')
        }}
        profitTargetDefault={60}
      />
    )

    expect(screen.getByTestId('mock-snapshots-XYZ')).toHaveTextContent(
      /^AAPL270912P00180000 XYZ280121C00080000$/
    )
    const xyz = screen.getAllByTestId('position-card')[1]
    expect(cardSummary(xyz)).toEqual(['XYZ', 'pmcc'])
    expect(xyz).toHaveAttribute('data-target', '60')
  })

  it('withholds snapshots from a closed PMCC card', () => {
    render(
      <PositionsGrid
        items={[{ ...XYZ, status: 'CLOSED' }]}
        isClosed
        snapshots={{ XYZ280121C00080000: optionSnapshot('25.70', '26.50', '26.10') }}
      />
    )

    expect(cardSummary(screen.getByTestId('position-card-closed'))).toEqual(['XYZ', 'pmcc'])
    expect(screen.getByTestId('mock-snapshots-XYZ')).toHaveTextContent(/^NO_SNAPSHOTS$/)
  })
})
