import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OptionChainQuote } from '../api/market-data'
import { LEAPS_PRESET, SHORT_PRESET } from '../lib/pmcc-entry'
import { useCallChain } from './useCallChain'

const mockOptionChain = vi.fn()
const KEEP = 'XYZ270917C00080000'
const LOW = 'XYZ270917C00070000'

function quote(contractId: string, delta: string): OptionChainQuote {
  return {
    contractId,
    strike: '80.0000',
    expiration: '2027-09-17',
    contractType: 'call',
    bid: '24.80',
    ask: '25.20',
    mid: '25.00',
    lastTrade: '25.00',
    openInterest: 100,
    volume: 10,
    greeks: { delta, gamma: '0.0100', theta: '-0.0200', vega: '0.3000' },
    timestamp: '2026-09-14T14:59:00Z'
  }
}

function makeWrapper(): ({ children }: { children: React.ReactNode }) => React.ReactElement {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  Wrapper.displayName = 'QueryClientWrapper'
  return Wrapper
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 14, 10, 0))
  mockOptionChain.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      marketData: {
        ...((window.api as { marketData?: unknown })?.marketData ?? {}),
        optionChain: mockOptionChain
      }
    }
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCallChain', () => {
  it('requests calls in the LEAPS window below the underlying price', async () => {
    mockOptionChain.mockResolvedValue({ ok: true, snapshots: [], nextCursor: null })

    renderHook(
      () => useCallChain({ ticker: 'XYZ', preset: LEAPS_PRESET, underlyingPrice: '100.00' }),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(mockOptionChain).toHaveBeenCalledOnce())
    expect(mockOptionChain).toHaveBeenCalledWith({
      underlying: 'XYZ',
      type: 'call',
      expirationFrom: '2027-03-13',
      strikeTo: '100.00'
    })
    // No `limit`: the adapter follows every page only when the caller does not page itself,
    // and a 180+ DTE window on a liquid name runs past a single 250-contract page.
    expect(mockOptionChain.mock.calls[0][0]).not.toHaveProperty('limit')
  })

  it('requests calls in the short window above the underlying price', async () => {
    mockOptionChain.mockResolvedValue({ ok: true, snapshots: [], nextCursor: null })

    renderHook(
      () => useCallChain({ ticker: 'XYZ', preset: SHORT_PRESET, underlyingPrice: '100.00' }),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(mockOptionChain).toHaveBeenCalledOnce())
    expect(mockOptionChain).toHaveBeenCalledWith({
      underlying: 'XYZ',
      type: 'call',
      expirationFrom: '2026-10-04',
      expirationTo: '2026-10-29',
      strikeFrom: '100.00'
    })
  })

  it('returns the success status and the delta-filtered contracts', async () => {
    mockOptionChain.mockResolvedValue({
      ok: true,
      snapshots: [quote(LOW, '0.60'), quote(KEEP, '0.80')],
      nextCursor: null
    })

    const { result } = renderHook(
      () => useCallChain({ ticker: 'XYZ', preset: LEAPS_PRESET, underlyingPrice: null }),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.contracts.map((q) => q.contractId)).toEqual([KEEP])
    expect(result.current.error).toBeNull()
  })

  it('keeps the selected contract after its delta drifts out of the band', async () => {
    mockOptionChain.mockResolvedValue({
      ok: true,
      snapshots: [quote(LOW, '0.69'), quote(KEEP, '0.80')],
      nextCursor: null
    })

    const { result } = renderHook(
      () =>
        useCallChain({
          ticker: 'XYZ',
          preset: LEAPS_PRESET,
          underlyingPrice: null,
          selectedContractId: LOW
        }),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.contracts.map((q) => q.contractId)).toEqual([LOW, KEEP])
  })

  it('drops adjusted-root contracts the provider returns for the ticker', async () => {
    mockOptionChain.mockResolvedValue({
      ok: true,
      snapshots: [quote('XYZ1270917C00080000', '0.80'), quote(KEEP, '0.80')],
      nextCursor: null
    })

    const { result } = renderHook(
      () => useCallChain({ ticker: 'xyz', preset: LEAPS_PRESET, underlyingPrice: null }),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.contracts.map((q) => q.contractId)).toEqual([KEEP])
  })

  it('returns the error status when the chain is unavailable', async () => {
    mockOptionChain.mockResolvedValue({
      ok: false,
      errors: [{ field: '__root__', code: 'network_error', message: 'down' }]
    })

    const { result } = renderHook(
      () => useCallChain({ ticker: 'XYZ', preset: LEAPS_PRESET, underlyingPrice: null }),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.contracts).toEqual([])
    expect(result.current.error).toMatchObject({ status: 502 })
  })

  it.each(['', 'TOOLONG', 'X1'])('does not query for ticker %j', async (ticker) => {
    const { result } = renderHook(
      () => useCallChain({ ticker, preset: LEAPS_PRESET, underlyingPrice: null }),
      { wrapper: makeWrapper() }
    )

    await Promise.resolve()
    expect(mockOptionChain).not.toHaveBeenCalled()
    expect(result.current.contracts).toEqual([])
  })

  it('queries again for a new ticker', async () => {
    mockOptionChain.mockResolvedValue({ ok: true, snapshots: [], nextCursor: null })

    const { rerender } = renderHook(
      ({ ticker }) => useCallChain({ ticker, preset: LEAPS_PRESET, underlyingPrice: null }),
      { wrapper: makeWrapper(), initialProps: { ticker: 'XYZ' } }
    )
    await waitFor(() => expect(mockOptionChain).toHaveBeenCalledOnce())

    rerender({ ticker: 'ABC' })

    await waitFor(() => expect(mockOptionChain).toHaveBeenCalledTimes(2))
    expect(mockOptionChain).toHaveBeenLastCalledWith(expect.objectContaining({ underlying: 'ABC' }))
  })

  it('is idle, not pending, for an empty ticker', async () => {
    const { result } = renderHook(
      () => useCallChain({ ticker: '', preset: LEAPS_PRESET, underlyingPrice: null }),
      { wrapper: makeWrapper() }
    )

    await Promise.resolve()
    expect(result.current.status).toBe('idle')
    expect(result.current.contracts).toEqual([])
  })

  it('keeps the previous contracts while a new underlying price refetches the chain', async () => {
    mockOptionChain
      .mockResolvedValueOnce({ ok: true, snapshots: [quote(KEEP, '0.80')], nextCursor: null })
      .mockReturnValueOnce(new Promise(() => {}))

    const { result, rerender } = renderHook(
      ({ underlyingPrice }) =>
        useCallChain({ ticker: 'XYZ', preset: LEAPS_PRESET, underlyingPrice }),
      { wrapper: makeWrapper(), initialProps: { underlyingPrice: '100.00' } }
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    rerender({ underlyingPrice: '105.00' })

    await waitFor(() => expect(mockOptionChain).toHaveBeenCalledTimes(2))
    expect(result.current.status).toBe('success')
    expect(result.current.contracts.map((q) => q.contractId)).toEqual([KEEP])
  })

  it('does not carry one ticker’s contracts over to another', async () => {
    mockOptionChain
      .mockResolvedValueOnce({ ok: true, snapshots: [quote(KEEP, '0.80')], nextCursor: null })
      .mockReturnValueOnce(new Promise(() => {}))

    const { result, rerender } = renderHook(
      ({ ticker }) => useCallChain({ ticker, preset: LEAPS_PRESET, underlyingPrice: null }),
      { wrapper: makeWrapper(), initialProps: { ticker: 'XYZ' } }
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    rerender({ ticker: 'ABC' })

    await waitFor(() => expect(mockOptionChain).toHaveBeenCalledTimes(2))
    expect(result.current.status).toBe('pending')
    expect(result.current.contracts).toEqual([])
  })

  it('does not query while disabled, even for a valid ticker', async () => {
    mockOptionChain.mockResolvedValue({ ok: true, snapshots: [], nextCursor: null })

    renderHook(
      () =>
        useCallChain({
          ticker: 'XYZ',
          preset: LEAPS_PRESET,
          underlyingPrice: null,
          enabled: false
        }),
      { wrapper: makeWrapper() }
    )

    await Promise.resolve()
    expect(mockOptionChain).not.toHaveBeenCalled()
  })

  it('keeps the loaded contracts once disabled, without refetching', async () => {
    mockOptionChain.mockResolvedValue({
      ok: true,
      snapshots: [quote(KEEP, '0.80')],
      nextCursor: null
    })

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useCallChain({ ticker: 'XYZ', preset: LEAPS_PRESET, underlyingPrice: null, enabled }),
      { wrapper: makeWrapper(), initialProps: { enabled: true } }
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    rerender({ enabled: false })

    expect(result.current.contracts.map((q) => q.contractId)).toEqual([KEEP])
    expect(mockOptionChain).toHaveBeenCalledOnce()
  })
})
