import { render, screen } from '@testing-library/react'

import { NavItem } from './NavItem'

describe('NavItem', () => {
  it('renders the label text', () => {
    render(<NavItem href="/new" label="Open Wheel" icon="+" active={false} />)

    expect(screen.getByText('Open Wheel')).toBeInTheDocument()
  })

  it('renders with active styling when active is true', () => {
    render(<NavItem href="/" label="Positions" icon="◈" active />)

    const link = screen.getByRole('link', { name: /positions/i })
    expect(link).toHaveStyle({ color: 'var(--wb-gold)', background: 'var(--wb-gold-dim)' })
  })

  it('renders as a link with the correct href', () => {
    render(<NavItem href="/new" label="Open Wheel" icon="+" active={false} />)

    expect(screen.getByRole('link', { name: /open wheel/i })).toHaveAttribute('href', '#/new')
  })
})
