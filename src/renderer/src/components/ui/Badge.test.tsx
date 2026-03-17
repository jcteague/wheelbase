import { render, screen } from '@testing-library/react'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>42</Badge>)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('applies gold variant styles by default', () => {
    const { container } = render(<Badge>3</Badge>)
    const el = container.firstElementChild as HTMLElement
    const style = el.getAttribute('style') ?? ''
    expect(style).toContain('var(--wb-gold)')
    expect(style).toContain('var(--wb-gold-dim)')
  })

  it('accepts a custom color prop for phase badge use', () => {
    const { container } = render(<Badge color="#58a6ff">CSP</Badge>)
    const el = container.firstElementChild as HTMLElement
    // JSDOM normalizes hex to rgb
    expect(el).toHaveStyle({ color: 'rgb(88, 166, 255)' })
  })

  it('renders as inline element', () => {
    const { container } = render(<Badge>1</Badge>)
    const el = container.firstElementChild as HTMLElement
    expect(el.tagName.toLowerCase()).toBe('span')
  })
})
