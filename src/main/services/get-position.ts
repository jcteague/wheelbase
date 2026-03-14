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
  OptionType,
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
  option_type: OptionType | null
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

const GET_QUERY = `
  SELECT
    p.id, p.ticker, p.phase, p.status,
    p.strategy_type, p.opened_date, p.closed_date,
    p.account_id, p.notes, p.thesis, p.tags,
    p.created_at, p.updated_at,
    l.id           AS leg_id,
    l.leg_role,
    l.action,
    l.option_type,
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
    WHERE position_id = p.id AND leg_role IN ('CSP_OPEN', 'CC_OPEN')
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

  const activeLeg: LegRecord | null = row.leg_id
    ? {
        id: row.leg_id,
        positionId: row.id,
        legRole: row.leg_role!,
        action: row.action!,
        optionType: row.option_type!,
        strike: row.strike!,
        expiration: row.expiration!,
        contracts: row.contracts!,
        premiumPerContract: row.premium_per_contract!,
        fillPrice: row.fill_price!,
        fillDate: row.fill_date!,
        createdAt: row.leg_created_at!,
        updatedAt: row.leg_updated_at!
      }
    : null

  const costBasisSnapshot: CostBasisSnapshotRecord | null = row.snapshot_id
    ? {
        id: row.snapshot_id,
        positionId: row.id,
        basisPerShare: row.basis_per_share!,
        totalPremiumCollected: row.total_premium_collected!,
        finalPnl: row.final_pnl ?? null,
        snapshotAt: row.snapshot_at!,
        createdAt: row.snapshot_created_at!
      }
    : null

  logger.info({ positionId }, 'position_fetched')

  return { position, activeLeg, costBasisSnapshot }
}
