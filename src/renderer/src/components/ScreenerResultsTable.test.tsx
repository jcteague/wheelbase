import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { format, parseISO } from 'date-fns'
import type { ScreenerCandidate } from '../api/screener'
import { ScreenerResultsTable } from './ScreenerResultsTable'

// Fixtures mirror the mockup's KO/AAPL/MSFT candidates
// (mockups/us-66-screener-results.mdx CANDIDATES).
const KO: ScreenerCandidate = {
  ticker: 'KO',
  contractId: 'KO260821P00060000',
  strike: '60.0000',
  expiration: '2026-08-21',
  dte: 37,
  bid: '0.92',
  ask: '0.98',
  mark: '0.95',
  spreadAbsolute: '0.06',
  spreadPercent: '6.32',
  delta: '0.2200',
  openInterest: 1800,
  volume: null,
  ivRank: { value: '38.0', observedAt: '2026-08-07T16:00:02-04:00' },
  capitalSecured: '6000.00',
  periodYield: '0.0158',
  annualizedYield: '0.1560',
  yieldPerDelta: '0.7100',
  earnings: { status: 'clear' },
  timestamp: '2026-08-07T16:00:02-04:00'
}

const AAPL: ScreenerCandidate = {
  ticker: 'AAPL',
  contractId: 'AAPL260821P00180000',
  strike: '180.0000',
  expiration: '2026-08-21',
  dte: 37,
  bid: '2.67',
  ask: '2.73',
  mark: '2.70',
  spreadAbsolute: '0.06',
  spreadPercent: '2.22',
  delta: '0.2800',
  openInterest: 4200,
  volume: null,
  ivRank: { value: '44.0', observedAt: '2026-08-07T16:00:02-04:00' },
  capitalSecured: '18000.00',
  periodYield: '0.0150',
  annualizedYield: '0.1480',
  yieldPerDelta: '0.5286',
  earnings: { status: 'clear' },
  timestamp: '2026-08-07T16:00:02-04:00'
}

const MSFT: ScreenerCandidate = {
  ticker: 'MSFT',
  contractId: 'MSFT260828P00410000',
  strike: '410.0000',
  expiration: '2026-08-28',
  dte: 44,
  bid: '6.05',
  ask: '6.35',
  mark: '6.20',
  spreadAbsolute: '0.30',
  spreadPercent: '4.84',
  delta: '0.2500',
  openInterest: 2600,
  volume: null,
  ivRank: null,
  capitalSecured: '41000.00',
  periodYield: '0.0151',
  annualizedYield: '0.1250',
  yieldPerDelta: '0.5018',
  earnings: { status: 'clear' },
  timestamp: '2026-08-07T16:00:02-04:00'
}

const CANDIDATES = [KO, AAPL, MSFT]

describe('ScreenerResultsTable row order and rank badges', () => {
  it('renders rows in the given array order with rank badges 1, 2, 3', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} onPromote={vi.fn()} />)

    const rows = screen.getAllByTestId(/^screener-row-/)
    expect(rows).toHaveLength(3)
    expect(rows[0].getAttribute('data-testid')).toBe('screener-row-KO')
    expect(rows[1].getAttribute('data-testid')).toBe('screener-row-AAPL')
    expect(rows[2].getAttribute('data-testid')).toBe('screener-row-MSFT')

    expect(within(rows[0]).getByText('1')).toBeInTheDocument()
    expect(within(rows[1]).getByText('2')).toBeInTheDocument()
    expect(within(rows[2]).getByText('3')).toBeInTheDocument()
  })
})

