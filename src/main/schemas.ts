import { z } from 'zod'
import type {
  LegAction,
  LegRole,
  OptionType,
  StrategyType,
  WheelPhase,
  WheelStatus
} from './core/types'

// ---------------------------------------------------------------------------
// IPC input schema
// ---------------------------------------------------------------------------

export const CreatePositionPayloadSchema = z.object({
  ticker: z.string(),
  strike: z.number().positive(),
  expiration: z.string(),
  contracts: z.number().int().positive(),
  premiumPerContract: z.number().positive(),
  fillDate: z.string().optional(),
  accountId: z.string().optional(),
  thesis: z.string().optional(),
  notes: z.string().optional()
})

export type CreatePositionPayload = z.infer<typeof CreatePositionPayloadSchema>

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface PositionRecord {
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
  strategyType: StrategyType
  openedDate: string
  closedDate: string | null
  accountId: string | null
  notes: string | null
  thesis: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface LegRecord {
  id: string
  positionId: string
  legRole: LegRole
  action: LegAction
  optionType: OptionType
  strike: string
  expiration: string
  contracts: number
  premiumPerContract: string
  fillPrice: string | null
  fillDate: string
  createdAt: string
  updatedAt: string
}

export interface CostBasisSnapshotRecord {
  id: string
  positionId: string
  basisPerShare: string
  totalPremiumCollected: string
  finalPnl: string | null
  snapshotAt: string
  createdAt: string
}

export interface CreatePositionResult {
  position: PositionRecord
  leg: LegRecord
  costBasisSnapshot: CostBasisSnapshotRecord
}

// ---------------------------------------------------------------------------
// Close CSP schemas
// ---------------------------------------------------------------------------

export const CloseCspPayloadSchema = z.object({
  positionId: z.string().uuid(),
  closePricePerContract: z.number().positive(),
  fillDate: z.string().optional()
})

export type CloseCspPayload = z.infer<typeof CloseCspPayloadSchema>

export interface CloseCspPositionResult {
  position: {
    id: string
    ticker: string
    phase: WheelPhase
    status: WheelStatus
    closedDate: string
  }
  leg: LegRecord
  costBasisSnapshot: CostBasisSnapshotRecord & { finalPnl: string }
}

export interface GetPositionResult {
  position: PositionRecord
  activeLeg: LegRecord | null
  costBasisSnapshot: CostBasisSnapshotRecord | null
  legs: LegRecord[]
}

export interface PositionListItem {
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
  strike: string | null
  expiration: string | null
  dte: number | null
  premiumCollected: string
  effectiveCostBasis: string
}

// ---------------------------------------------------------------------------
// Expire CSP schemas
// ---------------------------------------------------------------------------

export const ExpireCspPayloadSchema = z.object({
  positionId: z.string().uuid(),
  expirationDateOverride: z.string().optional()
})

export type ExpireCspPayload = z.infer<typeof ExpireCspPayloadSchema>

export interface ExpireCspPositionResult {
  position: {
    id: string
    ticker: string
    phase: 'WHEEL_COMPLETE'
    status: 'CLOSED'
    closedDate: string
  }
  leg: LegRecord
  costBasisSnapshot: CostBasisSnapshotRecord & { finalPnl: string }
}
