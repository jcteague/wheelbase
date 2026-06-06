import { ElectronAPI } from '@electron-toolkit/preload'

interface IpcPositionListItem {
  id: string
  ticker: string
  phase: string
  status: string
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

interface IpcRecordCallAwayPayload {
  positionId: string
}

type IpcRecordCallAwayResult = IpcResult<{
  position: { id: string; ticker: string; phase: string; status: string; closedDate: string }
  leg: IpcLegRecord & { fillPrice: string }
  costBasisSnapshot: IpcCostBasisSnapshotRecord & { finalPnl: string }
  finalPnl: string
  cycleDays: number
  annualizedReturn: string
  basisPerShare: string
}>

interface IpcExpireCcPayload {
  positionId: string
  expirationDateOverride?: string
}

type IpcExpireCcResult = IpcResult<{
  position: { id: string; ticker: string; phase: string; status: string; closedDate: null }
  leg: IpcLegRecord
  costBasisSnapshot: IpcCostBasisSnapshotRecord
  sharesHeld: number
}>

interface IpcRollCspPayload {
  positionId: string
  costToClosePerContract: number
  newPremiumPerContract: number
  newExpiration: string
  newStrike?: number
  fillDate?: string
}

type IpcRollCspResult = IpcResult<{
  position: { id: string; ticker: string; phase: 'CSP_OPEN'; status: 'ACTIVE' }
  rollFromLeg: IpcLegRecord
  rollToLeg: IpcLegRecord
  rollChainId: string
  costBasisSnapshot: IpcCostBasisSnapshotRecord
}>

interface IpcRollCcPayload {
  positionId: string
  costToClosePerContract: number
  newPremiumPerContract: number
  newExpiration: string
  newStrike?: number
  fillDate?: string
}

type IpcRollCcResult = IpcResult<{
  position: { id: string; ticker: string; phase: 'CC_OPEN'; status: 'ACTIVE' }
  rollFromLeg: IpcLegRecord
  rollToLeg: IpcLegRecord
  rollChainId: string
  costBasisSnapshot: IpcCostBasisSnapshotRecord
}>

interface IpcStockQuote {
  price: string
  bid: string
  ask: string
  prevClose: string | null
  volume: number
  timestamp: string
}

interface IpcMarketStatus {
  isOpen: boolean
  nextOpen: string
  nextClose: string
  session: 'regular' | 'pre' | 'post' | 'closed'
}

interface IpcGetStockQuotesPayload {
  tickers: string[]
}

type IpcGetStockQuotesResult = IpcResult<{ quotes: Record<string, IpcStockQuote> }>

interface IpcSetStockQuoteTickersPayload {
  tickers: string[]
}

type IpcSetStockQuoteTickersResult = IpcResult<{ subscribedTickers: string[] }>

interface IpcOptionSnapshot {
  bid: string
  ask: string
  mid: string
  lastTrade: string
  openInterest: number | null
  volume: number | null
  greeks: {
    delta: string
    gamma: string
    theta: string
    vega: string
    iv: string
  }
  timestamp: string
}

interface IpcAccountInfo {
  buyingPower: string
  portfolioValue: string
  cash: string
  environment: 'paper' | 'live'
  accountNumberMasked: string
}

interface IpcBrokerActivity {
  activityId: string
  activityType: string
  symbol: string
  qty: number
  price: string
  transactionTime: string
}

type IpcBrokerErrorCode =
  | 'auth_failed'
  | 'network_error'
  | 'rate_limited'
  | 'environment_mismatch'
  | 'unknown'

type IpcBrokerResult<T> =
  | ({ ok: true } & T)
  | {
      ok: false
      errors: Array<{ field: string; code: string; message: string }>
      code?: IpcBrokerErrorCode
    }

type IpcGetBrokerAccountResult = IpcBrokerResult<{ account: IpcAccountInfo }>
type IpcGetBrokerActivitiesResult = IpcBrokerResult<{ activities: IpcBrokerActivity[] }>
type IpcGetBrokerMarketStatusResult = IpcBrokerResult<{ status: IpcMarketStatus }>

interface IpcGetOptionSnapshotsPayload {
  symbols: string[]
}

type IpcGetOptionSnapshotsResult = IpcResult<{
  snapshots: Record<string, IpcOptionSnapshot>
  unavailable: boolean
}>

interface IpcOptionSnapshotPayload {
  underlying: string
  contract: string
}

type IpcGetOptionSnapshotResult = IpcResult<{ snapshot: IpcOptionSnapshot }>

interface IpcOptionChainPayload {
  underlying: string
  expirationFrom?: string
  expirationTo?: string
  type?: 'put' | 'call'
  strikeFrom?: string
  strikeTo?: string
  limit?: number
  cursor?: string
}

type IpcGetOptionChainResult = IpcResult<{
  snapshots: IpcOptionSnapshot[]
  nextCursor: string | null
}>

declare global {
  interface PendingAssignmentNotification {
    id: number
    ticker: string
    strike: string
    expiration: string
    contractType: 'put' | 'call'
    qty: number
    transactionTime: string
    positionId: string
  }

  interface IpcStockQuoteEvent {
    ticker: string
    quote: IpcStockQuote
  }

  interface IpcStreamErrorEvent {
    feed: 'stockQuotes' | 'optionQuotes' | 'optionTrades'
    code: string
    message: string
    reconnectable: boolean
  }

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
      recordCallAway: (payload: IpcRecordCallAwayPayload) => Promise<IpcRecordCallAwayResult>
      expireCc: (payload: IpcExpireCcPayload) => Promise<IpcExpireCcResult>
      rollCsp: (payload: IpcRollCspPayload) => Promise<IpcRollCspResult>
      rollCc: (payload: IpcRollCcPayload) => Promise<IpcRollCcResult>
      setStockQuoteTickers: (
        payload: IpcSetStockQuoteTickersPayload
      ) => Promise<IpcSetStockQuoteTickersResult>
      getOptionSnapshots: (
        payload: IpcGetOptionSnapshotsPayload
      ) => Promise<IpcGetOptionSnapshotsResult>
      onStockQuote: (cb: (event: IpcStockQuoteEvent) => void) => () => void
      onStreamError: (cb: (event: IpcStreamErrorEvent) => void) => () => void
      broker: {
        account: () => Promise<IpcGetBrokerAccountResult>
        activities: (payload: {
          type: string
          since?: string
        }) => Promise<IpcGetBrokerActivitiesResult>
        marketStatus: () => Promise<IpcGetBrokerMarketStatusResult>
      }
      marketData: {
        stockQuotes: (payload: IpcGetStockQuotesPayload) => Promise<IpcGetStockQuotesResult>
        optionSnapshot: (payload: IpcOptionSnapshotPayload) => Promise<IpcGetOptionSnapshotResult>
        optionChain: (payload: IpcOptionChainPayload) => Promise<IpcGetOptionChainResult>
      }
      triggerTestTick: (payload: { ticker: string; quote: IpcStockQuote }) => Promise<{ ok: true }>
      triggerStreamError: (payload: IpcStreamErrorEvent) => Promise<{ ok: true }>
      setPositionProfitTarget: (payload: {
        positionId: string
        targetPercent: number | null
      }) => Promise<{ ok: boolean }>
      assignments: {
        listPending: () => Promise<
          | { ok: true; assignments: PendingAssignmentNotification[] }
          | { ok: false; errors: string[] }
        >
        confirm: (
          pendingAssignmentId: number
        ) => Promise<
          | { ok: true; position: { id: number; phase: string; assignedAt: string } }
          | { ok: false; errors: string[]; code?: string }
        >
        dismiss: (
          pendingAssignmentId: number
        ) => Promise<
          { ok: true; dismissedAt: string } | { ok: false; errors: string[]; code?: string }
        >
        runDetectionNow: () => Promise<
          | { ok: true; detected: number; skipped: number; durationMs: number }
          | { ok: false; errors: string[] }
        >
      }
    }
  }
}
