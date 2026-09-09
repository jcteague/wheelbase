import { formatIvrValue } from '../lib/screener-format'
import type { ScreenerIvRank } from '../api/screener'

type IvrCellProps = {
  ivRank: ScreenerIvRank | null
}

// Built once: constructing an Intl formatter is comparatively expensive and this
// renders on every row of every screen.
const easternDay = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

function observedInEasternTime(observedAt: string): string {
  return easternDay.format(new Date(observedAt))
}

export function IvrCell({ ivRank }: IvrCellProps): React.JSX.Element {
  if (ivRank === null) {
    return (
      <span data-ivr-state="empty" className="text-wb-text-muted">
        n/a
      </span>
    )
  }

  const ageLabel = `${ivRank.ageTradingDays} trading ${ivRank.ageTradingDays === 1 ? 'day' : 'days'} old`
  const observedLabel = `Observed ${observedInEasternTime(ivRank.observedAt)}`
  const title = `${ageLabel}; ${observedLabel}`
  // A reading the screener refused to score reads muted, so the number on screen
  // never looks like one the rank was built on.
  const scored = ivRank.state === 'fresh' || ivRank.state === 'aging'
  const toneClass = scored ? 'text-wb-text-primary' : 'text-wb-text-muted'
  const value = formatIvrValue(ivRank.value)

  return (
    <span
      data-testid="ivr-cell"
      data-ivr-state={ivRank.state}
      title={title}
      aria-label={`IV rank ${value}, ${title}`}
      className={`inline-flex flex-col items-end ${toneClass}`}
    >
      <span>
        {value}
        {ivRank.state === 'aging' || ivRank.state === 'stale' ? ` · ${ivRank.ageTradingDays}d` : ''}
      </span>
      {ivRank.state === 'predates_earnings' && (
        <span className="text-[0.62rem] text-wb-text-muted">predates earnings</span>
      )}
    </span>
  )
}
