import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUseMutation, mockUseQueryClient, mockInvalidateQueries, mockSetQueryData } = vi.hoisted(
  () => ({
    mockUseMutation: vi.fn(),
    mockUseQueryClient: vi.fn(),
    mockInvalidateQueries: vi.fn(),
    mockSetQueryData: vi.fn()
  })
)

vi.mock('@tanstack/react-query', () => ({
  useMutation: mockUseMutation,
  useQueryClient: mockUseQueryClient
}))

vi.mock('../api/watchlist', () => ({
  updateWatchlistEntry: vi.fn()
}))

import type { WatchlistEntry, WatchlistSnapshot } from '../api/watchlist'
import { updateWatchlistEntry } from '../api/watchlist'
import { useUpdateWatchlistEntry } from './useUpdateWatchlistEntry'

const SAVED: WatchlistEntry = {
  ticker: 'AAPL',
  notes: 'Would own below $165 after the split',
  ownBelowPrice: '165.0000',
  ivrTrigger: null,
  postEarningsOnly: false,
  coreHolding: false,
  addedAt: '2026-09-01T14:00:00.000Z'
}

function stale(ticker: string): WatchlistSnapshot {
  return {
    rows: [
      {
        entry: { ...SAVED, ticker, notes: 'Would own below $170', ownBelowPrice: '170.0000' },
        quote: null,
        ivRank: null,
        earnings: { kind: 'unknown' },
        verdict: {
          price: { verdict: 'unmet', label: 'Above your price' },
          iv: { verdict: 'none', label: null },
          earnings: { verdict: 'none', label: null }
        }
      }
    ],
    asOf: '2026-09-11T20:00:00.000Z'
  }
}

/** The updater `setQueryData` was called with, applied to a given cache value. */
function applyUpdater(previous: WatchlistSnapshot | undefined): WatchlistSnapshot | undefined {
  const updater = mockSetQueryData.mock.calls[0][1] as (
    prev: WatchlistSnapshot | undefined
  ) => WatchlistSnapshot | undefined
  return updater(previous)
}

describe('useUpdateWatchlistEntry', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockReset()
    mockSetQueryData.mockReset()
    mockUseMutation.mockReset()
    mockUseQueryClient.mockReset()
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: mockInvalidateQueries,
      setQueryData: mockSetQueryData
    })
    mockUseMutation.mockImplementation((options) => options)
  })

  /** Named `use…` so rules-of-hooks recognises the call inside it as legitimate — the
   *  other suites call the hook straight from the `it`, which this one cannot do twice. */
  function useFiredSuccess(entry: WatchlistEntry = SAVED): void {
    useUpdateWatchlistEntry()
    const [options] = mockUseMutation.mock.calls[0] as [
      { onSuccess?: (data: WatchlistEntry) => void }
    ]
    options.onSuccess?.(entry)
  }

  it('uses updateWatchlistEntry as the mutation function', () => {
    useUpdateWatchlistEntry()

    const [options] = mockUseMutation.mock.calls[0] as [{ mutationFn: typeof updateWatchlistEntry }]
    expect(options.mutationFn).toBe(updateWatchlistEntry)
  })

  it('invalidates the watchlist query on success', () => {
    useFiredSuccess()

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['watchlist'] })
  })

  it('invalidates the watchlist snapshot on success', () => {
    useFiredSuccess()

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['watchlist', 'snapshot'] })
  })

  // [US-69] A changed condition is an input to the verdict engine, so an edit can move the
  // stock between bench sections. Without this the new rank waits for the next refresh.
  it('invalidates the screener results on success', () => {
    useFiredSuccess()

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['screener', 'results'] })
  })

  // The invalidation is not awaited, so the panel comes back before the refetch lands.
  // Seeding the saved entry into the cached row is what stops it showing the pre-save
  // thesis and conditions in the meantime.
  it('seeds the saved entry into the cached snapshot row', () => {
    useFiredSuccess()

    expect(mockSetQueryData).toHaveBeenCalledWith(['watchlist', 'snapshot'], expect.any(Function))
    expect(applyUpdater(stale('AAPL'))?.rows[0].entry).toEqual(SAVED)
  })

  it('leaves other stocks rows alone', () => {
    useFiredSuccess()

    const updated = applyUpdater(stale('KO'))
    expect(updated?.rows[0].entry.notes).toBe('Would own below $170')
  })

  // The verdict is the engine's, computed against fresh market data server-side, so it is
  // deliberately left for the refetch rather than guessed at here.
  it('leaves the row verdict for the refetch to replace', () => {
    useFiredSuccess()

    expect(applyUpdater(stale('AAPL'))?.rows[0].verdict.price.verdict).toBe('unmet')
  })

  it('does nothing when the snapshot has not been cached yet', () => {
    useFiredSuccess()

    expect(applyUpdater(undefined)).toBeUndefined()
  })
})
