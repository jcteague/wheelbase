import { render, screen } from '@testing-library/react'
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
      'title',
      expect.stringContaining('2 trading days old')
    )
  })

  it('mutes stale values even when the reading remains usable for display', () => {
    render(<IvrCell ivRank={{ ...BASE, state: 'stale', ageTradingDays: 6 }} />)

    const cell = screen.getByTestId('ivr-cell')
    expect(screen.getByText('38 · 6d')).toBeInTheDocument()
    expect(cell.className).toContain('text-wb-text-muted')
  })

  it('labels readings that predate earnings', () => {
    render(<IvrCell ivRank={{ ...BASE, state: 'predates_earnings', ageTradingDays: 1 }} />)

    expect(screen.getByText('predates earnings')).toBeInTheDocument()
    expect(screen.getByTestId('ivr-cell')).toHaveAttribute('data-ivr-state', 'predates_earnings')
  })

  it('renders missing readings as muted n/a', () => {
    render(<IvrCell ivRank={null} />)

    expect(screen.getByText('n/a')).toHaveAttribute('data-ivr-state', 'empty')
  })

  it('formats observation dates in Eastern Time in the accessible title', () => {
    render(<IvrCell ivRank={{ ...BASE, observedAt: '2026-08-08T02:00:00.000Z' }} />)

    expect(screen.getByTestId('ivr-cell')).toHaveAttribute(
      'title',
      expect.stringContaining('Observed Aug 7, 2026')
    )
  })
})
