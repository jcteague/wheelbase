// What a PMCC card shows, derived per render from the list item, one option snapshot per
// open leg and the stock quote [US-108]. The card composes these strings; every decision and
// figure lives here.

import Decimal from 'decimal.js'
import type { OptionSnapshotsBySymbol, StockQuote } from '../api/market-data'
import type { PmccLegSummary, PmccListItem, PmccListSummary } from '../api/positions'
import { isNumeric } from '../../../main/core/alerts'
import { computePmccUnrealizedPnl } from '../../../main/core/costbasis'
import { computeDte } from '../../../main/core/dte'
import {
  evaluatePmccSignals,
  premiumRecoveredFraction,
  type PmccSignals
} from '../../../main/core/pmcc-card'
import { pmccNextDecisionDte } from '../../../main/core/position-order'
import { isKnownPmccPhase } from '../../../main/pmcc-phase'
import { resolveProfitTarget } from '../../../main/core/profit-target'
import { fmtMoney, fmtMoneyGrouped, fmtPct1 } from './format'
import { isWideSpread } from './option-display'
import {
  dashedLeg,
  isContractCount,
  leapsDelta,
  openLeg,
  quoteLeg,
  sumContracts,
  type DashedLeg,
  type LegQuote,
  type OpenLeg
} from './pmcc-card-legs'
import { pmccTier2Cells, signedMoneyGrouped, type Tier2Cell } from './pmcc-card-tier2'
import type { PnlTone } from './wheel-card-display'

export type {
  DashedLeg,
  LeapsTrailing,
  OpenLeapsLeg,
  OpenLeg,
  OpenShortLeg,
  ShortTrailing
} from './pmcc-card-legs'
export type { Tier2Cell } from './pmcc-card-tier2'

/** `wide`: the LEAPS spread is wide, so the figure carries the ⚠. Only a valued P&L has one. */
export type ValuedPmccPnl = { amount: string; tone: PnlTone; percentLine: string; wide: boolean }

export type PmccBasis = { total: string; sub: string; paidFor: boolean }

export type PmccCredits = {
  total: string
  sub: string
  meterFraction: number | null
  meterGold: boolean
}

export type ClosedPmccDisplay = {
  kind: 'closed'
  price: null
  priceSubline: 'closed'
  state: 'Closed'
  coverage: string
  legs: DashedLeg[]
  pnl: 'closed — no live marks'
  basis: PmccBasis
  credits: PmccCredits
}

/** A PMCC phase this card does not know: its raw label, dashed live figures, no signals. */
export type NeutralPmccDisplay = {
  kind: 'neutral'
  stateLabel: string
  price: null
  priceSubline: '—'
  coverage: string
  legs: DashedLeg[]
  pnl: '—'
  basis: PmccBasis
  credits: PmccCredits
}

export type OpenPmccDisplay = {
  kind: 'open'
  price: string | null
  priceSubline: string
  state: string
  coverage: string
  legs: OpenLeg[]
  pnl: ValuedPmccPnl | 'unavailable — a leg has no mark'
  basis: PmccBasis
  credits: PmccCredits
  signals: PmccSignals
  tier2: Tier2Cell[]
}

/** One card state per variant: a closed or neutral card cannot carry signals or tier 2. */
export type PmccCardDisplay = ClosedPmccDisplay | NeutralPmccDisplay | OpenPmccDisplay

export interface PmccCardDisplayOptions {
  closed: boolean
  profitTargetDefault?: number
  /** The valuation instant for days-to-earnings and days since opening; defaults to now. */
  now?: Date
}

const DASH = '—'
const NO_MARK = 'unavailable — a leg has no mark'

function coverage(legs: readonly PmccLegSummary[]): string {
  const longs = sumContracts(legs, 'LONG')
  const shorts = sumContracts(legs, 'SHORT')
  return shorts > 0 && shorts < longs ? `${shorts} of ${longs} covered` : `${longs} × 100 sh`
}

function stateLabel(shortCount: number): string {
  if (shortCount === 0) return 'LEAPS open · no short call'
  return shortCount === 1 ? 'LEAPS + short call open' : `LEAPS + ${shortCount} short calls open`
}

function deriveBasis({ basisTotal, basisPerShare }: PmccListSummary): PmccBasis {
  const total = new Decimal(basisTotal)
  const paidFor = total.lte(0)
  return {
    // Credits past the LEAPS cost read below zero, with the app's U+2212 `−`.
    total: `${total.lt(0) ? '−' : ''}${fmtMoneyGrouped(total.abs().toString())}`,
    sub: paidFor ? 'LEAPS paid for' : `${fmtMoney(basisPerShare)} / share`,
    paidFor
  }
}

