// The PMCC card's tier-2 panel [US-108]: the once-a-cycle checks, as label / value / note
// cells in the mockup's order, from the pmcc-card cues.

import { differenceInCalendarDays, parseISO } from 'date-fns'
import Decimal from 'decimal.js'
import type { PmccListSummary } from '../api/positions'
import { isNumeric } from '../../../main/core/alerts'
import {
  LEAPS_DELTA_FLOOR,
  pmccBreakeven,
  pmccMaxIfCalled,
  shortExtrinsic
} from '../../../main/core/pmcc-card'
import { isWideSpread, spreadPercentOfMid } from '../../../shared/option-spread'
import { fmtMoney, fmtMoneyGrouped, fmtPct1 } from './format'
import { formatDelta, leapsDelta, type LegQuote } from './pmcc-card-legs'

export type Tier2Cell = { label: string; value: string; note: string }

export interface PmccTier2Input {
  pmcc: PmccListSummary
  leaps: LegQuote
  nearestShort: LegQuote | undefined
  price: string | null
  now: Date
}

const DASH = '—'

/** `fmtMoneyGrouped` signed `+` or U+2212 `−` (the app's minus): `+$1,215.00`, `−$500.00`. */
export function signedMoneyGrouped(value: string): string {
  const amount = new Decimal(value)
  return `${amount.gte(0) ? '+' : '−'}${fmtMoneyGrouped(amount.abs().toString())}`
}

function creditsCell({ pmcc }: PmccTier2Input): Tier2Cell {
  const recovered =
    pmcc.premiumRecoveredPercent === null ? DASH : fmtPct1(pmcc.premiumRecoveredPercent)
  return {
    label: 'Credits collected',
    value: fmtMoneyGrouped(pmcc.shortCreditsTotal),
    note: `${pmcc.cycles} short-call cycle${pmcc.cycles === 1 ? '' : 's'} · ${recovered} of LEAPS cost`
  }
}

function breakevenCell({ pmcc, leaps }: PmccTier2Input): Tier2Cell {
  return {
    label: 'Breakeven',
    value: fmtMoney(pmccBreakeven(leaps.leg.strike, pmcc.basisPerShare)),
    note: `LEAPS ${fmtMoney(leaps.leg.strike)} + basis ${fmtMoney(pmcc.basisPerShare)} / share`
  }
}

function maxIfCalledCell({ pmcc, leaps, nearestShort }: PmccTier2Input): Tier2Cell {
  if (nearestShort === undefined) {
    return { label: 'Max if called', value: DASH, note: 'no short call open' }
  }
  const max = pmccMaxIfCalled({
    shortStrike: nearestShort.leg.strike,
    leapsStrike: leaps.leg.strike,
    basisPerShare: pmcc.basisPerShare,
    shortContracts: nearestShort.leg.contracts
  })
  return {
    label: 'Max if called',
    value: signedMoneyGrouped(max),
    note: `called away at ${fmtMoney(nearestShort.leg.strike)}`
  }
}

function deltaCell({ leaps }: PmccTier2Input): Tier2Cell {
  const delta = leapsDelta(leaps.snapshot)
  if (delta === null) return { label: 'LEAPS delta', value: DASH, note: 'no greeks this poll' }
  return {
    label: 'LEAPS delta',
    value: formatDelta(delta),
    note: new Decimal(delta).lt(LEAPS_DELTA_FLOOR)
      ? `below the ${LEAPS_DELTA_FLOOR.toFixed(2)} floor`
      : 'tracking as synthetic stock'
  }
}

function extrinsicCell({ nearestShort, price }: PmccTier2Input): Tier2Cell {
  if (nearestShort === undefined) {
    return { label: 'Short extrinsic', value: DASH, note: 'no short call open' }
  }
  const { leg, snapshot } = nearestShort
  const livePrice = isNumeric(price) ? price : null
  const extrinsic = shortExtrinsic({
    mid: snapshot?.mid ?? null,
    price: livePrice,
    strike: leg.strike
  })
  if (extrinsic === null || livePrice === null) {
    return { label: 'Short extrinsic', value: DASH, note: 'no quote this poll' }
  }
  return {
    label: 'Short extrinsic',
    value: fmtMoney(extrinsic),
    note: new Decimal(livePrice).gte(leg.strike)
      ? 'ITM — assignment math is live'
      : 'OTM — all extrinsic'
  }
}

function leapsMarkCell({ leaps }: PmccTier2Input): Tier2Cell {
  const { snapshot } = leaps
  if (snapshot === null) return { label: 'LEAPS mark', value: DASH, note: 'no snapshot this poll' }
  const percent = spreadPercentOfMid(snapshot)
  const spread = percent === null ? DASH : fmtPct1(percent.toString())
  return {
    label: 'LEAPS mark',
    value: fmtMoney(snapshot.mid),
    note: `${fmtMoney(snapshot.bid)} × ${fmtMoney(snapshot.ask)} · ${spread} wide${isWideSpread(snapshot) ? ' · P&L unreliable' : ''}`
  }
}

function entryDebitCell({ pmcc, now }: PmccTier2Input): Tier2Cell {
  const opened = `opened ${pmcc.openedAt} · ${differenceInCalendarDays(now, parseISO(pmcc.openedAt))}d ago`
  const { entryDebit } = pmcc
  if (entryDebit === null) return { label: 'Entry net debit', value: DASH, note: opened }
  return {
    label: 'Entry net debit',
    value: fmtMoneyGrouped(entryDebit.total),
    note: `${fmtMoney(entryDebit.perShare)} / share · ${opened}`
  }
}

const TIER2_CELLS = [
  creditsCell,
  breakevenCell,
  maxIfCalledCell,
  deltaCell,
  extrinsicCell,
  leapsMarkCell,
  entryDebitCell
]

export function pmccTier2Cells(input: PmccTier2Input): Tier2Cell[] {
  return TIER2_CELLS.map((cell) => cell(input))
}
