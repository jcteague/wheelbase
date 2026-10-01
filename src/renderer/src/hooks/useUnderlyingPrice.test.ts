import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { marketDataQueryKeys } from './marketDataQueryKeys'
import { useUnderlyingPrice } from './useUnderlyingPrice'

const mockStockQuotes = vi.fn()
const mockSetStockQuoteTickers = vi.fn()

function makeWrapper(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
): ({ children }: { children: React.ReactNode }) => React.ReactElement {
  const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  Wrapper.displayName = 'QueryClientWrapper'
  return Wrapper
}

beforeEach(() => {
  mockStockQuotes.mockReset()
  mockSetStockQuoteTickers.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      setStockQuoteTickers: mockSetStockQuoteTickers,
      marketData: {
        ...((window.api as { marketData?: unknown })?.marketData ?? {}),
        stockQuotes: mockStockQuotes
      }
    }
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useUnderlyingPrice', () => {
  it('returns the ticker price from a one-shot quote fetch', async () => {
    mockStockQuotes.mockResolvedValue({ ok: true, quotes: { XYZ: { price: '100.00' } } })

    const { result } = renderHook(() => useUnderlyingPrice('XYZ'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current).toBe('100.00'))
    expect(mockStockQuotes).toHaveBeenCalledWith({ tickers: ['XYZ'] })
  })

  it('never touches the stock-quote stream subscription', async () => {
    mockStockQuotes.mockResolvedValue({ ok: true, quotes: { XYZ: { price: '100.00' } } })

    const { result, unmount } = renderHook(() => useUnderlyingPrice('XYZ'), {
      wrapper: makeWrapper()
    })
    await waitFor(() => expect(result.current).toBe('100.00'))
    unmount()

    expect(mockSetStockQuoteTickers).not.toHaveBeenCalled()
  })

  it('does not fetch and returns null for an empty or invalid ticker', () => {
    const { result: empty } = renderHook(() => useUnderlyingPrice(''), { wrapper: makeWrapper() })
    const { result: bad } = renderHook(() => useUnderlyingPrice('xyz1'), {
      wrapper: makeWrapper()
    })

    expect(empty.current).toBeNull()
    expect(bad.current).toBeNull()
    expect(mockStockQuotes).not.toHaveBeenCalled()
  })

  it('returns null when the quotes carry no entry for the ticker', async () => {
    mockStockQuotes.mockResolvedValue({ ok: true, quotes: {} })

    const { result } = renderHook(() => useUnderlyingPrice('XYZ'), { wrapper: makeWrapper() })

    await waitFor(() => expect(mockStockQuotes).toHaveBeenCalledWith({ tickers: ['XYZ'] }))
    expect(result.current).toBeNull()
  })

  it('returns null while the quote is unavailable', async () => {
    mockStockQuotes.mockResolvedValue({ ok: false, errors: [{ code: 'unknown', message: 'x' }] })

    const { result } = renderHook(() => useUnderlyingPrice('XYZ'), { wrapper: makeWrapper() })

    await waitFor(() => expect(mockStockQuotes).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('holds its first price when the stock-quotes cache moves on', async () => {
    mockStockQuotes.mockResolvedValue({ ok: true, quotes: { XYZ: { price: '100.00' } } })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useUnderlyingPrice('XYZ'), {
      wrapper: makeWrapper(queryClient)
    })
    await waitFor(() => expect(result.current).toBe('100.00'))

    // A live quote landing in the positions list's cache must not re-key the chain request.
    await act(async () => {
      queryClient.setQueryData(marketDataQueryKeys.stockQuotes(['XYZ']), {
        XYZ: { price: '120.00' }
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(result.current).toBe('100.00')
  })

  it('fetches one snapshot per mount and never polls', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockStockQuotes.mockResolvedValue({ ok: true, quotes: { XYZ: { price: '100.00' } } })

    const { result } = renderHook(() => useUnderlyingPrice('XYZ'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current).toBe('100.00'))

    await act(() => vi.advanceTimersByTimeAsync(61_000))

    expect(mockStockQuotes).toHaveBeenCalledOnce()
  })

  it('does not fetch while disabled, even for a valid ticker', () => {
    const { result } = renderHook(() => useUnderlyingPrice('XYZ', { enabled: false }), {
      wrapper: makeWrapper()
    })

    expect(result.current).toBeNull()
    expect(mockStockQuotes).not.toHaveBeenCalled()
  })
})
