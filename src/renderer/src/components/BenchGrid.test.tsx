import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BenchGrid } from './BenchGrid'
import { meets, waiting } from './bench-test-utils'

// [US-96] The grid owns which stock the detail panel is showing. The page hands it a
// ticker the trader clicked, but that ticker can go stale — a removal takes its stock off
// the bench mid-render — so the fallback chain here is what keeps the panel populated
// rather than blank. These tests pin each link of that chain.

const noop = (): void => {}

function renderGrid(
  props: Partial<Parameters<typeof BenchGrid>[0]> = {}
): ReturnType<typeof render> {
  return render(
    <BenchGrid
      bench={{ meets: [meets()], waiting: [waiting({ ticker: 'AAPL' })] }}
      selected={null}
      onSelect={noop}
      onRemove={noop}
      onReview={noop}
      onAdjustCriteria={noop}
      criteriaUnloadable={false}
      screened
      {...props}
    />
  )
}

const section = (title: string): HTMLElement => screen.getByRole('region', { name: title })

describe('BenchGrid', () => {
  it('opens on the bench default when the trader has selected nothing', () => {
    renderGrid()

    expect(screen.getByTestId('bench-detail-ticker')).toHaveTextContent('KO')
  })

  it('shows the stock the trader selected', () => {
    renderGrid({ selected: 'AAPL' })

    expect(screen.getByTestId('bench-detail-ticker')).toHaveTextContent('AAPL')
  })

  // The selected ticker outlives the stock when a removal lands, so falling back to the
  // default is what stops the panel emptying out under the trader mid-read.
  it('falls back to the default when the selected ticker has left the bench', () => {
    renderGrid({ selected: 'GONE' })

    expect(screen.getByTestId('bench-detail-ticker')).toHaveTextContent('KO')
  })

  // Reachable on its own terms even though the page guards it: the panel must not render a
  // detail for a stock that is not there, and neither section may claim a count it lacks.
  it('renders no detail and both empty states for an empty bench', () => {
    renderGrid({ bench: { meets: [], waiting: [] } })

    expect(screen.queryByTestId('bench-detail-ticker')).toBeNull()
    expect(within(section('Meets criteria')).getByTestId('screener-empty')).toBeInTheDocument()
    expect(section('Stocks of interest')).toHaveTextContent(
      'Nothing waiting — every saved stock meets criteria.'
    )
  })

  it('waits for market data instead of blaming the criteria when no screen ran', () => {
    renderGrid({ bench: { meets: [], waiting: [] }, screened: false })

    const meetsSection = section('Meets criteria')
    expect(within(meetsSection).queryByTestId('screener-empty')).toBeNull()
    expect(meetsSection).toHaveTextContent('Waiting for market data')
  })

  it('raises the selected candidate when Review trade is clicked', async () => {
    const onReview = vi.fn()
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    renderGrid({ onReview })

    await user.click(screen.getByTestId('bench-review-KO'))

    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ ticker: 'KO' }))
  })
})
