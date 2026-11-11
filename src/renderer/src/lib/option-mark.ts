// An open option leg's mark on a position card — shared by the wheel and PMCC cards: which
// snapshots are usable, and the mid with its no-bid / wide-spread note.

import Decimal from 'decimal.js'
import type { OptionSnapshot } from '../api/market-data'
import { isNumeric } from '../../../main/core/alerts'
import { fmtMoney } from './format'
import { hasNoBid, isWideSpread } from './option-display'

/** `no bid` wins over the wide-spread warning: a zero bid always reads as wide. */
export type MarkNote = { kind: 'noBid' } | { kind: 'wideSpread'; tooltip: string }

export type OptionMark = { mid: string; note: MarkNote | null } | 'unavailable'

/** The snapshot when every card helper can parse it without throwing, else `null`. */
export function usableSnapshot(snapshot: OptionSnapshot | undefined): OptionSnapshot | null {
  if (snapshot === undefined) return null
  const { bid, ask, mid } = snapshot
  return [bid, ask, mid].every(isNumeric) && new Decimal(mid).gte(0) ? snapshot : null
}

function markNote(snapshot: OptionSnapshot): MarkNote | null {
  if (hasNoBid(snapshot)) return { kind: 'noBid' }
  if (isWideSpread(snapshot)) {
    return {
      kind: 'wideSpread',
      tooltip: `Wide spread: ${fmtMoney(snapshot.bid)} × ${fmtMoney(snapshot.ask)} — P&L may be unreliable`
    }
  }
  return null
}

/** A usable snapshot's mid and note; `'unavailable'` without one. */
export function optionMark(snapshot: OptionSnapshot | null): OptionMark {
  return snapshot === null
    ? 'unavailable'
    : { mid: fmtMoney(snapshot.mid), note: markNote(snapshot) }
}
