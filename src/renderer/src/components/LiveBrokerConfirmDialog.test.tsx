import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { LiveBrokerConfirmDialog } from './LiveBrokerConfirmDialog'

it('renders the exact LIVE confirmation title, body, bullets, and footer', () => {
  render(
    <LiveBrokerConfirmDialog isOpen openPositionCount={0} onCancel={vi.fn()} onConfirm={vi.fn()} />
  )

  const dialog = screen.getByRole('dialog')
  expect(screen.getByText('Switch to LIVE Alpaca account?')).toBeInTheDocument()
  expect(dialog).toHaveTextContent(
    /from now on, wheelbase will read buying power, cash, and broker activities from your real money alpaca account/i
  )
  expect(screen.getByText('Header changes from amber PAPER to green LIVE')).toBeInTheDocument()
  expect(
    screen.getByText('Buying power, cash, activities — all switch to your live account')
  ).toBeInTheDocument()
  expect(
    screen.getByText(
      'Positions in Wheelbase are not synchronized — your journal entries remain exactly as you recorded them'
    )
  ).toBeInTheDocument()
  expect(
    screen.getByText('Phase 4 order execution will route to live when enabled')
  ).toBeInTheDocument()
  expect(
    screen.getByText('Market data reconnects with your live keys — same Alpaca feeds, same prices.')
  ).toBeInTheDocument()
})

it('confirm button uses the gold primary style, not destructive red', () => {
  render(
    <LiveBrokerConfirmDialog isOpen openPositionCount={0} onCancel={vi.fn()} onConfirm={vi.fn()} />
  )

  const confirm = screen.getByRole('button', { name: /switch to live/i })
  expect(confirm).toHaveClass('bg-wb-gold')
  expect(confirm).not.toHaveClass('bg-wb-red')
})

it('shows the open-position warning when positions exist', () => {
  render(
    <LiveBrokerConfirmDialog isOpen openPositionCount={3} onCancel={vi.fn()} onConfirm={vi.fn()} />
  )

  expect(
    screen.getByText(
      'You have 3 open positions in Wheelbase. Verify each one matches an actual contract in your live Alpaca account before acting on it.'
    )
  ).toBeInTheDocument()
})

it('calls the provided callbacks from Cancel and Switch to LIVE', () => {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  render(
    <LiveBrokerConfirmDialog
      isOpen
      openPositionCount={0}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )

  fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
  fireEvent.click(screen.getByRole('button', { name: /switch to live/i }))

  expect(onCancel).toHaveBeenCalledOnce()
  expect(onConfirm).toHaveBeenCalledOnce()
})
