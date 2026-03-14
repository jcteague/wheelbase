import { render, screen } from '@testing-library/react'
import { LoadingState } from './LoadingState'

describe('LoadingState', () => {
  it('renders with role status', () => {
    render(<LoadingState message="Loading positions…" />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows the provided message', () => {
    render(<LoadingState message="Loading positions…" />)

    expect(screen.getByText('Loading positions…')).toBeInTheDocument()
  })

  it('defaults to Loading… when no message is provided', () => {
    render(<LoadingState />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('contains the pulsing dot element', () => {
    render(<LoadingState />)

    const dot = screen.getByRole('status').querySelector('span')

    expect(dot).toBeInTheDocument()
    expect(dot).toHaveStyle({ animation: 'pulse 1.5s ease-in-out infinite' })
  })
})
