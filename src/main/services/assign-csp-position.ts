import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { randomUUID } from 'node:crypto'
import { calculateAssignmentBasis } from '../core/costbasis'
import { ValidationError, recordAssignment } from '../core/lifecycle'
import { makeSnapshotAt } from '../dates'
import { logger } from '../logger'
import type { AssignCspPayload, AssignCspPositionResult, LegRecord } from '../schemas'
import { getPosition } from './get-position'

interface RollChainEntry {
  netCredit: string
  contracts: number
}

function groupRollsByChain(legs: LegRecord[]): RollChainEntry[] {
  const rollLegs = legs.filter((l) => l.legRole === 'ROLL_TO' || l.legRole === 'ROLL_FROM')

  const chainMap = new Map<string, LegRecord[]>()
  for (const leg of rollLegs) {
    const key = leg.rollChainId ?? ''
    if (!chainMap.has(key)) chainMap.set(key, [])
    chainMap.get(key)!.push(leg)
  }

  return Array.from(chainMap.values())
    .map((chainLegs) => {
      const rollTo = chainLegs.find((l) => l.legRole === 'ROLL_TO')
      const rollFrom = chainLegs.find((l) => l.legRole === 'ROLL_FROM')
      if (!rollTo || !rollFrom) return null
      const netCredit = new Decimal(rollTo.premiumPerContract)
        .minus(rollFrom.premiumPerContract)
        .toFixed(4)
      const earliestDate = chainLegs.reduce(
        (min, l) => (l.fillDate < min ? l.fillDate : min),
        chainLegs[0].fillDate
      )
      return { netCredit, contracts: rollTo.contracts, earliestDate }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => a.earliestDate.localeCompare(b.earliestDate))
    .map(({ netCredit, contracts }) => ({ netCredit, contracts }))
}

export function assignCspPosition(
  db: Database.Database,
  positionId: string,
  payload: AssignCspPayload
): AssignCspPositionResult {
  const now = new Date().toISOString()

  logger.debug({ positionId, assignmentDate: payload.assignmentDate }, 'assign_csp_position_inputs')

  const positionDetail = getPosition(db, positionId)
  if (!positionDetail) {
    throw new ValidationError('__root__', 'not_found', 'Position not found')
  }

  const lifecycleResult = recordAssignment({
    currentPhase: positionDetail.position.phase,
    assignmentDate: payload.assignmentDate,
    openFillDate: positionDetail.activeLeg?.fillDate ?? payload.assignmentDate
  })

  const openLeg = positionDetail.activeLeg
  if (!openLeg) {
    throw new ValidationError('__root__', 'no_active_leg', 'Position has no active leg')
  }

  const cspOpenLeg = positionDetail.legs.find((l) => l.legRole === 'CSP_OPEN')
  const rollChains = groupRollsByChain(positionDetail.legs)

  const premiumLegs = [
    ...(cspOpenLeg
      ? [
          {
            legRole: 'CSP_OPEN',
            premiumPerContract: cspOpenLeg.premiumPerContract,
            contracts: cspOpenLeg.contracts
          }
        ]
      : []),
    ...rollChains.map(({ netCredit, contracts }, idx) => ({
      legRole: 'ROLL_NET',
      premiumPerContract: netCredit,
      contracts,
      label: `Roll #${idx + 1} ${new Decimal(netCredit).isNegative() ? 'debit' : 'credit'}`
    }))
  ]

  const basisResult = calculateAssignmentBasis({
    strike: openLeg.strike,
    contracts: openLeg.contracts,
    premiumLegs
  })

  const assignLegId = randomUUID()
  const snapshotId = randomUUID()
  const snapshotAt = makeSnapshotAt(payload.assignmentDate)

  db.transaction(() => {
    db.prepare(
      `INSERT INTO legs
        (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts,
         premium_per_contract, fill_price, fill_date, created_at, updated_at)
       VALUES (?, ?, 'ASSIGN', 'ASSIGN', 'STOCK', ?, ?, ?, '0.0000', ?, ?, ?, ?)`
    ).run(
      assignLegId,
      positionId,
      openLeg.strike,
      openLeg.expiration,
      openLeg.contracts,
      null,
      payload.assignmentDate,
      now,
      now
    )

    db.prepare(`UPDATE positions SET phase = ?, updated_at = ? WHERE id = ?`).run(
      lifecycleResult.phase,
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

  logger.info({ positionId, phase: lifecycleResult.phase }, 'position_assigned')

  return {
    position: {
      id: positionDetail.position.id,
      ticker: positionDetail.position.ticker,
      phase: lifecycleResult.phase,
      status: 'ACTIVE',
      closedDate: null
    },
    leg: {
      id: assignLegId,
      positionId,
      legRole: 'ASSIGN',
      action: 'ASSIGN',
      instrumentType: 'STOCK',
      strike: openLeg.strike,
      expiration: openLeg.expiration,
      contracts: openLeg.contracts,
      premiumPerContract: '0.0000',
      fillPrice: null,
      fillDate: payload.assignmentDate,
      rollChainId: null,
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
    },
    premiumWaterfall: basisResult.premiumWaterfall
  }
}
