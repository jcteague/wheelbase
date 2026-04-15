import { render, screen } from '@testing-library/react'
import { ErrorAlert } from './ErrorAlert'

describe('ErrorAlert', () => {
  it('renders with role="alert" and displays the message text', () => {
    render(<ErrorAlert message="Something went wrong." />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
  })

  it('applies error styling via Tailwind classes', () => {
    render(<ErrorAlert message="Styled error" />)

    const el = screen.getByRole('alert')
    expect(el).toHaveClass('bg-wb-red-dim')
    expect(el).toHaveClass('text-wb-red')
    expect(el).toHaveClass('font-wb-mono')
  })

  it('renders children when passed instead of a message prop', () => {
    render(
      <ErrorAlert>
        <span>Inline child content</span>
      </ErrorAlert>
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Inline child content')).toBeInTheDocument()
  })
})
