// [US-109] The leg timeline's colours: one place mapping a net's direction and a cycle's
// outcome to `wb-*` classes, shared by the strip, the LEAPS track and the cycle groups.
import Decimal from 'decimal.js'
import { netDirection, type NetDirection } from '../../../../shared/net-direction'
import { TOKEN_HEX } from '../../lib/phase'
import type { CycleOutcome } from '../../lib/pmcc-timeline-rows'

/** A credit reads green, a debit gold; an even net is neutral. */
export const NET_TONE: Record<NetDirection, string> = {
  credit: 'text-wb-green',
  debit: 'text-wb-gold',
  even: 'text-wb-text-secondary'
}

/** The tone of a signed 4-dp net. */
export function signedNetTone(value: string): string {
  return NET_TONE[netDirection(new Decimal(value))]
}

type OutcomeTone = {
  /** `Badge` tint (`tintFromColor` needs hex). */
  badge: string
  /** The badge's text class. */
  text: string
  /** The strip segment's fill and border. */
  segment: string
}

const SETTLED_TONE: OutcomeTone = {
  badge: TOKEN_HEX.green,
  text: 'text-wb-green',
  segment: 'bg-wb-green/20 border-wb-green-border'
}

/**
 * Ended cycles read green, the open one gold, an assignment in the loss colour; a cycle past its
 * expiration with no outcome recorded is neutral, neither open nor an outcome.
 */
export const OUTCOME_TONE: Record<CycleOutcome, OutcomeTone> = {
  EXPIRED: SETTLED_TONE,
  CLOSED: SETTLED_TONE,
  ASSIGNED: {
    badge: TOKEN_HEX.red,
    text: 'text-wb-red',
    segment: 'bg-wb-red/30 border-wb-red/40'
  },
  OPEN: {
    badge: TOKEN_HEX.gold,
    text: 'text-wb-gold',
    segment: 'bg-wb-gold-dim border-wb-gold-border'
  },
  UNRECORDED: {
    badge: TOKEN_HEX['text-muted'],
    text: 'text-wb-text-muted',
    segment: 'bg-wb-text-muted/20 border-wb-border'
  }
}
