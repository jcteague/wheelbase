import { render, screen } from '@testing-library/react'
import { AlertBox } from './AlertBox'

describe('AlertBox', () => {
  it('renders children', () => {
    render(<AlertBox variant="success">All good</AlertBox>)
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('success variant uses green tokens', () => {
    const { container } = render(<AlertBox variant="success">ok</AlertBox>)
    const el = container.firstElementChild as HTMLElement
    const style = el.getAttribute('style') ?? ''
    expect(style).toContain('var(--wb-green-dim)')
    expect(style).toContain('var(--wb-green)')
  })

  it('error variant uses red tokens', () => {
    const { container } = render(<AlertBox variant="error">err</AlertBox>)
    const el = container.firstElementChild as HTMLElement
    const style = el.getAttribute('style') ?? ''
    expect(style).toContain('var(--wb-red-dim)')
    expect(style).toContain('var(--wb-red)')
  })

  it('warning variant uses gold tokens', () => {
    const { container } = render(<AlertBox variant="warning">warn</AlertBox>)
    const el = container.firstElementChild as HTMLElement
    const style = el.getAttribute('style') ?? ''
    expect(style).toContain('var(--wb-gold-dim)')
    expect(style).toContain('var(--wb-gold)')
  })

  it('info variant uses sky tokens', () => {
    const { container } = render(<AlertBox variant="info">info</AlertBox>)
    const el = container.firstElementChild as HTMLElement
    const style = el.getAttribute('style') ?? ''
    expect(style).toContain('var(--wb-sky-dim)')
    expect(style).toContain('var(--wb-sky)')
  })
})
