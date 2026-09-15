export type BrokerErrorCode =
  | 'auth_failed'
  | 'network_error'
  | 'rate_limited'
  | 'environment_mismatch'
  | 'unknown'

/** Broker-side error. Distinct from MarketDataError: includes 'environment_mismatch' instead of 'streaming_unsupported'. */
export class BrokerError extends Error {
  readonly code: BrokerErrorCode
  readonly deeplink?: string

  constructor(code: BrokerErrorCode, message: string, deeplink?: string) {
    super(message)
    this.code = code
    this.deeplink = deeplink
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

/** Facts about *your account*, and nothing else. Facts about *the market* — the exchange
 *  clock and its session calendar — are on MarketDataProvider, so the app stays fully
 *  usable as a journal with no broker attached. */
export interface BrokerProvider {
  getAccountInfo(): Promise<AccountInfo>
  getActivities(filter: ActivityFilter): Promise<BrokerActivity[]>
}
