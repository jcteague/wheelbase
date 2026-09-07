import type { BrokerProvider } from './broker-provider'
import { BrokerError } from './broker-provider'
import { AlpacaBrokerProvider } from './alpaca-broker'
import { FakeBrokerProvider } from './fake-broker'
import type { AlpacaCredentials } from '../services/settings'
import { loadAlpacaCredentialsFromEnv } from './alpaca-credentials'

type BrokerFactoryConfig = {
  loadActiveAlpacaCredentials: () => AlpacaCredentials | null
}

let config: BrokerFactoryConfig = {
  loadActiveAlpacaCredentials: loadAlpacaCredentialsFromEnv
}

function buildProvider(): BrokerProvider {
  const credentials = config.loadActiveAlpacaCredentials()
  if (process.env.FAKE_BROKER === 'true') {
    return new FakeBrokerProvider({ environment: credentials?.environment })
  }
  if (credentials) {
    return new AlpacaBrokerProvider({
      keyId: credentials.keyId,
      secretKey: credentials.secret,
      environment: credentials.environment
    })
  }
  throw new BrokerError('auth_failed', 'Alpaca credentials not configured')
}

let cached: BrokerProvider | null = null

export const brokerFactory = {
  configure(next: BrokerFactoryConfig): void {
    config = next
    cached = null
  },
  create(): BrokerProvider {
    if (!cached) cached = buildProvider()
    return cached
  },
  recreate(): void {
    cached = null
  }
}
