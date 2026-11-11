// One leg block on the PMCC card [US-108]: its identity, DTE emphasis, mark, trailing cue and
// the action states it owns, from the leg summary and its option snapshot.

import Decimal from 'decimal.js'
import type { OptionSnapshot, OptionSnapshotsBySymbol } from '../api/market-data'
import type { PmccLegSummary, PmccListItem } from '../api/positions'
import {
  PMCC_LEAPS_ROLL_WINDOW_MAX_DTE,
  isInLeapsRollWindow,
  isNumeric
} from '../../../main/core/alerts'
import { computeUnrealizedPnl } from '../../../main/core/costbasis'
import type { PmccAction, PmccLegRef } from '../../../main/core/pmcc-card'
import { occSymbolForLeg } from '../../../shared/option-symbol'
import { DTE_URGENT_THRESHOLD, isDteUrgent } from './dte'
import { fmtMoney, fmtPct1 } from './format'
import { optionMark, usableSnapshot, type OptionMark } from './option-mark'
import type { PnlTone, ProfitTargetHit } from './wheel-card-display'

/** The LEAPS block's trailing figures: `delta` is `—` when the snapshot has no greeks. */
export type LeapsTrailing = { delta: string; debit: string }

/**
 * A short call's own profit cue: its share of its own max profit, plus the TARGET figures once
 * that share reaches the position's profit target. `'unavailable'` when the leg has no mark.
 */
export type ShortTrailing =
  | { percentOfMax: string; tone: PnlTone | 'flat'; target: ProfitTargetHit | null }
  | 'unavailable'

interface OpenLegBase {
  legId: string
  title: string
  contractsSuffix: string
  expiration: string
  dte: string
  dteGold: boolean
  dteTooltip: string | null
  mark: OptionMark
  /** The action states this leg owns, worst first. */
  actions: PmccAction[]
}

export type OpenLeapsLeg = OpenLegBase & { tag: 'L'; trailing: LeapsTrailing }
export type OpenShortLeg = OpenLegBase & { tag: 'S'; trailing: ShortTrailing }
export type OpenLeg = OpenLeapsLeg | OpenShortLeg

/** A leg on a closed or neutral card: identity only, every live figure dashed. */
export type DashedLeg = {
  legId: string
  tag: 'L' | 'S'
  title: string
  contractsSuffix: string
  expiration: string
  dte: '—'
  mark: '—'
}

/** An open leg with its usable snapshot, or `null` when it has no mark this poll. */
export type LegQuote = { leg: PmccLegSummary; snapshot: OptionSnapshot | null }

const DASH = '—'

/** The LEAPS delta as the snapshot reports it, or `null` when it carries no greeks. */
export function leapsDelta(snapshot: OptionSnapshot | null): string | null {
  const delta = snapshot?.greeks?.delta ?? null
  return isNumeric(delta) ? delta : null
}

export function formatDelta(delta: string): string {
  return new Decimal(delta).toFixed(2)
}

function deltaOrDash(delta: string | null): string {
  return delta === null ? DASH : formatDelta(delta)
}

export function sumContracts(legs: readonly PmccLegSummary[], side: 'LONG' | 'SHORT'): number {
  return legs.filter((leg) => leg.side === side).reduce((sum, leg) => sum + leg.contracts, 0)
}

export function isContractCount(contracts: number): boolean {
  return Number.isInteger(contracts) && contracts >= 1
}

/** The leg's snapshot by its OCC call symbol, kept only when it is usable. */
export function quoteLeg(
  item: PmccListItem,
  leg: PmccLegSummary,
  snapshots: OptionSnapshotsBySymbol | undefined
): LegQuote {
  const symbol = occSymbolForLeg({ ...leg, ticker: item.ticker, instrumentType: 'CALL' })
  const snapshot = symbol === null ? undefined : snapshots?.[symbol]
  return { leg, snapshot: usableSnapshot(snapshot) }
}