// [US-70] A candidate whose earnings verdict is anything but `clear` is demoted, so it
// carries a caution badge and gives up its rank number — matching the mockup's
// `rank: null` rows. The table itself still never re-sorts.
describe('ScreenerResultsTable earnings badges', () => {
  const FLAGGED: ScreenerCandidate = {
    ...AAPL,
    earnings: { status: 'flagged', date: '2026-07-31', daysBeforeExpiry: 21 }
  }
  const UNKNOWN: ScreenerCandidate = { ...AAPL, earnings: { status: 'unknown' } }
  const UNAVAILABLE: ScreenerCandidate = { ...AAPL, earnings: { status: 'unavailable' } }

  function rowFor(candidate: ScreenerCandidate): HTMLElement {
    render(<ScreenerResultsTable candidates={[candidate]} onPromote={vi.fn()} />)
    return screen.getByTestId(`screener-row-${candidate.ticker}`)
  }

  it('shows the numeric rank and no badge on a clear row', () => {
    const row = rowFor(KO)

    expect(within(row).getByText('1')).toBeInTheDocument()
    expect(within(row).queryByTestId('earnings-badge')).toBeNull()
  })

  it('replaces the rank with an em dash on a flagged row', () => {
    const row = rowFor(FLAGGED)

    expect(within(row).queryByText('1')).toBeNull()
    expect(within(row).getByText('—')).toBeInTheDocument()
  })

  it('replaces the rank with an em dash on an unknown row', () => {
    expect(within(rowFor(UNKNOWN)).getByText('—')).toBeInTheDocument()
  })

  it('replaces the rank with an em dash on an unavailable row', () => {
    expect(within(rowFor(UNAVAILABLE)).getByText('—')).toBeInTheDocument()
  })

  it('renders the flagged warning copy', () => {
    expect(within(rowFor(FLAGGED)).getByTestId('earnings-badge').textContent).toContain(
      '21d before expiry'
    )
  })

  it('renders the unknown caution copy', () => {
    expect(within(rowFor(UNKNOWN)).getByTestId('earnings-badge').textContent).toBe(
      '? Earnings date unknown'
    )
  })

  it('renders the unavailable caution copy', () => {
    expect(within(rowFor(UNAVAILABLE)).getByTestId('earnings-badge').textContent).toBe(
      '? Earnings date unavailable'
    )
  })

  it('puts the badge in the ticker cell, not a column of its own', () => {
    const row = rowFor(FLAGGED)
    const cells = within(row).getAllByRole('cell')
    const tickerCell = cells.find((cell) => cell.textContent?.includes('AAPL'))

    expect(tickerCell).toBeDefined()
    expect(within(tickerCell!).getByTestId('earnings-badge')).toBeInTheDocument()
    // The badge adds no column — the header set US-66 pinned is unchanged.
    expect(cells).toHaveLength(13)
  })

  it('renders rows in the order given, never re-sorting a demoted row upward', () => {
    const demotedFirst: ScreenerCandidate[] = [
      FLAGGED,
      KO,
      { ...MSFT, earnings: { status: 'unknown' } }
    ]
    render(<ScreenerResultsTable candidates={demotedFirst} onPromote={vi.fn()} />)

    expect(
      screen.getAllByTestId(/^screener-row-/).map((row) => row.getAttribute('data-testid'))
    ).toEqual(['screener-row-AAPL', 'screener-row-KO', 'screener-row-MSFT'])
  })

  it('keeps the score reachable on a demoted row rather than dropping it with the rank pill', () => {
    expect(rowFor(FLAGGED).getAttribute('data-yield-per-delta')).toBe('0.53')
  })
})

describe('ScreenerResultsTable header row', () => {
  it('shows exactly the mockup column set', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} onPromote={vi.fn()} />)

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual([
      '#',
      'Ticker',
      'Strike',
      'Exp',
      'DTE',
      'Mark',
      'Yield',
      'Ann.',
      'Δ',
      'IVR',
      'OI',
      'Spread',
      // [US-68] The promote action's column; unlabelled, and appended last so the
      // metric columns keep the positions US-66 pinned.
      ''
    ])
  })
})

