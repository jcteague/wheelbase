// Pure PMCC entry-leg selectors. pmccEntryLegs (first rows win) feeds the entry debit that
// getPosition and the list card read, which must stay the entry figure after later shorts or
// rolls land. The current open
// legs (listPositions' and the detail page's) come from pmccOpenLegs, and the running basis
// from pmccLedgerFromLegs — both in pmcc-ledger.ts.

import { calculatePmccOpeningDebit } from '../core/costbasis'
import type { LegRecord, PmccEntryDebit } from '../schemas'

export interface PmccOpeningLegs {
  long?: LegRecord
  short?: LegRecord
}

/** The position's first LEAPS_OPEN and SHORT_CALL_OPEN legs — the entry pair. */
export function pmccEntryLegs(legs: LegRecord[]): PmccOpeningLegs {
  return {
    long: legs.find((leg) => leg.legRole === 'LEAPS_OPEN'),
    short: legs.find((leg) => leg.legRole === 'SHORT_CALL_OPEN')
  }
}

/**
 * The entry pair's net debit, from one opening-debit calculation over both legs' fills and
 * fees — the total never from the rounded basis_per_share, which drifts. Null when either
 * leg or its fill price is missing.
 */
export function pmccEntryDebit(legs: LegRecord[]): PmccEntryDebit | null {
  const { long, short } = pmccEntryLegs(legs)
  if (!long?.fillPrice || !short?.fillPrice) return null
  const debit = calculatePmccOpeningDebit({
    contracts: long.contracts,
    long: { strike: long.strike, fillPrice: long.fillPrice, fees: long.fees },
    short: { strike: short.strike, fillPrice: short.fillPrice, fees: short.fees }
  })
  return { perShare: debit.basisPerShare, total: debit.initialNetDebit }
}
