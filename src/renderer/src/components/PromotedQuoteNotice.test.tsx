// [US-68] One banner slot, one state. The copy is pinned here because the e2e spec
// asserts the same literals — they are the trader-facing contract of the story's
// "non-blocking banner" ACs.
import { render, screen } from '@testing-library/react'
import { format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { promoteBannerMessage, type PromoteBanner } from '../lib/promote'
import { PromotedQuoteNotice } from './PromotedQuoteNotice'

const QUOTED_AT = '2026-08-07T20:00:02Z'
const QUOTED_TIME = format(parseISO(QUOTED_AT), 'HH:mm:ss')

function renderBanner(banner: PromoteBanner): HTMLElement | null {
  render(<PromotedQuoteNotice banner={banner} />)
  return screen.queryByTestId('promote-banner')
}

describe('PromotedQuoteNotice', () => {
  it('warns in gold that the price moved, naming both marks', () => {
    const banner = renderBanner({ kind: 'moved', promotedMark: '2.70', freshMark: '2.50' })

    expect(banner).toHaveAttribute('data-kind', 'moved')
    expect(banner).toHaveAttribute('data-tone', 'warning')
    expect(banner).toHaveTextContent(
      'Price moved: quoted $2.70 → now $2.50 — review before submitting.'
    )
  })

  it('warns in gold that the quote could not be refreshed, naming the snapshot time', () => {
    const banner = renderBanner({ kind: 'offline', quotedAt: QUOTED_AT })

    expect(banner).toHaveAttribute('data-kind', 'offline')
    expect(banner).toHaveAttribute('data-tone', 'warning')
    expect(banner).toHaveTextContent(
      `Couldn't refresh quote — showing screener snapshot from ${QUOTED_TIME}. Verify before recording.`
    )
  })

  it('warns in gold that a closed-market mark is a stale after-hours snapshot', () => {
    const banner = renderBanner({ kind: 'stale', quotedAt: QUOTED_AT, session: 'CLOSED' })

    expect(banner).toHaveAttribute('data-kind', 'stale')
    expect(banner).toHaveAttribute('data-tone', 'warning')
    expect(banner).toHaveTextContent(
      `Market closed — the pre-filled mark is a stale after-hours snapshot (quoted ${QUOTED_TIME}). Verify before recording.`
    )
  })

  // The pill beside this banner reads EXT, so the copy must not claim the market
  // is closed — equity options simply aren't trading, which is the actual reason
  // the pre-filled mark is stale.
  it('warns in gold without claiming the market is closed during extended hours', () => {
    const banner = renderBanner({ kind: 'stale', quotedAt: QUOTED_AT, session: 'EXT' })

    expect(banner).toHaveAttribute('data-kind', 'stale')
    expect(banner).toHaveAttribute('data-tone', 'warning')
    expect(banner).toHaveTextContent(
      `Extended hours — options aren't trading, so the pre-filled mark is a stale snapshot (quoted ${QUOTED_TIME}). Verify before recording.`
    )
    expect(banner).not.toHaveTextContent('Market closed')
  })

  it('confirms in green that the entered price is what gets recorded', () => {
    const banner = renderBanner({ kind: 'edited', enteredPremium: '2.65', promotedMark: '2.70' })

    expect(banner).toHaveAttribute('data-kind', 'edited')
    expect(banner).toHaveAttribute('data-tone', 'success')
    expect(banner).toHaveTextContent(
      'Recording your entered price ($2.65), not the screener snapshot ($2.70).'
    )
  })

  it('confirms in green when the fresh quote is the promoted mark exactly', () => {
    const banner = renderBanner({
      kind: 'match',
      promotedMark: '2.70',
      freshMark: '2.70'
    })

    expect(banner).toHaveAttribute('data-kind', 'match')
    expect(banner).toHaveAttribute('data-tone', 'success')
    expect(banner).toHaveTextContent('Fresh quote matches the promoted mark — $2.70.')
  })

  it('confirms in green when the fresh quote differs without moving materially', () => {
    const banner = renderBanner({
      kind: 'match',
      promotedMark: '2.70',
      freshMark: '2.68'
    })

    expect(banner).toHaveTextContent(
      'Fresh quote $2.68 — no material move from the promoted $2.70.'
    )
  })

  it('renders nothing while there is no banner state', () => {
    expect(renderBanner({ kind: 'none' })).toBeNull()
  })

  it('renders the gold and green AlertBox tones, not a hand-rolled box', () => {
    const { rerender } = render(
      <PromotedQuoteNotice banner={{ kind: 'moved', promotedMark: '2.70', freshMark: '2.50' }} />
    )
    expect(screen.getByTestId('promote-banner').getAttribute('style')).toContain('wb-gold')

    rerender(
      <PromotedQuoteNotice
        banner={{ kind: 'edited', enteredPremium: '2.65', promotedMark: '2.70' }}
      />
    )
    expect(screen.getByTestId('promote-banner').getAttribute('style')).toContain('wb-green')
  })
})

// The e2e spec asserts these same strings against the running app, so they are
// exported rather than duplicated there.
describe('promoteBannerMessage', () => {
  it('has no message for the empty banner state', () => {
    expect(promoteBannerMessage({ kind: 'none' })).toBeNull()
  })

  it('is the single source of the rendered copy', () => {
    const banner: PromoteBanner = { kind: 'moved', promotedMark: '2.70', freshMark: '2.50' }
    render(<PromotedQuoteNotice banner={banner} />)

    expect(screen.getByTestId('promote-banner')).toHaveTextContent(promoteBannerMessage(banner)!)
  })
})
