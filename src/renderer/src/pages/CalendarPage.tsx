import { useMemo, useState } from 'react'
import { addMonths, format, startOfMonth, subMonths } from 'date-fns'
import { useLocation } from 'wouter'
import { CalendarAgenda } from '../components/CalendarAgenda'
import { CalendarDayDetail } from '../components/CalendarDayDetail'
import { CalendarLegend } from '../components/CalendarLegend'
import { CalendarMonthGrid } from '../components/CalendarMonthGrid'
import { CalendarMonthNav } from '../components/CalendarMonthNav'
import { CalendarViewToggle } from '../components/CalendarViewToggle'
import { MarketStatusPill } from '../components/MarketStatusPill'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { useCalendarView } from '../hooks/useCalendarView'
import { useMarketStatusDisplay } from '../hooks/useMarketStatusDisplay'
import { usePositions } from '../hooks/usePositions'
import { useToday } from '../hooks/useToday'
import {
  buildAgendaWeeks,
  buildMonthGrid,
  groupByExpiration,
  toCalendarEntries
} from '../lib/expiration-calendar'

export const CALENDAR_PAGE_TITLE = 'Expiration Calendar'

export function CalendarPage(): React.JSX.Element {
  const [, setLocation] = useLocation()
  const [view, setView] = useCalendarView()
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const { data: positions } = usePositions()
  // CalendarPage never fetches stock quotes, so there's no staleness signal to pass through.
  const { display: marketStatusDisplay } = useMarketStatusDisplay()

  const today = useToday()
  const entries = useMemo(() => toCalendarEntries(positions ?? []), [positions])
  const byDate = useMemo(() => groupByExpiration(entries), [entries])

  const grid = useMemo(() => buildMonthGrid(viewMonth, byDate, today), [viewMonth, byDate, today])
  const emptyMonth = useMemo(() => grid.flat().every((cell) => cell.entries.length === 0), [grid])
  const weeks = useMemo(() => buildAgendaWeeks(entries, today), [entries, today])
  const selectedEntries = selectedDate ? (byDate.get(selectedDate) ?? []) : []

  const goToMonth = (next: Date): void => {
    setViewMonth(next)
    setSelectedDate(null)
  }

  return (
    <PageLayout
      header={
        <PageHeader
          left={
            <h1 className="text-sm font-semibold text-wb-text-primary m-0">
              {CALENDAR_PAGE_TITLE}
            </h1>
          }
          right={
            <div className="flex items-center gap-[10px]">
              <MarketStatusPill state={marketStatusDisplay} />
              <CalendarViewToggle value={view} onChange={setView} />
            </div>
          }
        />
      }
    >
      <div className="flex items-center justify-between px-[24px] py-[14px]">
        {view === 'grid' ? (
          <CalendarMonthNav
            label={format(viewMonth, 'MMMM yyyy')}
            onPrev={() => goToMonth(subMonths(viewMonth, 1))}
            onNext={() => goToMonth(addMonths(viewMonth, 1))}
            onToday={() => goToMonth(startOfMonth(new Date()))}
          />
        ) : (
          <div className="text-[1.15rem] font-semibold text-wb-text-primary">
            Management Horizon · Next 30 Days
          </div>
        )}
        <CalendarLegend />
      </div>

      <div className="px-[24px] pb-[24px]">
        {view === 'grid' ? (
          <div className="grid grid-cols-[1fr_320px] gap-[16px]">
            <CalendarMonthGrid
              grid={grid}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              emptyMonth={emptyMonth}
            />
            <CalendarDayDetail
              date={selectedDate}
              entries={selectedEntries}
              onReview={(id) => setLocation(`/positions/${id}`)}
            />
          </div>
        ) : (
          <CalendarAgenda weeks={weeks} />
        )}
      </div>
    </PageLayout>
  )
}
