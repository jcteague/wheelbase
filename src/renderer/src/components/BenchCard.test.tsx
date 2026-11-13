import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PmccScreenerCandidate } from '../api/pmcc-screener'
import type { BenchStock } from '../lib/bench'
import { XLF_DIAGONAL } from '../test-fixtures/pmcc-diagonals'
import { BenchCard } from './BenchCard'
import { PMCC_CARD_SUMMARY, WHEEL_CARD_SUMMARY } from './bench-card-summary'
import { candidate, entry, meets, none, row, verdict, waiting } from './bench-test-utils'

// [US-96] One watchlist stock as a card on the bench. The card keeps every US-63 e2e
// seam (`watchlist-row-{t}`, `watchlist-ticker`, `watchlist-remove-{t}`) so the older
// watchlist specs keep working on the new surface.

const noop = (): void => {}

const XLF_ROW = row({
  entry: entry({ ticker: 'XLF', notes: 'Broad financial exposure.', ivrTrigger: null }),
  verdict: verdict({ iv: none })
})

describe('BenchCard', () => {
  describe('a stock that meets criteria', () => {
    it('carries the row seam and the meets section marker', () => {
      render(
        <BenchCard
          summary={WHEEL_CARD_SUMMARY}
          stock={meets()}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.getByTestId('watchlist-row-KO')).toHaveAttribute('data-bench-section', 'meets')
    })

    it('shows the screener rank as a pill', () => {
      render(
        <BenchCard
          summary={WHEEL_CARD_SUMMARY}
          stock={meets()}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.getByTestId('watchlist-rank')).toHaveTextContent('#1')
    })

    it('shows the ticker as a link button and the last price', () => {
      render(
        <BenchCard
          summary={WHEEL_CARD_SUMMARY}
          stock={meets()}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.getByTestId('watchlist-ticker')).toHaveTextContent('KO →')
      expect(screen.getByTestId('watchlist-price')).toHaveTextContent('$62.00')
    })

    it('summarises the matching put instead of a waiting reason', () => {
      render(
        <BenchCard
          summary={WHEEL_CARD_SUMMARY}
          stock={meets()}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.getByTestId('watchlist-contract')).toHaveTextContent(
        '$60.00 put · Oct 16 · 1.58% yield'
      )
      expect(screen.queryByTestId('watchlist-reason')).toBeNull()
    })

    it("titles the rank pill with the put's score to two decimals", () => {
      render(
        <BenchCard
          summary={WHEEL_CARD_SUMMARY}
          stock={meets()}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.getByTestId('watchlist-rank')).toHaveAttribute('title', '0.71')
    })

    it("names the trader's own conditions beside the IV reading", () => {
      render(
        <BenchCard
          summary={WHEEL_CARD_SUMMARY}
          stock={meets()}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.getByText('IVR ≥ 40')).toBeInTheDocument()
      expect(screen.getByTestId('ivr-cell')).toBeInTheDocument()
    })

    it('offers the remove action', () => {
      render(
        <BenchCard
          summary={WHEEL_CARD_SUMMARY}
          stock={meets()}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.getByTestId('watchlist-remove-KO')).toBeInTheDocument()
    })

    // [US-70] A demoted candidate gives up its rank number — it would claim a standing
    // among the clean candidates that its earnings tier denies it.
    it('replaces the rank with an em dash and an earnings badge when demoted', () => {
      const demoted = meets({
        candidate: candidate({
          earnings: { status: 'flagged', date: '2026-10-10', daysBeforeExpiry: 6 }
        })
      })
      render(
        <BenchCard
          summary={WHEEL_CARD_SUMMARY}
          stock={demoted}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.getByTestId('watchlist-rank')).toHaveTextContent('—')
      expect(screen.getByTestId('earnings-badge')).toBeInTheDocument()
    })
  })

  describe('a stock still waiting', () => {
    it('carries the waiting section marker and the reason', () => {
      render(
        <BenchCard
          summary={WHEEL_CARD_SUMMARY}
          stock={waiting()}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.getByTestId('watchlist-row-KO')).toHaveAttribute(
        'data-bench-section',
        'waiting'
      )
      expect(screen.getByTestId('watchlist-reason')).toHaveTextContent('IV low')
    })

    // AC 30: an outage must degrade verdicts, not rows — "every card still shows its
    // ticker and thesis". The thesis is the trader's own work and the one thing on the
    // card no provider can take away, so it survives when the price and verdict do not.
    it('keeps the thesis on the card when the verdict is all a provider outage left', () => {
      const outage = waiting({
        reason: 'Data unavailable · not evaluated',
        row: row({ quote: null })
      })
      render(
        <BenchCard
          summary={WHEEL_CARD_SUMMARY}
          stock={outage}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.getByTestId('watchlist-card-thesis')).toHaveTextContent(
        'Core wheel. Comfortable owning through a full cycle.'
      )
      expect(screen.getByTestId('watchlist-price')).toHaveTextContent('—')
      expect(screen.getByTestId('watchlist-reason')).toHaveTextContent(
        'Data unavailable · not evaluated'
      )
    })

    it('says nothing in the thesis slot when the trader wrote none', () => {
      const untheorised = waiting({ row: row({ entry: entry({ notes: null }) }) })
      render(
        <BenchCard
          summary={WHEEL_CARD_SUMMARY}
          stock={untheorised}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.queryByTestId('watchlist-card-thesis')).toBeNull()
    })

    it('shows no rank', () => {
      render(
        <BenchCard
          summary={WHEEL_CARD_SUMMARY}
          stock={waiting()}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.queryByTestId('watchlist-rank')).toBeNull()
    })
  })

  it('shows an em dash when the quote could not be fetched', () => {
    render(
      <BenchCard
        summary={WHEEL_CARD_SUMMARY}
        stock={waiting({ row: row({ quote: null }) })}
        selected={false}
        onSelect={noop}
        onRemove={noop}
      />
    )

    expect(screen.getByTestId('watchlist-price')).toHaveTextContent('—')
  })

  it('raises onSelect with the ticker when the ticker is clicked', async () => {
    const onSelect = vi.fn()
    render(
      <BenchCard
        summary={WHEEL_CARD_SUMMARY}
        stock={meets()}
        selected={false}
        onSelect={onSelect}
        onRemove={noop}
      />
    )

    await userEvent.click(screen.getByTestId('watchlist-ticker'))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('KO')
  })

  // The whole card is the target, not just the ticker: a trader reading a card's reason
  // or its price has already pointed at the stock they mean, and making them travel back
  // to a small link to open it is friction with nothing behind it.
  it.each([
    ['the contract line', 'watchlist-contract'],
    ['the price', 'watchlist-price'],
    ['the rank pill', 'watchlist-rank']
  ])('raises onSelect when %s is clicked', async (_label, testId) => {
    const onSelect = vi.fn()
    render(
      <BenchCard
        summary={WHEEL_CARD_SUMMARY}
        stock={meets()}
        selected={false}
        onSelect={onSelect}
        onRemove={noop}
      />
    )

    await userEvent.click(screen.getByTestId(testId))

    expect(onSelect).toHaveBeenCalledWith('KO')
  })

  it('raises onSelect when the card body itself is clicked', async () => {
    const onSelect = vi.fn()
    render(
      <BenchCard
        summary={WHEEL_CARD_SUMMARY}
        stock={meets()}
        selected={false}
        onSelect={onSelect}
        onRemove={noop}
      />
    )

    await userEvent.click(screen.getByTestId('watchlist-row-KO'))

    expect(onSelect).toHaveBeenCalledWith('KO')
  })

  // Remove is the one control on the card that means something else. Selecting a stock on
  // the way to deleting it would leave the detail panel showing a stock that is gone.
  it('does not select the stock when the remove button is clicked', async () => {
    const onSelect = vi.fn()
    const onRemove = vi.fn()
    render(
      <BenchCard
        summary={WHEEL_CARD_SUMMARY}
        stock={meets()}
        selected={false}
        onSelect={onSelect}
        onRemove={onRemove}
      />
    )

    await userEvent.click(screen.getByTestId('watchlist-remove-KO'))

    expect(onRemove).toHaveBeenCalledWith('KO')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('rings the selected card in gold', () => {
    const { rerender } = render(
      <BenchCard
        summary={WHEEL_CARD_SUMMARY}
        stock={meets()}
        selected={false}
        onSelect={noop}
        onRemove={noop}
      />
    )
    const card = (): HTMLElement =>
      screen.getByTestId('watchlist-row-KO').closest('section') as HTMLElement

    expect(card().className).not.toContain('ring-wb-gold')

    rerender(
      <BenchCard
        summary={WHEEL_CARD_SUMMARY}
        stock={meets()}
        selected
        onSelect={noop}
        onRemove={noop}
      />
    )

    expect(card().className).toContain('ring-1')
    expect(card().className).toContain('ring-wb-gold')
  })

  it('raises onRemove with the ticker when the remove button is clicked', async () => {
    const onRemove = vi.fn()
    const stock = meets({ ticker: 'PEP', row: row({ entry: entry({ ticker: 'PEP' }) }) })
    render(
      <BenchCard
        summary={WHEEL_CARD_SUMMARY}
        stock={stock}
        selected={false}
        onSelect={noop}
        onRemove={onRemove}
      />
    )

    await userEvent.click(screen.getByTestId('watchlist-remove-PEP'))

    expect(onRemove).toHaveBeenCalledWith('PEP')
  })

  // [US-110] The same card through the PMCC lens: a diagonal in place of a put.
  describe('a PMCC diagonal', () => {
    const xlf = (): BenchStock<PmccScreenerCandidate> => ({
      ...meets({ ticker: 'XLF', row: XLF_ROW }),
      candidate: XLF_DIAGONAL
    })

    it('shows the screener rank as the pill and the 2-dp score as its title', () => {
      render(
        <BenchCard
          summary={PMCC_CARD_SUMMARY}
          stock={xlf()}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      const rank = screen.getByTestId('watchlist-rank')
      expect(rank).toHaveTextContent('#1')
      expect(rank).toHaveAttribute('title', '2.38')
    })

    it('summarises the matching diagonal instead of a waiting reason', () => {
      render(
        <BenchCard
          summary={PMCC_CARD_SUMMARY}
          stock={xlf()}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.getByTestId('watchlist-contract')).toHaveTextContent(
        '$42.00 LEAPS · $53.00 short Oct 23 · 6.63% on debit'
      )
      expect(screen.queryByTestId('watchlist-reason')).toBeNull()
    })

    it("shows the engine's exclusion reason while the stock waits", () => {
      const amd: BenchStock<PmccScreenerCandidate> = {
        ...waiting({
          ticker: 'AMD',
          reason: 'debit 93.84% of width exceeds 90%',
          row: row({ entry: entry({ ticker: 'AMD' }) })
        }),
        candidate: null
      }
      render(
        <BenchCard
          summary={PMCC_CARD_SUMMARY}
          stock={amd}
          selected={false}
          onSelect={noop}
          onRemove={noop}
        />
      )

      expect(screen.getByTestId('watchlist-reason')).toHaveTextContent(
        'debit 93.84% of width exceeds 90%'
      )
      expect(screen.queryByTestId('watchlist-contract')).toBeNull()
      expect(screen.queryByTestId('watchlist-rank')).toBeNull()
    })
  })
})
