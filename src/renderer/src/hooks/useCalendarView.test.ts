import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCalendarView } from './useCalendarView'

const STORAGE_KEY = 'wb.calendar.view'

describe('useCalendarView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to "grid" when localStorage has no stored view', () => {
    const { result } = renderHook(() => useCalendarView())

    expect(result.current[0]).toBe('grid')
  })

  it('restores the persisted view from localStorage on init', () => {
    localStorage.setItem(STORAGE_KEY, 'agenda')

    const { result } = renderHook(() => useCalendarView())

    expect(result.current[0]).toBe('agenda')
  })

  it('writes the new view to localStorage when set', () => {
    const { result } = renderHook(() => useCalendarView())

    act(() => {
      result.current[1]('agenda')
    })

    expect(result.current[0]).toBe('agenda')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('agenda')
  })

  it('falls back to "grid" for an invalid stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'heatmap')

    const { result } = renderHook(() => useCalendarView())

    expect(result.current[0]).toBe('grid')
  })
})
