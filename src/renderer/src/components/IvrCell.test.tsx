import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ScreenerIvRank } from '../api/screener'
import { IvrCell } from './IvrCell'

const BASE: ScreenerIvRank = {
  value: '38.0',
  observedAt: '2026-08-07T16:00:00.000Z',
  ageTradingDays: 0,
  state: 'fresh'
}

describe('IvrCell', () => {
  it('renders a fresh reading as a bare value', () => {
    render(<IvrCell ivRank={BASE} />)

    expect(screen.getByText('38')).toBeInTheDocument()
    expect(screen.queryByText(/trading day/)).toBeNull()
    expect(screen.getByTestId('ivr-cell')).toHaveAttribute('data-ivr-state', 'fresh')
  })

  it('shows the trading-day age for an aging reading', () => {
    render(<IvrCell ivRank={{ ...BASE, state: 'aging', ageTradingDays: 2 }} />)

    expect(screen.getByText('38 · 2d')).toBeInTheDocument()
    expect(screen.getByTestId('ivr-cell')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('2 trading days old')
    )
  })

  it('mutes stale values even when the reading remains usable for display', () => {
    render(<IvrCell ivRank={{ ...BASE, state: 'stale', ageTradingDays: 6 }} />)

    const cell = screen.getByTestId('ivr-cell')
    expect(screen.getByText('38 · 6d')).toBeInTheDocument()
    expect(cell.className).toContain('text-wb-text-muted')
  })

  // [US-96] `exp` distinguishes a reading that aged out from `n/a`, which means the
  // ticker was never collected at all.
  it('renders an expired reading as a muted exp beside an expired ring', () => {
    render(<IvrCell ivRank={{ ...BASE, state: 'expired', ageTradingDays: 12 }} />)

    const cell = screen.getByTestId('ivr-cell')
    expect(screen.getByText('exp')).toBeInTheDocument()
    expect(cell).toHaveAttribute('data-ivr-state', 'expired')
    expect(cell.className).toContain('text-wb-text-muted')
    expect(screen.getByTestId('freshness-ring')).toHaveAttribute('data-state', 'expired')
  })

  // [US-96] The caption is gone: the gold ring carries "predates earnings" now.
  it('marks readings that predate earnings with the gold ring', () => {
    render(<IvrCell ivRank={{ ...BASE, state: 'predates_earnings', ageTradingDays: 1 }} />)

    expect(screen.queryByText('predates earnings')).toBeNull()
    expect(screen.getByTestId('ivr-cell')).toHaveAttribute('data-ivr-state', 'predates_earnings')
    expect(screen.getByTestId('freshness-ring')).toHaveAttribute('data-state', 'predates_earnings')
  })

  it('renders missing readings as muted n/a with no ring', () => {
    render(<IvrCell ivRank={null} />)

    expect(screen.getByText('n/a')).toHaveAttribute('data-ivr-state', 'empty')
    expect(screen.queryByTestId('freshness-ring')).toBeNull()
  })

  it('formats observation dates in Eastern Time in the accessible label', () => {
    render(<IvrCell ivRank={{ ...BASE, observedAt: '2026-08-08T02:00:00.000Z' }} />)

    expect(screen.getByTestId('ivr-cell')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Observed Aug 7, 2026')
    )
  })

  it('explains the reading in a tooltip on hover', async () => {
    const user = userEvent.setup()
    render(<IvrCell ivRank={{ ...BASE, state: 'stale', ageTradingDays: 6 }} />)

    await user.hover(screen.getByTestId('ivr-cell'))

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Stale')
  })

  it('opens the same tooltip for keyboard focus', async () => {
    const user = userEvent.setup()
    render(<IvrCell ivRank={{ ...BASE, state: 'aging', ageTradingDays: 2 }} />)

    await user.tab()

    expect(screen.getByTestId('ivr-cell')).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Aging')
  })
})
