// [US-68] The consuming half of the promote-navigation contract: the page decides,
// from the search string alone, whether the form opens promoted or plain. A malformed
// promote is not an error state — it degrades to the plain form, and a bare `?ticker=`
// keeps working exactly as it did before promote existed.
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PromotedCandidate } from '../lib/promote'
import { buildPromoteSearch } from '../lib/promote'
import { NewWheelPage } from './NewWheelPage'

const { mockSearch, mockNavigate } = vi.hoisted(() => ({
  mockSearch: { value: '' },
  mockNavigate: vi.fn()
}))

vi.mock('wouter', () => ({
  useLocation: () => ['/new', mockNavigate],
  useSearch: () => mockSearch.value
}))

// The form itself is exercised in NewWheelForm.test.tsx; here it only has to report
// what the page decided to hand it.
vi.mock('../components/NewWheelForm', () => ({
  NewWheelForm: ({
    defaultTicker,
    promoted
  }: {
    defaultTicker?: string
    promoted?: PromotedCandidate
  }) => (
    <div
      data-testid="new-wheel-form"
      data-default-ticker={defaultTicker ?? ''}
      data-promoted={promoted ? JSON.stringify(promoted) : ''}
    />
  )
}))

const AAPL = {
  ticker: 'AAPL',
  strike: '180.0000',
  expiration: '2026-08-21',
  mark: '2.70',
  timestamp: '2026-08-07T20:00:02Z'
}

function renderAt(search: string): HTMLElement {
  mockSearch.value = search
  render(<NewWheelPage />)
  return screen.getByTestId('new-wheel-form')
}

const promotedFrom = (form: HTMLElement): PromotedCandidate | null => {
  const raw = form.getAttribute('data-promoted')
  return raw ? (JSON.parse(raw) as PromotedCandidate) : null
}

beforeEach(() => {
  mockNavigate.mockReset()
})

describe('NewWheelPage', () => {
  it('hands the form the promoted candidate carried by a promote navigation', () => {
    const form = renderAt(buildPromoteSearch(AAPL, 'Would own below $170'))

    expect(promotedFrom(form)).toEqual({
      ticker: 'AAPL',
      strike: '180',
      expiration: '2026-08-21',
      premium: '2.70',
      quotedAt: '2026-08-07T20:00:02Z',
      thesis: 'Would own below $170'
    })
  })

  it('opens the plain form when nothing was promoted', () => {
    const form = renderAt('')

    expect(promotedFrom(form)).toBeNull()
    expect(form).toHaveAttribute('data-default-ticker', '')
  })

  it('still honours the bare ?ticker= prefill the other flows use', () => {
    const form = renderAt('ticker=TSLA')

    expect(form).toHaveAttribute('data-default-ticker', 'TSLA')
    expect(promotedFrom(form)).toBeNull()
  })

  // wouter's hash navigate writes the promote params into the real `location.search`
  // and never clears them. Left there, the next plain "Open Wheel" from the sidebar
  // would re-open this form pre-filled from a candidate the trader never promoted.
  it('consumes the promote params so a later plain visit cannot resurrect them', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')

    renderAt(buildPromoteSearch(AAPL))

    expect(replaceState).toHaveBeenCalledOnce()
    const [, , url] = replaceState.mock.calls[0]
    expect(String(url)).not.toContain('promoted=1')
    expect(String(url)).not.toContain('ticker=AAPL')
    replaceState.mockRestore()
  })

  it('keeps the promoted values on screen after clearing the URL', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})

    const form = renderAt(buildPromoteSearch(AAPL))

    expect(promotedFrom(form)?.ticker).toBe('AAPL')
    replaceState.mockRestore()
  })

  it('leaves the URL alone when nothing was promoted', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')

    renderAt('ticker=TSLA')

    expect(replaceState).not.toHaveBeenCalled()
    replaceState.mockRestore()
  })

  it('degrades to the plain form when the promoted params are malformed', () => {
    const params = new URLSearchParams(buildPromoteSearch(AAPL))
    params.set('premium', 'not-a-price')

    const form = renderAt(params.toString())

    expect(promotedFrom(form)).toBeNull()
    // The ticker param is still present and still usable as a plain prefill.
    expect(form).toHaveAttribute('data-default-ticker', 'AAPL')
  })

  // A rejected payload is still a consumed one — left in the URL, its `ticker=`
  // would pre-fill the next plain visit, which is the bug one branch over.
  it('consumes a malformed promote too, rather than leaving its ticker behind', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const params = new URLSearchParams(buildPromoteSearch(AAPL))
    params.set('premium', 'not-a-price')

    renderAt(params.toString())

    expect(replaceState).toHaveBeenCalledOnce()
    expect(String(replaceState.mock.calls[0][2])).not.toContain('ticker=AAPL')
    replaceState.mockRestore()
  })
})
