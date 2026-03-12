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
  optionType: string
  strike: string
  expiration: string
  contracts: number
  premiumPerContract: string
  fillDate: string
  createdAt: string
  updatedAt: string
}

interface IpcCostBasisSnapshotRecord {
  id: string
  positionId: string
  basisPerShare: string
  totalPremiumCollected: string
  snapshotAt: string
  createdAt: string
}

type IpcCreatePositionResult =
  | {
      ok: true
      position: IpcPositionRecord
      leg: IpcLegRecord
      costBasisSnapshot: IpcCostBasisSnapshotRecord
    }
  | {
      ok: false
      errors: Array<{ field: string; code: string; message: string }>
    }

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      ping: () => Promise<string>
      listPositions: () => Promise<IpcPositionListItem[]>
      createPosition: (payload: IpcCreatePositionPayload) => Promise<IpcCreatePositionResult>
    }
  }
}
