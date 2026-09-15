import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screenerQueryKeys } from './screenerQueryKeys'
import { useIvrSnapshotUpdates } from './useIvrSnapshotUpdates'
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
