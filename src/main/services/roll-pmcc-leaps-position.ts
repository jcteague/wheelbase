// [US-105] rollPmccLeapsPosition — records a PMCC LEAPS roll as a linked ROLL_FROM (SELL to
// close the open LEAPS) / ROLL_TO (BUY the replacement) leg pair and appends US-103's
// PMCC_LEAPS_ROLL snapshot, in one transaction. The position row and any open short call are
// untouched: the phase stays PMCC_OPEN. No Electron or broker imports here.

import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { rollPmccLeaps } from '../core/lifecycle'
import { latestFillDate } from '../core/pmcc-rules'
import { localToday } from '../dates'
import { logger } from '../logger'
import type { RollPmccLeapsPayload, RollPmccLeapsResult } from '../schemas'
import { money4 } from '../../shared/decimal-text'
import { nextPmccRollNumber } from './pmcc-ledger'
import { loadPmccRollContext, logPmccRollRejection, recordPmccRoll } from './pmcc-roll-record'

function recordRoll(
  db: Database.Database,
  positionId: string,
  payload: RollPmccLeapsPayload
): RollPmccLeapsResult {
  const fillDate = payload.fillDate ?? localToday()
  const {
    detail,
    openLegs: { long, short }
  } = loadPmccRollContext(db, positionId)
  const proceeds = money4(payload.proceedsPerContract)
  const replacementDebit = money4(payload.replacementDebitPerContract)
  const newStrike = payload.newStrike === undefined ? long.strike : money4(payload.newStrike)
  const currentLeaps = { strike: long.strike, expiration: long.expiration }
  const openShort = short && { strike: short.strike, expiration: short.expiration }
  const lastEventDate = latestFillDate(detail.legs)

  logger.debug(
    {
      positionId,
      currentLeaps,
      openShort,
      lastEventDate,
      fillDate,
      newStrike,
      newExpiration: payload.newExpiration
    },
    'roll_pmcc_leaps_comparator_inputs'
  )
  rollPmccLeaps({
    currentPhase: detail.position.phase,
    currentLeaps,
    openShort,
    lastEventDate,
    fillDate,
    newStrike,
    newExpiration: payload.newExpiration,
    proceedsPerContract: proceeds,
    replacementDebitPerContract: replacementDebit
  })

  const { rollFromLeg, rollToLeg, rollChainId, ledger, snapshot } = recordPmccRoll(db, positionId, {
    from: {
      action: 'SELL',
      strike: long.strike,
      expiration: long.expiration,
      premiumPerContract: proceeds
    },
    to: {
      action: 'BUY',
      strike: newStrike,
      expiration: payload.newExpiration,
      premiumPerContract: replacementDebit
    },
    contracts: long.contracts,
    fillDate,
    triggerEvent: 'PMCC_LEAPS_ROLL'
  })

  const leapsRollNumber = nextPmccRollNumber(detail.legs, 'leaps')

  logger.info(
    {
      positionId,
      rollChainId,
      netCreditPerShare: money4(new Decimal(proceeds).minus(replacementDebit)),
      basisPerShare: ledger.basisPerShare,
      effectiveShareCost: ledger.effectiveShareCost,
      leapsRollNumber
    },
    'pmcc_leaps_rolled'
  )

  return {
    position: {
      id: detail.position.id,
      ticker: detail.position.ticker,
      phase: 'PMCC_OPEN',
      status: 'ACTIVE'
    },
    rollFromLeg,
    rollToLeg,
    rollChainId,
    costBasisSnapshot: snapshot,
    ledger,
    leapsRollNumber
  }
}

export function rollPmccLeapsPosition(
  db: Database.Database,
  positionId: string,
  payload: RollPmccLeapsPayload
): RollPmccLeapsResult {
  logger.debug(
    {
      positionId,
      fillDate: payload.fillDate,
      newStrike: payload.newStrike,
      newExpiration: payload.newExpiration,
      proceedsPerContract: payload.proceedsPerContract,
      replacementDebitPerContract: payload.replacementDebitPerContract
    },
    'roll_pmcc_leaps_inputs'
  )
  return logPmccRollRejection(positionId, 'pmcc_leaps_roll_rejected', () =>
    recordRoll(db, positionId, payload)
  )
}
