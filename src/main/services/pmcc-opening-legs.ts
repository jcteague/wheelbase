// Pure PMCC opening-leg selectors. pmccOpeningLegs (later rows win) feeds listPositions'
// current long/short summaries; pmccEntryLegs (first rows win) feeds getPosition's initial net
// debit, which must stay the entry figure after later shorts or rolls land. The running basis
// comes from pmccLedgerFromLegs (pmcc-ledger.ts).

import { calculatePmccOpeningDebit } from '../core/costbasis'
import type { LegRecord } from '../schemas'

export interface PmccOpeningLegs {
  long?: LegRecord
  short?: LegRecord
}

/** The position's LEAPS_OPEN and SHORT_CALL_OPEN legs, from legs in readLegs order. */
export function pmccOpeningLegs(legs: LegRecord[]): PmccOpeningLegs {
  // Later rows win: a newer `SHORT_CALL_OPEN` supersedes the opening one. Roll and expiry legs
  // are not consulted — the list's leg summaries become roll-aware when US-104/105 record rolls
  // in production.
  return {
    long: legs.findLast((leg) => leg.legRole === 'LEAPS_OPEN'),
    short: legs.findLast((leg) => leg.legRole === 'SHORT_CALL_OPEN')
  }
}

/** The position's first LEAPS_OPEN and SHORT_CALL_OPEN legs — the entry pair. */
export function pmccEntryLegs(legs: LegRecord[]): PmccOpeningLegs {
  return {
    long: legs.find((leg) => leg.legRole === 'LEAPS_OPEN'),
    short: legs.find((leg) => leg.legRole === 'SHORT_CALL_OPEN')
  }
}

/**
 * Dollars, 4 dp, recomputed from both legs' fills and fees — never from the rounded
 * basis_per_share, which drifts. Null when either leg or its fill price is missing.
 */
export function pmccInitialNetDebit(legs: LegRecord[]): string | null {
  const { long, short } = pmccEntryLegs(legs)
  if (!long?.fillPrice || !short?.fillPrice) return null
  return calculatePmccOpeningDebit({
    contracts: long.contracts,
    long: { strike: long.strike, fillPrice: long.fillPrice, fees: long.fees },
    short: { strike: short.strike, fillPrice: short.fillPrice, fees: short.fees }
  }).initialNetDebit
}
