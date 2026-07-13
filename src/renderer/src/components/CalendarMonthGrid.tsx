import { format } from 'date-fns'
import { CHIP_LIMIT, visibleChips, type DayCell } from '../lib/expiration-calendar'
import { isDteUrgent } from '../lib/dte'
import { CalendarChip } from './CalendarChip'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type CalendarMonthGridProps = {
  grid: DayCell[][]
  selectedDate: string | null
  onSelectDate: (isoDate: string) => void
  emptyMonth: boolean
}

type DayCellViewProps = {
  cell: DayCell
  selectedDate: string | null
  onSelectDate: (isoDate: string) => void
}

function DayCellView({ cell, selectedDate, onSelectDate }: DayCellViewProps): React.JSX.Element {
  const isoDate = format(cell.date, 'yyyy-MM-dd')
  const { visible, hiddenCount } = visibleChips(cell.entries, CHIP_LIMIT)
  const isPopulated = cell.entries.length > 0
  const isSelected = isPopulated && selectedDate === isoDate
  const isSoon = cell.entries.some((entry) => isDteUrgent(entry.dte))

  return (
    <div
      data-testid={`day-cell-${isoDate}`}
      onClick={() => {
        if (isPopulated) onSelectDate(isoDate)
      }}
      className={[
        'min-h-24 p-2 flex flex-col gap-[5px] border-b border-r border-wb-border-subtle last:border-r-0',
        cell.inMonth ? '' : 'opacity-40',
        isPopulated ? 'cursor-pointer' : '',
        isSoon || isSelected ? 'bg-wb-gold-subtle ring-1 ring-inset ring-wb-gold' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center gap-[6px]">
        <span
          className={[
            'font-wb-mono text-[0.72rem]',
            cell.isToday ? 'font-bold text-wb-gold' : 'font-medium text-wb-text-secondary'
          ].join(' ')}
        >
          {cell.dayOfMonth}
        </span>
        {cell.isToday ? (
          <span className="font-wb-mono text-[0.55rem] tracking-[0.1em] text-wb-gold">TODAY</span>
        ) : isSoon ? (
          <span className="font-wb-mono text-[0.55rem] tracking-[0.1em] text-wb-gold">SOON</span>
        ) : null}
      </div>
      {visible.map((entry) => (
        <CalendarChip key={entry.id} entry={entry} dense />
      ))}
      {hiddenCount > 0 ? (
        <div className="font-wb-mono text-[0.62rem] text-wb-blue pl-[2px]">+{hiddenCount} more</div>
      ) : null}
    </div>
  )
}

export function CalendarMonthGrid({
  grid,
  selectedDate,
  onSelectDate,
  emptyMonth
}: CalendarMonthGridProps): React.JSX.Element {
  return (
    <div className="border border-wb-border rounded-lg overflow-hidden bg-wb-bg-surface">
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="p-[8px_10px] font-wb-mono text-[0.68rem] tracking-[0.05em] text-wb-text-muted border-b border-wb-border"
          >
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.flat().map((cell) => (
          <DayCellView
            key={format(cell.date, 'yyyy-MM-dd') + (cell.inMonth ? '' : '-spill')}
            cell={cell}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
          />
        ))}
      </div>
      {emptyMonth ? (
        <div className="py-7 px-4 text-center">
          <div className="text-wb-text-primary text-[0.95rem] mb-[6px]">
            No expirations this month
          </div>
          <div className="text-wb-text-secondary text-[0.8rem]">
            Navigate to a month with active option positions to see them here.
          </div>
        </div>
      ) : null}
    </div>
  )
}
