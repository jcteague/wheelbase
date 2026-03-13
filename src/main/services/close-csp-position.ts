import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { randomUUID } from 'node:crypto'
import { calculateCspClose } from '../core/costbasis'
import { ValidationError, closeCsp } from '../core/lifecycle'
import { logger } from '../logger'
import type { CloseCspPayload, CloseCspPositionResult } from '../schemas'
import { getPosition } from './get-position'

export function closeCspPosition(
  db: Database.Database,
  positionId: string,
  payload: CloseCspPayload
): CloseCspPositionResult {
  const today = new Date().toISOString().slice(0, 10)
  const fillDate = payload.fillDate ?? today
  const now = new Date().toISOString()

  logger.debug({ positionId, fillDate }, 'close_csp_position_inputs')

  const positionDetail = getPosition(db, positionId)
  if (!positionDetail) {
    throw new ValidationError('__root__', 'not_found', 'Position not found')
  }

  const openLeg = positionDetail.activeLeg
  if (!openLeg) {
    throw new ValidationError('__root__', 'no_active_leg', 'Position has no active leg')
  }

  const closePrice = String(payload.closePricePerContract)

  const lifecycleResult = closeCsp({
    currentPhase: positionDetail.position.phase,
    closePricePerContract: closePrice,
    openPremiumPerContract: openLeg.premiumPerContract,
    closeFillDate: fillDate,
    openFillDate: openLeg.fillDate,
    expiration: openLeg.expiration
  })

  const calcResult = calculateCspClose({
    openPremiumPerContract: openLeg.premiumPerContract,
    closePricePerContract: closePrice,
    contracts: openLeg.contracts
  })

  const closePriceFormatted = new Decimal(closePrice).toFixed(4)

  const closeLegId = randomUUID()
  const snapshotId = randomUUID()
  const openSnapshot = positionDetail.costBasisSnapshot
  const snapshotAt = new Date(Date.now() + 1).toISOString() // +1ms to sort after the opening snapshot

  db.transaction(() => {
    db.prepare(
      `INSERT INTO legs
        (id, position_id, leg_role, action, option_type, strike, expiration, contracts,
         premium_per_contract, fill_price, fill_date, created_at, updated_at)
       VALUES (?, ?, 'CSP_CLOSE', 'BUY', 'PUT', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      closeLegId,
      positionId,
      openLeg.strike,
      openLeg.expiration,
      openLeg.contracts,
      closePriceFormatted,
      closePriceFormatted,
      fillDate,
      now,
      now
    )

    db.prepare(
      `UPDATE positions SET phase = ?, status = 'CLOSED', closed_date = ?, updated_at = ? WHERE id = ?`
    ).run(lifecycleResult.phase, fillDate, now, positionId)

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
    'position_closed'
  )

  return {
    position: {
      id: positionDetail.position.id,
      ticker: positionDetail.position.ticker,
      phase: lifecycleResult.phase,
      status: 'CLOSED',
      closedDate: fillDate
    },
    leg: {
      id: closeLegId,
      positionId,
      legRole: 'CSP_CLOSE',
      action: 'BUY',
      optionType: 'PUT',
      strike: openLeg.strike,
      expiration: openLeg.expiration,
      contracts: openLeg.contracts,
      premiumPerContract: closePriceFormatted,
      fillDate,
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
