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

const IsoDateRegex = /^\d{4}-\d{2}-\d{2}$/
const IsoDateMessage = 'Must be a valid date (YYYY-MM-DD)'

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
  rollChainId: string | null
  createdAt: string
  updatedAt: string
}

export type TriggerEvent =
  | 'CSP_OPEN'
  | 'CSP_CLOSE'
  | 'CSP_EXPIRE'
  | 'CSP_ASSIGN'
  | 'CSP_ROLL'
  | 'CC_OPEN'
  | 'CC_ROLL'
  | 'CALL_AWAY'

export interface CostBasisSnapshotRecord {
  id: string
  positionId: string
  basisPerShare: string
  totalPremiumCollected: string
  finalPnl: string | null
  triggerEvent: TriggerEvent
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
  allSnapshots: CostBasisSnapshotRecord[]
}

export interface PositionListItem {
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
  strike: string | null
  expiration: string | null
  dte: number | null
  instrumentType: 'PUT' | 'CALL' | null
  contracts: number | null
  entryPremiumPerContract: string | null
  premiumCollected: string
  effectiveCostBasis: string
  profitTargetPercent: number | null
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
  assignmentDate: z.string().regex(IsoDateRegex, IsoDateMessage)
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
// Expire CC schemas
// ---------------------------------------------------------------------------

export const ExpireCcPayloadSchema = z.object({
  positionId: PositionIdSchema,
  expirationDateOverride: z.string().optional()
})

export type ExpireCcPayload = z.infer<typeof ExpireCcPayloadSchema>

export interface ExpireCcPositionResult {
  position: {
    id: string
    ticker: string
    phase: 'HOLDING_SHARES'
    status: 'ACTIVE'
    closedDate: null
  }
  leg: LegRecord
  costBasisSnapshot: CostBasisSnapshotRecord
  sharesHeld: number
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

// ---------------------------------------------------------------------------
// Roll schemas (shared base)
// ---------------------------------------------------------------------------

const RollPayloadBaseSchema = z.object({
  positionId: PositionIdSchema,
  costToClosePerContract: z.number().positive(),
  newPremiumPerContract: z.number().positive(),
  newExpiration: z.string().regex(IsoDateRegex, IsoDateMessage),
  newStrike: z.number().positive().optional(),
  fillDate: z.string().optional()
})

interface RollResultBase {
  rollFromLeg: LegRecord
  rollToLeg: LegRecord
  rollChainId: string
  costBasisSnapshot: CostBasisSnapshotRecord
}

// ---------------------------------------------------------------------------
// Roll CSP schemas
// ---------------------------------------------------------------------------

export const RollCspPayloadSchema = RollPayloadBaseSchema

export type RollCspPayload = z.infer<typeof RollCspPayloadSchema>

export interface RollCspResult extends RollResultBase {
  position: {
    id: string
    ticker: string
    phase: 'CSP_OPEN'
    status: 'ACTIVE'
  }
}

// ---------------------------------------------------------------------------
// Roll CC schemas
// ---------------------------------------------------------------------------

export const RollCcPayloadSchema = RollPayloadBaseSchema

export type RollCcPayload = z.infer<typeof RollCcPayloadSchema>

export interface RollCcResult extends RollResultBase {
  position: {
    id: string
    ticker: string
    phase: 'CC_OPEN'
    status: 'ACTIVE'
  }
}

// ---------------------------------------------------------------------------
// Market data schemas
// ---------------------------------------------------------------------------

const MAX_TICKER_LENGTH = 10
const MAX_TICKERS_PER_REQUEST = 50

const TickerListSchema = z
  .array(z.string().min(1).max(MAX_TICKER_LENGTH))
  .max(MAX_TICKERS_PER_REQUEST)

export const GetStockQuotesPayloadSchema = z.object({
  tickers: TickerListSchema
})
export type GetStockQuotesPayload = z.infer<typeof GetStockQuotesPayloadSchema>

export const SetStockQuoteTickersPayloadSchema = GetStockQuotesPayloadSchema
export type SetStockQuoteTickersPayload = z.infer<typeof SetStockQuoteTickersPayloadSchema>

export const GetOptionSnapshotsPayloadSchema = z.object({
  symbols: z.array(z.string().min(1).max(25)).max(50)
})
export type GetOptionSnapshotsPayload = z.infer<typeof GetOptionSnapshotsPayloadSchema>

export const GetOptionSnapshotPayloadSchema = z.object({
  underlying: z.string().min(1),
  contract: z.string().regex(/^[A-Z]{1,6}\d{6}[CP]\d{8}$/)
})
export type GetOptionSnapshotPayload = z.infer<typeof GetOptionSnapshotPayloadSchema>

export const GetOptionChainPayloadSchema = z.object({
  underlying: z.string().min(1),
  expirationFrom: z.string().date().optional(),
  expirationTo: z.string().date().optional(),
  type: z.enum(['put', 'call']).optional(),
  strikeFrom: z.string().optional(),
  strikeTo: z.string().optional(),
  limit: z.number().int().min(1).max(250).optional(),
  cursor: z.string().optional()
})
export type GetOptionChainPayload = z.infer<typeof GetOptionChainPayloadSchema>

export const GetBrokerActivitiesPayloadSchema = z.object({
  type: z.string().min(1),
  since: z.string().datetime().optional()
})
export type GetBrokerActivitiesPayload = z.infer<typeof GetBrokerActivitiesPayloadSchema>

// ---------------------------------------------------------------------------
// Settings schemas
// ---------------------------------------------------------------------------

export const BrokerEnvironmentSchema = z.enum(['paper', 'live'])

const NonEmptyTrimmedStringSchema = z.string().trim().min(1, 'Required')

export const SaveAlpacaCredentialsPayloadSchema = z.object({
  environment: BrokerEnvironmentSchema,
  keyId: NonEmptyTrimmedStringSchema,
  secret: NonEmptyTrimmedStringSchema
})
export type SaveAlpacaCredentialsPayload = z.infer<typeof SaveAlpacaCredentialsPayloadSchema>

export const RemoveAlpacaCredentialsPayloadSchema = z.object({
  environment: BrokerEnvironmentSchema
})
export type RemoveAlpacaCredentialsPayload = z.infer<typeof RemoveAlpacaCredentialsPayloadSchema>

export const SetActiveBrokerEnvironmentPayloadSchema = z.object({
  environment: BrokerEnvironmentSchema
})
export type SetActiveBrokerEnvironmentPayload = z.infer<
  typeof SetActiveBrokerEnvironmentPayloadSchema
>

export const TestConnectionPayloadSchema = z.discriminatedUnion('vendor', [
  z.object({
    vendor: z.literal('massive')
  }),
  z.object({
    vendor: z.literal('alpaca'),
    environment: BrokerEnvironmentSchema,
    keyId: NonEmptyTrimmedStringSchema,
    secret: NonEmptyTrimmedStringSchema
  })
])
export type TestConnectionPayload = z.infer<typeof TestConnectionPayloadSchema>
