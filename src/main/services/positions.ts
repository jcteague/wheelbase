// Service layer — DB access + core logic composition.
// No Electron or broker imports here.

import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { randomUUID } from 'node:crypto'
import { calculateInitialCspBasis } from '../core/costbasis'
import { openWheel } from '../core/lifecycle'
import { localToday, makeSnapshotAt } from '../dates'
import { logger } from '../logger'
import type { CreatePositionPayload, CreatePositionResult } from '../schemas'

export { listPositions } from './list-positions'
export { getPosition } from './get-position'
export { closeCspPosition } from './close-csp-position'
export { expireCspPosition } from './expire-csp-position'
export { assignCspPosition } from './assign-csp-position'
export { openCoveredCallPosition } from './open-covered-call-position'
export { closeCoveredCallPosition } from './close-covered-call-position'
export { expireCcPosition } from './expire-cc-position'

// ---------------------------------------------------------------------------
// createPosition
// ---------------------------------------------------------------------------

export function createPosition(
  db: Database.Database,
  payload: CreatePositionPayload
): CreatePositionResult {
  const today = localToday()
  const fillDate = payload.fillDate ?? today
  const now = new Date().toISOString()

  logger.debug(
    { ticker: payload.ticker, strike: payload.strike, expiration: payload.expiration, fillDate },
    'create_position_inputs'
  )

  const strikeStr = String(payload.strike)
  const premiumStr = String(payload.premiumPerContract)

  const lifecycleResult = openWheel({
    ticker: payload.ticker,
    strike: strikeStr,
    expiration: payload.expiration,
    contracts: payload.contracts,
    premiumPerContract: premiumStr,
    fillDate,
    referenceDate: today
  })

  logger.debug({ phase: lifecycleResult.phase }, 'lifecycle_validated')

  const basisResult = calculateInitialCspBasis({
    strike: strikeStr,
    premiumPerContract: premiumStr,
    contracts: payload.contracts
  })

  logger.debug(basisResult, 'cost_basis_calculated')

  const positionId = randomUUID()
  const legId = randomUUID()
  const snapshotId = randomUUID()
  const strikeFormatted = new Decimal(strikeStr).toFixed(4)
  const premiumFormatted = new Decimal(premiumStr).toFixed(4)
  const basisFormatted = new Decimal(basisResult.basisPerShare).toFixed(4)
  const totalPremiumFormatted = new Decimal(basisResult.totalPremiumCollected).toFixed(4)

  db.transaction(() => {
    db.prepare(
      `INSERT INTO positions
        (id, ticker, strategy_type, status, phase, opened_date, account_id, notes, thesis, tags, created_at, updated_at)
       VALUES (?, ?, 'WHEEL', 'ACTIVE', ?, ?, ?, ?, ?, '[]', ?, ?)`
    ).run(
      positionId,
      payload.ticker,
      lifecycleResult.phase,
      fillDate,
      payload.accountId ?? null,
      payload.notes ?? null,
      payload.thesis ?? null,
      now,
      now
    )

    db.prepare(
      `INSERT INTO legs
        (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts, premium_per_contract, fill_date, created_at, updated_at)
       VALUES (?, ?, 'CSP_OPEN', 'SELL', 'PUT', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      legId,
      positionId,
      strikeFormatted,
      payload.expiration,
      payload.contracts,
      premiumFormatted,
      fillDate,
      now,
      now
    )

    db.prepare(
      `INSERT INTO cost_basis_snapshots
        (id, position_id, basis_per_share, total_premium_collected, snapshot_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      snapshotId,
      positionId,
      basisFormatted,
      totalPremiumFormatted,
      makeSnapshotAt(fillDate),
      now
    )
  })()

  logger.info(
    { positionId, ticker: payload.ticker, phase: lifecycleResult.phase, basisFormatted },
    'position_created'
  )

  return {
    position: {
      id: positionId,
      ticker: payload.ticker,
      phase: lifecycleResult.phase,
      status: 'ACTIVE',
      strategyType: 'WHEEL',
      openedDate: fillDate,
      closedDate: null,
      accountId: payload.accountId ?? null,
      notes: payload.notes ?? null,
      thesis: payload.thesis ?? null,
      tags: [],
      createdAt: now,
      updatedAt: now
    },
    leg: {
      id: legId,
      positionId,
      legRole: 'CSP_OPEN',
      action: 'SELL',
      instrumentType: 'PUT',
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
      basisPerShare: basisFormatted,
      totalPremiumCollected: totalPremiumFormatted,
      finalPnl: null,
      snapshotAt: now,
      createdAt: now
    }
  }
}
