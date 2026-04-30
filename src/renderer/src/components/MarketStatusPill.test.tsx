import { render, screen } from '@testing-library/react'
import { MarketStatusPill } from './MarketStatusPill'

describe('MarketStatusPill', () => {
  it('renders LIVE label with green design-system classes', () => {
    render(<MarketStatusPill state="LIVE" />)

    expect(screen.getByText('LIVE')).toBeInTheDocument()

    const pill = screen.getByTestId('market-status-pill')
    expect(pill.className).toContain('text-wb-green')
    expect(pill.className).toContain('bg-wb-green/10')

    const dot = screen.getByTestId('market-status-dot')
    expect(dot.className).toContain('bg-wb-green')
  })

  it('renders EXT label with gold design-system classes', () => {
    render(<MarketStatusPill state="EXT" />)

    expect(screen.getByText('EXT')).toBeInTheDocument()

    const pill = screen.getByTestId('market-status-pill')
    expect(pill.className).toContain('text-wb-gold')

    const dot = screen.getByTestId('market-status-dot')
    expect(dot.className).toContain('bg-wb-gold')
  })

  it('renders CLOSED label with muted secondary classes', () => {
    render(<MarketStatusPill state="CLOSED" />)

    expect(screen.getByText('CLOSED')).toBeInTheDocument()

    const pill = screen.getByTestId('market-status-pill')
    expect(pill.className).toContain('text-wb-text-secondary')

    const dot = screen.getByTestId('market-status-dot')
    expect(dot.className).toContain('bg-wb-text-secondary')
  })

  it('renders DELAYED label with gold classes (no pulse)', () => {
    render(<MarketStatusPill state="DELAYED" />)

    expect(screen.getByText('DELAYED')).toBeInTheDocument()

    const dot = screen.getByTestId('market-status-dot')
    expect(dot.className).toContain('bg-wb-gold')
    expect(dot.className).not.toContain('animate-wb-pulse')
  })

  it('applies pulse animation only when state is LIVE', () => {
    const { unmount } = render(<MarketStatusPill state="LIVE" />)
    expect(screen.getByTestId('market-status-dot').className).toContain('animate-wb-pulse')
    unmount()

    render(<MarketStatusPill state="EXT" />)
    expect(screen.getByTestId('market-status-dot').className).not.toContain('animate-wb-pulse')
  })
})
