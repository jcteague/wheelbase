import type { PnlTone } from '../../lib/wheel-card-display'
import { HEADLINE_FIGURE } from './styles'

const PNL_TONE_CLASS: Record<PnlTone, string> = {
  gain: 'text-wb-green',
  loss: 'text-wb-red'
}

const WIDE_PNL_TOOLTIP = 'Wide spread — the LEAPS spread makes this P&L unreliable'

/** A valued P&L; `wide` (PMCC only) marks it unreliable with a ⚠. */
type ValuedFigure = { amount: string; tone: PnlTone; percentLine: string; wide?: boolean }

type PnlFigureProps = {
  /** A blank P&L is the note shown in place of the percent line, under a dash. */
  pnl: ValuedFigure | string
  testId: string
}

/** A card's headline P&L over its percent line — shared by both cards. */
export function PnlFigure({ pnl, testId }: PnlFigureProps): React.JSX.Element {
  const blank = typeof pnl === 'string'
  const tone = blank ? 'text-wb-text-muted' : PNL_TONE_CLASS[pnl.tone]
  return (
    <div data-testid={testId}>
      <div className={`${HEADLINE_FIGURE} ${tone}`}>
        {blank ? '—' : pnl.amount}
        {!blank && pnl.wide && (
          <span title={WIDE_PNL_TOOLTIP} className="ml-1 cursor-help text-[13px] text-wb-gold">
            ⚠
          </span>
        )}
      </div>
      <div className={`font-wb-mono text-[10.5px] ${tone}`}>{blank ? pnl : pnl.percentLine}</div>
    </div>
  )
}
