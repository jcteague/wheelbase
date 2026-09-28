import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { IvRank, IvRankAbsence } from '../api/ivr'
import { IvrCell } from './IvrCell'

const BASE: IvRank = {
  value: '38',
  percentile: '71',
  low: '0.1800',
  high: '0.4500',
  observedAt: '2026-08-07T16:00:00.000Z',
  ageTradingDays: 0,
  state: 'fresh'
}

describe('IvrCell', () => {
  it('renders a fresh reading as a bare value', () => {
    render(<IvrCell ivr={{ ivRank: BASE, ivRankAbsence: null }} />)

    expect(screen.getByText('38')).toBeInTheDocument()
    expect(screen.queryByText(/trading day/)).toBeNull()
    expect(screen.getByTestId('ivr-cell')).toHaveAttribute('data-ivr-state', 'fresh')
  })

  it('shows the trading-day age for an aging reading', () => {
    render(
      <IvrCell
        ivr={{ ivRank: { ...BASE, state: 'aging', ageTradingDays: 2 }, ivRankAbsence: null }}
      />
    )

    expect(screen.getByText('38 · 2d')).toBeInTheDocument()
    expect(screen.getByTestId('ivr-cell')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('2 trading days old')
    )
  })

  it('mutes stale values even when the reading remains usable for display', () => {
    render(
      <IvrCell
        ivr={{ ivRank: { ...BASE, state: 'stale', ageTradingDays: 6 }, ivRankAbsence: null }}
      />
    )

    const cell = screen.getByTestId('ivr-cell')
    expect(screen.getByText('38 · 6d')).toBeInTheDocument()
    expect(cell.className).toContain('text-wb-text-muted')
  })

  // [US-96] `exp` distinguishes a reading that aged out from `n/a`, which means the
  // ticker was never collected at all.
  it('renders an expired reading as a muted exp beside an expired ring', () => {
    render(
      <IvrCell
        ivr={{ ivRank: { ...BASE, state: 'expired', ageTradingDays: 12 }, ivRankAbsence: null }}
      />
    )

    const cell = screen.getByTestId('ivr-cell')
    expect(screen.getByText('exp')).toBeInTheDocument()
    expect(cell).toHaveAttribute('data-ivr-state', 'expired')
    expect(cell.className).toContain('text-wb-text-muted')
    expect(screen.getByTestId('freshness-ring')).toHaveAttribute('data-state', 'expired')
  })

  // [US-96] The caption is gone: the gold ring carries "predates earnings" now.
  it('marks readings that predate earnings with the gold ring', () => {
    render(
      <IvrCell
        ivr={{
          ivRank: { ...BASE, state: 'predates_earnings', ageTradingDays: 1 },
          ivRankAbsence: null
        }}
      />
    )

    expect(screen.queryByText('predates earnings')).toBeNull()
    expect(screen.getByTestId('ivr-cell')).toHaveAttribute('data-ivr-state', 'predates_earnings')
    expect(screen.getByTestId('freshness-ring')).toHaveAttribute('data-state', 'predates_earnings')
  })

  it('renders missing readings as muted n/a with no ring', () => {
    render(<IvrCell ivr={{ ivRank: null, ivRankAbsence: { reason: 'not_collected' } }} />)

    expect(screen.getByText('n/a')).toHaveAttribute('data-ivr-state', 'empty')
    expect(screen.queryByTestId('freshness-ring')).toBeNull()
  })

  // [US-121] A flat window withholds the rank, not the reading: the tooltip still carries
  // the range and percentile, which a missing reading has none of.
  it('renders a withheld rank as n/a with its tier and tooltip intact', async () => {
    const user = userEvent.setup()
    render(<IvrCell ivr={{ ivRank: { ...BASE, value: null }, ivRankAbsence: null }} />)

    const cell = screen.getByTestId('ivr-cell')
    expect(cell).toHaveTextContent('n/a')
    expect(cell).toHaveAttribute('data-ivr-state', 'fresh')

    await user.hover(cell)

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('0.1800–0.4500')
    expect(tooltip).toHaveTextContent('IV percentile 71')
  })

  it('gives a missing reading no tooltip, unlike a withheld rank', async () => {
    const user = userEvent.setup()
    render(<IvrCell ivr={{ ivRank: null, ivRankAbsence: { reason: 'not_collected' } }} />)

    const cell = screen.getByText('n/a')
    expect(cell).toHaveAttribute('data-ivr-state', 'empty')
    expect(screen.queryByTestId('ivr-cell')).toBeNull()

    await user.hover(cell)

    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows a pulsing ellipsis while IV history is being computed', async () => {
    const user = userEvent.setup()
    render(<IvrCell ivr={{ ivRank: null, ivRankAbsence: { reason: 'pending' } }} />)

    const cell = screen.getByText('…')
    expect(cell).toHaveAttribute('data-ivr-state', 'pending')
    expect(cell.className).toContain('animate-wb-pulse')
    expect(cell).toHaveAttribute('title', 'Computing IV history')
    expect(screen.queryByTestId('freshness-ring')).toBeNull()

    await user.hover(cell)

    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it.each<[IvRankAbsence, string]>([
    [{ reason: 'not_collected' }, 'No IV rank collected'],
    [{ reason: 'failed' }, 'Last IV history run failed'],
    [{ reason: 'no_market_data' }, 'IV rank needs Alpaca market-data credentials'],
    [
      { reason: 'insufficient_history', coverage: 150, window: 252, required: 200 },
      'IV history covers 150 of the last 252 sessions; rank needs 200'
    ]
  ])('explains a missing reading by its absence reason (%o)', (absence, title) => {
    render(<IvrCell ivr={{ ivRank: null, ivRankAbsence: absence }} />)

    const cell = screen.getByText('n/a')
    expect(cell).toHaveAttribute('data-ivr-state', 'empty')
    expect(cell).toHaveAttribute('data-ivr-reason', absence.reason)
    expect(cell).toHaveAttribute('title', title)
    expect(screen.queryByTestId('freshness-ring')).toBeNull()
  })

  it('renders an integer rank and carries percentile and range in the accessible label', () => {
    render(<IvrCell ivr={{ ivRank: { ...BASE, value: '25' }, ivRankAbsence: null }} />)

    const cell = screen.getByTestId('ivr-cell')
    expect(screen.getByText('25')).toBeInTheDocument()
    expect(cell).toHaveAttribute('aria-label', expect.stringContaining('IV percentile 71'))
    expect(cell).toHaveAttribute(
      'aria-label',
      expect.stringContaining('52-week IV 0.1800 to 0.4500')
    )
  })

  it('formats observation dates in Eastern Time in the accessible label', () => {
    render(
      <IvrCell
        ivr={{ ivRank: { ...BASE, observedAt: '2026-08-08T02:00:00.000Z' }, ivRankAbsence: null }}
      />
    )

    expect(screen.getByTestId('ivr-cell')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Observed Aug 7, 2026')
    )
  })

  it('explains the reading in a tooltip on hover', async () => {
    const user = userEvent.setup()
    render(
      <IvrCell
        ivr={{ ivRank: { ...BASE, state: 'stale', ageTradingDays: 6 }, ivRankAbsence: null }}
      />
    )

    await user.hover(screen.getByTestId('ivr-cell'))

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Stale')
  })

  it('opens the same tooltip for keyboard focus', async () => {
    const user = userEvent.setup()
    render(
      <IvrCell
        ivr={{ ivRank: { ...BASE, state: 'aging', ageTradingDays: 2 }, ivRankAbsence: null }}
      />
    )

    await user.tab()

    expect(screen.getByTestId('ivr-cell')).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Aging')
  })
})
