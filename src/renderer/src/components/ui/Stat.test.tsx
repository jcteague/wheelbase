import { render, screen } from '@testing-library/react'
import { Stat } from './Stat'

describe('Stat', () => {
  it('renders the label text', () => {
    render(<Stat label="Strike" value="245.00" />)
    expect(screen.getByText('Strike')).toBeInTheDocument()
  })

  it('renders the value', () => {
    render(<Stat label="Strike" value="245.00" />)
    expect(screen.getByText('245.00')).toBeInTheDocument()
  })
})
