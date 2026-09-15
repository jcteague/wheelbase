// [US-31] FakeBrokerProvider — test double implementing BrokerProvider

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccountInfo, BrokerActivity } from './broker-provider'

import { FakeBrokerProvider } from './fake-broker'

describe('FakeBrokerProvider', () => {
  let savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    savedEnv = {
      FAKE_BROKER_ACCOUNT: process.env.FAKE_BROKER_ACCOUNT,
      FAKE_BROKER_ACTIVITIES: process.env.FAKE_BROKER_ACTIVITIES,
      FAKE_MARKET_STATUS: process.env.FAKE_MARKET_STATUS
    }
    delete process.env.FAKE_BROKER_ACCOUNT
    delete process.env.FAKE_BROKER_ACTIVITIES
    delete process.env.FAKE_MARKET_STATUS
  })

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }
  })

  // === getAccountInfo ===

  describe('getAccountInfo', () => {
    it('returns AccountInfo from FAKE_BROKER_ACCOUNT env var when set', async () => {
      const custom: AccountInfo = {
        buyingPower: '25000.00',
        portfolioValue: '100000.00',
        cash: '12500.00',
        environment: 'paper',
        accountNumberMasked: 'PA…XYZ'
      }
      process.env.FAKE_BROKER_ACCOUNT = JSON.stringify(custom)

      const provider = new FakeBrokerProvider()
      const result = await provider.getAccountInfo()

      expect(result).toEqual(custom)
    })

    it('returns a default fixture when FAKE_BROKER_ACCOUNT env var is not set', async () => {
      const provider = new FakeBrokerProvider()
      const result = await provider.getAccountInfo()

      expect(result).toMatchObject({
        buyingPower: expect.any(String),
        portfolioValue: expect.any(String),
        cash: expect.any(String),
        environment: expect.stringMatching(/^(paper|live)$/),
        accountNumberMasked: expect.any(String)
      })
    })
  })

  // === getActivities ===

  describe('getActivities', () => {
    it('returns FAKE_BROKER_ACTIVITIES env var parsed JSON when present', async () => {
      const activities: BrokerActivity[] = [
        {
          activityId: 'act-001',
          activityType: 'OPASN',
          symbol: 'AAPL260516P00180000',
          qty: 100,
          price: '180.00',
          transactionTime: '2026-05-01T14:30:00Z'
        }
      ]
      process.env.FAKE_BROKER_ACTIVITIES = JSON.stringify(activities)

      const provider = new FakeBrokerProvider()
      const result = await provider.getActivities({ type: 'OPASN' })

      expect(result).toEqual(activities)
    })

    it('returns empty array when FAKE_BROKER_ACTIVITIES env var is not set', async () => {
      const provider = new FakeBrokerProvider()
      const result = await provider.getActivities({ type: 'OPASN' })

      expect(result).toEqual([])
    })
  })

  // === BrokerProvider shape ===

  it('implements the BrokerProvider interface (getAccountInfo, getActivities)', () => {
    const provider = new FakeBrokerProvider()
    expect(typeof provider.getAccountInfo).toBe('function')
    expect(typeof provider.getActivities).toBe('function')
  })

  it('throws the BrokerError named by FAKE_BROKER_ERROR from every account method', async () => {
    process.env.FAKE_BROKER_ERROR = 'auth_failed'
    const provider = new FakeBrokerProvider()

    await expect(provider.getAccountInfo()).rejects.toMatchObject({ code: 'auth_failed' })
    await expect(provider.getActivities({ type: 'FILL' })).rejects.toMatchObject({
      code: 'auth_failed'
    })

    delete process.env.FAKE_BROKER_ERROR
  })

  // [US-116] Both market facts moved to FakeMarketDataProvider, so FAKE_BROKER_ERROR no
  // longer has any way to break market status or the exchange calendar.
  it('exposes neither market fact, so FAKE_BROKER_ERROR cannot reach them', () => {
    const provider = new FakeBrokerProvider() as unknown as Record<string, unknown>

    expect(provider.getMarketStatus).toBeUndefined()
    expect(provider.getMarketCalendar).toBeUndefined()
  })
})