function deriveCredits({
  shortCreditsTotal,
  premiumRecoveredPercent: percent
}: PmccListSummary): PmccCredits {
  return {
    total: fmtMoneyGrouped(shortCreditsTotal),
    sub: percent === null ? DASH : `${fmtPct1(percent)} of LEAPS cost recovered`,
    meterFraction: premiumRecoveredFraction(percent),
    meterGold: percent !== null && new Decimal(percent).gte(100)
  }
}

/** Signed by the P&L's tone, not the rounded figure, so a tiny loss reads `−0.0%`, never `+0.0%`. */
function signedPercent(percent: string, tone: PnlTone): string {
  return `${tone === 'loss' ? '−' : '+'}${fmtPct1(new Decimal(percent).abs().toString())}`
}

/** `computePmccUnrealizedPnl` throws on a bad mid, count or basis, so every leg is checked first. */
function derivePnl(
  pmcc: PmccListSummary,
  quotes: readonly [LegQuote, ...LegQuote[]]
): OpenPmccDisplay['pnl'] {
  const legs = quotes.flatMap(({ leg, snapshot }) =>
    snapshot === null || !isContractCount(leg.contracts)
      ? []
      : [{ side: leg.side, mid: snapshot.mid, contracts: leg.contracts }]
  )
  if (legs.length < quotes.length || !isNumeric(pmcc.basisTotal)) return NO_MARK
  const { pnl, pnlPercentOfBasis } = computePmccUnrealizedPnl({ legs, basisTotal: pmcc.basisTotal })
  const tone: PnlTone = new Decimal(pnl).gte(0) ? 'gain' : 'loss'
  const leaps = quotes[0].snapshot
  return {
    amount: signedMoneyGrouped(pnl),
    tone,
    percentLine:
      pnlPercentOfBasis === null
        ? 'basis not positive'
        : `${signedPercent(pnlPercentOfBasis, tone)} of basis`,
    wide: leaps !== null && isWideSpread(leaps)
  }
}

function deriveOpen(
  item: PmccListItem,
  snapshots: OptionSnapshotsBySymbol | undefined,
  price: string | null,
  { profitTargetDefault, now }: { profitTargetDefault: number | undefined; now: Date }
): OpenPmccDisplay {
  const { pmcc } = item
  const [leapsLeg, ...shortLegs] = pmcc.legs
  const leaps = quoteLeg(item, leapsLeg, snapshots)
  const shortQuotes = shortLegs.map((leg) => quoteLeg(item, leg, snapshots))
  const quotes: [LegQuote, ...LegQuote[]] = [leaps, ...shortQuotes]
  const shorts = [...shortQuotes].sort((a, b) => a.leg.dte - b.leg.dte)
  const signals = evaluatePmccSignals({
    leaps: {
      strike: leaps.leg.strike,
      dte: leaps.leg.dte,
      delta: leapsDelta(leaps.snapshot),
      spread: leaps.snapshot
    },
    shorts: shorts.map(({ leg }) => leg),
    price,
    basisPerShare: pmcc.basisPerShare,
    managementWindowDte: pmcc.managementWindowDte,
    daysToEarnings: computeDte(item.nextEarnings, now)
  })
  const targetPercent = resolveProfitTarget(item.profitTargetPercent, profitTargetDefault)

  return {
    kind: 'open',
    price,
    priceSubline: `${pmccNextDecisionDte(pmcc.legs)}d to next decision`,
    state: stateLabel(shorts.length),
    coverage: coverage(pmcc.legs),
    legs: quotes.map((quote) => openLeg(quote, signals.actions, targetPercent)),
    pnl: derivePnl(pmcc, quotes),
    basis: deriveBasis(pmcc),
    credits: deriveCredits(pmcc),
    signals,
    tier2: pmccTier2Cells({ pmcc, leaps, nearestShort: shorts[0], price, now })
  }
}

export function derivePmccCardDisplay(
  item: PmccListItem,
  snapshotsBySymbol: OptionSnapshotsBySymbol | undefined,
  quote: StockQuote | undefined,
  { closed, profitTargetDefault, now = new Date() }: PmccCardDisplayOptions
): PmccCardDisplay {
  const { pmcc } = item
  const ledger = {
    coverage: coverage(pmcc.legs),
    legs: pmcc.legs.map(dashedLeg),
    basis: deriveBasis(pmcc),
    credits: deriveCredits(pmcc)
  }
  if (closed) {
    return {
      kind: 'closed',
      price: null,
      priceSubline: 'closed',
      state: 'Closed',
      pnl: 'closed — no live marks',
      ...ledger
    }
  }
  if (!isKnownPmccPhase(item.phase)) {
    return {
      kind: 'neutral',
      stateLabel: item.phase,
      price: null,
      priceSubline: DASH,
      pnl: DASH,
      ...ledger
    }
  }
  return deriveOpen(item, snapshotsBySymbol, quote?.price ?? null, { profitTargetDefault, now })
}
