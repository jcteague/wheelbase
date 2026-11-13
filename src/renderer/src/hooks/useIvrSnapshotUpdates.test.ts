import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screenerQueryKeys } from './screenerQueryKeys'
import { useIvrSnapshotUpdates } from './useIvrSnapshotUpdates'
import { usePmccScreenerResults } from './usePmccScreenerResults'
import { watchlistQueryKeys } from './watchlistQueryKeys'

let onSnapshotUpdatedCallback: ((event: { ticker: string }) => void) | null = null
const mockUnsubscribe = vi.fn()

const mockOnSnapshotUpdated = vi.fn((cb: (event: { ticker: string }) => void) => {
  onSnapshotUpdatedCallback = cb
  return mockUnsubscribe
})

beforeEach(() => {
  mockOnSnapshotUpdated.mockClear()
  mockUnsubscribe.mockClear()
  onSnapshotUpdatedCallback = null
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      ivr: {
        ...((window.api as { ivr?: unknown })?.ivr ?? {}),
        onSnapshotUpdated: mockOnSnapshotUpdated
      }
    }
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

describe('useIvrSnapshotUpdates', () => {
  it('refreshes the bench and the screener when a reading lands', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    renderHook(() => useIvrSnapshotUpdates(), { wrapper: makeWrapper(queryClient) })

    expect(mockOnSnapshotUpdated).toHaveBeenCalledTimes(1)

    act(() => {
      onSnapshotUpdatedCallback?.({ ticker: 'AAPL' })
    })

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: watchlistQueryKeys.snapshot })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: screenerQueryKeys.results })
  })

  // [US-110] A new reading can move a ticker into or out of the PMCC IV-rank band, so the
  // PMCC lens re-screens just as the wheel lens does.
  it('re-screens the PMCC lens when a reading lands', async () => {
    const mockPmccResults = vi.fn<Window['api']['screener']['pmccResults']>()
    mockPmccResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: [],
      excluded: [],
      quoteTimestamp: null
    })
    Object.assign(window, {
      api: { ...window.api, screener: { ...window.api.screener, pmccResults: mockPmccResults } }
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    renderHook(
      () => {
        usePmccScreenerResults()
        useIvrSnapshotUpdates()
      },
      { wrapper: makeWrapper(queryClient) }
    )
    await waitFor(() => expect(mockPmccResults).toHaveBeenCalledTimes(1))

    act(() => {
      onSnapshotUpdatedCallback?.({ ticker: 'AAPL' })
    })

    await waitFor(() => expect(mockPmccResults).toHaveBeenCalledTimes(2))
  })

  it('unsubscribes on unmount', () => {
    const queryClient = new QueryClient()

    const { unmount } = renderHook(() => useIvrSnapshotUpdates(), {
      wrapper: makeWrapper(queryClient)
    })

    expect(mockUnsubscribe).not.toHaveBeenCalled()

    unmount()

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
