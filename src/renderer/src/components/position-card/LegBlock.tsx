import type { ReactNode } from 'react'
import { formatActionLine } from '../../lib/card-actions'
import { LegTag, type LegTagValue } from './LegTag'
import { TONE_TEXT_CLASS } from './styles'
import type { CardAction, CardTone } from './types'

const LEG_BASE =
  'grid grid-cols-[auto_1fr_auto_auto] items-center gap-[10px] rounded-[7px] border px-[10px] py-2 font-wb-mono text-[11.5px] tabular-nums'

const LEG_PLAIN_CLASS = `${LEG_BASE} border-wb-border-subtle bg-wb-bg-base`

const LEG_ACTION_CLASS: Record<CardTone, string> = {
  red: `${LEG_BASE} border-wb-red/30 border-l-[3px] border-l-wb-red bg-wb-red-dim`,
  gold: `${LEG_BASE} border-wb-gold-border border-l-[3px] border-l-wb-gold bg-wb-gold-dim`
}

function LegMarks({ actions }: { actions: CardAction[] }): React.JSX.Element | null {
  if (actions.length === 0) return null
  return (
    <span
      title={actions.map(formatActionLine).join('\n')}
      className={`mr-[6px] cursor-help ${TONE_TEXT_CLASS[actions[0].tone]}`}
    >
      {actions.map((action) => action.glyph).join(' ')}
    </span>
  )
}

type LegBlockProps = {
  tag: LegTagValue
  /** Open actions on this leg, worst first; the first sets the highlight tone. */
  actions?: CardAction[]
  title: ReactNode
  dte: ReactNode
  mark: ReactNode
  trailing?: ReactNode
}

export function LegBlock({
  tag,
  actions = [],
  title,
  dte,
  mark,
  trailing
}: LegBlockProps): React.JSX.Element {
  const tone = actions[0]?.tone
  return (
    <div
      data-testid="leg-block"
      data-action={tone}
      className={tone ? LEG_ACTION_CLASS[tone] : LEG_PLAIN_CLASS}
    >
      <LegTag tag={tag} />
      <span className="text-wb-text-primary">
        <LegMarks actions={actions} />
        {title}
      </span>
      <span>{dte}</span>
      <span className="justify-self-end text-wb-text-secondary">
        {mark}
        {trailing}
      </span>
    </div>
  )
}
