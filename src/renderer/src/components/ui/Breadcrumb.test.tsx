import { render, screen } from '@testing-library/react'
import { Breadcrumb } from './Breadcrumb'

describe('Breadcrumb', () => {
  it('renders the back link with backLabel', () => {
    render(<Breadcrumb backTo="#/" backLabel="Positions" current="TSLA" />)
    const link = screen.getByRole('link', { name: /positions/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '#/')
  })

  it('renders the current page name', () => {
    render(<Breadcrumb backTo="#/" backLabel="Positions" current="TSLA" />)
    expect(screen.getByText('TSLA')).toBeInTheDocument()
  })

  it('renders a slash separator between back link and current', () => {
    render(<Breadcrumb backTo="#/" backLabel="Positions" current="TSLA" />)
    expect(screen.getByText('/')).toBeInTheDocument()
  })
})
