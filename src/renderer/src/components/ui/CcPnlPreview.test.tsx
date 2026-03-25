import { render, screen } from '@testing-library/react'
import { CcPnlPreview } from './CcPnlPreview'

describe('CcPnlPreview', () => {
  it('renders profit amount and "% of max" label for profit close', () => {
    // pnl = (2.30 - 1.10) × 1 × 100 = +$120.00
    // pct = 1.10 / 2.30 × 100 = 47.8% of max
    render(
      <CcPnlPreview openPremiumPerContract="2.30" closePricePerContract="1.10" contracts={1} />
    )

    expect(screen.getByText(/\+\$120\.00 profit/)).toBeInTheDocument()
    expect(screen.getByText(/47\.8% of max/)).toBeInTheDocument()
  })

  it('renders loss amount and "% above open" label for loss close', () => {
    // pnl = (2.30 - 3.50) × 1 × 100 = -$120.00
    // pct = (3.50 - 2.30) / 2.30 × 100 = 52.2% above open
    render(
      <CcPnlPreview openPremiumPerContract="2.30" closePricePerContract="3.50" contracts={1} />
    )

    expect(screen.getByText(/\u2212\$120\.00 loss|-\$120\.00 loss/)).toBeInTheDocument()
    expect(screen.getByText(/52\.2% above open/)).toBeInTheDocument()
  })

  it('renders break-even text for equal open and close prices', () => {
    render(
      <CcPnlPreview openPremiumPerContract="2.30" closePricePerContract="2.30" contracts={1} />
    )

    expect(screen.getByText(/\$0\.00 break-even/)).toBeInTheDocument()
  })

  it('renders nothing when closePricePerContract is empty string', () => {
    const { container } = render(
      <CcPnlPreview openPremiumPerContract="2.30" closePricePerContract="" contracts={1} />
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when closePricePerContract is "0"', () => {
    const { container } = render(
      <CcPnlPreview openPremiumPerContract="2.30" closePricePerContract="0" contracts={1} />
    )

    expect(container.firstChild).toBeNull()
  })

  it('updates displayed P&L when closePricePerContract prop changes', () => {
    const { rerender } = render(
      <CcPnlPreview openPremiumPerContract="2.30" closePricePerContract="1.10" contracts={1} />
    )

    expect(screen.getByText(/\+\$120\.00 profit/)).toBeInTheDocument()

    rerender(
      <CcPnlPreview openPremiumPerContract="2.30" closePricePerContract="3.50" contracts={1} />
    )

    expect(screen.queryByText(/\+\$120\.00 profit/)).not.toBeInTheDocument()
    expect(screen.getByText(/\u2212\$120\.00 loss|-\$120\.00 loss/)).toBeInTheDocument()
  })
})
