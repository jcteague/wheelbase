// Adapter between the renderer and the IPC preload layer.

import { type ApiError, apiError, type IpcFieldError, throwMappedIpcErrors } from './error'

export type { ApiError }
export type ApiFieldError = IpcFieldError

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
  | 'PMCC_OPEN'

export type WheelStatus = 'ACTIVE' | 'CLOSED'

export type CreatePositionPayload = IpcPayload<'createPosition'>

export type CreatePositionResponse = IpcSuccess<'createPosition'>

// Responses are camelCase end to end: the handler's own types are the renderer's.
import type { CostBasisSnapshotRecord, LegRecord, PositionListItem } from '../../../main/schemas'

/** What a handler accepts, exactly as the preload types it. */
type IpcPayload<K extends keyof Window['api']> = Window['api'][K] extends (
  payload: infer P
) => Promise<unknown>
  ? P
  : never

/** A handler's success payload, exactly as the preload types it. */
type IpcSuccess<K extends keyof Window['api']> = Window['api'][K] extends (
  ...args: never[]
) => Promise<infer R>
  ? Omit<Extract<R, { ok: true }>, 'ok'>
  : never
export type {
  PmccLegSummary,
  PmccListItem,
  PmccListSummary,
  PositionListItem,
  WheelListItem
} from '../../../main/schemas'

export async function listPositions(): Promise<PositionListItem[]> {
  return window.api.listPositions()
}

export type LegDetail = LegRecord

export type SnapshotDetail = CostBasisSnapshotRecord

export type PositionDetail = IpcSuccess<'getPosition'>

export type CloseCspPayload = IpcPayload<'closePosition'>

export type CloseCspResponse = IpcSuccess<'closePosition'>

export type ExpireCspPayload = IpcPayload<'expirePosition'>

export type ExpireCspResponse = IpcSuccess<'expirePosition'>

export type AssignCspPayload = IpcPayload<'assignPosition'>

export type AssignCspResponse = IpcSuccess<'assignPosition'>

export async function getPosition(positionId: string): Promise<PositionDetail> {
  const result = await window.api.getPosition(positionId)
  if (!result.ok) {
    throw apiError(404, { detail: result.errors })
  }
  return result
}

export async function closePosition(payload: CloseCspPayload): Promise<CloseCspResponse> {
  const result = await window.api.closePosition(payload)
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result
}

export async function expirePosition(payload: ExpireCspPayload): Promise<ExpireCspResponse> {
  const result = await window.api.expirePosition(payload)
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result
}

export async function assignPosition(payload: AssignCspPayload): Promise<AssignCspResponse> {
  const result = await window.api.assignPosition(payload)
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result
}

export type OpenCcPayload = IpcPayload<'openCoveredCall'>

export type OpenCcResponse = IpcSuccess<'openCoveredCall'>

export async function openCoveredCall(payload: OpenCcPayload): Promise<OpenCcResponse> {
  const result = await window.api.openCoveredCall(payload)
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result
}

export type CloseCcEarlyPayload = IpcPayload<'closeCoveredCallEarly'>

export type CloseCcEarlyResponse = IpcSuccess<'closeCoveredCallEarly'>

export async function closeCoveredCallEarly(
  payload: CloseCcEarlyPayload
): Promise<CloseCcEarlyResponse> {
  const result = await window.api.closeCoveredCallEarly(payload)
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result
}

export type RecordCallAwayPayload = IpcPayload<'recordCallAway'>

export type RecordCallAwayResponse = IpcSuccess<'recordCallAway'>

export async function recordCallAway(
  payload: RecordCallAwayPayload
): Promise<RecordCallAwayResponse> {
  const result = await window.api.recordCallAway(payload)
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result
}

export type ExpireCcPayload = IpcPayload<'expireCc'>

export type ExpireCcResponse = IpcSuccess<'expireCc'>

export async function expireCc(payload: ExpireCcPayload): Promise<ExpireCcResponse> {
  const result = await window.api.expireCc(payload)
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result
}

export type RollCspPayload = IpcPayload<'rollCsp'>

export type RollCspResponse = IpcSuccess<'rollCsp'>

export async function rollCsp(payload: RollCspPayload): Promise<RollCspResponse> {
  const result = await window.api.rollCsp(payload)
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result
}

export type RollCcPayload = IpcPayload<'rollCc'>

export type RollCcResponse = IpcSuccess<'rollCc'>

export async function rollCc(payload: RollCcPayload): Promise<RollCcResponse> {
  const result = await window.api.rollCc(payload)
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result
}

export type SaveAlertOverridesPayload = IpcPayload<'saveAlertOverrides'>

export type SaveAlertOverridesResponse = IpcSuccess<'saveAlertOverrides'>

export async function saveAlertOverrides(
  payload: SaveAlertOverridesPayload
): Promise<SaveAlertOverridesResponse> {
  const result = await window.api.saveAlertOverrides(payload)
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result
}

export async function createPosition(
  payload: CreatePositionPayload
): Promise<CreatePositionResponse> {
  const result = await window.api.createPosition(payload)

  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }

  return result
}

// PMCC is camelCase end to end, so the renderer types are the preload's wire types.
export type CreatePmccPositionPayload = IpcPayload<'createPmccPosition'>

export type CreatePmccPositionResponse = IpcSuccess<'createPmccPosition'>

export async function createPmccPosition(
  payload: CreatePmccPositionPayload
): Promise<CreatePmccPositionResponse> {
  const result = await window.api.createPmccPosition(payload)
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result
}
