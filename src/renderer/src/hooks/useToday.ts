import { useEffect, useState } from 'react'
import { addDays, startOfDay } from 'date-fns'

/**
 * The current local calendar day, normalized to midnight. Reference-stable
 * within a day (safe as a `useMemo`/`useEffect` dependency) but rolls over to
 * the next day on its own via a scheduled timeout, so a long-running session
 * doesn't need a remount to notice midnight has passed.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()))

  useEffect(() => {
    const msUntilMidnight = addDays(today, 1).getTime() - Date.now()
    const timer = setTimeout(() => setToday(startOfDay(new Date())), Math.max(msUntilMidnight, 0))
    return () => clearTimeout(timer)
  }, [today])

  return today
}
