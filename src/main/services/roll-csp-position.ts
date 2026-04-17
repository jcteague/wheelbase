import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { randomUUID } from 'node:crypto'
import { calculateRollBasis } from '../core/costbasis'
import { ValidationError, rollCsp } from '../core/lifecycle'
import { localToday, makeSnapshotAt } from '../dates'
import { logger } from '../logger'
import type { RollCspPayload, RollCspResult } from '../schemas'
import { getPosition } from './get-position'

export function rollCspPosition(
  db: Database.Database,
  positionId: string,
  payload: RollCspPayload
): RollCspResult {
  const today = localToday()
  const fillDate = payload.fillDate ?? today
  const now = new Date().toISOString()

  logger.debug({ positionId, fillDate }, 'roll_csp_position_inputs')

  const positionDetail = getPosition(db, positionId)
  if (!positionDetail) {
    throw new ValidationError('__root__', 'not_found', 'Position not found')
  }

  const activeLeg = positionDetail.activeLeg
  if (!activeLeg) {
    throw new ValidationError('__root__', 'no_active_leg', 'Position has no active leg')
  }

  const costToCloseFormatted = new Decimal(payload.costToClosePerContract).toFixed(4)
  const newPremiumFormatted = new Decimal(payload.newPremiumPerContract).toFixed(4)
  const newStrikeFormatted = new Decimal(payload.newStrike ?? activeLeg.strike).toFixed(4)

  // Lifecycle validation
  rollCsp({
    currentPhase: positionDetail.position.phase,
    currentExpiration: activeLeg.expiration,
    newExpiration: payload.newExpiration,
    costToClosePerContract: costToCloseFormatted,
    newPremiumPerContract: newPremiumFormatted
  })

  // Cost basis calculation
  const prevSnapshot = positionDetail.costBasisSnapshot
  const basisResult = calculateRollBasis({
    prevBasisPerShare: prevSnapshot?.basisPerShare ?? '0.0000',
    prevTotalPremiumCollected: prevSnapshot?.totalPremiumCollected ?? '0.0000',
    costToClosePerContract: costToCloseFormatted,
    newPremiumPerContract: newPremiumFormatted,
    contracts: activeLeg.contracts
  })

  const rollChainId = randomUUID()
  const rollFromLegId = randomUUID()
  const rollToLegId = randomUUID()
  const snapshotId = randomUUID()
  const snapshotAt = makeSnapshotAt(fillDate)

  db.transaction(() => {
    // ROLL_FROM leg: BUY to close the current CSP
    db.prepare(
      `INSERT INTO legs
        (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts,
         premium_per_contract, fill_price, fill_date, roll_chain_id, created_at, updated_at)
       VALUES (?, ?, 'ROLL_FROM', 'BUY', 'PUT', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      rollFromLegId,
      positionId,
      activeLeg.strike,
      activeLeg.expiration,
      activeLeg.contracts,
      costToCloseFormatted,
      costToCloseFormatted,
      fillDate,
      rollChainId,
      now,
      now
    )

    // ROLL_TO leg: SELL to open new CSP
    db.prepare(
      `INSERT INTO legs
        (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts,
         premium_per_contract, fill_price, fill_date, roll_chain_id, created_at, updated_at)
       VALUES (?, ?, 'ROLL_TO', 'SELL', 'PUT', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      rollToLegId,
      positionId,
      newStrikeFormatted,
      payload.newExpiration,
      activeLeg.contracts,
      newPremiumFormatted,
      newPremiumFormatted,
      fillDate,
      rollChainId,
      now,
      now
    )

    // Cost basis snapshot (no final PnL — position is still open)
    db.prepare(
      `INSERT INTO cost_basis_snapshots
        (id, position_id, basis_per_share, total_premium_collected, final_pnl, snapshot_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`
    ).run(
      snapshotId,
      positionId,
      basisResult.basisPerShare,
      basisResult.totalPremiumCollected,
      snapshotAt,
      now
    )

    // Position row NOT updated — phase stays CSP_OPEN
  })()

  logger.info({ positionId, rollChainId, basisPerShare: basisResult.basisPerShare }, 'csp_rolled')

  return {
    position: {
      id: positionDetail.position.id,
      ticker: positionDetail.position.ticker,
      phase: 'CSP_OPEN',
      status: 'ACTIVE'
    },
    rollFromLeg: {
      id: rollFromLegId,
      positionId,
      legRole: 'ROLL_FROM',
      action: 'BUY',
      instrumentType: 'PUT',
      strike: activeLeg.strike,
      expiration: activeLeg.expiration,
      contracts: activeLeg.contracts,
      premiumPerContract: costToCloseFormatted,
      fillPrice: costToCloseFormatted,
      fillDate,
      rollChainId,
      createdAt: now,
      updatedAt: now
    },
    rollToLeg: {
      id: rollToLegId,
      positionId,
      legRole: 'ROLL_TO',
      action: 'SELL',
      instrumentType: 'PUT',
      strike: newStrikeFormatted,
      expiration: payload.newExpiration,
      contracts: activeLeg.contracts,
      premiumPerContract: newPremiumFormatted,
      fillPrice: newPremiumFormatted,
      fillDate,
      rollChainId,
      createdAt: now,
      updatedAt: now
    },
    rollChainId,
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
