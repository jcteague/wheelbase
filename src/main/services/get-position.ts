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
import { activeLegSubquery } from './active-leg-sql'
import { readLegs } from './leg-rows'
import { pmccInitialNetDebit } from './pmcc-opening-legs'
import { pmccLedgerFromLegs } from './pmcc-ledger'
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
  profit_target_percent: number | null
  management_window_dte_override: number | null
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
  fees: string | null
  leg_created_at: string | null
  leg_updated_at: string | null
  // snapshot columns (nullable)
  snapshot_id: string | null
  basis_per_share: string | null
  total_premium_collected: string | null
  final_pnl: string | null
  trigger_event: string | null
  snapshot_at: string | null
  snapshot_created_at: string | null
}

function mapSnapshotRow(r: SnapshotRow): CostBasisSnapshotRecord {
  return {
    id: r.id,
    positionId: r.position_id,
    basisPerShare: r.basis_per_share,
    totalPremiumCollected: r.total_premium_collected,
    finalPnl: r.final_pnl,
    triggerEvent: r.trigger_event as CostBasisSnapshotRecord['triggerEvent'],
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
    rollChainId: null,
    fees: row.fees!,
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
    triggerEvent: row.trigger_event as CostBasisSnapshotRecord['triggerEvent'],
    snapshotAt: row.snapshot_at!,
    createdAt: row.snapshot_created_at!
  }
}

const GET_ALL_SNAPSHOTS_QUERY = `
  SELECT
    id, position_id, basis_per_share, total_premium_collected, final_pnl, trigger_event, snapshot_at, created_at
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
  trigger_event: string
  snapshot_at: string
  created_at: string
}

const GET_QUERY = `
  SELECT
    p.id, p.ticker, p.phase, p.status,
    p.strategy_type, p.opened_date, p.closed_date,
    p.account_id, p.notes, p.thesis, p.tags,
    p.profit_target_percent, p.management_window_dte_override,
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
    l.fees,
    l.created_at   AS leg_created_at,
    l.updated_at   AS leg_updated_at,
    cbs.id         AS snapshot_id,
    cbs.basis_per_share,
    cbs.total_premium_collected,
    cbs.final_pnl,
    cbs.trigger_event,
    cbs.snapshot_at,
    cbs.created_at AS snapshot_created_at
  FROM positions p
  LEFT JOIN legs l ON l.id = (
    ${activeLegSubquery()}
  )
  LEFT JOIN cost_basis_snapshots cbs ON cbs.id = (
    SELECT id FROM cost_basis_snapshots
    WHERE position_id = p.id
    ORDER BY snapshot_at DESC, rowid DESC
    LIMIT 1
  )
  WHERE p.id = ?
`

export function getPosition(db: Database.Database, positionId: string): GetPositionResult | null {
  logger.debug({ positionId }, 'get_position_query_start')

  const row = db.prepare(GET_QUERY).get(positionId) as PositionRow | undefined

  if (!row) return null

  const legs = readLegs(db, positionId)
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
    profitTargetPercent: row.profit_target_percent ?? null,
    managementWindowDteOverride: row.management_window_dte_override ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }

  const activeLeg = mapActiveLeg(row)
  const costBasisSnapshot = mapLatestSnapshot(row)

  const allSnapshots: CostBasisSnapshotRecord[] = snapshotRows.map(mapSnapshotRow)

  const isPmcc = position.strategyType === 'PMCC'
  const initialNetDebit = isPmcc ? pmccInitialNetDebit(legs) : null
  const pmccLedger = isPmcc ? pmccLedgerFromLegs(legs) : null

  logger.info({ positionId }, 'position_fetched')

  return {
    position,
    activeLeg,
    costBasisSnapshot,
    legs,
    allSnapshots,
    initialNetDebit,
    pmccLedger
  }
}
