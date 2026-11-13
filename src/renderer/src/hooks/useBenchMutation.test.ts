// [US-110] A bench write re-screens whichever lens is showing: the wheel screener and the
// PMCC screener both read the watchlist, so an add/remove/edit must refresh both.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBenchMutation } from './useBenchMutation'
import { usePmccScreenerResults } from './usePmccScreenerResults'
import { useScreenerResults } from './useScreenerResults'

const mockResults = vi.fn<Window['api']['screener']['results']>()
const mockPmccResults = vi.fn<Window['api']['screener']['pmccResults']>()

beforeEach(() => {
  mockResults.mockReset()
  mockPmccResults.mockReset()
  mockResults.mockResolvedValue({
    ok: true,
    status: 'ok',
    ranked: [],
    excluded: [],
    quoteTimestamp: null
  })
  mockPmccResults.mockResolvedValue({
    ok: true,
    status: 'ok',
    ranked: [],
    excluded: [],
    quoteTimestamp: null
  })
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      screener: { results: mockResults, pmccResults: mockPmccResults }
    }
  })
})

/** Mounts the bench write alongside the given lens's results query, as the Watchlist page does. */
function renderWithLens(lens: 'wheel' | 'pmcc'): { write: () => Promise<string> } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(
    () => {
      useScreenerResults({ enabled: lens === 'wheel' })
      usePmccScreenerResults({ enabled: lens === 'pmcc' })
      return useBenchMutation(() => Promise.resolve('written'))
    },
    {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client: queryClient }, children)
    }
  )
  return { write: () => result.current.mutateAsync(undefined) }
}

describe('useBenchMutation', () => {
  it('re-screens the PMCC lens after a write', async () => {
    const { write } = renderWithLens('pmcc')
    await waitFor(() => expect(mockPmccResults).toHaveBeenCalledTimes(1))

    await act(() => write())

    await waitFor(() => expect(mockPmccResults).toHaveBeenCalledTimes(2))
  })

  it('re-screens the wheel lens after a write', async () => {
    const { write } = renderWithLens('wheel')
    await waitFor(() => expect(mockResults).toHaveBeenCalledTimes(1))

    await act(() => write())

    await waitFor(() => expect(mockResults).toHaveBeenCalledTimes(2))
  })
})
