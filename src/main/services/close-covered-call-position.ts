import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import Decimal from 'decimal.js'
import { calculateCcClose } from '../core/costbasis'
import { ValidationError, closeCoveredCall } from '../core/lifecycle'
import { logger } from '../logger'
import type { CloseCcPayload, CloseCcPositionResult } from '../schemas'
import { getPosition } from './get-position'

export function closeCoveredCallPosition(
  db: Database.Database,
  positionId: string,
  payload: Omit<CloseCcPayload, 'positionId'> & { positionId: string }
): CloseCcPositionResult {
  const today = new Date().toISOString().slice(0, 10)
  const fillDate = payload.fillDate ?? today
  const now = new Date().toISOString()

  logger.debug(
    { positionId, closePricePerContract: payload.closePricePerContract },
    'close_covered_call_position_inputs'
  )

  const positionDetail = getPosition(db, positionId)
  if (!positionDetail) {
    throw new ValidationError('__root__', 'not_found', 'Position not found')
  }

  const ccOpenLeg = positionDetail.legs.find((l) => l.legRole === 'CC_OPEN')

  closeCoveredCall({
    currentPhase: positionDetail.position.phase,
    closePricePerContract: String(payload.closePricePerContract),
    openFillDate: ccOpenLeg?.fillDate ?? fillDate,
    fillDate,
    expiration: ccOpenLeg?.expiration ?? fillDate
  })

  if (!ccOpenLeg) {
    throw new ValidationError('__root__', 'no_cc_open_leg', 'Position has no open covered call leg')
  }

  const closePriceStr = String(payload.closePricePerContract)
  const closePriceFormatted = new Decimal(closePriceStr).toFixed(4)

  const { ccLegPnl } = calculateCcClose({
    openPremiumPerContract: ccOpenLeg.premiumPerContract,
    closePricePerContract: closePriceStr,
    contracts: ccOpenLeg.contracts
  })

  const legId = randomUUID()

  db.transaction(() => {
    db.prepare(
      `INSERT INTO legs
        (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts,
         premium_per_contract, fill_price, fill_date, created_at, updated_at)
       VALUES (?, ?, 'CC_CLOSE', 'BUY', 'CALL', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      legId,
      positionId,
      ccOpenLeg.strike,
      ccOpenLeg.expiration,
      ccOpenLeg.contracts,
      closePriceFormatted,
      closePriceFormatted,
      fillDate,
      now,
      now
    )

    db.prepare(`UPDATE positions SET phase = 'HOLDING_SHARES', updated_at = ? WHERE id = ?`).run(
      now,
      positionId
    )
  })()

  logger.info({ positionId, phase: 'HOLDING_SHARES' }, 'covered_call_closed_early')

  return {
    position: {
      id: positionDetail.position.id,
      ticker: positionDetail.position.ticker,
      phase: 'HOLDING_SHARES',
      status: 'ACTIVE',
      closedDate: null
    },
    leg: {
      id: legId,
      positionId,
      legRole: 'CC_CLOSE',
      action: 'BUY',
      instrumentType: 'CALL',
      strike: ccOpenLeg.strike,
      expiration: ccOpenLeg.expiration,
      contracts: ccOpenLeg.contracts,
      premiumPerContract: closePriceFormatted,
      fillPrice: closePriceFormatted,
      fillDate,
      createdAt: now,
      updatedAt: now
    },
    ccLegPnl
  }
}
