// [US-68] The one-shot fresh quote the promoted new-wheel form reconciles against.
//
// Not a live ticker: the form re-fetches once on open. Anything that fails —
// a rejected query, a provider outage, a symbol the provider doesn't know —
// collapses to 'failed' so the form degrades to the screener snapshot rather
// than blocking (the boundary-I/O rule from the alert-evaluation-failure-isolation ADR).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PromotedCandidate } from '../lib/promote'
import { marketDataQueryKeys } from './marketDataQueryKeys'
import { usePromotedQuote } from './usePromotedQuote'

const mockGetOptionSnapshots = vi.fn()

beforeEach(() => {
  mockGetOptionSnapshots.mockReset()
  Object.assign(window, {
    api: { ...(window.api ?? {}), getOptionSnapshots: mockGetOptionSnapshots }
  })
})

function makeWrapper(
  queryClient: QueryClient
): ({ children }: { children: React.ReactNode }) => React.ReactElement {
  const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  Wrapper.displayName = 'QueryClientWrapper'
  return Wrapper
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const AAPL: PromotedCandidate = {
  ticker: 'AAPL',
  strike: '180',
  expiration: '2026-08-21',
  premium: '2.70',
  quotedAt: '2026-08-07T20:00:02Z'
}

const AAPL_OCC = 'AAPL260821P00180000'
const FRESH_AT = '2026-08-07T20:11:40Z'

const FRESH_SNAPSHOT = {
  bid: '2.66',
  ask: '2.70',
  mid: '2.68',
  lastTrade: '2.68',
  openInterest: 4200,
  volume: 500,
  greeks: { delta: '-0.28', gamma: '0.02', theta: '-0.03', vega: '0.10', iv: '0.28' },
  timestamp: FRESH_AT
}

describe('usePromotedQuote', () => {
  it('requests the promoted contract’s OCC symbol and resolves its mid as the fresh mark', async () => {
    const queryClient = newClient()
    mockGetOptionSnapshots.mockResolvedValue({
      ok: true,
      snapshots: { [AAPL_OCC]: FRESH_SNAPSHOT },
      unavailable: false
    })

    const { result } = renderHook(() => usePromotedQuote(AAPL), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.quote).toEqual({ mark: '2.68', timestamp: FRESH_AT }))
    expect(mockGetOptionSnapshots).toHaveBeenCalledWith({ symbols: [AAPL_OCC] })
    expect(mockGetOptionSnapshots).toHaveBeenCalledTimes(1)
  })

  it('is pending before the fetch resolves', () => {
    const queryClient = newClient()
    mockGetOptionSnapshots.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => usePromotedQuote(AAPL), {
      wrapper: makeWrapper(queryClient)
    })

    expect(result.current.quote).toBe('pending')
  })

  it('degrades to failed when the snapshots call rejects', async () => {
    const queryClient = newClient()
    mockGetOptionSnapshots.mockResolvedValue({
      ok: false,
      errors: [{ field: '__root__', code: 'provider_unavailable', message: 'Massive is down' }]
    })

    const { result } = renderHook(() => usePromotedQuote(AAPL), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.quote).toBe('failed'))
  })

  it('degrades to failed when the provider reports the chain unavailable', async () => {
    const queryClient = newClient()
    mockGetOptionSnapshots.mockResolvedValue({ ok: true, snapshots: {}, unavailable: true })

    const { result } = renderHook(() => usePromotedQuote(AAPL), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.quote).toBe('failed'))
  })

  it('degrades to failed when the promoted symbol is absent from the snapshots map', async () => {
    const queryClient = newClient()
    mockGetOptionSnapshots.mockResolvedValue({
      ok: true,
      snapshots: { MSFT260821P00410000: FRESH_SNAPSHOT },
      unavailable: false
    })

    const { result } = renderHook(() => usePromotedQuote(AAPL), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.quote).toBe('failed'))
  })

  it('never fetches for a non-promoted form', async () => {
    const queryClient = newClient()

    const { result } = renderHook(() => usePromotedQuote(undefined), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.quote).toBe('pending'))
    expect(mockGetOptionSnapshots).not.toHaveBeenCalled()
  })

  // A candidate whose symbol won't build is a quote the form cannot get — the same
  // outcome as an outage, so the trader gets the same "couldn't refresh" explanation
  // rather than a banner-less form waiting on a fetch that will never happen.
  it('degrades to failed without fetching when the promoted strike cannot build an OCC symbol', async () => {
    const queryClient = newClient()

    const { result } = renderHook(() => usePromotedQuote({ ...AAPL, strike: '0' }), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.quote).toBe('failed'))
    expect(mockGetOptionSnapshots).not.toHaveBeenCalled()
  })

  // `staleTime: Infinity` alone would let a second promote of the same contract
  // resolve from cache, presenting the previous visit's mark as the fresh quote.
  it('keeps nothing cached for the next promote of the same contract', async () => {
    const queryClient = newClient()
    mockGetOptionSnapshots.mockResolvedValue({
      ok: true,
      snapshots: { [AAPL_OCC]: FRESH_SNAPSHOT },
      unavailable: false
    })

    const { result, unmount } = renderHook(() => usePromotedQuote(AAPL), {
      wrapper: makeWrapper(queryClient)
    })
    await waitFor(() => expect(result.current.quote).not.toBe('pending'))
    unmount()

    await waitFor(() =>
      expect(queryClient.getQueryData(marketDataQueryKeys.promotedQuote(AAPL_OCC))).toBeUndefined()
    )
  })

  it('is a one-shot fetch — no polling, no focus refetch, no retry', async () => {
    const queryClient = newClient()
    mockGetOptionSnapshots.mockResolvedValue({
      ok: true,
      snapshots: { [AAPL_OCC]: FRESH_SNAPSHOT },
      unavailable: false
    })

    const { result } = renderHook(() => usePromotedQuote(AAPL), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.quote).not.toBe('pending'))

    const query = queryClient
      .getQueryCache()
      .find({ queryKey: marketDataQueryKeys.promotedQuote(AAPL_OCC) })
    const options = query?.options as {
      refetchInterval?: unknown
      refetchOnWindowFocus?: unknown
      retry?: unknown
      staleTime?: unknown
    }

    expect(options.refetchInterval).toBe(false)
    expect(options.refetchOnWindowFocus).toBe(false)
    expect(options.retry).toBe(false)
    expect(options.staleTime).toBe(Infinity)
  })

  it('keys the query under a promote-scoped market-data key', () => {
    expect(marketDataQueryKeys.promotedQuote(AAPL_OCC)).toEqual([
      'market',
      'promoted-quote',
      AAPL_OCC
    ])
  })
})
