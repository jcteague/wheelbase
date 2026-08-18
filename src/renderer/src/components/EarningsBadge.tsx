// [US-70] The earnings caution beneath a ticker in the ranked results.
// Copy and treatment come from mockups/us-66-screener-results.mdx:285.
import type { ScreenerCandidateEarnings } from '../api/screener'
import { fmtDate } from '../lib/format'

type EarningsBadgeProps = {
  earnings: ScreenerCandidateEarnings
}

const PILL =
  'inline-flex items-center gap-[5px] rounded-full border px-[7px] py-px font-wb-mono text-[0.58rem] font-bold tracking-[0.04em] whitespace-nowrap'

// Gold is deliberately not red: an earnings-window candidate is a judgement call the
// trader may take on purpose. An unknown date is neither a risk verdict nor a clean
// bill of health, so it gets the neutral treatment instead.
const CAUTION = 'bg-wb-gold-dim border-wb-gold-border text-wb-gold'
const NEUTRAL = 'bg-wb-bg-elevated border-wb-border text-wb-text-secondary'

/** Status → treatment, as a table rather than a chain of ternaries. `clear` is absent
 *  because a clear candidate renders no badge at all. */
const TREATMENT: Record<Exclude<ScreenerCandidateEarnings['status'], 'clear'>, string> = {
  flagged: CAUTION,
  unknown: NEUTRAL,
  unavailable: NEUTRAL
}

/** `daysBeforeExpiry` arrives on the payload — the engine already did this arithmetic,
 *  and recomputing it here would give the renderer a second opinion on gap risk. */
function badgeCopy(earnings: Exclude<ScreenerCandidateEarnings, { status: 'clear' }>): string {
  switch (earnings.status) {
    case 'flagged':
      return `⚠ Earnings ${fmtDate(earnings.date)} · ${earnings.daysBeforeExpiry}d before expiry`
    case 'unknown':
      return '? Earnings date unknown'
    case 'unavailable':
      return '? Earnings date unavailable'
  }
}

export function EarningsBadge({ earnings }: EarningsBadgeProps): React.JSX.Element | null {
  if (earnings.status === 'clear') return null

  return (
    <span data-testid="earnings-badge" className={`${PILL} ${TREATMENT[earnings.status]}`}>
      {badgeCopy(earnings)}
    </span>
  )
}
