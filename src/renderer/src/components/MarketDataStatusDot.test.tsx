import { render, screen } from '@testing-library/react'
import { MarketDataStatusDot } from './MarketDataStatusDot'

it('renders a green dot when Alpaca market data is configured', () => {
  render(<MarketDataStatusDot marketData="configured" />)

  const dot = screen.getByTestId('market-data-status-dot')
  expect(dot).toHaveAttribute('title', 'Market data: connected via Alpaca')
  expect(dot).toHaveClass('text-wb-text-muted')
  expect(screen.getByTestId('market-data-status-dot-indicator')).toHaveClass('bg-wb-green')
})

it('renders a neutral dot when Alpaca market data is not configured', () => {
  render(<MarketDataStatusDot marketData="missing" />)

  expect(screen.getByTestId('market-data-status-dot')).toHaveAttribute(
    'title',
    'Market data: connect Alpaca in Settings'
  )
  expect(screen.getByTestId('market-data-status-dot-indicator')).toHaveClass('bg-wb-text-muted')
})
