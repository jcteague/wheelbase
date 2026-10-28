// What a wheel card shows, derived per render from the list item, its option snapshot and
// its stock quote. The card composes these strings; every decision and figure lives here.

import Decimal from 'decimal.js'
import type { OptionSnapshot, StockQuote } from '../api/market-data'
import type { WheelListItem } from '../api/positions'
import { isNumeric } from '../../../main/core/alerts'
import { computeUnrealizedPnl } from '../../../main/core/costbasis'
import { resolveProfitTarget } from '../../../main/core/profit-target'
import { isDteUrgent } from './dte'
import { fmtMoney, formatSignedMoney } from './format'
import {
  formatPnlPercentForDisplay,
  hasNoBid,
  isWideSpread,
  type TargetTooltipInput
} from './option-display'

export type PnlTone = 'gain' | 'loss'

/** TargetBadge's figures; present only once the leg has reached its profit target. */
export type ProfitTargetHit = TargetTooltipInput

/** The live P&L on an open option leg; `target` is set once the leg reaches its profit target. */
export type ValuedPnl = {
  amount: string
  tone: PnlTone
  target: ProfitTargetHit | null
  percentLine: string
}

/** `no bid` wins over the wide-spread warning: a zero bid always reads as wide. */
export type MarkNote = { kind: 'noBid' } | { kind: 'wideSpread'; tooltip: string }

export type WheelCardMark = { mid: string; note: MarkNote | null } | 'unavailable'

export type OptionLeg = {
  tag: 'P' | 'C'
  title: string
  expiration: string
  dte: string
  dteUrgent: boolean
  mark: WheelCardMark
  credit: string
}

/** Only a finished wheel reads "wheel complete"; a CSP bought back closed the position early. */
export type ClosedCardDisplay = {
  kind: 'closed'
  price: null
  priceSubline: 'closed'
  pnl: 'closed — no live marks'
  leg: 'wheel complete' | 'position closed'
}

export type SharesCardDisplay = {
  kind: 'shares'
  price: string | null
  priceSubline: 'shares held · no option leg'
  pnl: 'no option leg open'
  leg: 'no option leg open — sell a covered call'
}

/** `pnl` is `'unavailable'` when there is no usable snapshot or stored fill to value it. */
export type OptionCardDisplay = {
  kind: 'option'
  price: string | null
  priceSubline: string
  pnl: ValuedPnl | 'unavailable'
  leg: OptionLeg
}

/**
 * One card state per variant. A blank P&L or leg is the note shown in its place, so a closed
 * or shares-only card cannot carry live figures, a TARGET or an urgent DTE.
 */
export type WheelCardDisplay = ClosedCardDisplay | SharesCardDisplay | OptionCardDisplay

export interface WheelCardDisplayOptions {
  closed: boolean
  profitTargetDefault?: number
}

const DASH = '—'

function closedDisplay(phase: WheelListItem['phase']): ClosedCardDisplay {
  return {
    kind: 'closed',
    price: null,
    priceSubline: 'closed',
    pnl: 'closed — no live marks',
    leg: phase === 'WHEEL_COMPLETE' ? 'wheel complete' : 'position closed'
  }
}

/** A snapshot every helper below can parse without throwing. */
function isUsableSnapshot({ bid, ask, mid }: OptionSnapshot): boolean {
  return [bid, ask, mid].every(isNumeric) && new Decimal(mid).gte(0)
}

/** `computeUnrealizedPnl`'s preconditions on the stored leg: it throws otherwise. */
function pnlLeg(item: WheelListItem): { entryPremium: string; contracts: number } | null {
  const { entryPremiumPerContract: entryPremium, contracts } = item
  if (entryPremium === null || contracts === null) return null
  if (!Number.isInteger(contracts) || contracts < 1) return null
  if (!isNumeric(entryPremium) || new Decimal(entryPremium).lte(0)) return null
  return { entryPremium, contracts }
}

/** Signed by the P&L's tone, not the rounded figure, so a tiny loss reads `-0`, never `+0`. */
function signedPercent(pnlPercent: string, tone: PnlTone): string {
  const magnitude = formatPnlPercentForDisplay(new Decimal(pnlPercent).abs().toString())
  return `${tone === 'loss' ? '-' : '+'}${magnitude}`
}

function derivePnl(
  item: WheelListItem,
  mid: string,
  profitTargetDefault: number | undefined
): OptionCardDisplay['pnl'] {
  const leg = pnlLeg(item)
  if (leg === null) return 'unavailable'
  const { pnl, pnlPercent, maxProfit } = computeUnrealizedPnl({ ...leg, currentMid: mid })
  const targetPercent = resolveProfitTarget(item.profitTargetPercent, profitTargetDefault)
  const tone: PnlTone = new Decimal(pnl).gte(0) ? 'gain' : 'loss'
  return {
    amount: formatSignedMoney(pnl),
    tone,
    target: new Decimal(pnlPercent).gte(targetPercent)
      ? { pnlPercent, maxProfit, targetPercent }
      : null,
    percentLine: `${signedPercent(pnlPercent, tone)}% of max profit`
  }
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

export function deriveWheelCardDisplay(
  item: WheelListItem,
  snapshot: OptionSnapshot | undefined,
  quote: StockQuote | undefined,
  { closed, profitTargetDefault }: WheelCardDisplayOptions
): WheelCardDisplay {
  if (closed) return closedDisplay(item.phase)
  const price = quote?.price ?? null

  if (item.instrumentType === null) {
    return {
      kind: 'shares',
      price,
      priceSubline: 'shares held · no option leg',
      pnl: 'no option leg open',
      leg: 'no option leg open — sell a covered call'
    }
  }

  const live = snapshot !== undefined && isUsableSnapshot(snapshot) ? snapshot : null
  const isPut = item.instrumentType === 'PUT'

  return {
    kind: 'option',
    price,
    priceSubline: item.dte === null ? DASH : `${item.dte}d to expiration`,
    pnl: live === null ? 'unavailable' : derivePnl(item, live.mid, profitTargetDefault),
    leg: {
      tag: isPut ? 'P' : 'C',
      title: `${item.strike === null ? DASH : fmtMoney(item.strike)} ${isPut ? 'put' : 'call'}`,
      expiration: item.expiration ?? DASH,
      dte: item.dte === null ? DASH : `${item.dte}d`,
      dteUrgent: isDteUrgent(item.dte),
      mark: live === null ? 'unavailable' : { mid: fmtMoney(live.mid), note: markNote(live) },
      credit: item.entryPremiumPerContract === null ? DASH : fmtMoney(item.entryPremiumPerContract)
    }
  }
}
