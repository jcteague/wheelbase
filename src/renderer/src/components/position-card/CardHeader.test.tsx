import { render, screen } from '@testing-library/react'
import { CardHeader } from './CardHeader'

function renderHeader(): void {
  render(
    <CardHeader href="#/positions/pos-aapl" ticker="AAPL" price={<span>$182.45</span>}>
      <span>CSP Open</span>
    </CardHeader>
  )
}

describe('CardHeader', () => {
  it('links the ticker to the position', () => {
    renderHeader()

    const ticker = screen.getByRole('link', { name: 'AAPL' })
    expect(ticker).toHaveAttribute('data-testid', 'position-ticker')
    expect(ticker).toHaveAttribute('href', '#/positions/pos-aapl')
  })

  it('links Open ↗ to the position, titled for the detail page', () => {
    renderHeader()

    const open = screen.getByRole('link', { name: 'Open ↗' })
    expect(open).toHaveAttribute('href', '#/positions/pos-aapl')
    expect(open).toHaveAttribute('title', 'Open the position detail page')
  })

  it('lays out ticker, badges, price, then Open ↗', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: 'AAPL' }).parentElement).toHaveTextContent(
      /^AAPLCSP Open\$182\.45Open ↗$/
    )
  })
})
