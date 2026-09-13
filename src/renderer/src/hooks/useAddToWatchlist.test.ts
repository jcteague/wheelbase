import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUseMutation, mockUseQueryClient, mockInvalidateQueries } = vi.hoisted(() => ({
  mockUseMutation: vi.fn(),
  mockUseQueryClient: vi.fn(),
  mockInvalidateQueries: vi.fn()
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: mockUseMutation,
  useQueryClient: mockUseQueryClient
}))

vi.mock('../api/watchlist', () => ({
  addWatchlistEntry: vi.fn()
}))

import { addWatchlistEntry } from '../api/watchlist'
import { useAddToWatchlist } from './useAddToWatchlist'

describe('useAddToWatchlist', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockReset()
    mockUseMutation.mockReset()
    mockUseQueryClient.mockReset()
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: mockInvalidateQueries
    })
    mockUseMutation.mockImplementation((options) => options)
  })

  it('uses addWatchlistEntry as the mutation function', () => {
    useAddToWatchlist()

    const [options] = mockUseMutation.mock.calls[0] as [{ mutationFn: typeof addWatchlistEntry }]
    expect(options.mutationFn).toBe(addWatchlistEntry)
  })

  it('invalidates the watchlist query on success', () => {
    useAddToWatchlist()

    const [options] = mockUseMutation.mock.calls[0] as [{ onSuccess?: () => void }]
    options.onSuccess?.()

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['watchlist'] })
  })

  // [US-96] Adding a stock changes the bench: it needs a quote and a verdict, and the
  // screener has to re-run so the new ticker can rank. Both are invalidated alongside
  // the plain list so the card appears complete rather than blank until the next focus.
  it('invalidates the watchlist snapshot on success', () => {
    useAddToWatchlist()

    const [options] = mockUseMutation.mock.calls[0] as [{ onSuccess?: () => void }]
    options.onSuccess?.()

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['watchlist', 'snapshot'] })
  })

  it('invalidates the screener results on success', () => {
    useAddToWatchlist()

    const [options] = mockUseMutation.mock.calls[0] as [{ onSuccess?: () => void }]
    options.onSuccess?.()

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['screener', 'results'] })
  })
})
