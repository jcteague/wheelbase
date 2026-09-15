import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// The entry form owns two mutation hooks, so it needs a QueryClient it has no business
// getting from a grid test. This stub stands in for it and reports the props the swap
// hands it — which is all the grid is responsible for.
vi.mock('./WatchlistEntryForm', () => ({
  WatchlistEntryForm: ({
    entry,
    onSaved,
    onCancel
  }: {
    entry?: { ticker: string }
    onSaved?: () => void
    onCancel?: () => void
  }) => (
    <div data-testid="entry-form-stub" data-entry-ticker={entry?.ticker}>
      <button type="button" onClick={onSaved}>
        stub-save
      </button>
      <button type="button" onClick={onCancel}>
        stub-cancel
      </button>
    </div>
  )
}))

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
      editing={null}
      onEdit={noop}
      onEditDone={noop}
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

  // [US-69] The panel is one slot showing one of two things. Which one is derived from
  // `editing === current.ticker` rather than held as a second piece of state, so the two
  // can never disagree about which stock is being edited.
  describe('editing', () => {
    it('shows the read view while nothing is being edited', () => {
      renderGrid()

      expect(screen.getByTestId('bench-detail-ticker')).toHaveTextContent('KO')
      expect(screen.queryByTestId('entry-form-stub')).toBeNull()
    })

    it('swaps the panel for the form, seeded with the selected stock entry', () => {
      renderGrid({ editing: 'KO' })

      const form = screen.getByTestId('entry-form-stub')
      expect(form.getAttribute('data-entry-ticker')).toBe('KO')
      expect(screen.queryByTestId('bench-detail-ticker')).toBeNull()
      expect(screen.getByTestId('bench-detail-panel')).toBeInTheDocument()
    })

    // Leaving the stock leaves the edit: a stale ticker must not open a form over a
    // different stock's panel.
    it('keeps the read view when the edited ticker is not the selected one', () => {
      renderGrid({ editing: 'AAPL', selected: 'KO' })

      expect(screen.getByTestId('bench-detail-ticker')).toHaveTextContent('KO')
      expect(screen.queryByTestId('entry-form-stub')).toBeNull()
    })

    it('raises the current ticker when the detail panel asks to edit', async () => {
      const onEdit = vi.fn()
      const { default: userEvent } = await import('@testing-library/user-event')
      renderGrid({ onEdit })

      await userEvent.setup().click(screen.getByTestId('bench-detail-edit'))

      expect(onEdit).toHaveBeenCalledWith('KO')
    })

    it('closes the edit on both save and cancel', async () => {
      const onEditDone = vi.fn()
      const { default: userEvent } = await import('@testing-library/user-event')
      const user = userEvent.setup()
      renderGrid({ editing: 'KO', onEditDone })

      await user.click(screen.getByText('stub-save'))
      await user.click(screen.getByText('stub-cancel'))

      expect(onEditDone).toHaveBeenCalledTimes(2)
    })
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
