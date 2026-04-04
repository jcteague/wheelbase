// Adapter between the renderer and the IPC preload layer.

export type WheelPhase =
  | 'CSP_OPEN'
  | 'CSP_EXPIRED'
  | 'CSP_CLOSED_PROFIT'
  | 'CSP_CLOSED_LOSS'
  | 'HOLDING_SHARES'
  | 'CC_OPEN'
  | 'CC_EXPIRED'
  | 'CC_CLOSED_PROFIT'
  | 'CC_CLOSED_LOSS'
  | 'WHEEL_COMPLETE'

export type WheelStatus = 'ACTIVE' | 'CLOSED'

export type CreatePositionPayload = {
  ticker: string
  strike: number
  expiration: string
  contracts: number
  premium_per_contract: number
  fill_date?: string
  thesis?: string
  notes?: string
}

export type PositionData = {
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
}

export type LegData = {
  id: string
  instrumentType: string
  strike: string
  expiration: string
  contracts: number
  premium_per_contract: string
}

export type CostBasisSnapshotData = {
  id: string
  basis_per_share: string
  total_premium_collected: string
}

export type CreatePositionResponse = {
  position: PositionData
  leg: LegData
  cost_basis_snapshot: CostBasisSnapshotData
}

export type PositionListItem = {
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
  strike: string | null
  expiration: string | null
  dte: number | null
  premium_collected: string
  effective_cost_basis: string
}

export type ApiFieldError = {
  field: string
  code: string
  message: string
}

export type ApiError = {
  status: number
  body: unknown
}

type IpcFieldError = {
  field: string
  code: string
  message: string
}

function apiError(status: number, body: unknown): ApiError {
  return { status, body }
}

// IPC camelCase field names → renderer snake_case form field names
const IPC_TO_FORM_FIELD: Record<string, string> = {
  premiumPerContract: 'premium_per_contract',
  fillDate: 'fill_date',
  closePricePerContract: 'close_price_per_contract',
  assignmentDate: 'assignment_date'
}

function mapIpcErrors(errors: IpcFieldError[]): ApiFieldError[] {
  return errors.map((e) => ({
    field: IPC_TO_FORM_FIELD[e.field] ?? e.field,
    code: e.code,
    message: e.message
  }))
}

function throwMappedIpcErrors(errors: IpcFieldError[]): never {
  throw apiError(400, { detail: mapIpcErrors(errors) })
}

export async function listPositions(): Promise<PositionListItem[]> {
  const items = await window.api.listPositions()
  return items.map((item) => ({
    id: item.id,
    ticker: item.ticker,
    phase: item.phase as WheelPhase,
    status: item.status as WheelStatus,
    strike: item.strike,
    expiration: item.expiration,
    dte: item.dte,
    premium_collected: item.premiumCollected,
    effective_cost_basis: item.effectiveCostBasis
  }))
}

export type PositionDetail = {
  position: {
    id: string
    ticker: string
    phase: WheelPhase
    status: WheelStatus
    strategyType: string
    openedDate: string
    closedDate: string | null
    accountId: string | null
    notes: string | null
    thesis: string | null
    tags: string[]
    createdAt: string
    updatedAt: string
  }
  activeLeg: {
    id: string
    positionId: string
    legRole: string
    action: string
    instrumentType: string
    strike: string
    expiration: string
    contracts: number
    premiumPerContract: string
    fillDate: string
    createdAt: string
    updatedAt: string
  } | null
  costBasisSnapshot: {
    id: string
    positionId: string
    basisPerShare: string
    totalPremiumCollected: string
    finalPnl: string | null
    snapshotAt: string
    createdAt: string
  } | null
  legs: Array<{
    id: string
    positionId: string
    legRole: string
    action: string
    instrumentType: string
    strike: string
    expiration: string
    contracts: number
    premiumPerContract: string
    fillDate: string
    createdAt: string
    updatedAt: string
  }>
}

export type CloseCspPayload = {
  position_id: string
  close_price_per_contract: number
  fill_date?: string
}

