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

import type { PmccScreenerCandidate } from '../api/pmcc-screener'
import type { Bench, BenchStock } from '../lib/bench'
import { XLF_DIAGONAL } from '../test-fixtures/pmcc-diagonals'
import { BenchGrid } from './BenchGrid'
import { entry, meets, row, waiting } from './bench-test-utils'

// [US-96] The grid owns which stock the detail panel is showing. The page hands it a
// ticker the trader clicked, but that ticker can go stale — a removal takes its stock off
// the bench mid-render — so the fallback chain here is what keeps the panel populated
// rather than blank. These tests pin each link of that chain.

const noop = (): void => {}

type GridProps = Parameters<typeof BenchGrid>[0]

function renderGrid(
  props: Partial<Extract<GridProps, { strategy: 'WHEEL' }>> = {}
): ReturnType<typeof render> {
  return render(
    <BenchGrid
      strategy="WHEEL"
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

  // [US-110] The PMCC lens: the same grid, a diagonal per card, and its own empty copy —
  // the knobs it names are the PMCC sheet's, not the wheel's.
  describe('through the PMCC lens', () => {
    const XLF: BenchStock<PmccScreenerCandidate> = {
      ...meets({ ticker: 'XLF', row: row({ entry: entry({ ticker: 'XLF' }) }) }),
      candidate: XLF_DIAGONAL
    }
    const AMD: BenchStock<PmccScreenerCandidate> = {
      ...waiting({ ticker: 'AMD', reason: 'debit 93.84% of width exceeds 90%' }),
      candidate: null
    }

    function renderPmccGrid(
      bench: Bench<PmccScreenerCandidate>,
      props: Partial<Extract<GridProps, { strategy: 'PMCC' }>> = {}
    ): void {
      render(
        <BenchGrid
          strategy="PMCC"
          bench={bench}
          selected={null}
          onSelect={noop}
          onRemove={noop}
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

    it('names the PMCC knobs to loosen when a screen ran and no diagonal met them', () => {
      renderPmccGrid({ meets: [], waiting: [AMD] })

      const empty = within(section('Meets criteria')).getByTestId('screener-empty')
      expect(empty).toHaveTextContent('No diagonals match your PMCC criteria')
      expect(empty).toHaveTextContent(
        'Every LEAPS and short-call pair on your watchlist was filtered out. Loosen a delta band, a DTE window, or the debit-to-width limit.'
      )
      expect(empty).not.toHaveTextContent('No candidates match your criteria')
      expect(within(empty).getByRole('button', { name: 'Adjust criteria' })).toBeEnabled()
    })

    it('waits for market data instead of blaming the PMCC criteria when no screen ran', () => {
      renderPmccGrid({ meets: [], waiting: [AMD] }, { screened: false })

      const meetsSection = section('Meets criteria')
      expect(within(meetsSection).queryByTestId('screener-empty')).toBeNull()
      expect(meetsSection).toHaveTextContent('Waiting for market data')
    })

    it('summarises each card as a diagonal and titles its rank with the score', () => {
      renderPmccGrid({ meets: [XLF], waiting: [AMD] })

      const card = within(section('Meets criteria')).getByTestId('watchlist-row-XLF')
      expect(within(card).getByTestId('watchlist-contract')).toHaveTextContent(
        '$42.00 LEAPS · $53.00 short Oct 23 · 6.63% on debit'
      )
      expect(within(card).getByTestId('watchlist-rank')).toHaveAttribute('title', '2.38')
    })

    it('opens the detail on the matching diagonal, with no Review trade', () => {
      renderPmccGrid({ meets: [XLF], waiting: [AMD] })

      expect(screen.getByTestId('bench-detail-ticker')).toHaveTextContent('XLF')
      expect(screen.getByTestId('bench-detail-diagonal')).toHaveTextContent('$53.00 CALL')
      expect(screen.queryByRole('button', { name: /Review trade/ })).toBeNull()
    })
  })
})
