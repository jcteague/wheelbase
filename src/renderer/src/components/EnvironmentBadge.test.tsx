import { render, screen } from '@testing-library/react'
import { EnvironmentBadge } from './EnvironmentBadge'

it('paper renders high-visibility amber PAPER with animate-wb-pulse', () => {
  render(<EnvironmentBadge activeBrokerEnv="paper" />)

  const badge = screen.getByText('PAPER')
  expect(badge).toHaveClass('text-wb-gold')
  expect(badge).toHaveClass('bg-wb-gold-dim')
  expect(screen.getByTestId('environment-badge-dot')).toHaveClass('animate-wb-pulse')
})

it('live renders subtle green LIVE without pulse', () => {
  render(<EnvironmentBadge activeBrokerEnv="live" />)

  const badge = screen.getByText('LIVE')
  expect(badge).toHaveClass('text-wb-green')
  expect(screen.getByTestId('environment-badge-dot')).not.toHaveClass('animate-wb-pulse')
})

it('none renders NO BROKER with neutral styling and tooltip text', () => {
  render(<EnvironmentBadge activeBrokerEnv="none" />)

  const badge = screen.getByText('NO BROKER')
  expect(badge).toHaveAttribute('title', 'Alpaca not configured. Click to set up.')
  expect(badge).toHaveClass('text-wb-text-secondary')
})
