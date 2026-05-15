import { render, screen } from '@testing-library/react'
import { PnlBar } from './PnlBar'

type Pnl = { captured: number; max: number; pct: number }

describe('PnlBar', () => {
  it('renders progressbar role with aria-valuenow', () => {
    const pnl: Pnl = { pct: 35, captured: 122.5, max: 350 }
    render(<PnlBar pnl={pnl} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toBeInTheDocument()
    expect(bar).toHaveAttribute('aria-valuenow', '35')
  })

  it('aria-valuemin is 0 and aria-valuemax is 100', () => {
    const pnl: Pnl = { pct: 35, captured: 122.5, max: 350 }
    render(<PnlBar pnl={pnl} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('renders without crashing when pct is negative', () => {
    const pnl: Pnl = { pct: -10, captured: -35, max: 350 }
    render(<PnlBar pnl={pnl} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toBeInTheDocument()
  })
})
