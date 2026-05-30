import type { BrokerProvider } from './broker-provider'
import { BrokerError } from './broker-provider'
import { AlpacaBrokerProvider } from './alpaca-broker'
import { FakeBrokerProvider } from './fake-broker'

function buildProvider(): BrokerProvider {
  if (process.env.FAKE_BROKER === 'true') {
    return new FakeBrokerProvider()
  }
  const keyId = process.env.ALPACA_KEY_ID
  const secretKey = process.env.ALPACA_SECRET_KEY
  if (keyId && secretKey) {
    return new AlpacaBrokerProvider({
      keyId,
      secretKey,
      environment: process.env.ALPACA_PAPER === 'true' ? 'paper' : 'live'
    })
  }
  throw new BrokerError('auth_failed', 'Alpaca credentials not configured')
}

let cached: BrokerProvider | null = null

export const brokerFactory = {
  create(): BrokerProvider {
    if (!cached) cached = buildProvider()
    return cached
  },
  recreate(): void {
    cached = null
  }
}
