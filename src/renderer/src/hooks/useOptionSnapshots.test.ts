import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOptionSnapshots, type ActiveLegSummary } from './useOptionSnapshots'
import { marketDataQueryKeys } from './marketDataQueryKeys'

const mockGetOptionSnapshots = vi.fn()

beforeEach(() => {
  mockGetOptionSnapshots.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      getOptionSnapshots: mockGetOptionSnapshots
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

const AAPL_OPTION_SNAPSHOT = {
  bid: '1.20',
  ask: '1.40',
  mid: '1.30',
  lastTrade: '1.30',
  openInterest: 100,
  volume: 50,
  greeks: {
    delta: '-0.30',
    gamma: '0.02',
    theta: '-0.05',
    vega: '0.15',
    iv: '0.25'
  },
  timestamp: '2024-01-15T15:30:00Z'
}

const AAPL_PUT_LEG: ActiveLegSummary = {
  ticker: 'AAPL',
  expiration: '2026-05-16',
  strike: '180',
  instrumentType: 'PUT'
}
const AAPL_PUT_OCC = 'AAPL260516P00180000'

const AAPL_PUT_LEG_DIFF_EXP: ActiveLegSummary = {
  ticker: 'AAPL',
  expiration: '2026-06-19',
  strike: '180',
  instrumentType: 'PUT'
}
const AAPL_PUT_OCC_DIFF_EXP = 'AAPL260619P00180000'

const HOLDING_LEG: ActiveLegSummary = {
  ticker: 'AAPL',
  expiration: null,
  strike: null,
  instrumentType: null
}

describe('useOptionSnapshots', () => {
  it('idle when legs is empty', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useOptionSnapshots([]), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(mockGetOptionSnapshots).not.toHaveBeenCalled()
  })

  it('idle when every leg lacks instrumentType', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useOptionSnapshots([HOLDING_LEG]), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(mockGetOptionSnapshots).not.toHaveBeenCalled()
  })

  it('builds OCC symbols and fetches snapshots', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetOptionSnapshots.mockResolvedValue({
      ok: true,
      snapshots: { [AAPL_PUT_OCC]: AAPL_OPTION_SNAPSHOT },
      unavailable: false
    })

    const { result } = renderHook(() => useOptionSnapshots([AAPL_PUT_LEG]), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[AAPL_PUT_OCC]).toEqual(AAPL_OPTION_SNAPSHOT)
    expect(mockGetOptionSnapshots).toHaveBeenCalledWith({ symbols: [AAPL_PUT_OCC] })
  })

  it('re-fetches when legs change (different expiration → different OCC)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetOptionSnapshots.mockResolvedValue({
      ok: true,
      snapshots: { [AAPL_PUT_OCC]: AAPL_OPTION_SNAPSHOT },
      unavailable: false
    })

    const { result, rerender } = renderHook(
      ({ legs }: { legs: ActiveLegSummary[] }) => useOptionSnapshots(legs),
      {
        wrapper: makeWrapper(queryClient),
        initialProps: { legs: [AAPL_PUT_LEG] }
      }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGetOptionSnapshots).toHaveBeenCalledWith({ symbols: [AAPL_PUT_OCC] })

    mockGetOptionSnapshots.mockResolvedValue({
      ok: true,
      snapshots: { [AAPL_PUT_OCC_DIFF_EXP]: AAPL_OPTION_SNAPSHOT }
    })

    rerender({ legs: [AAPL_PUT_LEG_DIFF_EXP] })

    await waitFor(() => {
      expect(mockGetOptionSnapshots).toHaveBeenCalledWith({ symbols: [AAPL_PUT_OCC_DIFF_EXP] })
    })
  })

  it('uses query key from marketDataQueryKeys.optionSnapshots', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetOptionSnapshots.mockResolvedValue({
      ok: true,
      snapshots: { [AAPL_PUT_OCC]: AAPL_OPTION_SNAPSHOT },
      unavailable: false
    })

    const { result } = renderHook(() => useOptionSnapshots([AAPL_PUT_LEG]), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const expectedKey = marketDataQueryKeys.optionSnapshots([AAPL_PUT_OCC])
    expect(expectedKey).toEqual(['market-data', 'option-snapshots', AAPL_PUT_OCC])
    expect(queryClient.getQueryData(expectedKey)).toBeDefined()
  })

  it('surfaces error state when window.api rejects', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetOptionSnapshots.mockRejectedValue(new Error('IPC failure'))

    const { result } = renderHook(() => useOptionSnapshots([AAPL_PUT_LEG]), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('IPC failure')
  })

  it('skips legs that throw from buildOccSymbol (e.g. strike 0)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetOptionSnapshots.mockResolvedValue({
      ok: true,
      snapshots: { [AAPL_PUT_OCC]: AAPL_OPTION_SNAPSHOT },
      unavailable: false
    })

    const invalidLeg: ActiveLegSummary = {
      ticker: 'AAPL',
      expiration: '2026-05-16',
      strike: '0',
      instrumentType: 'PUT'
    }

    const { result } = renderHook(() => useOptionSnapshots([invalidLeg, AAPL_PUT_LEG]), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGetOptionSnapshots).toHaveBeenCalledWith({ symbols: [AAPL_PUT_OCC] })
  })

  it('refetchInterval is 60_000 by default', async () => {
    vi.useFakeTimers()
    try {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      mockGetOptionSnapshots.mockResolvedValue({
        ok: true,
        snapshots: { [AAPL_PUT_OCC]: AAPL_OPTION_SNAPSHOT }
      })

      const { result } = renderHook(() => useOptionSnapshots([AAPL_PUT_LEG]), {
        wrapper: makeWrapper(queryClient)
      })

      await vi.waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockGetOptionSnapshots).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(60_000)

      await vi.waitFor(() => expect(mockGetOptionSnapshots).toHaveBeenCalledTimes(2))
    } finally {
      vi.useRealTimers()
    }
  })

  it('refetchInterval is false (disabled) when session is closed', async () => {
    vi.useFakeTimers()
    try {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      mockGetOptionSnapshots.mockResolvedValue({
        ok: true,
        snapshots: { [AAPL_PUT_OCC]: AAPL_OPTION_SNAPSHOT }
      })

      const { result } = renderHook(
        () => useOptionSnapshots([AAPL_PUT_LEG], { session: 'closed' }),
        {
          wrapper: makeWrapper(queryClient)
        }
      )

      await vi.waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockGetOptionSnapshots).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(120_000)

      expect(mockGetOptionSnapshots).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('surfaces unavailable:true when IPC returns unavailable:true', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetOptionSnapshots.mockResolvedValue({ ok: true, snapshots: {}, unavailable: true })

    const { result } = renderHook(() => useOptionSnapshots([AAPL_PUT_LEG]), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.unavailable).toBe(true)
    expect(result.current.data).toEqual({})
  })

  it('unavailable is false when IPC returns unavailable:false', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetOptionSnapshots.mockResolvedValue({
      ok: true,
      snapshots: { [AAPL_PUT_OCC]: AAPL_OPTION_SNAPSHOT },
      unavailable: false
    })

    const { result } = renderHook(() => useOptionSnapshots([AAPL_PUT_LEG]), {
      wrapper: makeWrapper(queryClient)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.unavailable).toBe(false)
  })
})
