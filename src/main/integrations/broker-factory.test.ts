import { beforeEach, describe, expect, it } from 'vitest'
import { brokerFactory } from './broker-factory'
import { AlpacaBrokerProvider } from './alpaca-broker'
import { FakeBrokerProvider } from './fake-broker'
import { BrokerError } from './broker-provider'

describe('brokerFactory', () => {
  beforeEach(() => {
    delete process.env.ALPACA_KEY_ID
    delete process.env.ALPACA_SECRET_KEY
    delete process.env.ALPACA_PAPER
    delete process.env.FAKE_BROKER
    brokerFactory.recreate()
  })

  it('returns AlpacaBrokerProvider when ALPACA_KEY_ID and ALPACA_SECRET_KEY are configured', () => {
    process.env.ALPACA_KEY_ID = 'PA123'
    process.env.ALPACA_SECRET_KEY = 'secret'
    process.env.ALPACA_PAPER = 'true'
    const provider = brokerFactory.create()
    expect(provider).toBeInstanceOf(AlpacaBrokerProvider)
  })

  it('returns AlpacaBrokerProvider with live base URL when ALPACA_PAPER is not set', () => {
    process.env.ALPACA_KEY_ID = 'LIVE123'
    process.env.ALPACA_SECRET_KEY = 'secret'
    const provider = brokerFactory.create()
    expect(provider).toBeInstanceOf(AlpacaBrokerProvider)
  })

  it('returns FakeBrokerProvider when FAKE_BROKER env var is set', () => {
    process.env.FAKE_BROKER = 'true'
    const provider = brokerFactory.create()
    expect(provider).toBeInstanceOf(FakeBrokerProvider)
  })

  it('throws BrokerError with auth_failed code when no credentials configured', () => {
    let caught: unknown
    try {
      brokerFactory.create()
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(BrokerError)
    expect((caught as BrokerError).code).toBe('auth_failed')
  })
})
