import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ScreenerExclusion } from '../api/screener'
import { ScreenerExcludedSection } from './ScreenerExcludedSection'

// Fixtures mirror the mockup's EXCLUDED list (mockups/us-66-screener-results.mdx).
const EXCLUSIONS: ScreenerExclusion[] = [
  { ticker: 'TSLA', code: 'spread', reason: 'spread 22% exceeds 10%' },
  { ticker: 'AMD', code: 'delta_band', reason: 'delta 0.42 outside 0.20–0.30' },
  { ticker: 'F', code: 'open_interest', reason: 'open interest 120 below 500' },
  { ticker: 'XYZ', code: 'no_options_listed', reason: 'no options listed' }
]

describe('ScreenerExcludedSection collapsed state', () => {
  it('is collapsed by default with a header button reading the exclusion count', () => {
    render(<ScreenerExcludedSection exclusions={EXCLUSIONS} />)

    const toggle = screen.getByTestId('screener-excluded-toggle')
    expect(toggle).toHaveTextContent('Excluded (4)')
    expect(screen.queryByTestId('screener-excluded-row-TSLA')).not.toBeInTheDocument()
    expect(screen.queryByText('spread 22% exceeds 10%')).not.toBeInTheDocument()
  })
})

describe('ScreenerExcludedSection expanded state', () => {
  it('toggles rows visible on header click, showing ticker and verbatim reason chip', async () => {
    const user = userEvent.setup()
    render(<ScreenerExcludedSection exclusions={EXCLUSIONS} />)

    await user.click(screen.getByTestId('screener-excluded-toggle'))

    const row = screen.getByTestId('screener-excluded-row-TSLA')
    expect(within(row).getByText('TSLA')).toBeInTheDocument()
    const reason = within(row).getByText('spread 22% exceeds 10%')
    expect(reason.className).toContain('bg-wb-red-dim')

    expect(screen.getByTestId('screener-excluded-row-AMD')).toBeInTheDocument()
    expect(screen.getByTestId('screener-excluded-row-F')).toBeInTheDocument()
    expect(screen.getByTestId('screener-excluded-row-XYZ')).toBeInTheDocument()

    await user.click(screen.getByTestId('screener-excluded-toggle'))
    expect(screen.queryByTestId('screener-excluded-row-TSLA')).not.toBeInTheDocument()
  })

  it('renders no rank badge or rank number in excluded rows', async () => {
    const user = userEvent.setup()
    render(<ScreenerExcludedSection exclusions={EXCLUSIONS} />)

    await user.click(screen.getByTestId('screener-excluded-toggle'))

    const row = screen.getByTestId('screener-excluded-row-TSLA')
    expect(row.querySelector('.bg-wb-gold-dim')).toBeNull()
    expect(within(row).queryByText(/^\d+$/)).not.toBeInTheDocument()
  })
})

describe('ScreenerExcludedSection empty state', () => {
  it('renders nothing when exclusions is empty', () => {
    const { container } = render(<ScreenerExcludedSection exclusions={[]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
