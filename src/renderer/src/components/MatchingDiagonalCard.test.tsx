import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AAPL_DIAGONAL, XLF_DIAGONAL } from '../test-fixtures/pmcc-diagonals'
import { MatchingDiagonalCard } from './MatchingDiagonalCard'

// [US-110] The diagonal the PMCC lens would open on this stock: both legs, then the spread
// metrics, every number the engine's own arithmetic formatted — the renderer recomputes
// nothing. No Review trade: the handoff into the PMCC entry form is US-122.

function metrics(): Record<string, string | null | undefined> {
  const grid = screen.getByTestId('bench-diagonal-metrics')
  return Object.fromEntries(
    Array.from(grid.querySelectorAll('dt')).map((dt) => [
      dt.textContent,
      dt.nextElementSibling?.textContent
    ])
  )
}

describe('MatchingDiagonalCard', () => {
  it('heads the card as the best diagonal for the stock', () => {
    render(<MatchingDiagonalCard candidate={XLF_DIAGONAL} />)

    expect(screen.getByText('Matching diagonal · best score for this stock')).toBeInTheDocument()
    expect(screen.getByTestId('bench-detail-diagonal')).toBeInTheDocument()
  })

  describe('the legs', () => {
    it('tags the LEAPS as the bought leg, with its strike, expiry and quote', () => {
      render(<MatchingDiagonalCard candidate={XLF_DIAGONAL} />)

      const leg = screen.getByTestId('bench-leg-long')
      expect(leg).toHaveTextContent('LEAPS · BUY')
      expect(leg).toHaveTextContent('$42.00 CALL')
      expect(leg).toHaveTextContent('Jan 21, 2028 · 490 DTE')
      expect(leg).toHaveTextContent('mark $10.30 · Δ 0.81 · OI 640 · spread $0.30 (3%)')
    })

    it('tags the short call as the sold leg, with its strike, expiry and quote', () => {
      render(<MatchingDiagonalCard candidate={XLF_DIAGONAL} />)

      const leg = screen.getByTestId('bench-leg-short')
      expect(leg).toHaveTextContent('SHORT · SELL')
      expect(leg).toHaveTextContent('$53.00 CALL')
      expect(leg).toHaveTextContent('Oct 23, 2026 · 35 DTE')
      expect(leg).toHaveTextContent('mark $0.64 · Δ 0.29 · OI 2,140 · spread $0.04 (6%)')
    })

    // Sky is the HOLDING_SHARES colour — the LEAPS stands in for shares; violet is the
    // CC_OPEN colour of the call being sold against them.
    it('tints the LEAPS tag sky and the short tag violet', () => {
      render(<MatchingDiagonalCard candidate={XLF_DIAGONAL} />)

      const leaps = within(screen.getByTestId('bench-leg-long')).getByText('LEAPS · BUY')
      const short = within(screen.getByTestId('bench-leg-short')).getByText('SHORT · SELL')
      expect(leaps.className).toContain('text-wb-sky')
      expect(leaps.className).toContain('bg-wb-sky/10')
      expect(short.className).toContain('text-wb-violet')
      expect(short.className).toContain('bg-wb-violet-dim')
    })
  })

  describe('the spread metrics', () => {
    it('lays out the nine metrics in the order a trader checks them', () => {
      render(<MatchingDiagonalCard candidate={XLF_DIAGONAL} />)

      expect(Object.entries(metrics())).toEqual([
        ['Net debit / share', '$9.66'],
        ['Per spread', '$966.00'],
        ['Strike width', '$11.00'],
        ['Debit / width', '87.82%'],
        ['Cycle yield', '6.63%'],
        ['Annualized', '69.09%/yr'],
        ['Extrinsic in LEAPS', '$1.10'],
        ['Recovered per cycle', '58.18%'],
        ['Short Δ', '0.29']
      ])
    })

    it('groups thousands in the per-spread debit', () => {
      render(<MatchingDiagonalCard candidate={AAPL_DIAGONAL} />)

      expect(metrics()['Per spread']).toBe('$4,345.00')
    })

    it('trims a trailing zero from the debit-to-width ratio', () => {
      render(<MatchingDiagonalCard candidate={AAPL_DIAGONAL} />)

      expect(metrics()['Debit / width']).toBe('86.9%')
    })

    // Extrinsic needs the underlying's price; without one it is unknown, not zero, and the
    // diagonal still ranks — extrinsic is display-only.
    it('shows an em dash in both extrinsic cells when the LEAPS extrinsic is unknown', () => {
      render(
        <MatchingDiagonalCard
          candidate={{ ...XLF_DIAGONAL, longExtrinsic: null, extrinsicCoverage: null }}
        />
      )

      expect(metrics()['Extrinsic in LEAPS']).toBe('—')
      expect(metrics()['Recovered per cycle']).toBe('—')
      expect(metrics()['Net debit / share']).toBe('$9.66')
    })
  })

  it('explains how the debit, the width and the score were computed', () => {
    render(<MatchingDiagonalCard candidate={XLF_DIAGONAL} />)

    expect(
      screen.getByText(
        'Net debit uses marks, before fees. Under 100% of width, the strike width covers the debit if the short call is assigned. Cycle yield = short mark ÷ net debit. Ranked by annualized cycle yield ÷ short Δ: 2.38.'
      )
    ).toBeInTheDocument()
  })

  it('offers no Review trade action', () => {
    render(<MatchingDiagonalCard candidate={XLF_DIAGONAL} />)

    expect(screen.getByTestId('bench-detail-diagonal')).toHaveTextContent('$42.00 CALL')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/Review trade/)).toBeNull()
  })
})
