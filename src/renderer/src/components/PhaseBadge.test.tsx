import { render, screen } from '@testing-library/react'
import { PHASE_COLOR } from '../lib/phase'
import { PhaseBadge } from './PhaseBadge'

describe('PhaseBadge', () => {
  it('renders the default phase label for CSP_OPEN as Sell Put', () => {
    render(<PhaseBadge phase="CSP_OPEN" />)

    expect(screen.getByText('Sell Put')).toBeInTheDocument()
  })

  it('renders the short variant label for CSP_OPEN as CSP Open', () => {
    render(<PhaseBadge phase="CSP_OPEN" variant="short" />)

    expect(screen.getByText('CSP Open')).toBeInTheDocument()
  })

  it('applies the phase color from PHASE_COLOR', () => {
    render(<PhaseBadge phase="CSP_OPEN" />)

    expect(screen.getByText('Sell Put').closest('span')).toHaveStyle({
      color: PHASE_COLOR.CSP_OPEN
    })
  })

  it('renders the colored dot indicator', () => {
    render(<PhaseBadge phase="CSP_OPEN" />)

    const badge = screen.getByText('Sell Put').closest('span')
    const dot = badge?.querySelector('span')

    expect(dot).not.toBeNull()
    expect(dot).toHaveStyle({ background: PHASE_COLOR.CSP_OPEN })
  })
})
