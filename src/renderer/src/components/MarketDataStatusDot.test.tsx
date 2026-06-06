import { render, screen } from '@testing-library/react'
import { MarketDataStatusDot } from './MarketDataStatusDot'

it('renders a green Massive dot when configured', () => {
  render(<MarketDataStatusDot massive="configured" />)

  const dot = screen.getByTestId('market-data-status-dot')
  expect(dot).toHaveAttribute('title', 'Massive: connected')
  expect(dot).toHaveClass('text-wb-text-muted')
  expect(screen.getByTestId('market-data-status-dot-indicator')).toHaveClass('bg-wb-green')
})

it('renders a neutral Massive dot when missing', () => {
  render(<MarketDataStatusDot massive="missing" />)

  expect(screen.getByTestId('market-data-status-dot')).toHaveAttribute(
    'title',
    'Massive: not configured'
  )
  expect(screen.getByTestId('market-data-status-dot-indicator')).toHaveClass('bg-wb-text-muted')
})
