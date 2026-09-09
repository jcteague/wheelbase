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

export type MarketStatus = {
  isOpen: boolean
  nextOpen: string
  nextClose: string
  session: 'regular' | 'pre' | 'post' | 'closed'
}

/** One day the exchange published a session for, as the venue states it: an Eastern
 *  wall-clock close ('16:00', or '13:00' on an early-close day). Days the exchange was
 *  shut are simply absent from a calendar response. */
export type MarketCalendarDay = {
  date: string // 'YYYY-MM-DD'
  close: string // 'HH:MM' Eastern wall clock
}

/** Inclusive day bounds for a calendar request. */
export type MarketCalendarRange = {
  start: string // 'YYYY-MM-DD'
  end: string // 'YYYY-MM-DD'
}

export interface BrokerProvider {
  getAccountInfo(): Promise<AccountInfo>
  getActivities(filter: ActivityFilter): Promise<BrokerActivity[]>
  getMarketStatus(): Promise<MarketStatus>
  /** The exchange's own session calendar over `range`. Sessions are facts we cache
   *  rather than derive: holiday rules have exceptions and unscheduled closures exist. */
  getMarketCalendar(range: MarketCalendarRange): Promise<MarketCalendarDay[]>
}