export type ClosedPositionData = {
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
  closedDate: string
}

export type ClosedSnapshotData = CostBasisSnapshotData & {
  positionId: string
  finalPnl: string
  snapshotAt: string
  createdAt: string
}

export type CloseCspResponse = {
  position: ClosedPositionData
  leg: LegData & { fillDate: string; fillPrice: string }
  costBasisSnapshot: ClosedSnapshotData
}

export type ExpireCspPayload = {
  position_id: string
  expiration_date_override?: string
}

export type ExpireCspResponse = {
  position: ClosedPositionData
  leg: LegData & {
    positionId: string
    legRole: string
    action: string
    instrumentType: string
    premiumPerContract: string
    fillDate: string
    createdAt: string
    updatedAt: string
  }
  costBasisSnapshot: ClosedSnapshotData
}

export type AssignCspPayload = {
  position_id: string
  assignment_date: string
}

export type AssignCspResponse = {
  position: PositionData
  leg: LegData & {
    positionId: string
    legRole: string
    action: string
    instrumentType: string
    premiumPerContract: string
    fillPrice: null
    fillDate: string
    createdAt: string
    updatedAt: string
  }
  costBasisSnapshot: {
    id: string
    positionId: string
    basisPerShare: string
    totalPremiumCollected: string
    finalPnl: null
    snapshotAt: string
    createdAt: string
  }
  premiumWaterfall: Array<{ label: string; amount: string }>
}

export async function getPosition(positionId: string): Promise<PositionDetail> {
  const result = await window.api.getPosition(positionId)
  if (!result.ok) {
    throw apiError(404, { detail: result.errors })
  }
  return result as unknown as PositionDetail
}

export async function closePosition(payload: CloseCspPayload): Promise<CloseCspResponse> {
  const result = await window.api.closePosition({
    positionId: payload.position_id,
    closePricePerContract: payload.close_price_per_contract,
    fillDate: payload.fill_date
  })
  if (!result.ok) {
    throw apiError(400, { detail: mapIpcErrors(result.errors) })
  }
  return result as unknown as CloseCspResponse
}

export async function expirePosition(payload: ExpireCspPayload): Promise<ExpireCspResponse> {
  const result = await window.api.expirePosition({
    positionId: payload.position_id,
    expirationDateOverride: payload.expiration_date_override
  })
  if (!result.ok) {
    throw apiError(400, { detail: mapIpcErrors(result.errors) })
  }
  return result as unknown as ExpireCspResponse
}

export async function assignPosition(payload: AssignCspPayload): Promise<AssignCspResponse> {
  const result = await window.api.assignPosition({
    positionId: payload.position_id,
    assignmentDate: payload.assignment_date
  })
  if (!result.ok) {
    throw apiError(400, { detail: mapIpcErrors(result.errors) })
  }
  return result as unknown as AssignCspResponse
}

export type OpenCcPayload = {
  position_id: string
  strike: number
  expiration: string
  contracts: number
  premium_per_contract: number
  fill_date?: string
}

export type OpenCcResponse = {
  position: { id: string; ticker: string; phase: 'CC_OPEN'; status: 'ACTIVE'; closedDate: null }
  leg: LegData & {
    positionId: string
    legRole: string
    action: string
    instrumentType: string
    premiumPerContract: string
    fillDate: string
    createdAt: string
    updatedAt: string
  }
  costBasisSnapshot: {
    id: string
    positionId: string
    basisPerShare: string
    totalPremiumCollected: string
    finalPnl: null
    snapshotAt: string
    createdAt: string
  }
}

export async function openCoveredCall(payload: OpenCcPayload): Promise<OpenCcResponse> {
  const result = await window.api.openCoveredCall({
    positionId: payload.position_id,
    strike: payload.strike,
    expiration: payload.expiration,
    contracts: payload.contracts,
    premiumPerContract: payload.premium_per_contract,
    fillDate: payload.fill_date
  })
  if (!result.ok) {
    throw apiError(400, { detail: mapIpcErrors(result.errors) })
  }
  return result as unknown as OpenCcResponse
}

