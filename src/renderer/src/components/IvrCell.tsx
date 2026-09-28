import type { IvRankPair, ScreenerIvRank } from '../api/screener'
import {
  isUsableIvrState,
  ivrAbsenceTitle,
  ivrTooltipCopy,
  observedDayLabel,
  tradingDaysLabel
} from '../lib/ivr-tooltip'
import { formatIvrValue } from '../lib/screener-format'
import { FreshnessRing } from './FreshnessRing'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

type IvrCellProps = {
  /** The row's reading or, when there is none, why — passed as one pair so the
   *  exactly-one-non-null correlation survives the prop boundary. */
  ivr: IvRankPair
}

const TIER_TEXT: Record<ScreenerIvRank['state'], string> = {
  fresh: 'text-wb-green',
  aging: 'text-wb-text-secondary',
  stale: 'text-wb-text-muted',
  expired: 'text-wb-text-muted',
  predates_earnings: 'text-wb-gold'
}

export function IvrCell({ ivr }: IvrCellProps): React.JSX.Element {
  const { ivRank, ivRankAbsence: absence } = ivr
  // No reading: say why, with no ring and no tooltip — there is nothing to explain yet.
  if (ivRank === null) {
    const absenceTitle = ivrAbsenceTitle(absence)
    if (absence.reason === 'pending') {
      return (
        <span
          data-ivr-state="pending"
          className="text-wb-text-muted animate-wb-pulse"
          title={absenceTitle}
        >
          …
        </span>
      )
    }
    return (
      <span
        data-ivr-state="empty"
        data-ivr-reason={absence.reason}
        className="text-wb-text-muted"
        title={absenceTitle}
      >
        n/a
      </span>
    )
  }

  // A reading the screener refused to score reads muted, so the number on screen
  // never looks like one the rank was built on.
  const toneClass = isUsableIvrState(ivRank.state) ? 'text-wb-text-primary' : 'text-wb-text-muted'
  // Age earns its place on the row only once it is old enough to change a decision;
  // a fresh reading would just repeat the same small number on every line.
  const showsAge = ivRank.state === 'aging' || ivRank.state === 'stale'
  // An aged-out number would read as current. `exp` says the reading exists but has
  // gone past use, which "n/a" — never collected at all — does not.
  const expired = ivRank.state === 'expired'
  const value = expired ? 'exp' : formatIvrValue(ivRank.value)
  // The ring and the tooltip are sighted-only, so the label carries the whole reading.
  const ariaLabel = `IV rank ${value}, ${tradingDaysLabel(ivRank.ageTradingDays)} old; Observed ${observedDayLabel(ivRank.observedAt)}; IV percentile ${ivRank.percentile}; 52-week IV ${ivRank.low} to ${ivRank.high}`
  const { title, body } = ivrTooltipCopy(ivRank)

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="ivr-cell"
            data-ivr-state={ivRank.state}
            tabIndex={0}
            aria-label={ariaLabel}
            className={`inline-flex cursor-default items-center gap-1.5 ${toneClass}`}
          >
            <span className={expired ? 'font-normal' : ''}>
              {value}
              {showsAge ? ` · ${ivRank.ageTradingDays}d` : ''}
            </span>
            <FreshnessRing state={ivRank.state} />
          </span>
        </TooltipTrigger>
        <TooltipContent data-testid="ivr-tooltip">
          <span className="mb-1 flex items-center gap-2">
            <FreshnessRing state={ivRank.state} size={12} />
            <span
              className={`font-wb-mono text-[0.62rem] font-bold uppercase tracking-widest ${TIER_TEXT[ivRank.state]}`}
            >
              {title}
            </span>
          </span>
          <p className="text-xs leading-relaxed text-wb-text-secondary">{body}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