describe('ScreenerResultsTable cell formatting', () => {
  it('renders the AAPL row cells through the display formatters', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} onPromote={vi.fn()} />)

    const row = screen.getByTestId('screener-row-AAPL')
    expect(within(row).getByText('$180.00')).toBeInTheDocument()
    expect(within(row).getByText('$2.70')).toBeInTheDocument()
    expect(within(row).getByText('1.5%')).toBeInTheDocument()
    expect(within(row).getByText('14.8%/yr')).toBeInTheDocument()
    expect(within(row).getByText('0.28')).toBeInTheDocument()
    // [US-67] The IVR cell carries the observation date, since the floor can now
    // exclude on this reading and a stale one must not look current.
    const observed = format(parseISO('2026-08-07T16:00:02-04:00'), 'MMM d')
    expect(within(row).getByText(`44 (${observed})`)).toBeInTheDocument()
    expect(within(row).getByText('4,200')).toBeInTheDocument()
    expect(within(row).getByText('$0.06 (2%)')).toBeInTheDocument()
    expect(within(row).getByText('37d')).toBeInTheDocument()
  })

  it('carries the formatted score in data-yield-per-delta', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} onPromote={vi.fn()} />)

    const row = screen.getByTestId('screener-row-AAPL')
    expect(row.getAttribute('data-yield-per-delta')).toBe('0.53')
  })

  it('renders n/a in a muted IVR cell when ivRank is null, keeping the rank badge', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} onPromote={vi.fn()} />)

    const row = screen.getByTestId('screener-row-MSFT')
    const ivr = within(row).getByText('n/a')
    expect(ivr).toBeInTheDocument()
    expect(ivr.className).toContain('text-wb-text-muted')
    expect(within(row).getByText('3')).toBeInTheDocument()
  })
})

describe('ScreenerResultsTable visual treatment', () => {
  it('renders yield cells green, the rank badge gold, and the ticker gold mono', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} onPromote={vi.fn()} />)

    const row = screen.getByTestId('screener-row-AAPL')
    expect(within(row).getByText('1.5%').className).toContain('text-wb-green')
    expect(within(row).getByText('14.8%/yr').className).toContain('text-wb-green')

    const badge = within(row).getByText('2')
    expect(badge.className).toContain('bg-wb-gold-dim')
    expect(badge.className).toContain('text-wb-gold')

    const ticker = within(row).getByText('AAPL')
    expect(ticker.className).toContain('text-wb-gold')
    expect(ticker.className).toContain('font-bold')
  })
})

describe('ScreenerResultsTable score legend', () => {
  it('renders a legend below the table naming yield-per-delta', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} onPromote={vi.fn()} />)

    expect(
      screen.getByText(/Ranked by yield-per-delta — annualized return-if-flat ÷ delta/)
    ).toBeInTheDocument()
  })
})

// [US-68] The promote entry point. The table stays presentation-only — it raises
// the candidate and the page owns the navigation, matching the split US-66 set.
describe('ScreenerResultsTable promote action', () => {
  const DATA_COLUMN_COUNT = 12

  it('offers a promote action on every ranked row', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} onPromote={vi.fn()} />)

    expect(screen.getByTestId('screener-promote-KO')).toBeInTheDocument()
    expect(screen.getByTestId('screener-promote-AAPL')).toBeInTheDocument()
    expect(screen.getByTestId('screener-promote-MSFT')).toBeInTheDocument()
  })

  it('labels the action so it is reachable by name', () => {
    render(<ScreenerResultsTable candidates={[AAPL]} onPromote={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Promote to trade' })).toBe(
      screen.getByTestId('screener-promote-AAPL')
    )
  })

  it('raises the clicked row’s full candidate rather than navigating itself', async () => {
    const user = userEvent.setup()
    const onPromote = vi.fn()
    render(<ScreenerResultsTable candidates={CANDIDATES} onPromote={onPromote} />)

    await user.click(screen.getByTestId('screener-promote-AAPL'))

    expect(onPromote).toHaveBeenCalledTimes(1)
    expect(onPromote).toHaveBeenCalledWith(AAPL)
  })

  it('appends the action as the last cell, leaving the metric cells in place', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} onPromote={vi.fn()} />)

    const row = screen.getByTestId('screener-row-AAPL')
    const cells = within(row).getAllByRole('cell')
    expect(cells).toHaveLength(DATA_COLUMN_COUNT + 1)
    // Rank chip still first; the promote button lives only in the trailing cell.
    expect(cells[0]).toHaveTextContent('2')
    expect(cells[DATA_COLUMN_COUNT]).toContainElement(screen.getByTestId('screener-promote-AAPL'))
  })

  it('wears the gold action treatment the criteria entry point uses', () => {
    render(<ScreenerResultsTable candidates={[AAPL]} onPromote={vi.fn()} />)

    const button = screen.getByTestId('screener-promote-AAPL')
    expect(button.className).toContain('border-wb-gold-border')
    expect(button.className).toContain('text-wb-gold')
  })
})
