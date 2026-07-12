import { useState } from 'react'

export type CalendarView = 'grid' | 'agenda'

const STORAGE_KEY = 'wb.calendar.view'

function readStoredView(): CalendarView {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'grid' || stored === 'agenda' ? stored : 'grid'
}

export function useCalendarView(): [CalendarView, (view: CalendarView) => void] {
  const [view, setView] = useState<CalendarView>(readStoredView)

  const updateView = (next: CalendarView): void => {
    localStorage.setItem(STORAGE_KEY, next)
    setView(next)
  }

  return [view, updateView]
}
