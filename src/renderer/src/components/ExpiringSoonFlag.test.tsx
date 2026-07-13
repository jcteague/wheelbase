import { render, screen } from '@testing-library/react'
import { ExpiringSoonFlag } from './ExpiringSoonFlag'

it('renders the "Expiring soon" label', () => {
  render(<ExpiringSoonFlag />)
  expect(screen.getByText(/expiring soon/i)).toBeInTheDocument()
})

it('exposes a stable test id', () => {
  render(<ExpiringSoonFlag />)
  expect(screen.getByTestId('expiring-soon-flag')).toBeInTheDocument()
})

it('uses gold design tokens', () => {
  render(<ExpiringSoonFlag />)
  const flag = screen.getByTestId('expiring-soon-flag')
  expect(flag.className).toContain('text-wb-gold')
  expect(flag.className).toContain('bg-wb-gold-dim')
  expect(flag.className).toContain('border-wb-gold-border')
})

it('applies a smaller size in the compact variant', () => {
  render(<ExpiringSoonFlag compact />)
  const flag = screen.getByTestId('expiring-soon-flag')
  expect(screen.getByText(/expiring soon/i)).toBeInTheDocument()
  expect(flag.className).toContain('text-[0.58rem]')
})
