// [US-104] rollPmccShortCallPosition — records a PMCC short-call roll as a linked ROLL_FROM /
// ROLL_TO leg pair and appends US-103's PMCC_SHORT_ROLL snapshot, in one transaction. The
// position row is untouched: the phase stays PMCC_OPEN. No Electron or broker imports here.

import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { rollPmccShortCall } from '../core/lifecycle'
import { localToday } from '../dates'
import { logger } from '../logger'
import type { RollPmccShortCallPayload, RollPmccShortCallResult } from '../schemas'
import { money4 } from '../../shared/decimal-text'
import { nextPmccRollNumber } from './pmcc-ledger'
import { loadPmccRollContext, logPmccRollRejection, recordPmccRoll } from './pmcc-roll-record'

function recordRoll(
  db: Database.Database,
  positionId: string,
  payload: RollPmccShortCallPayload
): RollPmccShortCallResult {
  const fillDate = payload.fillDate ?? localToday()
  const { detail, openLegs } = loadPmccRollContext(db, positionId)
  const costToClose = money4(payload.costToClosePerContract)
  const newPremium = money4(payload.newPremiumPerContract)

  const accepted = rollPmccShortCall({
    currentPhase: detail.position.phase,
    openShort: openLegs.short,
    leapsExpiration: openLegs.long.expiration,
    fillDate,
    newStrike: payload.newStrike === undefined ? undefined : money4(payload.newStrike),
    newExpiration: payload.newExpiration,
    costToClosePerContract: costToClose,
    newPremiumPerContract: newPremium
  })
  const { openShort: short, newStrike } = accepted

  const { rollFromLeg, rollToLeg, rollChainId, ledger, snapshot } = recordPmccRoll(db, positionId, {
    from: {
      action: 'BUY',
      strike: short.strike,
      expiration: short.expiration,
      premiumPerContract: costToClose
    },
    to: {
      action: 'SELL',
      strike: newStrike,
      expiration: payload.newExpiration,
      premiumPerContract: newPremium
    },
    contracts: short.contracts,
    fillDate,
    triggerEvent: 'PMCC_SHORT_ROLL'
  })

  const shortCallRollNumber = nextPmccRollNumber(detail.legs, 'short')

  logger.info(
    {
      positionId,
      rollChainId,
      netCreditPerShare: money4(new Decimal(newPremium).minus(costToClose)),
      basisPerShare: ledger.basisPerShare,
      shortCallRollNumber
    },
    'pmcc_short_call_rolled'
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
    shortCallRollNumber
  }
}

export function rollPmccShortCallPosition(
  db: Database.Database,
  positionId: string,
  payload: RollPmccShortCallPayload
): RollPmccShortCallResult {
  logger.debug(
    {
      positionId,
      fillDate: payload.fillDate,
      newStrike: payload.newStrike,
      newExpiration: payload.newExpiration
    },
    'roll_pmcc_short_call_inputs'
  )
  return logPmccRollRejection(positionId, 'pmcc_short_roll_rejected', () =>
    recordRoll(db, positionId, payload)
  )
}
