import { format } from 'date-fns'
import { isDteUrgent } from '../lib/dte'
import type { AgendaDay, AgendaWeek, CalendarEntry } from '../lib/expiration-calendar'
import { fmtMoney } from '../lib/format'
import { PhaseBadge } from './PhaseBadge'
import { WeekDensityBar } from './WeekDensityBar'

type CalendarAgendaProps = {
  weeks: AgendaWeek[]
}

function AgendaEntryRow({ entry }: { entry: CalendarEntry }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[64px_96px_1fr_auto] gap-3 items-center font-wb-mono text-[0.75rem]">
      <span className="font-bold text-wb-text-primary">{entry.ticker}</span>
      <PhaseBadge phase={entry.phase} />
      <span className="text-wb-text-secondary">
        {entry.strike != null ? fmtMoney(entry.strike) : '—'} strike
      </span>
      <span className={isDteUrgent(entry.dte) ? 'text-wb-gold' : 'text-wb-text-secondary'}>
        {entry.dte ?? '—'} DTE
      </span>
    </div>
  )
}

function AgendaDayRow({ day }: { day: AgendaDay }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-3.5 items-center px-3.5 py-3 border-t border-wb-border-subtle">
      <div className="text-center">
        <div className="font-wb-mono text-[0.62rem] text-wb-text-muted">
          {format(day.date, 'EEE')}
        </div>
        <div className="font-wb-mono text-[1.35rem] font-bold text-wb-text-primary">
          {format(day.date, 'd')}
        </div>
        <div className="font-wb-mono text-[0.6rem] text-wb-text-muted">
          {format(day.date, 'MMM').toUpperCase()}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {day.entries.map((entry) => (
          <AgendaEntryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  )
}

function AgendaWeekCard({ week }: { week: AgendaWeek }): React.JSX.Element {
  const allEntries = week.days.flatMap((day) => day.entries)

  return (
    <div
      data-testid={`agenda-week-${format(week.weekStart, 'yyyy-MM-dd')}`}
      className={[
        'rounded-lg overflow-hidden bg-wb-bg-surface border',
        week.isBusy ? 'border-wb-gold' : 'border-wb-border'
      ].join(' ')}
    >
      <div
        className={[
          'flex items-center justify-between px-3.5 py-2.5 border-b border-wb-border',
          week.isBusy ? 'bg-wb-gold-subtle' : ''
        ].join(' ')}
      >
        <div className="flex items-baseline gap-2.5">
          <span className="font-semibold text-wb-text-primary text-[0.9rem]">{week.label}</span>
          <span className="font-wb-mono text-[0.7rem] text-wb-text-muted">{week.rangeLabel}</span>
          {week.isBusy ? (
            <span className="font-wb-mono text-[0.6rem] tracking-[0.1em] text-wb-gold border border-wb-gold rounded-full px-[7px] py-[1px]">
              BUSY WEEK
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2.5">
          <WeekDensityBar entries={allEntries} />
          <span className="font-wb-mono text-[0.72rem] text-wb-text-secondary w-16 text-right">
            {week.total} expiring
          </span>
        </div>
      </div>
      {week.days.map((day) => (
        <AgendaDayRow key={day.date.toISOString()} day={day} />
      ))}
    </div>
  )
}

export function CalendarAgenda({ weeks }: CalendarAgendaProps): React.JSX.Element {
  if (weeks.length === 0) {
    return (
      <div className="rounded-lg border border-wb-border bg-wb-bg-surface px-4 py-12 text-center">
        <div className="text-wb-text-primary text-[0.95rem] mb-1.5">
          No expirations in the next 30 days
        </div>
        <div className="text-wb-text-secondary text-[0.8rem]">
          Your management horizon is clear — no options are set to expire.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5">
      {weeks.map((week) => (
        <AgendaWeekCard key={week.weekStart.toISOString()} week={week} />
      ))}
    </div>
  )
}
