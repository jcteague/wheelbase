// [US-96] One live bench — the snapshot query hook.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWatchlistSnapshot } from '../api/watchlist'
import { useWatchlistSnapshot } from './useWatchlistSnapshot'
import { watchlistQueryKeys } from './watchlistQueryKeys'

const { mockUseQuery } = vi.hoisted(() => ({ mockUseQuery: vi.fn() }))

vi.mock('@tanstack/react-query', () => ({
  useQuery: mockUseQuery
}))

vi.mock('../api/watchlist', () => ({
  getWatchlistSnapshot: vi.fn()
}))

describe('useWatchlistSnapshot', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
    mockUseQuery.mockImplementation((options) => options)
  })

  it('queries with watchlistQueryKeys.snapshot', () => {
    useWatchlistSnapshot()

    expect(mockUseQuery).toHaveBeenCalledOnce()
    const [options] = mockUseQuery.mock.calls[0] as [
      { queryKey: readonly unknown[]; queryFn: typeof getWatchlistSnapshot }
    ]

    // Pinned to the literal as well as the constant: the snapshot lives under the
    // watchlist tree so adding or removing a stock invalidates it by prefix.
    expect(watchlistQueryKeys.snapshot).toEqual(['watchlist', 'snapshot'])
    expect(options.queryKey).toEqual(watchlistQueryKeys.snapshot)
    expect(options.queryFn).toBe(getWatchlistSnapshot)
  })

  // Coming back to the window is exactly when a trader wants the day's prices
  // re-read, so the bench refetches on focus rather than on a timer.
  it('refetches when the window regains focus', () => {
    useWatchlistSnapshot()

    const [options] = mockUseQuery.mock.calls[0] as [{ refetchOnWindowFocus?: boolean }]
    expect(options.refetchOnWindowFocus).toBe(true)
  })
})
