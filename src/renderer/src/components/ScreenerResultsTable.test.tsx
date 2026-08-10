import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
  earningsFlagged: false,
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
  earningsFlagged: false,
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
  earningsFlagged: false,
  timestamp: '2026-08-07T16:00:02-04:00'
}

const CANDIDATES = [KO, AAPL, MSFT]

describe('ScreenerResultsTable row order and rank badges', () => {
  it('renders rows in the given array order with rank badges 1, 2, 3', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} />)

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

describe('ScreenerResultsTable header row', () => {
  it('shows exactly the mockup column set', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} />)

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
      'Spread'
    ])
  })
})

describe('ScreenerResultsTable cell formatting', () => {
  it('renders the AAPL row cells through the display formatters', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} />)

    const row = screen.getByTestId('screener-row-AAPL')
    expect(within(row).getByText('$180.00')).toBeInTheDocument()
    expect(within(row).getByText('$2.70')).toBeInTheDocument()
    expect(within(row).getByText('1.5%')).toBeInTheDocument()
    expect(within(row).getByText('14.8%/yr')).toBeInTheDocument()
    expect(within(row).getByText('0.28')).toBeInTheDocument()
    expect(within(row).getByText('44')).toBeInTheDocument()
    expect(within(row).getByText('4,200')).toBeInTheDocument()
    expect(within(row).getByText('$0.06 (2%)')).toBeInTheDocument()
    expect(within(row).getByText('37d')).toBeInTheDocument()
  })

  it('carries the formatted score in data-yield-per-delta', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} />)

    const row = screen.getByTestId('screener-row-AAPL')
    expect(row.getAttribute('data-yield-per-delta')).toBe('0.53')
  })

  it('renders n/a in a muted IVR cell when ivRank is null, keeping the rank badge', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} />)

    const row = screen.getByTestId('screener-row-MSFT')
    const ivr = within(row).getByText('n/a')
    expect(ivr).toBeInTheDocument()
    expect(ivr.className).toContain('text-wb-text-muted')
    expect(within(row).getByText('3')).toBeInTheDocument()
  })
})

describe('ScreenerResultsTable visual treatment', () => {
  it('renders yield cells green, the rank badge gold, and the ticker gold mono', () => {
    render(<ScreenerResultsTable candidates={CANDIDATES} />)

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
    render(<ScreenerResultsTable candidates={CANDIDATES} />)

    expect(
      screen.getByText(/Ranked by yield-per-delta — annualized return-if-flat ÷ delta/)
    ).toBeInTheDocument()
  })
})
