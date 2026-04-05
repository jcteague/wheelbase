import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import Decimal from 'decimal.js'
import { calculateCallAway } from '../core/costbasis'
import { recordCallAway, ValidationError } from '../core/lifecycle'
import { logger } from '../logger'
import type { RecordCallAwayPayload, RecordCallAwayResult } from '../schemas'
import { getPosition } from './get-position'

const CALL_AWAY_PHASE = 'WHEEL_COMPLETE' as const
const CLOSED_STATUS = 'CLOSED' as const
const ZERO_PREMIUM = '0.0000' as const

function getCcOpenLeg(
  positionDetail: NonNullable<ReturnType<typeof getPosition>>
): NonNullable<ReturnType<typeof getPosition>>['activeLeg'] {
  return positionDetail.activeLeg?.legRole === 'CC_OPEN' ? positionDetail.activeLeg : null
}

export function recordCallAwayPosition(
  db: Database.Database,
  positionId: string,
  payload: RecordCallAwayPayload
): RecordCallAwayResult {
  void payload
  const now = new Date().toISOString()

  logger.debug({ positionId }, 'record_call_away_position_inputs')

  const positionDetail = getPosition(db, positionId)
  if (!positionDetail) {
    throw new ValidationError('positionId', 'not_found', 'Position not found')
  }

  const ccOpenLeg = getCcOpenLeg(positionDetail)
  const fillDate = ccOpenLeg?.expiration ?? positionDetail.position.openedDate

  recordCallAway({
    currentPhase: positionDetail.position.phase,
    contracts: ccOpenLeg?.contracts ?? 1,
    fillDate,
    ccOpenFillDate: ccOpenLeg?.fillDate ?? fillDate
  })

  if (!ccOpenLeg) {
    throw new ValidationError(
      'positionId',
      'no_cc_open_leg',
      'Position has no open covered call leg'
    )
  }

  const ccStrikeStr = ccOpenLeg.strike
  const ccStrikeFormatted = new Decimal(ccStrikeStr).toFixed(4)

  const existingSnapshot = positionDetail.costBasisSnapshot
  const basisPerShare = existingSnapshot?.basisPerShare ?? '0.0000'
  const totalPremiumCollected = existingSnapshot?.totalPremiumCollected ?? '0.0000'

  const { finalPnl, cycleDays, annualizedReturn } = calculateCallAway({
    ccStrike: ccStrikeStr,
    basisPerShare,
    contracts: ccOpenLeg.contracts,
    positionOpenedDate: positionDetail.position.openedDate,
    fillDate
  })

  const legId = randomUUID()
  const snapshotId = randomUUID()
  const snapshotAt = new Date(Date.now() + 1).toISOString()

  db.transaction(() => {
    db.prepare(
      `INSERT INTO legs
        (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts,
          premium_per_contract, fill_price, fill_date, created_at, updated_at)
        VALUES (?, ?, 'CALLED_AWAY', 'EXERCISE', 'CALL', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      legId,
      positionId,
      ccOpenLeg.strike,
      ccOpenLeg.expiration,
      ccOpenLeg.contracts,
      ZERO_PREMIUM,
      ccStrikeFormatted,
      fillDate,
      now,
      now
    )

    db.prepare(
      `UPDATE positions SET phase = 'WHEEL_COMPLETE', status = 'CLOSED', closed_date = ?, updated_at = ? WHERE id = ?`
    ).run(fillDate, now, positionId)

    db.prepare(
      `INSERT INTO cost_basis_snapshots
        (id, position_id, basis_per_share, total_premium_collected, final_pnl, snapshot_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(snapshotId, positionId, basisPerShare, totalPremiumCollected, finalPnl, snapshotAt, now)
  })()

  logger.info({ positionId, phase: CALL_AWAY_PHASE, finalPnl }, 'call_away_recorded')

  return {
    position: {
      id: positionDetail.position.id,
      ticker: positionDetail.position.ticker,
      phase: CALL_AWAY_PHASE,
      status: CLOSED_STATUS,
      closedDate: fillDate
    },
    leg: {
      id: legId,
      positionId,
      legRole: 'CALLED_AWAY',
      action: 'EXERCISE',
      instrumentType: 'CALL',
      strike: ccOpenLeg.strike,
      expiration: ccOpenLeg.expiration,
      contracts: ccOpenLeg.contracts,
      premiumPerContract: ZERO_PREMIUM,
      fillPrice: ccStrikeFormatted,
      fillDate,
      createdAt: now,
      updatedAt: now
    },
    costBasisSnapshot: {
      id: snapshotId,
      positionId,
      basisPerShare,
      totalPremiumCollected,
      finalPnl,
      snapshotAt,
      createdAt: now
    },
    finalPnl,
    cycleDays,
    annualizedReturn,
    basisPerShare
  }
}
