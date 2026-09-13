import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BenchDetail } from './BenchDetail'
import {
  candidate,
  entry,
  FRESH_IVR,
  KO_QUOTE,
  meets,
  none,
  row,
  unknown,
  unmet,
  verdict,
  waiting
} from './bench-test-utils'

// [US-96] The sticky panel that answers "why is this stock here?" — the thesis, every
// entry condition with its verdict, what the IV reading can and cannot decide, the
// earnings date, and either the matching put or what is holding the stock back.

const noop = (): void => {}

const AAPL_QUOTE = { price: '178.40', prevClose: '176.98', timestamp: KO_QUOTE.timestamp }
const MSFT_QUOTE = { price: '505.10', prevClose: '511.24', timestamp: KO_QUOTE.timestamp }

describe('BenchDetail', () => {
  describe('header', () => {
    it('names the stock in the gold mono treatment', () => {
      render(<BenchDetail stock={meets()} onReview={noop} />)

      const ticker = screen.getByTestId('bench-detail-ticker')
      expect(ticker).toHaveTextContent('KO')
      expect(ticker.className).toContain('font-wb-mono')
      expect(ticker.className).toContain('text-wb-gold')
    })

    it('badges a stock that meets criteria in green and states which verdict it cleared', () => {
      render(
        <BenchDetail stock={meets({ verdictCopy: 'Screening criteria met' })} onReview={noop} />
      )

      const badge = screen.getByText('Meets criteria')
      expect(badge.getAttribute('style')).toContain('var(--wb-green)')
      expect(screen.getByTestId('bench-detail-verdict')).toHaveTextContent('Screening criteria met')
    })

    it('badges a waiting stock as Watching', () => {
      render(<BenchDetail stock={waiting()} onReview={noop} />)

      expect(screen.getByText('Watching')).toBeInTheDocument()
      expect(screen.queryByText('Meets criteria')).toBeNull()
      expect(screen.queryByTestId('bench-detail-verdict')).toBeNull()
    })
  })

  describe('stat grid', () => {
    it('shows the last price', () => {
      render(<BenchDetail stock={meets({ row: row({ quote: AAPL_QUOTE }) })} onReview={noop} />)

      expect(screen.getByText('Last price')).toBeInTheDocument()
      expect(screen.getByTestId('bench-last-price')).toHaveTextContent('$178.40')
    })

    it('shows an em dash for a price that could not be fetched', () => {
      render(<BenchDetail stock={meets({ row: row({ quote: null }) })} onReview={noop} />)

      expect(screen.getByTestId('bench-last-price')).toHaveTextContent('—')
    })

    it('shows an up day in green', () => {
      render(<BenchDetail stock={meets({ row: row({ quote: AAPL_QUOTE }) })} onReview={noop} />)

      const change = screen.getByTestId('bench-day-change')
      expect(change).toHaveTextContent('+0.8%')
      expect(change).toHaveAttribute('data-direction', 'up')
      expect(change.className).toContain('text-wb-green')
    })

    it('shows a down day in red', () => {
      render(<BenchDetail stock={meets({ row: row({ quote: MSFT_QUOTE }) })} onReview={noop} />)

      const change = screen.getByTestId('bench-day-change')
      expect(change).toHaveTextContent('−1.2%')
      expect(change).toHaveAttribute('data-direction', 'down')
      expect(change.className).toContain('text-wb-red')
    })

    it('shows an em dash when there is no previous close to compare against', () => {
      const quote = { ...KO_QUOTE, prevClose: null }
      render(<BenchDetail stock={meets({ row: row({ quote }) })} onReview={noop} />)

      const change = screen.getByTestId('bench-day-change')
      expect(change).toHaveTextContent('—')
      expect(change).not.toHaveAttribute('data-direction')
    })

    it('shows the IV rank reading', () => {
      render(<BenchDetail stock={meets()} onReview={noop} />)

      expect(screen.getByText('IV rank')).toBeInTheDocument()
      expect(screen.getByTestId('ivr-cell')).toBeInTheDocument()
    })
  })

  describe('thesis', () => {
    it('shows the saved note', () => {
      render(<BenchDetail stock={meets()} onReview={noop} />)

      expect(screen.getByText('Your thesis')).toBeInTheDocument()
      expect(screen.getByTestId('bench-detail-thesis')).toHaveTextContent(
        'Core wheel. Comfortable owning through a full cycle.'
      )
    })

    it('says so when no thesis was written', () => {
      const stock = meets({ row: row({ entry: entry({ notes: null }) }) })
      render(<BenchDetail stock={stock} onReview={noop} />)

      expect(screen.getByTestId('bench-detail-thesis')).toHaveTextContent('No thesis yet.')
    })
  })

  describe('entry conditions', () => {
    it('reports an unmet price condition', () => {
      const stock = waiting({
        row: row({
          entry: entry({ ownBelowPrice: '170.0000' }),
          quote: AAPL_QUOTE,
          verdict: verdict({ price: unmet('Price $178.40 above $170 target') })
        })
      })
      render(<BenchDetail stock={stock} onReview={noop} />)

      const gate = screen.getByTestId('bench-gate-price')
      expect(gate).toHaveTextContent('≤ $170 · not met')
      expect(gate).toHaveAttribute('data-verdict', 'unmet')
    })

    it('reports an unmet IV condition', () => {
      const stock = waiting({
        row: row({
          entry: entry({ ivrTrigger: 50 }),
          verdict: verdict({ iv: unmet('IV low') })
        })
      })
      render(<BenchDetail stock={stock} onReview={noop} />)

      const gate = screen.getByTestId('bench-gate-iv')
      expect(gate).toHaveTextContent('IVR ≥ 50 · not met')
      expect(gate).toHaveAttribute('data-verdict', 'unmet')
    })

    it('tints a met IV condition green', () => {
      render(<BenchDetail stock={meets()} onReview={noop} />)

      const gate = screen.getByTestId('bench-gate-iv')
      expect(gate).toHaveTextContent('IVR ≥ 40 · met')
      expect(gate).toHaveAttribute('data-verdict', 'met')
      expect(gate.getAttribute('style')).toContain('var(--wb-green)')
    })

    // An unknown is not a soft failure — it is a refusal to decide, and it reads muted
    // so it can never be mistaken for a condition the stock actually cleared.
    it('mutes a condition no usable reading could judge', () => {
      const stock = waiting({
        row: row({
          entry: entry({ ivrTrigger: 45 }),
          ivRank: { ...FRESH_IVR, state: 'stale', ageTradingDays: 6 },
          verdict: verdict({ iv: unknown('IV too old to judge') })
        })
      })
      render(<BenchDetail stock={stock} onReview={noop} />)

      const gate = screen.getByTestId('bench-gate-iv')
      expect(gate).toHaveTextContent('IVR ≥ 45 · unknown')
      expect(gate).toHaveAttribute('data-verdict', 'unknown')
      expect(gate.getAttribute('style')).toContain('var(--wb-text-muted)')
    })

    it('reports an unmet post-earnings condition', () => {
      const stock = waiting({
        row: row({
          entry: entry({ postEarningsOnly: true }),
          verdict: verdict({ earnings: unmet('Earnings in 3 days') })
        })
      })
      render(<BenchDetail stock={stock} onReview={noop} />)

      const gate = screen.getByTestId('bench-gate-earnings')
      expect(gate).toHaveTextContent('Post-earnings only · not met')
      expect(gate).toHaveAttribute('data-verdict', 'unmet')
    })

    it('omits a condition the trader never set', () => {
      render(<BenchDetail stock={meets()} onReview={noop} />)

      expect(screen.queryByTestId('bench-gate-price')).toBeNull()
      expect(screen.queryByTestId('bench-gate-earnings')).toBeNull()
    })

    it('chips the conditions no gate speaks for', () => {
      const stock = meets({ row: row({ entry: entry({ coreHolding: true }) }) })
      render(<BenchDetail stock={stock} onReview={noop} />)

      const tags = screen.getAllByTestId('watchlist-tag')
      expect(tags.map((tag) => tag.textContent)).toEqual(['core'])
    })

    // A stock with no conditions at all is screened on the defaults alone; saying so is
    // the difference between "nothing to check" and "checks are missing".
    it('says so when the stock has no personal conditions', () => {
      const stock = meets({
        row: row({ entry: entry({ ivrTrigger: null }), verdict: verdict({ iv: none }) })
      })
      render(<BenchDetail stock={stock} onReview={noop} />)

      expect(screen.getByText('No personal conditions')).toBeInTheDocument()
    })
  })

  describe('earnings', () => {
    it('counts down to a report inside the window and cautions', () => {
      const earnings = {
        kind: 'date' as const,
        date: '2026-09-14',
        daysUntil: 5,
        withinWindow: true
      }
      render(<BenchDetail stock={meets({ row: row({ earnings }) })} onReview={noop} />)

      const line = screen.getByTestId('bench-detail-earnings')
      expect(line).toHaveTextContent('Sep 14 · in 5 days')
      expect(line).toHaveAttribute('data-tone', 'caution')
      // The AC asks for the caution *colour*, not just a hook a test can read: a print
      // five days out has to look different on screen from one forty days out.
      expect(line.className).toContain('text-wb-gold')
    })

    it('shows a report outside the window as a plain date', () => {
      render(<BenchDetail stock={meets()} onReview={noop} />)

      const line = screen.getByTestId('bench-detail-earnings')
      expect(line).toHaveTextContent('Nov 3')
      expect(line).not.toHaveAttribute('data-tone')
      expect(line.className).not.toContain('text-wb-gold')
    })

    // A print landing today is the sharpest version of the caution the line exists for,
    // and "in 0 days" would read as a rounding artefact rather than as "this session".
    it('names the day rather than counting to it when the print is today', () => {
      const earnings = {
        kind: 'date' as const,
        date: '2026-09-14',
        daysUntil: 0,
        withinWindow: true
      }
      render(<BenchDetail stock={meets({ row: row({ earnings }) })} onReview={noop} />)

      const line = screen.getByTestId('bench-detail-earnings')
      expect(line).toHaveTextContent('Sep 14 · today')
      expect(line).toHaveAttribute('data-tone', 'caution')
    })

    it('counts a single day in the singular', () => {
      const earnings = {
        kind: 'date' as const,
        date: '2026-09-14',
        daysUntil: 1,
        withinWindow: true
      }
      render(<BenchDetail stock={meets({ row: row({ earnings }) })} onReview={noop} />)

      expect(screen.getByTestId('bench-detail-earnings')).toHaveTextContent('Sep 14 · in 1 day')
    })

    it('asks for verification when the date is unknown', () => {
      const stock = meets({ row: row({ earnings: { kind: 'unknown' } }) })
      render(<BenchDetail stock={stock} onReview={noop} />)

      const line = screen.getByTestId('bench-detail-earnings')
      expect(line).toHaveTextContent('Unknown · needs verification')
      expect(line).toHaveAttribute('data-tone', 'caution')
      expect(line.className).toContain('text-wb-gold')
    })
  })

  describe('reading note', () => {
    it('says nothing about a fresh reading', () => {
      render(<BenchDetail stock={meets()} onReview={noop} />)

      expect(screen.queryByTestId('bench-reading-note')).toBeNull()
    })

    it('says nothing about an aging reading, which still decides conditions', () => {
      const ivRank = { ...FRESH_IVR, state: 'aging' as const, ageTradingDays: 2 }
      render(<BenchDetail stock={meets({ row: row({ ivRank }) })} onReview={noop} />)

      expect(screen.queryByTestId('bench-reading-note')).toBeNull()
    })

    it('explains that a stale reading is shown for context only', () => {
      const ivRank = { ...FRESH_IVR, state: 'stale' as const, ageTradingDays: 6 }
      render(<BenchDetail stock={waiting({ row: row({ ivRank }) })} onReview={noop} />)

      expect(screen.getByTestId('bench-reading-note')).toHaveTextContent(
        'IV rank 58 is 6 trading days old. It is shown for context but is treated as unknown: it cannot satisfy “IVR ≥ 40”. A reading older than one session in steady state means collection has been failing for KO.'
      )
    })

    it('names the condition generically when the trader set no IV trigger', () => {
      const stock = waiting({
        row: row({
          entry: entry({ ivrTrigger: null }),
          ivRank: { ...FRESH_IVR, state: 'stale', ageTradingDays: 6 },
          verdict: verdict({ iv: none })
        })
      })
      render(<BenchDetail stock={stock} onReview={noop} />)

      expect(screen.getByTestId('bench-reading-note')).toHaveTextContent(
        'it cannot satisfy an IV condition'
      )
    })

    it('explains that an expired reading counts as no reading at all', () => {
      const ivRank = { ...FRESH_IVR, state: 'expired' as const, ageTradingDays: 12 }
      render(<BenchDetail stock={waiting({ row: row({ ivRank }) })} onReview={noop} />)

      expect(screen.getByTestId('bench-reading-note')).toHaveTextContent(
        'The last IV rank for KO is 12 trading days old and has expired. It is treated as no reading: it cannot satisfy “IVR ≥ 40” and the IV-rank floor does not apply. Age this old means the collector has been failing for this name — check the snapshot diagnostics.'
      )
    })

    it('explains that a reading taken before a print is unusable at any age', () => {
      const ivRank = { ...FRESH_IVR, state: 'predates_earnings' as const, ageTradingDays: 1 }
      render(<BenchDetail stock={waiting({ row: row({ ivRank }) })} onReview={noop} />)

      expect(screen.getByTestId('bench-reading-note')).toHaveTextContent(
        'IV rank 58 was observed before KO reported earnings. IV re-prices through a print, so this reading is unusable regardless of age and cannot satisfy an IV condition. It will clear after the next collection.'
      )
    })

    it('explains that a ticker was never collected', () => {
      render(<BenchDetail stock={waiting({ row: row({ ivRank: null }) })} onReview={noop} />)

      expect(screen.getByTestId('bench-reading-note')).toHaveTextContent(
        'There is no usable IV rank for KO. Until one exists, an IV condition cannot be judged and this stock cannot reach Meets criteria on it.'
      )
    })
  })

  describe('the matching put', () => {
    it('pins the contract and its metrics', () => {
      render(<BenchDetail stock={meets()} onReview={noop} />)

      const put = screen.getByTestId('bench-detail-put')
      expect(put).toHaveTextContent('$60.00 PUT')
      expect(put).toHaveTextContent('Oct 16 · 37 DTE')

      const metrics = Object.fromEntries(
        Array.from(put.querySelectorAll('dt')).map((dt) => [
          dt.textContent,
          dt.nextElementSibling?.textContent
        ])
      )
      expect(metrics).toEqual({
        'Mark / share': '$0.95',
        'Period yield': '1.58%',
        Annualized: '15.62%/yr',
        Delta: '0.22',
        'Open interest': '1,800',
        Spread: '$0.06 (6%)'
      })
    })

    it('states the cash the trade ties up and how the yield was computed', () => {
      render(<BenchDetail stock={meets()} onReview={noop} />)

      expect(screen.getByTestId('bench-detail-put')).toHaveTextContent(
        'Cash to secure 1 contract: $6000.00. Yield uses mark ÷ strike, before fees.'
      )
    })

    it('hands the candidate to onReview', async () => {
      const onReview = vi.fn()
      const stock = meets()
      render(<BenchDetail stock={stock} onReview={onReview} />)

      await userEvent.click(screen.getByTestId('bench-review-KO'))

      expect(onReview).toHaveBeenCalledWith(stock.candidate)
    })
  })

  describe('a stock still waiting', () => {
    it('warns with the reason and says the stock stays on the watchlist', () => {
      render(<BenchDetail stock={waiting({ reason: 'IV low' })} onReview={noop} />)

      expect(screen.getByTestId('bench-detail-waiting')).toHaveTextContent(
        'IV low. This stock stays on your watchlist while you wait.'
      )
      expect(screen.queryByTestId('bench-detail-put')).toBeNull()
    })

    // The put is real; only the verdict is missing. Hiding it would look like the
    // screener found nothing, which is a different problem with a different fix.
    it('shows the put being held back when the screener ranked one anyway', () => {
      const held = waiting({
        reason: 'IV too old to judge',
        candidate: candidate({ strike: '150.0000', periodYield: '0.0119' })
      })
      render(<BenchDetail stock={held} onReview={noop} />)

      expect(screen.getByTestId('bench-detail-held-back')).toHaveTextContent(
        'A qualifying put exists ($150.00 · Oct 16 · 1.19% yield) but is held back by the entry conditions above.'
      )
    })

    // The line used to hardcode the IV diagnosis, which was wrong for every stock held
    // back by something else — and doubly wrong here, where the IV reading is perfectly
    // usable and simply low. The reason is already stated above it; it must not invent a
    // second, contradicting one.
    it('does not blame the IV reading for a stock held back by its price', () => {
      const held = waiting({
        reason: 'Price $178.40 above $170 target · IV low',
        row: row({
          entry: entry({ ownBelowPrice: '170.0000', ivrTrigger: 50 }),
          quote: AAPL_QUOTE,
          ivRank: FRESH_IVR,
          verdict: verdict({
            price: unmet('Price $178.40 above $170 target'),
            iv: unmet('IV low')
          })
        }),
        candidate: candidate()
      })
      render(<BenchDetail stock={held} onReview={noop} />)

      const line = screen.getByTestId('bench-detail-held-back')
      expect(line).not.toHaveTextContent('until the IV condition can be judged')
      expect(line).not.toHaveTextContent('usable reading')
      expect(line).toHaveTextContent('held back by the entry conditions above')
    })

    it('says nothing about a held-back put when the screener ranked none', () => {
      render(<BenchDetail stock={waiting()} onReview={noop} />)

      expect(screen.queryByTestId('bench-detail-held-back')).toBeNull()
    })
  })
})
