import { usePromoteBanner } from '../hooks/usePromoteBanner'
import type { PromotedCandidate } from '../lib/promote'
import { PromotedQuoteNotice } from './PromotedQuoteNotice'
import { PromoteProvenance } from './PromoteProvenance'

type PromotedFormChromeProps = {
  promoted: PromotedCandidate
  /** The premium field's live value, so an override is announced as it is typed. */
  currentPremium: string
}

/**
 * [US-68] The header the new-wheel form grows when it was promoted from the screener:
 * where the values came from, and how the one-shot fresh quote reconciles with them.
 *
 * A component rather than a branch inside `NewWheelForm` so the market-data hooks
 * mount only when something was promoted — `useMarketStatusDisplay` polls broker
 * status every 60s, and the plain US-1 form must not start that.
 */
export function PromotedFormChrome({
  promoted,
  currentPremium
}: PromotedFormChromeProps): React.JSX.Element {
  const { banner, quotedAt } = usePromoteBanner(promoted, currentPremium)

  return (
    <div className="flex flex-col gap-4">
      <PromoteProvenance quotedAt={quotedAt} />
      <PromotedQuoteNotice banner={banner} />
    </div>
  )
}
