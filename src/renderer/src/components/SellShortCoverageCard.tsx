// [US-115] The Sell Short Call sheet's Coverage card: the open LEAPS and how the last cycle ended.
import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { LegDetail } from '../api/positions'
import { coverageCardLine, previousCycleLine, type PmccEndedCycle } from '../lib/pmcc-sell-short'
import { SectionCard } from './ui/SectionCard'

type SellShortCoverageCardProps = {
  leaps: LegDetail
  /** The LEAPS' live delta; `null` while no snapshot carries one. */
  leapsDelta: string | null
  previousCycle: PmccEndedCycle | null
  /** The valuation day (`yyyy-MM-dd`) the DTE and the uncovered days count to. */
  today: string
}

export function SellShortCoverageCard({
  leaps,
  leapsDelta,
  previousCycle,
  today
}: SellShortCoverageCardProps): React.JSX.Element {
  const dte = differenceInCalendarDays(parseISO(leaps.expiration), parseISO(today))
  return (
    <SectionCard header="Coverage" headerVariant="emphasized">
      <div
        data-testid="pmcc-sell-short-coverage"
        className="flex flex-col gap-1 px-4 py-3 font-wb-mono text-xs"
      >
        <span className="text-wb-gold">{coverageCardLine(leaps, dte, leapsDelta)}</span>
        <span className="text-wb-text-secondary">{previousCycleLine(previousCycle, today)}</span>
      </div>
    </SectionCard>
  )
}
