import { formatActionLine } from '../../lib/card-actions'
import { TONE_TEXT_CLASS } from './styles'
import type { CardAction, CardTone } from './types'

const STRIP_CLASS: Record<CardTone, string> = {
  red: 'border-b border-wb-red/40 bg-wb-red/20',
  gold: 'border-b border-wb-gold/40 bg-wb-gold/20'
}

const CHIP_CLASS: Record<CardTone, string> = {
  red: 'border-wb-red/50 text-wb-red',
  gold: 'border-wb-gold/50 text-wb-gold'
}

type ActionStripProps = {
  /** Ranked worst first; the first leads, the rest ride on a +N chip. */
  actions: CardAction[]
}

export function ActionStrip({ actions }: ActionStripProps): React.JSX.Element | null {
  if (actions.length === 0) return null
  const [top, ...rest] = actions
  return (
    <div
      data-testid="action-strip"
      data-tone={top.tone}
      role="status"
      className={`flex items-center gap-2 px-[13px] py-[8px] font-wb-mono ${STRIP_CLASS[top.tone]}`}
    >
      <span aria-hidden="true" className={`text-[16px] leading-none ${TONE_TEXT_CLASS[top.tone]}`}>
        {top.glyph}
      </span>
      <span className="min-w-0 text-[11.5px] leading-snug">
        <span className={`text-[12px] font-bold tracking-[0.12em] ${TONE_TEXT_CLASS[top.tone]}`}>
          {top.statusWord}
        </span>
        <span className="text-wb-text-primary"> · {top.summary}</span>
      </span>
      {rest.length > 0 && (
        <span
          title={`Also open:\n${rest.map(formatActionLine).join('\n')}`}
          className={`ml-auto shrink-0 cursor-help rounded border px-[6px] py-px text-[10px] font-bold ${CHIP_CLASS[rest[0].tone]}`}
        >
          +{rest.length}
        </span>
      )}
    </div>
  )
}
