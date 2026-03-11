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

export type WheelStatus = 'active' | 'paused' | 'closed'

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

export async function listPositions(): Promise<PositionListItem[]> {
  const response = await fetch('/api/positions')
  const body: unknown = await response.json()
  if (!response.ok) throw apiError(response.status, body)
  return body as PositionListItem[]
}

export async function createPosition(
  payload: CreatePositionPayload
): Promise<CreatePositionResponse> {
  const response = await fetch('/api/positions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  const body: unknown = await response.json()

  if (!response.ok) {
    throw apiError(response.status, body)
  }

  return body as CreatePositionResponse
}
