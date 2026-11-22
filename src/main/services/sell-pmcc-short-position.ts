// [US-115] sellPmccShortPosition — records the next short call against a PMCC's open LEAPS when
// no short call is open: one SHORT_CALL_OPEN sell leg and US-103's PMCC_SHORT_OPEN snapshot, in
// one transaction. The position row is untouched: the phase stays PMCC_OPEN. No broker order.

import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { sellPmccShort } from '../core/lifecycle'
import { logger } from '../logger'
import type { SellPmccShortPayload, SellPmccShortResult } from '../schemas'
import { money4 } from '../../shared/decimal-text'
import { insertPmccLeg } from './create-pmcc-position'
import { appendPmccSnapshot, lastShortRetiredOn, nextPmccCycleNumber } from './pmcc-ledger'
import { loadPmccRollContext, logPmccRollRejection } from './pmcc-roll-record'

export interface SellPmccShortOptions {
  /** The Eastern calendar day of the request: the default fill date and the future-date bound. */
  today: string
  /** ISO timestamp stamped on the new rows; defaults to the system clock. */
  now?: string
}

function recordSale(
  db: Database.Database,
  positionId: string,
  payload: SellPmccShortPayload,
  { today, now = new Date().toISOString() }: SellPmccShortOptions
): SellPmccShortResult {
  const fillDate = payload.fillDate ?? today
  const { detail, openLegs } = loadPmccRollContext(db, positionId)
  const leaps = openLegs.long
  const previousShortRetiredOn = lastShortRetiredOn(detail.legs)
  // The sale's decided terms: what the engine checks is exactly what the leg row stores.
  const terms = {
    strike: money4(payload.strike),
    expiration: payload.expiration,
    contracts: payload.contracts,
    fillPrice: money4(payload.fillPrice),
    fillDate,
    fees: money4(payload.fees)
  }

  logger.debug(
    {
      positionId,
      expiration: payload.expiration,
      leapsExpiration: leaps.expiration,
      previousShortRetiredOn,
      leapsFillDate: leaps.fillDate,
      today
    },
    'sell_pmcc_short_comparator_inputs'
  )

  sellPmccShort({
    currentPhase: detail.position.phase,
    openShort: openLegs.short,
    leaps,
    previousShortRetiredOn,
    today,
    ...terms
  })

  const legId = randomUUID()
  logger.debug({ positionId, legId }, 'sell_pmcc_short_tx_start')
  const { shortLeg, ledger, snapshot } = db.transaction(() => {
    const leg = insertPmccLeg(db, {
      id: legId,
      positionId,
      legRole: 'SHORT_CALL_OPEN',
      leg: terms,
      now
    })
    return {
      shortLeg: leg,
      ...appendPmccSnapshot(db, positionId, {
        triggerEvent: 'PMCC_SHORT_OPEN',
        eventDate: fillDate,
        now
      })
    }
  })()
  logger.debug({ positionId, legId }, 'sell_pmcc_short_tx_committed')
  logger.debug(
    {
      positionId,
      basisPerShare: ledger.basisPerShare,
      effectiveShareCost: ledger.effectiveShareCost,
      premiumRecoveredPercent: ledger.premiumRecoveredPercent
    },
    'sell_pmcc_short_projected_basis'
  )

  const cycleNumber = nextPmccCycleNumber(detail.legs)

  logger.info(
    { positionId, cycleNumber, contracts: terms.contracts, basisPerShare: ledger.basisPerShare },
    'pmcc_short_call_sold'
  )

  return {
    position: {
      id: detail.position.id,
      ticker: detail.position.ticker,
      phase: 'PMCC_OPEN',
      status: 'ACTIVE'
    },
    shortLeg,
    snapshot,
    ledger,
    cycleNumber
  }
}

export function sellPmccShortPosition(
  db: Database.Database,
  positionId: string,
  payload: SellPmccShortPayload,
  options: SellPmccShortOptions
): SellPmccShortResult {
  logger.debug({ positionId, payload, today: options.today }, 'sell_pmcc_short_inputs')
  return logPmccRollRejection(positionId, 'pmcc_sell_short_rejected', () =>
    recordSale(db, positionId, payload, options)
  )
}
