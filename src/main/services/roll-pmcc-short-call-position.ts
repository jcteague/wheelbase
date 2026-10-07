// [US-104] rollPmccShortCallPosition — records a PMCC short-call roll as a linked ROLL_FROM /
// ROLL_TO leg pair and appends US-103's PMCC_SHORT_ROLL snapshot, in one transaction. The
// position row is untouched: the phase stays PMCC_OPEN. No Electron or broker imports here.

import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { randomUUID } from 'node:crypto'
import { requirePmccOpenPhase, rollPmccShortCall, ValidationError } from '../core/lifecycle'
import { localToday } from '../dates'
import { logger } from '../logger'
import type {
  GetPositionResult,
  PmccOpenLegs,
  RollPmccShortCallPayload,
  RollPmccShortCallResult
} from '../schemas'
import { getPosition } from './get-position'
import { insertLegRow } from './leg-rows'
import { appendPmccSnapshot, isShortCallRoll } from './pmcc-ledger'
import { groupRollChains } from './roll-chains'

const money4 = (value: Decimal.Value): string => new Decimal(value).toFixed(4)

/** A wheel id has no LEAPS either, so its phase is reported before the missing leg. */
function requireOpenLegs(detail: GetPositionResult): PmccOpenLegs {
  if (detail.pmccOpenLegs !== null) return detail.pmccOpenLegs
  requirePmccOpenPhase(detail.position.phase)
  throw new ValidationError('__root__', 'no_active_leg', 'Position has no active leg')
}

function recordRoll(
  db: Database.Database,
  positionId: string,
  payload: RollPmccShortCallPayload
): RollPmccShortCallResult {
  const fillDate = payload.fillDate ?? localToday()
  const detail = getPosition(db, positionId)
  if (!detail) throw new ValidationError('__root__', 'not_found', 'Position not found')

  const openLegs = requireOpenLegs(detail)
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

  const rollChainId = randomUUID()
  const now = new Date().toISOString()
  const shared = {
    positionId,
    contracts: short.contracts,
    fillDate,
    rollChainId,
    fees: '0.0000',
    createdAt: now,
    updatedAt: now
  }
  const rollFromLeg: RollPmccShortCallResult['rollFromLeg'] = {
    ...shared,
    id: randomUUID(),
    legRole: 'ROLL_FROM',
    action: 'BUY',
    instrumentType: 'CALL',
    strike: short.strike,
    expiration: short.expiration,
    premiumPerContract: costToClose,
    fillPrice: costToClose
  }
  const rollToLeg: RollPmccShortCallResult['rollToLeg'] = {
    ...shared,
    id: randomUUID(),
    legRole: 'ROLL_TO',
    action: 'SELL',
    instrumentType: 'CALL',
    strike: newStrike,
    expiration: payload.newExpiration,
    premiumPerContract: newPremium,
    fillPrice: newPremium
  }

  logger.debug({ positionId, rollChainId }, 'roll_pmcc_short_call_tx_start')
  const { ledger, snapshot } = db.transaction(() => {
    insertLegRow(db, rollFromLeg)
    insertLegRow(db, rollToLeg)
    return appendPmccSnapshot(db, positionId, {
      triggerEvent: 'PMCC_SHORT_ROLL',
      eventDate: fillDate,
      now
    })
  })()
  logger.debug({ positionId, rollChainId }, 'roll_pmcc_short_call_tx_committed')

  const shortCallRollNumber = groupRollChains(detail.legs).filter(isShortCallRoll).length + 1

  logger.info(
    {
      positionId,
      rollChainId,
      netCreditPerShare: new Decimal(newPremium).minus(costToClose).toFixed(4),
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
  try {
    return recordRoll(db, positionId, payload)
  } catch (err) {
    if (err instanceof ValidationError) {
      logger.info({ positionId, field: err.field, code: err.code }, 'pmcc_short_roll_rejected')
    }
    throw err
  }
}
