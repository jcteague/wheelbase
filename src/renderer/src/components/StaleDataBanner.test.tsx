import { render, screen } from '@testing-library/react'
import { StaleDataBanner } from './StaleDataBanner'

describe('StaleDataBanner', () => {
  it('renders nothing when not stale', () => {
    const { container } = render(<StaleDataBanner stale={false} minutesAgo={0} />)

    expect(container.firstChild).toBeNull()
  })

  it('renders banner with minutesAgo when stale', () => {
    render(<StaleDataBanner stale={true} minutesAgo={6} />)

    expect(screen.getByText('Prices may be delayed — last updated 6m ago')).toBeInTheDocument()
    expect(screen.getByTestId('stale-data-banner')).toBeInTheDocument()
  })

  it('applies gold design-system classes when stale', () => {
    render(<StaleDataBanner stale={true} minutesAgo={6} />)

    const banner = screen.getByTestId('stale-data-banner')
    expect(banner.className).toContain('text-wb-gold')
    expect(banner.className).toContain('bg-wb-gold/10')
    expect(banner.className).toContain('border-wb-gold/30')
  })
})
