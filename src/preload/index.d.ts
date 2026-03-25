import { ElectronAPI } from '@electron-toolkit/preload'

interface IpcPositionListItem {
  id: string
  ticker: string
  phase: string
  status: string
  strike: string | null
  expiration: string | null
  dte: number | null
  premiumCollected: string
  effectiveCostBasis: string
}

interface IpcCreatePositionPayload {
  ticker: string
  strike: number
  expiration: string
  contracts: number
  premiumPerContract: number
  fillDate?: string
  thesis?: string
  notes?: string
}

interface IpcPositionRecord {
  id: string
  ticker: string
  phase: string
  status: string
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

interface IpcLegRecord {
  id: string
  positionId: string
  legRole: string
  action: string
  instrumentType: string
  strike: string
  expiration: string
  contracts: number
  premiumPerContract: string
  fillPrice?: string | null
  fillDate: string
  createdAt: string
  updatedAt: string
}

interface IpcCostBasisSnapshotRecord {
  id: string
  positionId: string
  basisPerShare: string
  totalPremiumCollected: string
  finalPnl: string | null
  snapshotAt: string
  createdAt: string
}

type IpcResult<T> =
  | ({ ok: true } & T)
  | { ok: false; errors: Array<{ field: string; code: string; message: string }> }

type IpcCreatePositionResult = IpcResult<{
  position: IpcPositionRecord
  leg: IpcLegRecord
  costBasisSnapshot: IpcCostBasisSnapshotRecord
}>

type IpcGetPositionResult = IpcResult<{
  position: IpcPositionRecord
  activeLeg: IpcLegRecord | null
  costBasisSnapshot: IpcCostBasisSnapshotRecord | null
}>

interface IpcCloseCspPayload {
  positionId: string
  closePricePerContract: number
  fillDate?: string
}

type IpcCloseCspResult = IpcResult<{
  position: { id: string; ticker: string; phase: string; status: string; closedDate: string }
  leg: IpcLegRecord
  costBasisSnapshot: IpcCostBasisSnapshotRecord & { finalPnl: string }
}>

interface IpcExpireCspPayload {
  positionId: string
  expirationDateOverride?: string
}

type IpcExpireCspResult = IpcResult<{
  position: { id: string; ticker: string; phase: string; status: string; closedDate: string }
  leg: IpcLegRecord
  costBasisSnapshot: IpcCostBasisSnapshotRecord & { finalPnl: string }
}>

interface IpcAssignCspPayload {
  positionId: string
  assignmentDate: string
}

type IpcAssignCspResult = IpcResult<{
  position: { id: string; ticker: string; phase: string; status: string }
  leg: IpcLegRecord
  costBasisSnapshot: IpcCostBasisSnapshotRecord
  premiumWaterfall: Array<{ label: string; amount: string }>
}>

interface IpcOpenCcPayload {
  positionId: string
  strike: number
  expiration: string
  contracts: number
  premiumPerContract: number
  fillDate?: string
}

type IpcOpenCcResult = IpcResult<{
  position: { id: string; ticker: string; phase: string; status: string; closedDate: null }
  leg: IpcLegRecord
  costBasisSnapshot: IpcCostBasisSnapshotRecord
}>

interface IpcCloseCcPayload {
  positionId: string
  closePricePerContract: number
  fillDate?: string
}

type IpcCloseCcResult = IpcResult<{
  position: { id: string; ticker: string; phase: string; status: string; closedDate: null }
  leg: IpcLegRecord & { fillPrice: string }
  ccLegPnl: string
}>

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      ping: () => Promise<string>
      listPositions: () => Promise<IpcPositionListItem[]>
      createPosition: (payload: IpcCreatePositionPayload) => Promise<IpcCreatePositionResult>
      getPosition: (positionId: string) => Promise<IpcGetPositionResult>
      closePosition: (payload: IpcCloseCspPayload) => Promise<IpcCloseCspResult>
      expirePosition: (payload: IpcExpireCspPayload) => Promise<IpcExpireCspResult>
      assignPosition: (payload: IpcAssignCspPayload) => Promise<IpcAssignCspResult>
      openCoveredCall: (payload: IpcOpenCcPayload) => Promise<IpcOpenCcResult>
      closeCoveredCallEarly: (payload: IpcCloseCcPayload) => Promise<IpcCloseCcResult>
    }
  }
}
