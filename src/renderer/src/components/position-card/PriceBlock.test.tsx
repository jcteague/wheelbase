import { render, screen } from '@testing-library/react'
import type { StockQuote } from '../../api/market-data'
import { PriceBlock } from './PriceBlock'

function quote(price: string, prevClose: string | null): StockQuote {
  return { price, prevClose, bid: price, ask: price, volume: 0, timestamp: '' }
}

describe('PriceBlock', () => {
  it('renders the formatted price and the sub line', () => {
    render(<PriceBlock price="182.45" sub="30d to expiration" />)

    expect(screen.getByText('$182.45')).toBeInTheDocument()
    expect(screen.getByText('30d to expiration')).toBeInTheDocument()
  })

  it('reads a missing price on an open card as a dash over "unavailable", titled (US-32)', () => {
    render(<PriceBlock price={null} sub="30d to expiration" testId="position-card-TSLA-price" />)

    const block = screen.getByTestId('position-card-TSLA-price')
    expect(block).toHaveAttribute('title', 'Price unavailable')
    expect([...block.children].map((line) => line.textContent)).toEqual([
      '—',
      'unavailable',
      '30d to expiration'
    ])
  })

  it("reads a closed card's price as a plain dash: not unavailable, and untitled", () => {
    render(<PriceBlock price={null} sub="closed" closed testId="position-card-TSLA-price" />)

    const block = screen.getByTestId('position-card-TSLA-price')
    expect(block).not.toHaveAttribute('title')
    expect([...block.children].map((line) => line.textContent)).toEqual(['—', 'closed'])
  })

  it('gives a present price no unavailable title', () => {
    render(<PriceBlock price="182.45" sub="30d to expiration" testId="position-card-AAPL-price" />)

    expect(screen.getByTestId('position-card-AAPL-price')).not.toHaveAttribute('title')
  })

  it('forwards the test id to the block', () => {
    render(<PriceBlock price="182.45" sub="30d to expiration" testId="position-card-AAPL-price" />)

    expect(screen.getByTestId('position-card-AAPL-price')).toHaveTextContent(
      '$182.4530d to expiration'
    )
  })

  it('shows a green change line when the price is up on the previous close', () => {
    render(
      <PriceBlock
        price="182.45"
        sub="30d to expiration"
        quote={quote('182.45', '181.00')}
        session="regular"
      />
    )

    expect(screen.getByText('+$1.45')).toHaveClass('text-wb-green')
  })

  it('shows a red change line when the price is down on the previous close', () => {
    render(
      <PriceBlock
        price="418.30"
        sub="10d to expiration"
        quote={quote('418.30', '420.00')}
        session="regular"
      />
    )

    expect(screen.getByText('-$1.70')).toHaveClass('text-wb-red')
  })

  it('shows no change line without a previous close', () => {
    render(<PriceBlock price="182.45" sub="30d to expiration" quote={quote('182.45', null)} />)

    expect(screen.getByText('$182.45')).toBeInTheDocument()
    expect(screen.queryByText(/^[+-]\$/)).not.toBeInTheDocument()
  })

  it('shows no change line when the session is closed', () => {
    render(
      <PriceBlock
        price="516.16"
        sub="30d to expiration"
        quote={quote('516.16', '497.59')}
        session="closed"
      />
    )

    expect(screen.getByText('$516.16')).toBeInTheDocument()
    expect(screen.queryByText(/^[+-]\$/)).not.toBeInTheDocument()
  })

  it('shows no change line on a closed card, even with a quote in an open session', () => {
    render(
      <PriceBlock
        price={null}
        sub="closed"
        closed
        quote={quote('182.45', '181.00')}
        session="regular"
      />
    )

    expect(screen.queryByText('+$1.45')).not.toBeInTheDocument()
    expect(screen.getByText('closed')).toBeInTheDocument()
  })
})
