import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarketStatus } from './useMarketStatus'

const mockGetMarketStatus = vi.fn()

beforeEach(() => {
  mockGetMarketStatus.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      getMarketStatus: mockGetMarketStatus
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

describe('useMarketStatus', () => {
  it('returns the market status from a successful query', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const status = {
      isOpen: true,
      nextOpen: '2024-01-15T14:30:00Z',
      nextClose: '2024-01-15T21:00:00Z',
      session: 'regular' as const
    }
    mockGetMarketStatus.mockResolvedValue({ ok: true, status })

    const { result } = renderHook(() => useMarketStatus(), { wrapper: makeWrapper(queryClient) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.session).toBe('regular')
  })

  it('surfaces error state when window.api fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetMarketStatus.mockRejectedValue(new Error('network failure'))

    const { result } = renderHook(() => useMarketStatus(), { wrapper: makeWrapper(queryClient) })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('query key is [market-data, market-status]', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetMarketStatus.mockResolvedValue({
      ok: true,
      status: { isOpen: false, nextOpen: '', nextClose: '', session: 'closed' as const }
    })

    renderHook(() => useMarketStatus(), { wrapper: makeWrapper(queryClient) })

    await waitFor(() => {
      const queries = queryClient.getQueryCache().findAll()
      expect(
        queries.some(
          (q) => JSON.stringify(q.queryKey) === JSON.stringify(['market-data', 'market-status'])
        )
      ).toBe(true)
    })
  })
})
