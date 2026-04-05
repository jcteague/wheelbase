import Database from 'better-sqlite3'
import type {
  CostBasisSnapshotRecord,
  GetPositionResult,
  LegRecord,
  PositionRecord
} from '../schemas'
import type {
  LegAction,
  LegRole,
  InstrumentType,
  StrategyType,
  WheelPhase,
  WheelStatus
} from '../core/types'
import { logger } from '../logger'

interface PositionRow {
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
  strategy_type: StrategyType
  opened_date: string
  closed_date: string | null
  account_id: string | null
  notes: string | null
  thesis: string | null
  tags: string
  created_at: string
  updated_at: string
  // leg columns (nullable if no active leg)
  leg_id: string | null
  leg_role: LegRole | null
  action: LegAction | null
  instrument_type: InstrumentType | null
  strike: string | null
  expiration: string | null
  contracts: number | null
  premium_per_contract: string | null
  fill_price: string | null
  fill_date: string | null
  leg_created_at: string | null
  leg_updated_at: string | null
  // snapshot columns (nullable)
  snapshot_id: string | null
  basis_per_share: string | null
  total_premium_collected: string | null
  final_pnl: string | null
  snapshot_at: string | null
  snapshot_created_at: string | null
}

function mapLegRow(r: LegRow): LegRecord {
  return {
    id: r.id,
    positionId: r.position_id,
    legRole: r.leg_role,
    action: r.action,
    instrumentType: r.instrument_type,
    strike: r.strike,
    expiration: r.expiration,
    contracts: r.contracts,
    premiumPerContract: r.premium_per_contract,
    fillPrice: r.fill_price,
    fillDate: r.fill_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

function mapSnapshotRow(r: SnapshotRow): CostBasisSnapshotRecord {
  return {
    id: r.id,
    positionId: r.position_id,
    basisPerShare: r.basis_per_share,
    totalPremiumCollected: r.total_premium_collected,
    finalPnl: r.final_pnl,
    snapshotAt: r.snapshot_at,
    createdAt: r.created_at
  }
}

function mapActiveLeg(row: PositionRow): LegRecord | null {
  if (!row.leg_id) {
    return null
  }

  return {
    id: row.leg_id,
    positionId: row.id,
    legRole: row.leg_role!,
    action: row.action!,
    instrumentType: row.instrument_type!,
    strike: row.strike!,
    expiration: row.expiration!,
    contracts: row.contracts!,
    premiumPerContract: row.premium_per_contract!,
    fillPrice: row.fill_price,
    fillDate: row.fill_date!,
    createdAt: row.leg_created_at!,
    updatedAt: row.leg_updated_at!
  }
}

function mapLatestSnapshot(row: PositionRow): CostBasisSnapshotRecord | null {
  if (!row.snapshot_id) {
    return null
  }

  return {
    id: row.snapshot_id,
    positionId: row.id,
    basisPerShare: row.basis_per_share!,
    totalPremiumCollected: row.total_premium_collected!,
    finalPnl: row.final_pnl ?? null,
    snapshotAt: row.snapshot_at!,
    createdAt: row.snapshot_created_at!
  }
}

const GET_LEGS_QUERY = `
  SELECT
    id, position_id, leg_role, action, instrument_type, strike, expiration,
    contracts, premium_per_contract, fill_price, fill_date, created_at, updated_at
  FROM legs
  WHERE position_id = ?
  ORDER BY fill_date ASC, created_at ASC
`

const GET_ALL_SNAPSHOTS_QUERY = `
  SELECT
    id, position_id, basis_per_share, total_premium_collected, final_pnl, snapshot_at, created_at
  FROM cost_basis_snapshots
  WHERE position_id = ?
  ORDER BY snapshot_at ASC
`

interface SnapshotRow {
  id: string
  position_id: string
  basis_per_share: string
  total_premium_collected: string
  final_pnl: string | null
  snapshot_at: string
  created_at: string
}

interface LegRow {
  id: string
  position_id: string
  leg_role: LegRole
  action: LegAction
  instrument_type: InstrumentType
  strike: string
  expiration: string
  contracts: number
  premium_per_contract: string
  fill_price: string | null
  fill_date: string
  created_at: string
  updated_at: string
}

const GET_QUERY = `
  SELECT
    p.id, p.ticker, p.phase, p.status,
    p.strategy_type, p.opened_date, p.closed_date,
    p.account_id, p.notes, p.thesis, p.tags,
    p.created_at, p.updated_at,
    l.id           AS leg_id,
    l.leg_role,
    l.action,
    l.instrument_type,
    l.strike,
    l.expiration,
    l.contracts,
    l.premium_per_contract,
    l.fill_price,
    l.fill_date,
    l.created_at   AS leg_created_at,
    l.updated_at   AS leg_updated_at,
    cbs.id         AS snapshot_id,
    cbs.basis_per_share,
    cbs.total_premium_collected,
    cbs.final_pnl,
    cbs.snapshot_at,
    cbs.created_at AS snapshot_created_at
  FROM positions p
  LEFT JOIN legs l ON l.id = (
    SELECT id FROM legs
    WHERE position_id = p.id
      AND (
        (p.phase = 'CSP_OPEN' AND leg_role = 'CSP_OPEN')
        OR (p.phase = 'CC_OPEN' AND leg_role = 'CC_OPEN')
      )
    ORDER BY fill_date DESC, created_at DESC
    LIMIT 1
  )
  LEFT JOIN cost_basis_snapshots cbs ON cbs.id = (
    SELECT id FROM cost_basis_snapshots
    WHERE position_id = p.id
    ORDER BY snapshot_at DESC
    LIMIT 1
  )
  WHERE p.id = ?
`

export function getPosition(db: Database.Database, positionId: string): GetPositionResult | null {
  logger.debug({ positionId }, 'get_position_query_start')

  const row = db.prepare(GET_QUERY).get(positionId) as PositionRow | undefined

  if (!row) return null

  const legRows = db.prepare(GET_LEGS_QUERY).all(positionId) as LegRow[]
  const snapshotRows = db.prepare(GET_ALL_SNAPSHOTS_QUERY).all(positionId) as SnapshotRow[]

  const position: PositionRecord = {
    id: row.id,
    ticker: row.ticker,
    phase: row.phase,
    status: row.status,
    strategyType: row.strategy_type,
    openedDate: row.opened_date,
    closedDate: row.closed_date ?? null,
    accountId: row.account_id ?? null,
    notes: row.notes ?? null,
    thesis: row.thesis ?? null,
    tags: JSON.parse(row.tags ?? '[]') as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }

  const activeLeg = mapActiveLeg(row)
  const costBasisSnapshot = mapLatestSnapshot(row)

  const legs: LegRecord[] = legRows.map(mapLegRow)
  const allSnapshots: CostBasisSnapshotRecord[] = snapshotRows.map(mapSnapshotRow)

  logger.info({ positionId }, 'position_fetched')

  return { position, activeLeg, costBasisSnapshot, legs, allSnapshots }
}
