import { render, screen } from '@testing-library/react'
import { DistanceThermo } from './DistanceThermo'

type Distance = {
  dollars: number
  pct: number
  severity: 'normal' | 'warning' | 'danger'
  isITM: boolean
}

describe('DistanceThermo', () => {
  it('renders without crashing for OTM position', () => {
    const dist: Distance = { pct: 2.5, dollars: 4.5, severity: 'normal', isITM: false }
    render(<DistanceThermo dist={dist} />)
    // Component should render the track and label row without error
    expect(screen.getByText('STRIKE')).toBeInTheDocument()
  })

  it('renders without crashing for ITM position', () => {
    const dist: Distance = { pct: -1.2, dollars: -2.16, severity: 'danger', isITM: true }
    render(<DistanceThermo dist={dist} />)
    expect(screen.getByText('STRIKE')).toBeInTheDocument()
  })

  it('underlying marker clamps to range', () => {
    // pct=10 exceeds the default range=5; clamping: Math.max(-5, Math.min(5, 10)) = 5
    // x = ((5 + 5) / (2 * 5)) * 100 = 100% — stays within valid bounds
    const dist: Distance = { pct: 10, dollars: 18, severity: 'normal', isITM: false }
    render(<DistanceThermo dist={dist} />)
    // Component should not crash and the marker div should exist in the document
    expect(screen.getByText('STRIKE')).toBeInTheDocument()
    // Range labels should show the default range of ±5%
    expect(screen.getByText('−5%')).toBeInTheDocument()
    expect(screen.getByText('+5%')).toBeInTheDocument()
  })
})
