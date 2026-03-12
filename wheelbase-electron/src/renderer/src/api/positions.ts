// Adapter between the renderer (snake_case) and the IPC layer (camelCase).

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

export type WheelStatus = 'active' | 'paused' | 'closed' | 'ACTIVE' | 'CLOSED'

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

function apiError(status: number, body: unknown): ApiError {
  return { status, body }
}

// IPC camelCase field names → renderer snake_case form field names
const IPC_TO_FORM_FIELD: Record<string, string> = {
  premiumPerContract: 'premium_per_contract',
  fillDate: 'fill_date'
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
    throw apiError(400, {
      detail: result.errors.map((e) => ({
        field: IPC_TO_FORM_FIELD[e.field] ?? e.field,
        code: e.code,
        message: e.message
      }))
    })
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
