import { z } from 'zod'
import type {
  LegAction,
  LegRole,
  InstrumentType,
  StrategyType,
  WheelPhase,
  WheelStatus
} from './core/types'

// ---------------------------------------------------------------------------
// IPC input schema
// ---------------------------------------------------------------------------

const PositionIdSchema = z.string().uuid()

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
  instrumentType: InstrumentType
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
  positionId: PositionIdSchema,
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
  positionId: PositionIdSchema,
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

// ---------------------------------------------------------------------------
// Assign CSP schemas
// ---------------------------------------------------------------------------

export const AssignCspPayloadSchema = z.object({
  positionId: PositionIdSchema,
  assignmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date (YYYY-MM-DD)')
})

export type AssignCspPayload = z.infer<typeof AssignCspPayloadSchema>

export interface AssignCspPositionResult {
  position: {
    id: string
    ticker: string
    phase: 'HOLDING_SHARES'
    status: 'ACTIVE'
    closedDate: null
  }
  leg: LegRecord
  costBasisSnapshot: CostBasisSnapshotRecord
  premiumWaterfall: Array<{ label: string; amount: string }>
}

// ---------------------------------------------------------------------------
// Open CC schemas
// ---------------------------------------------------------------------------

export const OpenCcPayloadSchema = z.object({
  positionId: PositionIdSchema,
  strike: z.number().positive(),
  expiration: z.string(),
  contracts: z.number().int().positive(),
  premiumPerContract: z.number().positive(),
  fillDate: z.string().optional()
})

export type OpenCcPayload = z.infer<typeof OpenCcPayloadSchema>

export interface OpenCcPositionResult {
  position: { id: string; ticker: string; phase: 'CC_OPEN'; status: 'ACTIVE'; closedDate: null }
  leg: LegRecord
  costBasisSnapshot: CostBasisSnapshotRecord
}

// ---------------------------------------------------------------------------
// Record Call-Away schemas
// ---------------------------------------------------------------------------

export const RecordCallAwayPayloadSchema = z.object({
  positionId: PositionIdSchema
})

export type RecordCallAwayPayload = z.infer<typeof RecordCallAwayPayloadSchema>

export interface RecordCallAwayResult {
  position: {
    id: string
    ticker: string
    phase: 'WHEEL_COMPLETE'
    status: 'CLOSED'
    closedDate: string
  }
  leg: LegRecord
  costBasisSnapshot: CostBasisSnapshotRecord & { finalPnl: string }
  finalPnl: string
  cycleDays: number
  annualizedReturn: string
  basisPerShare: string
}

// ---------------------------------------------------------------------------
// Close CC schemas
// ---------------------------------------------------------------------------

export const CloseCcPayloadSchema = z.object({
  positionId: PositionIdSchema,
  closePricePerContract: z.number().positive(),
  fillDate: z.string().optional()
})

export type CloseCcPayload = z.infer<typeof CloseCcPayloadSchema>

export interface CloseCcPositionResult {
  position: {
    id: string
    ticker: string
    phase: 'HOLDING_SHARES'
    status: 'ACTIVE'
    closedDate: null
  }
  leg: LegRecord
  ccLegPnl: string
}
