import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import Decimal from 'decimal.js'
import { calculateCcOpenBasis } from '../core/costbasis'
import { ValidationError, openCoveredCall } from '../core/lifecycle'
import { logger } from '../logger'
import type { OpenCcPayload, OpenCcPositionResult } from '../schemas'
import { getPosition } from './get-position'

export function openCoveredCallPosition(
  db: Database.Database,
  positionId: string,
  payload: OpenCcPayload
): OpenCcPositionResult {
  const today = new Date().toISOString().slice(0, 10)
  const fillDate = payload.fillDate ?? today
  const now = new Date().toISOString()

  logger.debug({ positionId, strike: payload.strike }, 'open_covered_call_position_inputs')

  const positionDetail = getPosition(db, positionId)
  if (!positionDetail) {
    throw new ValidationError('__root__', 'not_found', 'Position not found')
  }

  const strikeStr = String(payload.strike)
  const premiumStr = String(payload.premiumPerContract)

  const assignLeg = positionDetail.legs.find((l) => l.legRole === 'ASSIGN')

  // Call lifecycle engine first so phase errors surface before missing-leg errors
  openCoveredCall({
    currentPhase: positionDetail.position.phase,
    strike: strikeStr,
    contracts: payload.contracts,
    positionContracts: assignLeg?.contracts ?? 0,
    premiumPerContract: premiumStr,
    fillDate,
    assignmentDate: assignLeg?.fillDate ?? fillDate,
    referenceDate: today,
    expiration: payload.expiration
  })

  if (!assignLeg) {
    throw new ValidationError('__root__', 'no_assign_leg', 'Position has no assignment leg')
  }

  const snapshot = positionDetail.costBasisSnapshot
  if (!snapshot) {
    throw new ValidationError('__root__', 'no_snapshot', 'Position has no cost basis snapshot')
  }

  const basisResult = calculateCcOpenBasis({
    prevBasisPerShare: snapshot.basisPerShare,
    prevTotalPremiumCollected: snapshot.totalPremiumCollected,
    ccPremiumPerContract: premiumStr,
    contracts: payload.contracts,
    positionContracts: assignLeg.contracts
  })

  const legId = randomUUID()
  const snapshotId = randomUUID()
  const snapshotAt = new Date(Date.now() + 1).toISOString()
  const strikeFormatted = new Decimal(strikeStr).toFixed(4)
  const premiumFormatted = new Decimal(premiumStr).toFixed(4)

  db.transaction(() => {
    db.prepare(
      `INSERT INTO legs
        (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts,
         premium_per_contract, fill_price, fill_date, created_at, updated_at)
       VALUES (?, ?, 'CC_OPEN', 'SELL', 'CALL', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      legId,
      positionId,
      strikeFormatted,
      payload.expiration,
      payload.contracts,
      premiumFormatted,
      premiumFormatted,
      fillDate,
      now,
      now
    )

    db.prepare(`UPDATE positions SET phase = 'CC_OPEN', updated_at = ? WHERE id = ?`).run(
      now,
      positionId
    )

    db.prepare(
      `INSERT INTO cost_basis_snapshots
        (id, position_id, basis_per_share, total_premium_collected, final_pnl, snapshot_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      snapshotId,
      positionId,
      basisResult.basisPerShare,
      basisResult.totalPremiumCollected,
      null,
      snapshotAt,
      now
    )
  })()

  logger.info({ positionId, phase: 'CC_OPEN' }, 'covered_call_opened')

  return {
    position: {
      id: positionDetail.position.id,
      ticker: positionDetail.position.ticker,
      phase: 'CC_OPEN',
      status: 'ACTIVE',
      closedDate: null
    },
    leg: {
      id: legId,
      positionId,
      legRole: 'CC_OPEN',
      action: 'SELL',
      instrumentType: 'CALL',
      strike: strikeFormatted,
      expiration: payload.expiration,
      contracts: payload.contracts,
      premiumPerContract: premiumFormatted,
      fillPrice: premiumFormatted,
      fillDate,
      createdAt: now,
      updatedAt: now
    },
    costBasisSnapshot: {
      id: snapshotId,
      positionId,
      basisPerShare: basisResult.basisPerShare,
      totalPremiumCollected: basisResult.totalPremiumCollected,
      finalPnl: null,
      snapshotAt,
      createdAt: now
    }
  }
}
