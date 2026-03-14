import { render, screen } from '@testing-library/react'
import { SectionCard } from './SectionCard'

describe('SectionCard', () => {
  it('renders children content', () => {
    render(
      <SectionCard>
        <div>Body content</div>
      </SectionCard>
    )

    expect(screen.getByText('Body content')).toBeInTheDocument()
  })

  it('renders header text when provided', () => {
    render(
      <SectionCard header="Open Leg">
        <div>Body content</div>
      </SectionCard>
    )

    expect(screen.getByText('Open Leg')).toBeInTheDocument()
  })

  it('omits the header wrapper when header is absent', () => {
    const { container } = render(
      <SectionCard>
        <div>Body content</div>
      </SectionCard>
    )

    const card = container.firstElementChild

    expect(card).not.toBeNull()
    expect(card?.children).toHaveLength(1)
    expect(card?.firstElementChild).toHaveTextContent('Body content')
  })

  it('applies surface background and border styling', () => {
    const { container } = render(
      <SectionCard>
        <div>Body content</div>
      </SectionCard>
    )

    const style = container.firstElementChild?.getAttribute('style') ?? ''

    expect(style).toContain('background: var(--wb-bg-surface);')
    expect(style).toContain('border: 1px solid var(--wb-border);')
    expect(style).toContain('border-radius: 8px;')
    expect(style).toContain('overflow: hidden;')
  })
})
