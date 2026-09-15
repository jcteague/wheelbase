import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarketStatus } from './useMarketStatus'
import { useSettingsStatus } from './useSettings'
import { useMarketStatusDisplay } from './useMarketStatusDisplay'

vi.mock('./useMarketStatus')
vi.mock('./useSettings')

const mockUseMarketStatus = vi.mocked(useMarketStatus)
const mockUseSettingsStatus = vi.mocked(useSettingsStatus)

describe('useMarketStatusDisplay', () => {
  beforeEach(() => {
    mockUseSettingsStatus.mockReturnValue({
      data: { activeBrokerEnv: 'alpaca_paper', marketData: 'configured' },
      isLoading: false,
      isError: false
    } as unknown as ReturnType<typeof useSettingsStatus>)
    mockUseMarketStatus.mockReturnValue({
      data: { session: 'regular' },
      isLoading: false,
      isError: false
    } as unknown as ReturnType<typeof useMarketStatus>)
  })

  it('derives hasMarketData from settings and passes it to useMarketStatus', () => {
    renderHook(() => useMarketStatusDisplay())

    expect(mockUseMarketStatus).toHaveBeenCalledWith(true)
  })

  // [US-116] The pill asks whether the market-data provider is reachable, not whether a
  // broker is attached — the session is a market fact.
  it('enables the status query on market-data credentials alone, with no broker', () => {
    mockUseSettingsStatus.mockReturnValue({
      data: { activeBrokerEnv: 'none', marketData: 'configured' },
      isLoading: false,
      isError: false
    } as unknown as ReturnType<typeof useSettingsStatus>)

    const { result } = renderHook(() => useMarketStatusDisplay())

    expect(mockUseMarketStatus).toHaveBeenCalledWith(true)
    expect(result.current.hasMarketData).toBe(true)
    expect(result.current.display).toBe('LIVE')
  })

  it('passes hasMarketData=false to useMarketStatus when market data is not configured', () => {
    mockUseSettingsStatus.mockReturnValue({
      data: { activeBrokerEnv: 'alpaca_paper', marketData: 'missing' },
      isLoading: false,
      isError: false
    } as unknown as ReturnType<typeof useSettingsStatus>)

    renderHook(() => useMarketStatusDisplay())

    expect(mockUseMarketStatus).toHaveBeenCalledWith(false)
  })

  it('derives LIVE display from a regular session when not stale', () => {
    const { result } = renderHook(() => useMarketStatusDisplay(false))

    expect(result.current.display).toBe('LIVE')
    expect(result.current.hasMarketData).toBe(true)
  })

  it('derives DELAYED display when stale, regardless of session', () => {
    const { result } = renderHook(() => useMarketStatusDisplay(true))

    expect(result.current.display).toBe('DELAYED')
  })

  it('defaults stale to false when not provided', () => {
    const { result } = renderHook(() => useMarketStatusDisplay())

    expect(result.current.display).toBe('LIVE')
  })

  it('exposes the underlying settings and status queries', () => {
    const { result } = renderHook(() => useMarketStatusDisplay())

    expect(result.current.settingsQuery.data?.marketData).toBe('configured')
    expect(result.current.statusQuery.data?.session).toBe('regular')
  })
})
