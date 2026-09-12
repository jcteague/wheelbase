import { eachDayOfInterval, format, isWeekend, parseISO } from 'date-fns'
import {
  BrokerError,
  type AccountInfo,
  type ActivityFilter,
  type BrokerActivity,
  type BrokerErrorCode,
  type BrokerProvider,
  type MarketCalendarDay,
  type MarketCalendarRange,
  type MarketStatus
} from './broker-provider'

const DEFAULT_ACCOUNT: AccountInfo = {
  buyingPower: '50000.00',
  portfolioValue: '75000.00',
  cash: '25000.00',
  environment: 'paper',
  accountNumberMasked: 'PA…123'
}

const DEFAULT_MARKET_STATUS: MarketStatus = {
  isOpen: true,
  nextOpen: '2026-05-30T13:30:00Z',
  nextClose: '2026-05-29T20:00:00Z',
  session: 'regular'
}

const FAKE_CLOSE_TIME = '16:00'

/** Every weekday in the range as a normal 16:00 session. Offline runs need a calendar
 *  that is correct *relative to whatever day the suite runs on*, so this is generated
 *  rather than fixtured; a spec that needs a holiday or early close sets
 *  FAKE_BROKER_CALENDAR explicitly. */
function weekdaySessions(range: MarketCalendarRange): MarketCalendarDay[] {
  return eachDayOfInterval({ start: parseISO(range.start), end: parseISO(range.end) })
    .filter((day) => !isWeekend(day))
    .map((day) => ({ date: format(day, 'yyyy-MM-dd'), close: FAKE_CLOSE_TIME }))
}

function parseEnv<T>(envVar: string): T | null {
  const raw = process.env[envVar]
  return raw ? (JSON.parse(raw) as T) : null
}

type FakeBrokerProviderOptions = {
  environment?: 'paper' | 'live'
}

export class FakeBrokerProvider implements BrokerProvider {
  private readonly environment: 'paper' | 'live'

  constructor(options: FakeBrokerProviderOptions = {}) {
    this.environment = options.environment ?? 'paper'
  }

  private maybeThrow(): void {
    const code = process.env.FAKE_BROKER_ERROR
    if (code) throw new BrokerError(code as BrokerErrorCode, `Fake error: ${code}`)
  }

  async getAccountInfo(): Promise<AccountInfo> {
    this.maybeThrow()
    return (
      parseEnv<AccountInfo>(
        this.environment === 'live' ? 'FAKE_BROKER_ACCOUNT_LIVE' : 'FAKE_BROKER_ACCOUNT_PAPER'
      ) ??
      parseEnv<AccountInfo>('FAKE_BROKER_ACCOUNT') ?? {
        ...DEFAULT_ACCOUNT,
        environment: this.environment
      }
    )
  }

  async getActivities(filter: ActivityFilter): Promise<BrokerActivity[]> {
    this.maybeThrow()
    void filter
    return parseEnv<BrokerActivity[]>('FAKE_BROKER_ACTIVITIES') ?? []
  }

  async getMarketStatus(): Promise<MarketStatus> {
    this.maybeThrow()
    return parseEnv<MarketStatus>('FAKE_MARKET_STATUS') ?? DEFAULT_MARKET_STATUS
  }

  async getMarketCalendar(range: MarketCalendarRange): Promise<MarketCalendarDay[]> {
    this.maybeThrow()
    const fixture = parseEnv<MarketCalendarDay[]>('FAKE_BROKER_CALENDAR')
    if (fixture === null) return weekdaySessions(range)

    return fixture.filter((day) => day.date >= range.start && day.date <= range.end)
  }
}
