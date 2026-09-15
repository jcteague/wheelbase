import { createPollingScheduler } from './polling-scheduler'
import { marketDataFactory } from '../integrations/market-data-factory'
import {
  MarketDataError,
  type MarketStatus,
  type MarketStatusSource
} from '../integrations/market-data-provider'
import { logger } from '../logger'

/** What an install with no market-data credentials reports: a closed session as of
 *  startup. Jobs then take the scheduler's closed-market branch instead of every tick
 *  raising an auth error. */
const unconfiguredProviderStatus: MarketStatus = {
  isOpen: false,
  session: 'closed',
  nextOpen: new Date().toISOString(),
  nextClose: new Date().toISOString()
}

// Only `auth_failed` degrades: that is the unconfigured install. Every other failure — a
// network blip, a rate limit — propagates to the scheduler's own fallback branch, which
// keeps the job on its default cadence rather than parking it until an unknown next open.
const statusSource: MarketStatusSource = {
  async getMarketStatus() {
    try {
      return await marketDataFactory.create().getMarketStatus()
    } catch (err) {
      if (err instanceof MarketDataError && err.code === 'auth_failed') {
        logger.debug({ err }, 'scheduler_market_status_unconfigured')
        return unconfiguredProviderStatus
      }
      throw err
    }
  }
}

export const scheduler = createPollingScheduler(() => statusSource)
