// [US-67] Criteria summary strip — the clickable strip above the screener results
// that shows what is currently filtering and opens the criteria sheet.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { DEFAULT_SCREENING_CRITERIA } from '../../../main/core/screener'
import type { ScreeningCriteria } from '../api/screening-criteria'
import { fmtCriteriaSummary } from '../lib/screener-format'
import { ScreenerCriteriaStrip } from './ScreenerCriteriaStrip'

describe('ScreenerCriteriaStrip', () => {
  const criteria: ScreeningCriteria = {
    ...DEFAULT_SCREENING_CRITERIA,
    maxUnderlyingPrice: '75',
    minIvRank: '30'
  }

  it('renders one chip per fmtCriteriaSummary entry plus the Edit affordance', () => {
    render(<ScreenerCriteriaStrip criteria={criteria} onClick={vi.fn()} />)

    const expected = fmtCriteriaSummary(criteria)
    expect(expected.length).toBeGreaterThan(0)
    for (const chip of expected) {
      expect(screen.getByText(chip)).toBeInTheDocument()
    }
    expect(screen.getByText('Edit →')).toBeInTheDocument()
  })

  it('calls onClick when the strip is clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ScreenerCriteriaStrip criteria={criteria} onClick={onClick} />)

    await user.click(screen.getByTestId('screener-criteria-strip'))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders the strip as a button so it is keyboard-reachable', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ScreenerCriteriaStrip criteria={criteria} onClick={onClick} />)

    const strip = screen.getByTestId('screener-criteria-strip')
    expect(strip.tagName).toBe('BUTTON')

    await user.tab()
    expect(strip).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
