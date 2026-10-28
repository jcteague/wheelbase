import type { CardTone } from './types'

/** Small uppercase label above a figure. */
export const EYEBROW =
  'font-wb-mono text-[9px] font-semibold uppercase tracking-[0.11em] text-wb-text-muted'

/** The card's headline figure, the P&L; callers add its colour. */
export const HEADLINE_FIGURE = 'font-wb-mono text-2xl font-semibold tabular-nums tracking-[-0.01em]'

/** Muted note under a figure. */
export const SUB = 'font-wb-mono text-[10.5px] text-wb-text-muted'

export const TONE_TEXT_CLASS: Record<CardTone, string> = {
  red: 'text-wb-red',
  gold: 'text-wb-gold'
}
