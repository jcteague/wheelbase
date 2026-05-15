import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStockQuotes } from './useStockQuotes'

const mockGetStockQuotes = vi.fn()
const mockSetStockQuoteTickers = vi.fn()
let onStockQuoteCallback: ((event: IpcStockQuoteEvent) => void) | null = null
let onStreamErrorCallback: ((event: IpcStreamErrorEvent) => void) | null = null

const mockOnStockQuote = vi.fn((cb: (event: IpcStockQuoteEvent) => void) => {
  onStockQuoteCallback = cb
  return () => {
    onStockQuoteCallback = null
  }
})
const mockOnStreamError = vi.fn((cb: (event: IpcStreamErrorEvent) => void) => {
  onStreamErrorCallback = cb
  return () => {
    onStreamErrorCallback = null
  }
})

beforeEach(() => {
  mockGetStockQuotes.mockReset()
  mockSetStockQuoteTickers.mockReset()
  mockOnStockQuote.mockClear()
  mockOnStreamError.mockClear()
  onStockQuoteCallback = null
  onStreamErrorCallback = null
  mockSetStockQuoteTickers.mockResolvedValue({ ok: true, subscribedTickers: [] })
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      getStockQuotes: mockGetStockQuotes,
      setStockQuoteTickers: mockSetStockQuoteTickers,
      onStockQuote: mockOnStockQuote,
      onStreamError: mockOnStreamError
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

const AAPL_QUOTE = {
  price: '182.45',
  bid: '182.44',
  ask: '182.46',
  prevClose: '181.00',
  volume: 1000,
  timestamp: '2024-01-15T15:30:00Z'
}

describe('useStockQuotes', () => {
  it('disabled when tickers is empty', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useStockQuotes([]), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(mockGetStockQuotes).not.toHaveBeenCalled()
  })

  it('fetches REST seed on mount when tickers provided', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: { AAPL: AAPL_QUOTE } })

    const { result } = renderHook(() => useStockQuotes(['AAPL']), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.AAPL.price).toBe('182.45')
  })

  it('merges incoming tick into cache, preserving prevClose', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: { AAPL: AAPL_QUOTE } })

    const { result } = renderHook(() => useStockQuotes(['AAPL']), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    act(() => {
      onStockQuoteCallback?.({
        ticker: 'AAPL',
        quote: {
          price: '182.50',
          bid: '182.49',
          ask: '182.51',
          prevClose: null,
          volume: 1001,
          timestamp: '2024-01-15T15:31:00Z'
        }
      })
    })

    await waitFor(() => expect(result.current.data?.AAPL.price).toBe('182.50'))
    expect(result.current.data?.AAPL.prevClose).toBe('181.00')
  })

  it('dataUpdatedAt advances on stream tick', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: { AAPL: AAPL_QUOTE } })

    const { result } = renderHook(() => useStockQuotes(['AAPL']), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const initial = result.current.dataUpdatedAt

    act(() => {
      onStockQuoteCallback?.({
        ticker: 'AAPL',
        quote: {
          price: '182.60',
          bid: '182.59',
          ask: '182.61',
          prevClose: null,
          volume: 1002,
          timestamp: '2024-01-15T15:32:00Z'
        }
      })
    })

    await waitFor(() => expect(result.current.dataUpdatedAt).toBeGreaterThan(initial))
  })

  it('calls setStockQuoteTickers on mount with sorted tickers', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: {} })

    renderHook(() => useStockQuotes(['MSFT', 'AAPL']), { wrapper: makeWrapper(queryClient) })

    await waitFor(() => {
      expect(mockSetStockQuoteTickers).toHaveBeenCalledWith({ tickers: ['AAPL', 'MSFT'] })
    })
  })

  it('calls setStockQuoteTickers([]) on unmount', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: { AAPL: AAPL_QUOTE } })

    const { unmount } = renderHook(() => useStockQuotes(['AAPL']), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() =>
      expect(mockSetStockQuoteTickers).toHaveBeenCalledWith({ tickers: ['AAPL'] })
    )

    act(() => {
      unmount()
    })

    await waitFor(() => {
      const calls = mockSetStockQuoteTickers.mock.calls
      expect(calls.some((c) => JSON.stringify(c[0]) === JSON.stringify({ tickers: [] }))).toBe(true)
    })
  })

  it('re-subscribes when tickers change', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: {} })

    const { rerender } = renderHook(
      ({ tickers }: { tickers: string[] }) => useStockQuotes(tickers),
      {
        wrapper: makeWrapper(queryClient),
        initialProps: { tickers: ['AAPL', 'MSFT'] }
      }
    )

    await waitFor(() => {
      expect(mockSetStockQuoteTickers).toHaveBeenCalledWith({ tickers: ['AAPL', 'MSFT'] })
    })

    rerender({ tickers: ['AAPL'] })

    await waitFor(() => {
      expect(mockSetStockQuoteTickers).toHaveBeenCalledWith({ tickers: ['AAPL'] })
    })
  })

  it('surfaces stream error via streamError state', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: { AAPL: AAPL_QUOTE } })

    const { result } = renderHook(() => useStockQuotes(['AAPL']), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const streamErr = {
      feed: 'stockQuotes' as const,
      code: 'stream_disconnected',
      message: 'Connection lost',
      reconnectable: true
    }
    act(() => {
      onStreamErrorCallback?.(streamErr)
    })

    await waitFor(() => expect(result.current.streamError).not.toBeNull())
    expect(result.current.streamError).toEqual(streamErr)
  })

  it('surfaces streamError when setStockQuoteTickers returns ok:false', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: { AAPL: AAPL_QUOTE } })
    mockSetStockQuoteTickers.mockResolvedValue({
      ok: false,
      errors: [{ field: '__root__', code: 'auth_failed', message: 'Missing Alpaca credentials' }]
    })

    const { result } = renderHook(() => useStockQuotes(['AAPL']), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.streamError).not.toBeNull())
    expect(result.current.streamError?.feed).toBe('stockQuotes')
    expect(result.current.streamError?.code).toBe('auth_failed')
    expect(result.current.streamError?.message).toBe('Missing Alpaca credentials')
  })

  it('surfaces streamError when setStockQuoteTickers rejects', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: { AAPL: AAPL_QUOTE } })
    mockSetStockQuoteTickers.mockRejectedValue(new Error('IPC channel closed'))

    const { result } = renderHook(() => useStockQuotes(['AAPL']), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.streamError).not.toBeNull())
    expect(result.current.streamError?.code).toBe('subscription_failed')
    expect(result.current.streamError?.message).toBe('IPC channel closed')
  })

  it('reports stale=false initially when fresh data arrives', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: { AAPL: AAPL_QUOTE } })

    const { result } = renderHook(() => useStockQuotes(['AAPL']), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.stale).toBe(false)
    expect(result.current.minutesAgo).toBe(0)
  })

  it('flips stale=true after threshold elapses without a new tick', async () => {
    const initialNow = 1_700_000_000_000
    vi.useFakeTimers()
    vi.setSystemTime(initialNow)
    try {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: { AAPL: AAPL_QUOTE } })

      const { result } = renderHook(() => useStockQuotes(['AAPL']), {
        wrapper: makeWrapper(queryClient)
      })

      // Drive the initial REST query to completion under fake timers.
      await vi.waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.stale).toBe(false)

      // Advance the clock past the 5-minute threshold without any new ticks.
      // dataUpdatedAt does not change, but the internal poll re-evaluates.
      act(() => {
        vi.setSystemTime(initialNow + 6 * 60 * 1000)
        vi.advanceTimersByTime(31_000)
      })

      expect(result.current.stale).toBe(true)
      expect(result.current.minutesAgo).toBe(6)
    } finally {
      vi.useRealTimers()
    }
  })

  it('flips stale=true immediately when a stream error occurs', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: { AAPL: AAPL_QUOTE } })

    const { result } = renderHook(() => useStockQuotes(['AAPL']), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.stale).toBe(false)

    act(() => {
      onStreamErrorCallback?.({
        feed: 'stockQuotes',
        code: 'stream_disconnected',
        message: 'Connection lost',
        reconnectable: true
      })
    })

    await waitFor(() => expect(result.current.stale).toBe(true))
    expect(result.current.streamError?.code).toBe('stream_disconnected')
  })

  it('tick for a ticker not in cache adds the entry with prevClose: null', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetStockQuotes.mockResolvedValue({ ok: true, quotes: { AAPL: AAPL_QUOTE } })

    const { result } = renderHook(() => useStockQuotes(['AAPL']), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    act(() => {
      onStockQuoteCallback?.({
        ticker: 'NVDA',
        quote: {
          price: '500.00',
          bid: '499.99',
          ask: '500.01',
          prevClose: null,
          volume: 500,
          timestamp: '2024-01-15T15:30:00Z'
        }
      })
    })

    await waitFor(() => expect(result.current.data?.NVDA).toBeDefined())
    expect(result.current.data?.NVDA.prevClose).toBeNull()
  })
})
