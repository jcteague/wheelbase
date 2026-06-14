import { createPollingScheduler } from './polling-scheduler'
import { brokerFactory } from '../integrations/broker-factory'
import type { BrokerProvider, MarketStatus } from '../integrations/broker-provider'

const closedMarketStatus: MarketStatus = {
  isOpen: false,
  session: 'closed',
  nextOpen: new Date().toISOString(),
  nextClose: new Date().toISOString()
}

const fallbackBroker: BrokerProvider = {
  getAccountInfo: () => Promise.reject(new Error('Broker not configured')),
  getActivities: () => Promise.resolve([]),
  getMarketStatus: () => Promise.resolve(closedMarketStatus)
}

function getSafeBroker(): BrokerProvider {
  try {
    return brokerFactory.create()
  } catch {
    return fallbackBroker
  }
}

export const scheduler = createPollingScheduler(getSafeBroker)
