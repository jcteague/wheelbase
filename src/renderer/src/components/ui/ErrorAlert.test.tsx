import { render, screen } from '@testing-library/react'
import { ErrorAlert } from './ErrorAlert'

describe('ErrorAlert', () => {
  it('renders with role="alert" and displays the message text', () => {
    render(<ErrorAlert message="Something went wrong." />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
  })

  it('applies error styling', () => {
    render(<ErrorAlert message="Styled error" />)

    expect(screen.getByRole('alert')).toHaveStyle({
      background: 'var(--wb-red-dim)',
      color: 'var(--wb-red)',
      borderColor: 'rgba(248, 81, 73, 0.25)',
      borderStyle: 'solid',
      borderWidth: '1px'
    })
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
