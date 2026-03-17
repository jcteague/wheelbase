import { render, screen } from '@testing-library/react'
import { Caption } from './Caption'

describe('Caption', () => {
  it('renders children', () => {
    render(<Caption>Strike</Caption>)
    expect(screen.getByText('Strike')).toBeInTheDocument()
  })

  it('applies uppercase mono caption styles', () => {
    const { container } = render(<Caption>Strike</Caption>)
    const el = container.firstElementChild as HTMLElement
    const style = el.getAttribute('style') ?? ''
    expect(style).toContain('text-transform: uppercase')
    expect(style).toContain('letter-spacing')
    expect(style).toContain('font-size: 0.65rem')
  })

  it('renders with muted color token', () => {
    const { container } = render(<Caption>Strike</Caption>)
    const el = container.firstElementChild as HTMLElement
    const style = el.getAttribute('style') ?? ''
    expect(style).toContain('var(--wb-text-muted)')
  })
})
