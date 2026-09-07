import { beforeEach, describe, expect, it } from 'vitest'
import { brokerFactory } from './broker-factory'
import { AlpacaBrokerProvider } from './alpaca-broker'
import { FakeBrokerProvider } from './fake-broker'
import { BrokerError } from './broker-provider'
import { marketDataFactory } from './market-data-factory'
import { loadAlpacaCredentialsFromEnv } from './alpaca-credentials'

describe('brokerFactory', () => {
  beforeEach(() => {
    delete process.env.ALPACA_KEY_ID
    delete process.env.ALPACA_SECRET_KEY
    delete process.env.ALPACA_PAPER
    delete process.env.FAKE_BROKER
    brokerFactory.recreate()
    // Restores the factory's own default loader, which per-test configure() calls replace.
    brokerFactory.configure({ loadActiveAlpacaCredentials: loadAlpacaCredentialsFromEnv })
  })

  it('returns AlpacaBrokerProvider for persisted active paper credentials', () => {
    brokerFactory.configure({
      loadActiveAlpacaCredentials: () => ({
        keyId: 'PKPAPER123',
        secret: 'paper-secret',
        environment: 'paper'
      })
    })
    const provider = brokerFactory.create()
    expect(provider).toBeInstanceOf(AlpacaBrokerProvider)
  })

  it('returns FakeBrokerProvider when FAKE_BROKER env var is set', () => {
    process.env.FAKE_BROKER = 'true'
    const provider = brokerFactory.create()
    expect(provider).toBeInstanceOf(FakeBrokerProvider)
  })

  it('recreates the broker provider when active environment switches to live without touching market data', () => {
    brokerFactory.configure({
      loadActiveAlpacaCredentials: () => ({
        keyId: 'PKPAPER123',
        secret: 'paper-secret',
        environment: 'paper'
      })
    })
    const initial = brokerFactory.create()
    const marketProvider = marketDataFactory.create

    brokerFactory.configure({
      loadActiveAlpacaCredentials: () => ({
        keyId: 'AKLIVE456',
        secret: 'live-secret',
        environment: 'live'
      })
    })
    brokerFactory.recreate()
    const next = brokerFactory.create()

    expect(initial).toBeInstanceOf(AlpacaBrokerProvider)
    expect(next).toBeInstanceOf(AlpacaBrokerProvider)
    expect(next).not.toBe(initial)
    expect(marketDataFactory.create).toBe(marketProvider)
  })

  it('throws BrokerError with auth_failed code when no Alpaca credentials are configured', () => {
    let caught: unknown
    try {
      brokerFactory.create()
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(BrokerError)
    expect((caught as BrokerError).code).toBe('auth_failed')
    expect((caught as BrokerError).message).toMatch(/not configured/i)
  })
})
