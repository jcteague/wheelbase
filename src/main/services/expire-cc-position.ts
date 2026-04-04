import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ValidationError, expireCc } from '../core/lifecycle'
import { logger } from '../logger'
import type { ExpireCcPayload, ExpireCcPositionResult } from '../schemas'
import { getPosition } from './get-position'

export function expireCcPosition(
  db: Database.Database,
  positionId: string,
  payload: ExpireCcPayload
): ExpireCcPositionResult {
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()

  logger.debug({ positionId }, 'expire_cc_position_inputs')

  const positionDetail = getPosition(db, positionId)
  if (!positionDetail) {
    throw new ValidationError('__root__', 'not_found', 'Position not found')
  }

  const openLeg = positionDetail.activeLeg

  const referenceDate = payload.expirationDateOverride ?? today

  // Phase and date validation — expireCc throws invalid_phase before we check for an active leg
  expireCc({
    currentPhase: positionDetail.position.phase,
    expirationDate: openLeg?.expiration ?? today,
    referenceDate
  })

  if (!openLeg) {
    throw new ValidationError('__root__', 'no_active_leg', 'Position has no active CC leg')
  }

  const recordedDate = payload.expirationDateOverride ?? openLeg.expiration

  const assignLeg = positionDetail.legs.find((l) => l.legRole === 'ASSIGN')
  const sharesHeld = assignLeg ? assignLeg.contracts * 100 : 0

  const expireLegId = randomUUID()

  db.transaction(() => {
    db.prepare(
      `INSERT INTO legs
        (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts,
         premium_per_contract, fill_price, fill_date, created_at, updated_at)
       VALUES (?, ?, 'EXPIRE', 'EXPIRE', 'CALL', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      expireLegId,
      positionId,
      openLeg.strike,
      openLeg.expiration,
      openLeg.contracts,
      '0.0000',
      null,
      recordedDate,
      now,
      now
    )

    db.prepare(`UPDATE positions SET phase = 'HOLDING_SHARES', updated_at = ? WHERE id = ?`).run(
      now,
      positionId
    )
  })()

  logger.info({ positionId, phase: 'HOLDING_SHARES', sharesHeld }, 'cc_expired_worthless')

  return {
    position: {
      id: positionDetail.position.id,
      ticker: positionDetail.position.ticker,
      phase: 'HOLDING_SHARES',
      status: 'ACTIVE',
      closedDate: null
    },
    leg: {
      id: expireLegId,
      positionId,
      legRole: 'EXPIRE',
      action: 'EXPIRE',
      instrumentType: 'CALL',
      strike: openLeg.strike,
      expiration: openLeg.expiration,
      contracts: openLeg.contracts,
      premiumPerContract: '0.0000',
      fillPrice: null,
      fillDate: recordedDate,
      createdAt: now,
      updatedAt: now
    },
    costBasisSnapshot: positionDetail.costBasisSnapshot ?? {
      id: '',
      positionId,
      basisPerShare: '0.0000',
      totalPremiumCollected: '0.0000',
      finalPnl: null,
      snapshotAt: now,
      createdAt: now
    },
    sharesHeld
  }
}
