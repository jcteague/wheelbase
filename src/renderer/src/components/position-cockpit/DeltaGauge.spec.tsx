import { render, screen } from '@testing-library/react'
import { DeltaGauge } from './DeltaGauge'

describe('DeltaGauge', () => {
  it('renders center delta value to 2dp', () => {
    render(<DeltaGauge absDelta={0.28} color="var(--wb-green)" />)

    expect(screen.getByText('0.28')).toBeInTheDocument()
  })

  it('renders DELTA label without TIGHT suffix when tight=false', () => {
    render(<DeltaGauge absDelta={0.28} color="var(--wb-green)" tight={false} />)

    expect(screen.getByText('DELTA')).toBeInTheDocument()
    expect(screen.queryByText(/TIGHT/)).not.toBeInTheDocument()
  })

  it('renders DELTA · TIGHT when tight=true (DTE ≤ 7)', () => {
    render(<DeltaGauge absDelta={0.28} color="var(--wb-green)" tight={true} />)

    expect(screen.getByText('DELTA · TIGHT')).toBeInTheDocument()
  })

  it('renders two circles (track + fill)', () => {
    const { container } = render(<DeltaGauge absDelta={0.28} color="var(--wb-green)" />)

    const circles = container.querySelectorAll('circle')

    expect(circles).toHaveLength(2)
  })
})
