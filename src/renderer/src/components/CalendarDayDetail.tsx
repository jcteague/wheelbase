import { format, parseISO } from 'date-fns'
import { isDteUrgent } from '../lib/dte'
import type { CalendarEntry } from '../lib/expiration-calendar'
import { PHASE_COLOR } from '../lib/phase'
import { fmtMoney } from '../lib/format'
import { ExpiringSoonFlag } from './ExpiringSoonFlag'
import { PhaseBadge } from './PhaseBadge'
import { SectionCard } from './ui/SectionCard'

type CalendarDayDetailProps = {
  date: string | null
  entries: CalendarEntry[]
  onReview: (id: string) => void
}

function EntryCard({
  entry,
  onReview
}: {
  entry: CalendarEntry
  onReview: (id: string) => void
}): React.JSX.Element {
  const color = PHASE_COLOR[entry.phase]
  const soon = isDteUrgent(entry.dte)

  return (
    <div
      className={`p-3 rounded-lg border ${soon ? 'border-wb-gold-border' : 'border-wb-border'} bg-wb-bg-elevated`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center justify-between">
        <span className="font-wb-mono font-bold text-[0.9rem] text-wb-text-primary">
          {entry.ticker}
        </span>
        <PhaseBadge phase={entry.phase} />
      </div>
      {soon ? (
        <div className="mt-2">
          <ExpiringSoonFlag />
        </div>
      ) : null}
      <div className="flex gap-[18px] mt-[10px] font-wb-mono text-[0.72rem]">
        <div>
          <div className="text-wb-text-muted text-[0.62rem]">STRIKE</div>
          <div className="text-wb-text-primary">
            {entry.strike != null ? fmtMoney(entry.strike) : '—'}
          </div>
        </div>
        <div>
          <div className="text-wb-text-muted text-[0.62rem]">DTE</div>
          <div className={soon ? 'text-wb-gold' : 'text-wb-text-primary'}>
            {entry.dte != null ? `${entry.dte}d` : '—'}
          </div>
        </div>
        <div>
          <div className="text-wb-text-muted text-[0.62rem]">EXPIRES</div>
          <div className="text-wb-text-primary">{format(parseISO(entry.expiration), 'MMM d')}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onReview(entry.id)}
        className="mt-[10px] w-full py-[7px] rounded-lg border border-wb-border bg-transparent text-wb-gold font-wb-mono text-[0.72rem] cursor-pointer"
      >
        Review position →
      </button>
    </div>
  )
}

export function CalendarDayDetail({
  date,
  entries,
  onReview
}: CalendarDayDetailProps): React.JSX.Element {
  const hasSelection = date != null && entries.length > 0
  const header = hasSelection
    ? `${format(parseISO(date), 'MMM d')} · ${entries.length} expirations`
    : 'Day Detail'

  return (
    <SectionCard header={header} className="self-start">
      <div className="p-[14px] flex flex-col gap-[10px]">
        {hasSelection ? (
          entries.map((entry) => <EntryCard key={entry.id} entry={entry} onReview={onReview} />)
        ) : (
          <div className="text-wb-text-secondary text-[0.82rem] leading-[1.7]">
            Click any populated date to inspect the expirations, strike context, and DTE for that
            day.
          </div>
        )}
      </div>
    </SectionCard>
  )
}