function legIdentity(
  leg: PmccLegSummary
): Pick<DashedLeg, 'legId' | 'title' | 'contractsSuffix' | 'expiration'> {
  return {
    legId: leg.legId,
    title: `${fmtMoney(leg.strike)} ${leg.side === 'LONG' ? 'LEAPS' : 'call'}`,
    contractsSuffix: leg.contracts > 1 ? ` ×${leg.contracts}` : '',
    expiration: leg.expiration
  }
}

export function dashedLeg(leg: PmccLegSummary): DashedLeg {
  return { ...legIdentity(leg), tag: leg.side === 'LONG' ? 'L' : 'S', dte: DASH, mark: DASH }
}

function shortTone(pnl: string): PnlTone | 'flat' {
  const sign = new Decimal(pnl).comparedTo(0)
  if (sign > 0) return 'gain'
  if (sign < 0) return 'loss'
  return 'flat'
}

/** `computeUnrealizedPnl`'s preconditions on the short: it throws otherwise. */
function shortTrailing({ leg, snapshot }: LegQuote, targetPercent: number): ShortTrailing {
  const fill = leg.fillPerShare
  if (snapshot === null || !isContractCount(leg.contracts)) return 'unavailable'
  if (!isNumeric(fill) || new Decimal(fill).lte(0)) return 'unavailable'
  const { pnl, pnlPercent, maxProfit } = computeUnrealizedPnl({
    entryPremium: fill,
    currentMid: snapshot.mid,
    contracts: leg.contracts
  })
  const percent = new Decimal(pnlPercent)
  return {
    percentOfMax: `${percent.lt(0) ? '−' : ''}${fmtPct1(percent.abs().toString())} of max`,
    tone: shortTone(pnl),
    target: percent.gte(targetPercent) ? { pnlPercent, maxProfit, targetPercent } : null
  }
}

function legMark({ leg, snapshot }: LegQuote): OptionMark {
  const mark = optionMark(snapshot)
  // The wide-spread / no-bid note rides on the LEAPS only; a short's spread marks nothing.
  return mark === 'unavailable' || leg.side === 'LONG' ? mark : { ...mark, note: null }
}

function isLeg(leg: PmccLegSummary, ref: PmccLegRef): boolean {
  return ref.side === 'LONG' ? leg.side === 'LONG' : leg.side === 'SHORT' && ref.legId === leg.legId
}

/** An action marks every leg it names — ✕ can mark several shorts. */
function ownsAction(leg: PmccLegSummary, action: PmccAction): boolean {
  return action.legs.some((ref) => isLeg(leg, ref))
}

/** Why the DTE is gold: the LEAPS inside the roll window, the short inside the 7-day rule. */
function dteTooltip(leg: PmccLegSummary): string | null {
  if (leg.side === 'LONG') {
    return isInLeapsRollWindow(leg.dte)
      ? `Roll window — LEAPS inside the ${PMCC_LEAPS_ROLL_WINDOW_MAX_DTE}-day window`
      : null
  }
  return isDteUrgent(leg.dte)
    ? `Expiring soon — short call inside ${DTE_URGENT_THRESHOLD} days`
    : null
}

export function openLeg(
  quote: LegQuote,
  actions: readonly PmccAction[],
  targetPercent: number
): OpenLeg {
  const { leg, snapshot } = quote
  const tooltip = dteTooltip(leg)
  const base: OpenLegBase = {
    ...legIdentity(leg),
    dte: `${leg.dte}d`,
    dteGold: tooltip !== null,
    dteTooltip: tooltip,
    mark: legMark(quote),
    actions: actions.filter((action) => ownsAction(leg, action))
  }
  if (leg.side === 'SHORT') {
    return { ...base, tag: 'S', trailing: shortTrailing(quote, targetPercent) }
  }
  return {
    ...base,
    tag: 'L',
    trailing: { delta: deltaOrDash(leapsDelta(snapshot)), debit: fmtMoney(leg.fillPerShare) }
  }
}
