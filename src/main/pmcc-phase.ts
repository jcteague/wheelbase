// A PMCC row's phase as the positions list reads it [US-108]. `positions.phase` is free TEXT, so a
// later story's PMCC phase can reach the list before this build has a branch for it; the card
// shows such a phase as its raw label.

import type { PmccPhase } from './core/types'

declare const unknownPmccPhase: unique symbol

/** A stored PMCC phase this build does not know. Only `toPmccListPhase` makes one. */
export type UnknownPmccPhase = string & { readonly [unknownPmccPhase]: true }

export type PmccListPhase = PmccPhase | UnknownPmccPhase

const KNOWN_PMCC_PHASES: Record<PmccPhase, true> = { PMCC_OPEN: true }

export function isKnownPmccPhase(phase: string): phase is PmccPhase {
  return Object.hasOwn(KNOWN_PMCC_PHASES, phase)
}

/** Classifies a stored phase once, where it is read: a known phase keeps its literal type. */
export function toPmccListPhase(stored: string): PmccListPhase {
  return isKnownPmccPhase(stored) ? stored : (stored as UnknownPmccPhase)
}
