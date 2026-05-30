export type BrokerErrorCode =
  | 'auth_failed'
  | 'network_error'
  | 'rate_limited'
  | 'environment_mismatch'
  | 'unknown'

/** Broker-side error. Distinct from MarketDataError: includes 'environment_mismatch' instead of 'streaming_unsupported'. */
export class BrokerError extends Error {
  readonly code: BrokerErrorCode

  constructor(code: BrokerErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'BrokerError'
  }
}

export type AccountInfo = {
  buyingPower: string
  portfolioValue: string
  cash: string
  environment: 'paper' | 'live'
  accountNumberMasked: string
}

export type BrokerActivity = {
  activityId: string
  activityType: string
  symbol: string
  qty: number
  price: string
  transactionTime: string
}

export type ActivityFilter = {
  type: string
  since?: string
}

export type MarketStatus = {
  isOpen: boolean
  nextOpen: string
  nextClose: string
  session: 'regular' | 'pre' | 'post' | 'closed'
}

export interface BrokerProvider {
  getAccountInfo(): Promise<AccountInfo>
  getActivities(filter: ActivityFilter): Promise<BrokerActivity[]>
  getMarketStatus(): Promise<MarketStatus>
}
