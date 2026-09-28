import { render, screen } from '@testing-library/react'
import { PriceCell } from './PriceCell'

type StockQuote = {
  price: string
  bid: string
  ask: string
  prevClose: string | null
  volume: number
  timestamp: string
}

describe('PriceCell', () => {
  function renderPriceCell(element: React.ReactElement): ReturnType<typeof render> {
    return render(
      <table>
        <tbody>
          <tr>{element}</tr>
        </tbody>
      </table>
    )
  }

  it('renders price and positive change with green design-system class when up', () => {
    const quote: StockQuote = {
      price: '182.45',
      prevClose: '181.00',
      bid: '182.44',
      ask: '182.46',
      volume: 0,
      timestamp: ''
    }

    renderPriceCell(<PriceCell quote={quote} />)

    expect(screen.getByText('$182.45')).toBeInTheDocument()
    const changeEl = screen.getByText('+$1.45')
    expect(changeEl.className).toContain('text-wb-green')
  })

  it('renders price and negative change with red design-system class when down', () => {
    const quote: StockQuote = {
      price: '418.30',
      prevClose: '420.00',
      bid: '418.29',
      ask: '418.31',
      volume: 0,
      timestamp: ''
    }

    renderPriceCell(<PriceCell quote={quote} />)

    expect(screen.getByText('$418.30')).toBeInTheDocument()
    const changeEl = screen.getByText('-$1.70')
    expect(changeEl.className).toContain('text-wb-red')
  })

  it('renders dash and tooltip when quote is undefined', () => {
    renderPriceCell(<PriceCell quote={undefined} />)

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByTitle('Price unavailable')).toBeInTheDocument()
  })

  it('renders dash and tooltip when prevClose is null and price is null', () => {
    renderPriceCell(<PriceCell quote={undefined} />)

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByTitle('Price unavailable')).toBeInTheDocument()
  })

  it('renders price without change line when prevClose is null but price is set', () => {
    const quote: StockQuote = {
      price: '182.45',
      prevClose: null,
      bid: '182.44',
      ask: '182.46',
      volume: 0,
      timestamp: ''
    }

    renderPriceCell(<PriceCell quote={quote} />)

    expect(screen.getByText('$182.45')).toBeInTheDocument()
    expect(screen.queryByText(/^[+-]\$/)).toBeNull()
  })

  // prevClose is the session *before* the last one — on a weekend, Thursday's close — so
  // the last known price is the latest trade, not prevClose.
  it('renders the latest price, not prevClose, and no change line when session is closed', () => {
    const quote: StockQuote = {
      price: '516.16',
      prevClose: '497.59',
      bid: '516.00',
      ask: '516.30',
      volume: 0,
      timestamp: ''
    }

    renderPriceCell(<PriceCell quote={quote} session="closed" />)

    expect(screen.getByText('$516.16')).toBeInTheDocument()
    expect(screen.queryByText('$497.59')).toBeNull()
    expect(screen.queryByText(/^[+-]\$/)).toBeNull()
  })
})
