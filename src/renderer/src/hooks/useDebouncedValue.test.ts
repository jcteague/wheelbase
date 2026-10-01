import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedValue', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('XYZ', 300))
    expect(result.current).toBe('XYZ')
  })

  it('holds the previous value until the new one has been stable for the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'X' }
    })

    rerender({ value: 'XY' })
    act(() => vi.advanceTimersByTime(299))
    expect(result.current).toBe('X')

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('XY')
  })

  it('restarts the delay on every change, so only the last value lands', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: '' }
    })

    rerender({ value: 'A' })
    act(() => vi.advanceTimersByTime(200))
    rerender({ value: 'AA' })
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe('')

    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe('AA')
  })
})
