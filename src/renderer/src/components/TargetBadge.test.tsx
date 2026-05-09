import { render, screen } from '@testing-library/react'
import { TargetBadge } from './TargetBadge'

describe('TargetBadge', () => {
  it('renders nothing when targetReached is false', () => {
    render(
      <TargetBadge
        targetReached={false}
        pnlPercent="30.0000"
        maxProfit="350.0000"
        targetPercent={50}
      />
    )

    expect(screen.queryByTestId('target-badge')).toBeNull()
  })

  it('renders TARGET text with gold styling when targetReached is true', () => {
    render(
      <TargetBadge
        targetReached={true}
        pnlPercent="62.8571"
        maxProfit="350.0000"
        targetPercent={50}
      />
    )

    const badge = screen.getByTestId('target-badge')
    expect(badge).toBeInTheDocument()
    expect(badge.textContent).toBe('TARGET')
    expect(badge.className).toContain('bg-wb-gold-dim')
    expect(badge.className).toContain('text-wb-gold')
  })

  it('renders the tooltip text built by formatTargetTooltip', () => {
    render(
      <TargetBadge
        targetReached={true}
        pnlPercent="62.8571"
        maxProfit="350.0000"
        targetPercent={50}
      />
    )

    const badge = screen.getByTestId('target-badge')
    expect(badge.getAttribute('title')).toBe('62.9% of max profit ($350) — target is 50%')
  })

  it('renders gold styling regardless of percent override', () => {
    render(
      <TargetBadge
        targetReached={true}
        pnlPercent="28.5714"
        maxProfit="350.0000"
        targetPercent={25}
      />
    )

    const badge = screen.getByTestId('target-badge')
    expect(badge.className).toContain('bg-wb-gold-dim')
    expect(badge.className).toContain('text-wb-gold')
  })
})
