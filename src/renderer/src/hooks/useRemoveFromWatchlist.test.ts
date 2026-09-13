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
  removeWatchlistEntry: vi.fn()
}))

import { removeWatchlistEntry } from '../api/watchlist'
import { useRemoveFromWatchlist } from './useRemoveFromWatchlist'

describe('useRemoveFromWatchlist', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockReset()
    mockUseMutation.mockReset()
    mockUseQueryClient.mockReset()
    mockUseQueryClient.mockReturnValue({ invalidateQueries: mockInvalidateQueries })
    mockUseMutation.mockImplementation((options) => options)
  })

  it('uses removeWatchlistEntry as the mutation function', () => {
    useRemoveFromWatchlist()

    const [options] = mockUseMutation.mock.calls[0] as [{ mutationFn: typeof removeWatchlistEntry }]
    expect(options.mutationFn).toBe(removeWatchlistEntry)
  })

  it('invalidates the watchlist query on success', () => {
    useRemoveFromWatchlist()

    const [options] = mockUseMutation.mock.calls[0] as [{ onSuccess?: () => void }]
    options.onSuccess?.()

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['watchlist'] })
  })

  // [US-96] A removed stock must leave the bench and stop consuming a screener slot,
  // so the snapshot and the screen are both re-read rather than left showing a ghost.
  it('invalidates the watchlist snapshot on success', () => {
    useRemoveFromWatchlist()

    const [options] = mockUseMutation.mock.calls[0] as [{ onSuccess?: () => void }]
    options.onSuccess?.()

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['watchlist', 'snapshot'] })
  })

  it('invalidates the screener results on success', () => {
    useRemoveFromWatchlist()

    const [options] = mockUseMutation.mock.calls[0] as [{ onSuccess?: () => void }]
    options.onSuccess?.()

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['screener', 'results'] })
  })
})
