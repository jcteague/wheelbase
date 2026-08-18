// [US-70] EarningsBadge — the earnings caution the ranked results table renders
// beneath a ticker. Copy and treatment come from mockups/us-66-screener-results.mdx:285.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ScreenerCandidateEarnings } from '../api/screener'
import { fmtDate } from '../lib/format'
import { EarningsBadge } from './EarningsBadge'

const FLAGGED: ScreenerCandidateEarnings = {
  status: 'flagged',
  date: '2026-07-31',
  daysBeforeExpiry: 21
}

function renderBadge(earnings: ScreenerCandidateEarnings): HTMLElement | null {
  render(<EarningsBadge earnings={earnings} />)
  return screen.queryByTestId('earnings-badge')
}

describe('EarningsBadge — flagged', () => {
  it('renders the warning with the formatted date and the payload’s day count', () => {
    // Derived, not hardcoded, so the expectation holds in any machine's locale —
    // the same technique the IVR observation-label tests use.
    expect(renderBadge(FLAGGED)?.textContent).toBe(
      `⚠ Earnings ${fmtDate('2026-07-31')} · 21d before expiry`
    )
  })

  it('reads daysBeforeExpiry off the payload rather than recomputing it', () => {
    expect(renderBadge({ ...FLAGGED, daysBeforeExpiry: 3 })?.textContent).toContain(
      '3d before expiry'
    )
  })

  it('uses the gold caution treatment — an earnings trade is a judgement call, not an error', () => {
    const badge = renderBadge(FLAGGED)

    expect(badge?.className).toContain('bg-wb-gold-dim')
    expect(badge?.className).toContain('border-wb-gold-border')
    expect(badge?.className).toContain('text-wb-gold')
    expect(badge?.className).not.toContain('wb-red')
  })
})

describe('EarningsBadge — unknown and unavailable', () => {
  it('names an empty calendar "unknown"', () => {
    expect(renderBadge({ status: 'unknown' })?.textContent).toBe('? Earnings date unknown')
  })

  it('names an unreadable calendar "unavailable" — the two are not the same state', () => {
    expect(renderBadge({ status: 'unavailable' })?.textContent).toBe('? Earnings date unavailable')
  })

  it('gives both the same neutral treatment — neither is a risk verdict', () => {
    render(
      <>
        <EarningsBadge earnings={{ status: 'unknown' }} />
        <EarningsBadge earnings={{ status: 'unavailable' }} />
      </>
    )
    const [unknown, unavailable] = screen.getAllByTestId('earnings-badge')

    expect(unknown.className).toBe(unavailable.className)
    expect(unknown.className).toContain('text-wb-text-secondary')
    expect(unknown.className).not.toContain('wb-gold')
  })
})

describe('EarningsBadge — clear', () => {
  it('renders nothing at all', () => {
    expect(renderBadge({ status: 'clear' })).toBeNull()
  })
})

describe('EarningsBadge — pill shape', () => {
  it('is a nowrap mono pill, so it never reflows the ticker cell', () => {
    const badge = renderBadge(FLAGGED)

    expect(badge?.className).toContain('inline-flex')
    expect(badge?.className).toContain('rounded-full')
    expect(badge?.className).toContain('whitespace-nowrap')
    expect(badge?.className).toContain('font-wb-mono')
  })

  it('carries no inline style for colour or spacing', () => {
    expect(renderBadge(FLAGGED)?.getAttribute('style')).toBeNull()
  })
})
