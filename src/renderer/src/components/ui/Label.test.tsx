import { render, screen } from '@testing-library/react'
import { Caption } from './Caption'

describe('Caption', () => {
  it('renders children', () => {
    render(<Caption>Strike</Caption>)
    expect(screen.getByText('Strike')).toBeInTheDocument()
  })

  it('applies uppercase mono caption styles via Tailwind classes', () => {
    const { container } = render(<Caption>Strike</Caption>)
    const el = container.firstElementChild as HTMLElement
    expect(el).toHaveClass('uppercase')
    expect(el).toHaveClass('font-wb-mono')
    expect(el).toHaveClass('text-[0.65rem]')
  })

  it('renders with muted color token via Tailwind class', () => {
    const { container } = render(<Caption>Strike</Caption>)
    const el = container.firstElementChild as HTMLElement
    expect(el).toHaveClass('text-wb-text-muted')
  })
})
