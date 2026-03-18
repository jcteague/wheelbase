import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { calculateCspExpiration } from '../core/costbasis'
import { ValidationError, expireCsp } from '../core/lifecycle'
import { logger } from '../logger'
import type { ExpireCspPayload, ExpireCspPositionResult } from '../schemas'
import { getPosition } from './get-position'

export function expireCspPosition(
  db: Database.Database,
  positionId: string,
  payload: ExpireCspPayload
): ExpireCspPositionResult {
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()

  logger.debug({ positionId }, 'expire_csp_position_inputs')

  const positionDetail = getPosition(db, positionId)
  if (!positionDetail) {
    throw new ValidationError('__root__', 'not_found', 'Position not found')
  }

  if (positionDetail.position.phase !== 'CSP_OPEN') {
    throw new ValidationError('__phase__', 'invalid_phase', 'Position is not in CSP_OPEN phase')
  }

  const openLeg = positionDetail.activeLeg
  if (!openLeg) {
    throw new ValidationError('__root__', 'no_active_leg', 'Position has no active leg')
  }

  // referenceDate: today (or override) — used to validate the contract has expired
  // recordedDate: the contract's actual expiry (or override) — used for fill_date / closed_date
  const referenceDate = payload.expirationDateOverride ?? today
  const recordedDate = payload.expirationDateOverride ?? openLeg.expiration

  logger.debug({ referenceDate, recordedDate }, 'expire_csp_dates')

  const lifecycleResult = expireCsp({
    currentPhase: positionDetail.position.phase,
    expirationDate: openLeg.expiration,
    referenceDate
  })

  const calcResult = calculateCspExpiration({
    openPremiumPerContract: openLeg.premiumPerContract,
    contracts: openLeg.contracts
  })

  const expireLegId = randomUUID()
  const snapshotId = randomUUID()
  const openSnapshot = positionDetail.costBasisSnapshot
  const snapshotAt = new Date(Date.now() + 1).toISOString() // +1ms to sort after the opening snapshot

  db.transaction(() => {
    db.prepare(
      `INSERT INTO legs
        (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts,
         premium_per_contract, fill_price, fill_date, created_at, updated_at)
       VALUES (?, ?, 'EXPIRE', 'EXPIRE', 'PUT', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      expireLegId,
      positionId,
      openLeg.strike,
      openLeg.expiration,
      openLeg.contracts,
      '0.0000', // expiration collects no premium
      null, // fill_price is null for expiration
      recordedDate,
      now,
      now
    )

    db.prepare(
      `UPDATE positions SET phase = ?, status = 'CLOSED', closed_date = ?, updated_at = ? WHERE id = ?`
    ).run(lifecycleResult.phase, recordedDate, now, positionId)

    db.prepare(
      `INSERT INTO cost_basis_snapshots
        (id, position_id, basis_per_share, total_premium_collected, final_pnl, snapshot_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      snapshotId,
      positionId,
      openSnapshot?.basisPerShare ?? '0.0000',
      openSnapshot?.totalPremiumCollected ?? '0.0000',
      calcResult.finalPnl,
      snapshotAt,
      now
    )
  })()

  logger.info(
    { positionId, phase: lifecycleResult.phase, finalPnl: calcResult.finalPnl },
    'position_expired'
  )

  return {
    position: {
      id: positionDetail.position.id,
      ticker: positionDetail.position.ticker,
      phase: lifecycleResult.phase,
      status: 'CLOSED',
      closedDate: recordedDate
    },
    leg: {
      id: expireLegId,
      positionId,
      legRole: 'EXPIRE',
      action: 'EXPIRE',
      instrumentType: 'PUT',
      strike: openLeg.strike,
      expiration: openLeg.expiration,
      contracts: openLeg.contracts,
      premiumPerContract: '0.0000', // expiration collects no premium
      fillPrice: null,
      fillDate: recordedDate,
      createdAt: now,
      updatedAt: now
    },
    costBasisSnapshot: {
      id: snapshotId,
      positionId,
      basisPerShare: openSnapshot?.basisPerShare ?? '0.0000',
      totalPremiumCollected: openSnapshot?.totalPremiumCollected ?? '0.0000',
      finalPnl: calcResult.finalPnl,
      snapshotAt,
      createdAt: now
    }
  }
}
