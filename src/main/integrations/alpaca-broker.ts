import { Decimal } from 'decimal.js'
import { createClient } from '@alpacahq/typescript-sdk'
import {
  BrokerError,
  type AccountInfo,
  type ActivityFilter,
  type BrokerActivity,
  type BrokerProvider,
  type MarketStatus
} from './broker-provider'
import { isNetworkError } from './integration-errors'

export type AlpacaBrokerConfig = {
  keyId: string
  secretKey: string
  environment: 'paper' | 'live'
}

type AlpacaAccount = {
  buying_power: string
  portfolio_value: string
  cash: string
  account_number?: string
}

type AlpacaActivity = {
  id: string
  activity_type: string
  symbol?: string
  qty?: string
  per_share_amount?: string
  price?: string
  transaction_time?: string
  date?: string
}

const DEFAULT_ET_OFFSET_MINUTES = -240
const PRE_MARKET_START_HOUR = 4
const REGULAR_MARKET_START_HOUR = 9.5
const REGULAR_MARKET_END_HOUR = 16
const POST_MARKET_END_HOUR = 20

function parseOffsetMinutes(timestamp: string): number | null {
  const match = timestamp.match(/([+-])(\d{2}):(\d{2})$/)
  if (!match) return null
  const [, sign, hours, minutes] = match
  const direction = sign === '+' ? 1 : -1
  return direction * (parseInt(hours, 10) * 60 + parseInt(minutes, 10))
}

function deriveSession(isOpen: boolean, timestamp: string): 'regular' | 'pre' | 'post' | 'closed' {
  if (isOpen) return 'regular'
  const date = new Date(timestamp)
  const offsetMinutes = parseOffsetMinutes(timestamp) ?? DEFAULT_ET_OFFSET_MINUTES
  const minutesSinceUtcMidnight = date.getUTCHours() * 60 + date.getUTCMinutes()
  let etHours = (minutesSinceUtcMidnight + offsetMinutes) / 60
  if (etHours < 0) etHours += 24
  if (etHours >= PRE_MARKET_START_HOUR && etHours < REGULAR_MARKET_START_HOUR) return 'pre'
  if (etHours >= REGULAR_MARKET_END_HOUR && etHours < POST_MARKET_END_HOUR) return 'post'
  return 'closed'
}

function isAuthError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  // Primary path: SDK surfaces a status field
  if ('status' in err) {
    const { status } = err as { status: number }
    if (status === 401 || status === 403) return true
  }
  // Fallback: Alpaca SDK may omit status but embed a JSON body with a 401xxxxx error code
  const msg = err instanceof Error ? err.message : null
  if (msg) {
    try {
      const body = JSON.parse(msg) as { code?: number }
      if (typeof body.code === 'number' && String(body.code).startsWith('401')) return true
    } catch {
      // not a JSON body — not an auth error
    }
  }
  return false
}

function toMoney(value: string): string {
  return new Decimal(value).toFixed(4)
}

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 5) return accountNumber
  return accountNumber.slice(0, 2) + '…' + accountNumber.slice(-3)
}

export class AlpacaBrokerProvider implements BrokerProvider {
  private readonly config: AlpacaBrokerConfig
  private _client: ReturnType<typeof createClient> | null = null

  constructor(config: AlpacaBrokerConfig) {
    this.config = config
  }

  private get lazyClient(): ReturnType<typeof createClient> {
    if (!this._client) {
      this._client = createClient({
        key: this.config.keyId,
        secret: this.config.secretKey,
        paper: this.config.environment === 'paper'
      })
    }
    return this._client
  }

  private requireCredentials(): void {
    if (!this.config.keyId || !this.config.secretKey) {
      throw new BrokerError(
        'auth_failed',
        'Alpaca credentials not configured',
        'settings/credentials/alpaca'
      )
    }
  }

  private wrapError(err: unknown, context: string): never {
    if (err instanceof BrokerError) throw err

    if (isAuthError(err)) {
      if (this.config.environment === 'paper' && this.config.keyId.startsWith('AK')) {
        throw new BrokerError(
          'environment_mismatch',
          'Environment mismatch — these are LIVE keys, not paper keys'
        )
      }
      if (this.config.environment === 'live' && this.config.keyId.startsWith('P')) {
        throw new BrokerError(
          'environment_mismatch',
          'Environment mismatch — these are PAPER keys, not live keys'
        )
      }
      throw new BrokerError('auth_failed', `${context}: authentication failed`)
    }

    if (isNetworkError(err)) {
      throw new BrokerError(
        'network_error',
        `${context}: ${err instanceof Error ? err.message : 'network error'}`
      )
    }

    throw new BrokerError(
      'unknown',
      `${context}: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  async getAccountInfo(): Promise<AccountInfo> {
    this.requireCredentials()
    try {
      const account = (await this.lazyClient.getAccount()) as AlpacaAccount
      return {
        buyingPower: toMoney(account.buying_power),
        portfolioValue: toMoney(account.portfolio_value),
        cash: toMoney(account.cash),
        environment: this.config.environment,
        accountNumberMasked: maskAccountNumber(account.account_number ?? '')
      }
    } catch (err) {
      throw this.wrapError(err, 'getAccountInfo')
    }
  }

  async getActivities(filter: ActivityFilter): Promise<BrokerActivity[]> {
    this.requireCredentials()
    try {
      const params = {
        activity_type: filter.type,
        ...(filter.since ? { date: filter.since } : {})
      } as Parameters<typeof this.lazyClient.getActivity>[0]

      const response = (await this.lazyClient.getActivity(params)) as AlpacaActivity[]

      return response
        .map(
          (a): BrokerActivity => ({
            activityId: a.id,
            activityType: a.activity_type,
            symbol: a.symbol ?? '',
            qty: Number(a.qty ?? 0),
            price: a.per_share_amount ?? a.price ?? '0.00',
            transactionTime: a.transaction_time ?? a.date ?? ''
          })
        )
        .sort((a, b) => b.transactionTime.localeCompare(a.transactionTime))
    } catch (err) {
      throw this.wrapError(err, 'getActivities')
    }
  }

  async getMarketStatus(): Promise<MarketStatus> {
    this.requireCredentials()
    try {
      const clock = await this.lazyClient.getClock()
      return {
        isOpen: clock.is_open,
        nextOpen: clock.next_open,
        nextClose: clock.next_close,
        session: deriveSession(clock.is_open, clock.timestamp)
      }
    } catch (err) {
      throw this.wrapError(err, 'getMarketStatus')
    }
  }
}
