import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToday } from './useToday'

describe('useToday', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the start of the current local day', () => {
    vi.setSystemTime(new Date(2026, 7, 10, 14, 30))

    const { result } = renderHook(() => useToday())

    expect(result.current).toEqual(new Date(2026, 7, 10))
  })

  it('rolls over to the next day at local midnight without a remount', () => {
    vi.setSystemTime(new Date(2026, 7, 10, 23, 59, 0))
    const { result } = renderHook(() => useToday())
    expect(result.current).toEqual(new Date(2026, 7, 10))

    act(() => {
      vi.setSystemTime(new Date(2026, 7, 11, 0, 0, 1))
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current).toEqual(new Date(2026, 7, 11))
  })

  it('returns a reference-stable value across re-renders on the same day', () => {
    vi.setSystemTime(new Date(2026, 7, 10, 9, 0))

    const { result, rerender } = renderHook(() => useToday())
    const first = result.current
    rerender()

    expect(result.current).toBe(first)
  })
})
