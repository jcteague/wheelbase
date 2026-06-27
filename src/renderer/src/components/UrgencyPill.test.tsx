import { render, screen } from '@testing-library/react'
import { UrgencyPill } from './UrgencyPill'

describe('UrgencyPill', () => {
  it('renders HIGH with red urgency tokens', () => {
    render(<UrgencyPill urgency="high" />)

    const pill = screen.getByText('HIGH')
    expect(pill).toBeInTheDocument()
    expect(pill.className).toContain('text-wb-red')
    expect(pill.className).toContain('bg-wb-red-dim')
  })

  it('renders MED with gold urgency tokens', () => {
    render(<UrgencyPill urgency="medium" />)

    const pill = screen.getByText('MED')
    expect(pill).toBeInTheDocument()
    expect(pill.className).toContain('text-wb-gold')
    expect(pill.className).toContain('bg-wb-gold-dim')
  })

  it('renders LOW with blue urgency tokens', () => {
    render(<UrgencyPill urgency="low" />)

    const pill = screen.getByText('LOW')
    expect(pill).toBeInTheDocument()
    expect(pill.className).toContain('text-wb-blue')
    expect(pill.className).toContain('bg-wb-blue-dim')
  })
})