export type CloseCcEarlyPayload = {
  position_id: string
  close_price_per_contract: number
  fill_date?: string
}

export type CloseCcEarlyResponse = {
  position: {
    id: string
    ticker: string
    phase: 'HOLDING_SHARES'
    status: 'ACTIVE'
    closedDate: null
  }
  leg: FilledOptionCloseLegData
  ccLegPnl: string
}

export async function closeCoveredCallEarly(
  payload: CloseCcEarlyPayload
): Promise<CloseCcEarlyResponse> {
  const result = await window.api.closeCoveredCallEarly({
    positionId: payload.position_id,
    closePricePerContract: payload.close_price_per_contract,
    fillDate: payload.fill_date
  })
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result as unknown as CloseCcEarlyResponse
}

export type RecordCallAwayPayload = {
  position_id: string
}

type FilledOptionCloseLegData = LegData & {
  positionId: string
  legRole: string
  action: string
  instrumentType: string
  premiumPerContract: string
  fillPrice: string
  fillDate: string
  createdAt: string
  updatedAt: string
}

export type RecordCallAwayResponse = {
  position: {
    id: string
    ticker: string
    phase: 'WHEEL_COMPLETE'
    status: 'CLOSED'
    closedDate: string
  }
  leg: FilledOptionCloseLegData
  costBasisSnapshot: ClosedSnapshotData
  finalPnl: string
  cycleDays: number
  annualizedReturn: string
  basisPerShare: string
}

export async function recordCallAway(
  payload: RecordCallAwayPayload
): Promise<RecordCallAwayResponse> {
  const result = await window.api.recordCallAway({
    positionId: payload.position_id
  })
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result as unknown as RecordCallAwayResponse
}

export type ExpireCcPayload = {
  position_id: string
  expiration_date_override?: string
}

export type ExpireCcResponse = {
  position: {
    id: string
    ticker: string
    phase: 'HOLDING_SHARES'
    status: 'ACTIVE'
    closedDate: null
  }
  leg: LegData & {
    positionId: string
    legRole: string
    action: string
    instrumentType: string
    premiumPerContract: string
    fillPrice: null
    fillDate: string
    createdAt: string
    updatedAt: string
  }
  costBasisSnapshot: {
    id: string
    positionId: string
    basisPerShare: string
    totalPremiumCollected: string
    finalPnl: null
    snapshotAt: string
    createdAt: string
  }
  sharesHeld: number
}

export async function expireCc(payload: ExpireCcPayload): Promise<ExpireCcResponse> {
  const result = await window.api.expireCc({
    positionId: payload.position_id,
    expirationDateOverride: payload.expiration_date_override
  })
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result as unknown as ExpireCcResponse
}

export async function createPosition(
  payload: CreatePositionPayload
): Promise<CreatePositionResponse> {
  const result = await window.api.createPosition({
    ticker: payload.ticker,
    strike: payload.strike,
    expiration: payload.expiration,
    contracts: payload.contracts,
    premiumPerContract: payload.premium_per_contract,
    fillDate: payload.fill_date,
    thesis: payload.thesis,
    notes: payload.notes
  })

  if (!result.ok) {
    throw apiError(400, { detail: mapIpcErrors(result.errors) })
  }

  return {
    position: {
      id: result.position.id,
      ticker: result.position.ticker,
      phase: result.position.phase as WheelPhase,
      status: result.position.status as WheelStatus
    },
    leg: {
      id: result.leg.id,
      instrumentType: result.leg.instrumentType,
      strike: result.leg.strike,
      expiration: result.leg.expiration,
      contracts: result.leg.contracts,
      premium_per_contract: result.leg.premiumPerContract
    },
    cost_basis_snapshot: {
      id: result.costBasisSnapshot.id,
      basis_per_share: result.costBasisSnapshot.basisPerShare,
      total_premium_collected: result.costBasisSnapshot.totalPremiumCollected
    }
  }
}
