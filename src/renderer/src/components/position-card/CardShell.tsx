import type { ReactNode } from 'react'
import { PHASE_TOKEN, type PhaseToken } from '../../lib/phase'
import type { CardAccent, CardTone } from './types'

// Literal class strings so Tailwind sees them; the colour each phase gets is `PHASE_TOKEN`'s.
const BORDER_L_CLASS: Record<PhaseToken, string> = {
  gold: 'border-l-wb-gold',
  'text-muted': 'border-l-wb-text-muted',
  green: 'border-l-wb-green',
  red: 'border-l-wb-red',
  sky: 'border-l-wb-sky',
  violet: 'border-l-wb-violet',
  teal: 'border-l-wb-teal'
}

// Per side, so hovering never paints over the left border's accent or action edge.
const HOVER_BORDER =
  'hover:border-t-wb-text-muted/60 hover:border-r-wb-text-muted/60 hover:border-b-wb-text-muted/60'

function accentToken(accent: CardAccent): PhaseToken {
  return PHASE_TOKEN[accent === 'PMCC' ? 'PMCC_OPEN' : accent]
}

type CardShellProps = {
  accent: CardAccent
  /** An open action's tone; replaces the strategy accent on the left border. */
  edge?: CardTone
  /** Dims the card and gives it the closed test id. */
  closed?: boolean
  /** Where a click anywhere on the card navigates. */
  href: string
  children: ReactNode
}

export function CardShell({
  accent,
  edge,
  closed = false,
  href,
  children
}: CardShellProps): React.JSX.Element {
  function navigateToHref(): void {
    window.location.hash = href
  }

  return (
    <div
      data-testid={closed ? 'position-card-closed' : 'position-card'}
      data-edge={edge ?? accent}
      onClick={navigateToHref}
      className={[
        'flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-wb-border bg-wb-bg-surface transition-colors',
        edge
          ? `border-l-4 ${BORDER_L_CLASS[edge]}`
          : `border-l-2 ${BORDER_L_CLASS[accentToken(accent)]}`,
        closed ? 'opacity-50' : HOVER_BORDER
      ].join(' ')}
    >
      {children}
    </div>
  )
}
